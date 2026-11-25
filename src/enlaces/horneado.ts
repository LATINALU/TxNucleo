// Reglas horneadas: TxNucleo calcula con sus mecánicas reales (ModeloBalance, curvas de experiencia, tabla de rareza,
// arquetipos de enemigos) las TABLAS que un juego necesita y las escribe en `reglas.json`. Cualquier motor (Godot,
// web, Unity...) las consume sin reimplementar fórmulas, y el bot de prueba usa exactamente los mismos números.
// También analiza esas tablas (tiempo para matar, golpes para morir, enemigos por nivel) para detectar problemas
// de balance ANTES de jugar.

import { evaluar, curva, type Curva } from "../nucleo/escalado.ts";
import { Pcg32 } from "../nucleo/pcg32.ts";
import { ModeloBalance, mitigacionBalance, type CurvaPoder, type ReglasBalance } from "../contextos/balance/dominio/poder-esperado.ts";
import { probabilidadesRareza, type TablaRarezaNivel } from "../contextos/botin/dominio/rareza.ts";
import { ARQUETIPOS, type Arquetipo } from "../datos/criaturas.ts";
import { BALANCE_ACCION, PODER_RPG, PODER_SHOOTER, RAREZA_ARPG } from "../modelos/piezas.ts";
import type { Combinacion } from "../modelos/tipos.ts";
import { MODELOS } from "../modelos/catalogo.ts";

/** Estadísticas efectivas de un enemigo en un nivel: ya incluyen defensa y mitigación. */
export interface StatsHorneadas {
  readonly vida: number;
  /** Daño que hace al jugador típico de ese nivel por golpe (tras su defensa). */
  readonly danio: number;
  /** Daño que recibe por cada golpe del jugador típico de ese nivel (tras la defensa del enemigo). */
  readonly golpeRecibido: number;
  readonly exp: number;
}

/** Un tipo de enemigo con sus estadísticas por nivel (índice 0 = nivel 1). */
export interface EnemigoHorneado {
  readonly id: string;
  readonly familia: string;
  readonly conducta: string;
  /** Velocidad en casillas por segundo. */
  readonly velocidad: number;
  /** Alcance de ataque en casillas. */
  readonly alcance: number;
  readonly distancia: boolean;
  readonly costo: number;
  readonly peso: number;
  readonly porNivel: readonly StatsHorneadas[];
}

/** Una oleada: nivel de sus enemigos, cuántos de cada tipo y si trae jefe. */
export interface OleadaHorneada {
  readonly numero: number;
  readonly nivel: number;
  readonly enemigos: readonly { readonly id: string; readonly cantidad: number }[];
  readonly jefe: boolean;
}

/** Todo lo que un motor necesita para jugar las reglas de la combinación. */
export interface ReglasHorneadas {
  readonly version: "txnucleo.reglas.v1";
  readonly juego: string;
  readonly modelos: readonly string[];
  readonly generos: readonly string[];
  readonly semilla: number;
  readonly niveles: number;
  /** "prototipo": experiencia para subir derivada de la del enemigo (≈8 + 1,5·nivel enemigos); "modelo": la curva del modelo. */
  readonly progresion: "prototipo" | "modelo";
  /**
   * Solo en modo prototipo: multiplicadores aplicados porque en un juego de hordas al jugador lo atacan varios a la
   * vez (ModeloBalance razona peleas de a uno). Medidos con el bot de pruebas: ver docs/HORNEADO.md.
   */
  readonly ajusteMultitud: { readonly vidaComun: number; readonly danioComun: number; readonly vidaJefe: number; readonly danioJefe: number } | null;
  readonly jugador: {
    /** Casillas por segundo. */
    readonly velocidad: number;
    /** Alcance del ataque en casillas (cuerpo a cuerpo ~1.6, disparo ~7). */
    readonly alcance: number;
    readonly aDistancia: boolean;
    /** Ataques por segundo. */
    readonly ritmo: number;
    readonly porNivel: readonly { readonly vida: number; readonly golpe: number; readonly defensa: number }[];
    /** Experiencia necesaria para pasar del nivel i+1 al i+2. */
    readonly expParaSubir: readonly number[];
  };
  readonly enemigos: readonly EnemigoHorneado[];
  readonly jefe: { readonly cada: number; readonly porNivel: readonly (StatsHorneadas & { readonly duracion: number })[] };
  readonly botin: {
    readonly nombres: readonly string[];
    readonly colores: readonly string[];
    /** Probabilidad de cada rareza por nivel (índice 0 = nivel 1). */
    readonly probabilidades: readonly (readonly number[])[];
    /** Probabilidad de que un enemigo común suelte algo. */
    readonly probSoltar: number;
  };
  readonly oleadas: readonly OleadaHorneada[];
}

/** Opciones del horneado. */
export interface OpcionesHorneado {
  readonly nombre?: string;
  readonly niveles?: number;
  readonly oleadas?: number;
  readonly semilla?: number;
  /** Familia de enemigos del catálogo (zombi, soldado, fantasia, bestia, maquina); si no, se deduce de los modelos. */
  readonly familia?: Arquetipo["familia"];
  /** "prototipo" (por defecto): subir de nivel a ritmo de juego de acción. "modelo": usar la curva de experiencia del modelo. */
  readonly progresion?: "prototipo" | "modelo";
  /** Arma del jugador; si no, se deduce de los rasgos de los modelos (disparar + habilidades vs cuerpo a cuerpo). */
  readonly arma?: "distancia" | "cuerpo";
}

/** Ajuste de multitud del modo prototipo (medido con el bot sobre varias combinaciones). */
export const AJUSTE_MULTITUD = { vidaComun: 0.35, danioComun: 1 / 3, vidaJefe: 0.12, danioJefe: 1 / 3 } as const;

/** ¿El jugador ataca a distancia? Por los rasgos de los modelos: disparar + habilidades ≥ cuerpo a cuerpo. */
export function armaDe(c: Combinacion): "distancia" | "cuerpo" {
  let lejos = 0, cerca = 0;
  for (const id of c.ids) {
    const m = MODELOS.find((x) => x.id === id);
    if (!m) continue;
    lejos += (m.rasgos["nucleo:disparar" as never] ?? 0) + (m.rasgos["nucleo:habilidades" as never] ?? 0);
    cerca += m.rasgos["nucleo:cuerpo-a-cuerpo" as never] ?? 0;
  }
  return c.modulos.includes("disparos") || lejos >= cerca ? "distancia" : "cuerpo";
}

const r2 = (x: number): number => Math.round(x * 100) / 100;

/** Familia de enemigos según los modelos y géneros de la combinación. */
export function familiaDe(c: Combinacion): Arquetipo["familia"] {
  const g = new Set([...c.generos, ...c.ids]);
  if (c.ids.includes("mod-zombis") || g.has("zombis") || [...g].some((x) => x.includes("zombi"))) return "zombi";
  if (c.ids.includes("mod-militar") || g.has("militar") || g.has("tactico")) return "soldado";
  if (g.has("ciencia-ficcion") || g.has("naves")) return "maquina";
  return "fantasia";
}

/** Hornea las reglas de una combinación en tablas para cualquier motor. Determinista con la semilla. */
export function hornearReglas(c: Combinacion, op: OpcionesHorneado = {}): ReglasHorneadas {
  const niveles = Math.max(1, op.niveles ?? 30);
  const semilla = op.semilla ?? 1;
  const disparos = (op.arma ?? armaDe(c)) === "distancia";
  const bal = c.reglas.balance as { curva?: CurvaPoder; reglas?: ReglasBalance } | undefined;
  const poder: CurvaPoder = bal?.curva ?? (c.generos.includes("tactico") || c.generos.includes("competitivo") ? PODER_SHOOTER : PODER_RPG);
  const reglas: ReglasBalance = bal?.reglas ?? BALANCE_ACCION;
  const progresion = op.progresion ?? "prototipo";
  const aj = progresion === "prototipo" ? AJUSTE_MULTITUD : null;
  const mb = new ModeloBalance(poder, reglas);
  const costoExp = ((c.reglas.experiencia as { costo?: Curva } | undefined)?.costo) ?? curva.potencia(120, 1.6);
  const rareza = (c.reglas.rareza as TablaRarezaNivel | undefined) ?? RAREZA_ARPG;
  const lista = Array.from({ length: niveles }, (_, i) => i + 1);

  const familia = op.familia ?? familiaDe(c);
  const candidatos = ARQUETIPOS.filter((a) => a.familia === familia);
  const tipos = (candidatos.length ? candidatos : ARQUETIPOS.filter((a) => a.familia === "fantasia"))
    .slice()
    .sort((a, b) => b.peso - a.peso || a.id.localeCompare(b.id))
    .slice(0, 4);

  const stats = (a: Arquetipo, n: number): StatsHorneadas => {
    const e = mb.enemigo(n, a.pesoVida, a.pesoAtaque);
    return {
      vida: Math.max(1, Math.round(e.vida * (aj?.vidaComun ?? 1))),
      danio: Math.max(1, Math.round(e.ataque * mb.pasaAlJugador(n) * (aj?.danioComun ?? 1))),
      golpeRecibido: Math.max(1, Math.round(mb.poder(n).golpe * mitigacionBalance(e.defensa, reglas.kEnemigo))),
      exp: Math.max(1, e.exp),
    };
  };

  const enemigos: EnemigoHorneado[] = tipos.map((a) => ({
    id: a.id, familia: a.familia, conducta: a.conducta,
    velocidad: r2(a.velocidad * 2.6), alcance: r2(Math.max(1, a.alcance)), distancia: !!a.distancia,
    costo: a.costo, peso: a.peso,
    porNivel: lista.map((n) => stats(a, n)),
  }));

  const jefe = lista.map((n) => {
    const j = mb.jefe(n);
    return {
      vida: Math.max(1, Math.round(j.vida * (aj?.vidaJefe ?? 1))),
      danio: Math.max(1, Math.round(j.ataque * mb.pasaAlJugador(n) * (aj?.danioJefe ?? 1))),
      golpeRecibido: Math.max(1, Math.round(mb.poder(n).golpe * mitigacionBalance(j.defensa, reglas.kEnemigo))),
      exp: Math.max(1, j.exp),
      duracion: r2(j.duracion),
    };
  });

  // Oleadas: presupuesto creciente repartido por peso entre los tipos (determinista con la semilla).
  const azar = new Pcg32(semilla);
  const totalPeso = tipos.reduce((s, a) => s + a.peso, 0);
  const oleadas: OleadaHorneada[] = [];
  for (let i = 1; i <= Math.max(1, op.oleadas ?? 30); i++) {
    let presupuesto = Math.round(5 + i * 2.5);
    const cuenta = new Map<string, number>();
    for (let guardia = 0; presupuesto > 0 && guardia < 400; guardia++) {
      let x = azar.siguiente() * totalPeso;
      const a = tipos.find((t) => (x -= t.peso) < 0) ?? tipos[0]!;
      if (a.costo > presupuesto) {
        if (tipos.every((t) => t.costo > presupuesto)) break;
        continue;
      }
      presupuesto -= a.costo;
      cuenta.set(a.id, (cuenta.get(a.id) ?? 0) + 1);
    }
    oleadas.push({
      numero: i,
      nivel: Math.min(niveles, 1 + Math.floor((i - 1) / 2)),
      enemigos: tipos.filter((t) => cuenta.has(t.id)).map((t) => ({ id: t.id, cantidad: cuenta.get(t.id)! })),
      jefe: i % 5 === 0,
    });
  }

  return {
    version: "txnucleo.reglas.v1",
    juego: op.nombre ?? c.nombre,
    modelos: c.ids,
    generos: c.generos,
    semilla,
    niveles,
    progresion,
    ajusteMultitud: aj ? { ...aj } : null,
    jugador: {
      velocidad: 4.5,
      alcance: disparos ? 6.5 : 1.6,
      aDistancia: disparos,
      ritmo: reglas.ritmoJugador,
      porNivel: lista.map((n) => {
        const p = mb.poder(n);
        return { vida: Math.round(p.vida), golpe: Math.round(p.golpe), defensa: Math.round(p.defensa) };
      }),
      expParaSubir: lista.map((n) => Math.max(1, Math.round(progresion === "modelo" ? evaluar(costoExp, n) : (enemigos[0]?.porNivel[n - 1]!.exp ?? 1) * (8 + 1.5 * n)))),
    },
    enemigos,
    jefe: { cada: 5, porNivel: jefe },
    botin: {
      nombres: rareza.nombres,
      colores: rareza.colores ?? [],
      probabilidades: lista.map((n) => probabilidadesRareza(rareza, n).map((p) => Math.round(p * 1e4) / 1e4)),
      probSoltar: 0.25,
    },
    oleadas,
  };
}

/** Un aviso del análisis de balance. */
export interface AvisoBalance {
  readonly nivel: number;
  readonly tipo: "muy-facil" | "muy-dificil" | "lento" | "subida-lenta";
  readonly detalle: string;
}

/** Fila del análisis por nivel. */
export interface FilaBalance {
  readonly nivel: number;
  /** Golpes del jugador para matar al enemigo más común. */
  readonly golpesParaMatar: number;
  /** Segundos para matarlo al ritmo del jugador. */
  readonly segundosParaMatar: number;
  /** Golpes del enemigo más común que aguanta el jugador. */
  readonly golpesParaMorir: number;
  /** Enemigos comunes para subir al siguiente nivel. */
  readonly enemigosParaSubir: number;
  /** Segundos para matar al jefe del nivel. */
  readonly segundosJefe: number;
}

/**
 * Analiza las tablas horneadas: cuánto tarda el jugador en matar, cuánto aguanta, cuántos enemigos necesita para
 * subir. Marca los niveles fuera de rango (los umbrales son guías de diseño de acción, ajustables).
 */
export function analizarBalance(r: ReglasHorneadas, umbrales = { matarMin: 1, matarMax: 12, morirMin: 3, subirMax: 60, segundosMax: 6 }): { filas: FilaBalance[]; avisos: AvisoBalance[] } {
  const comun = r.enemigos[0];
  const filas: FilaBalance[] = [];
  const avisos: AvisoBalance[] = [];
  if (!comun) return { filas, avisos };
  for (let i = 0; i < r.niveles; i++) {
    const e = comun.porNivel[i]!, j = r.jefe.porNivel[i]!, p = r.jugador.porNivel[i]!;
    const fila: FilaBalance = {
      nivel: i + 1,
      golpesParaMatar: Math.ceil(e.vida / e.golpeRecibido),
      segundosParaMatar: r2(Math.ceil(e.vida / e.golpeRecibido) / r.jugador.ritmo),
      golpesParaMorir: Math.ceil(p.vida / e.danio),
      enemigosParaSubir: Math.ceil(r.jugador.expParaSubir[i]! / e.exp),
      segundosJefe: r2(Math.ceil(j.vida / j.golpeRecibido) / r.jugador.ritmo),
    };
    filas.push(fila);
    if (fila.golpesParaMatar <= umbrales.matarMin) avisos.push({ nivel: fila.nivel, tipo: "muy-facil", detalle: `el enemigo común muere de ${fila.golpesParaMatar} golpe` });
    if (fila.golpesParaMatar > umbrales.matarMax) avisos.push({ nivel: fila.nivel, tipo: "lento", detalle: `${fila.golpesParaMatar} golpes para matar a un común` });
    if (fila.segundosParaMatar > umbrales.segundosMax) avisos.push({ nivel: fila.nivel, tipo: "lento", detalle: `${fila.segundosParaMatar} s para matar a un común` });
    if (fila.golpesParaMorir < umbrales.morirMin) avisos.push({ nivel: fila.nivel, tipo: "muy-dificil", detalle: `el jugador muere en ${fila.golpesParaMorir} golpes` });
    if (fila.enemigosParaSubir > umbrales.subirMax) avisos.push({ nivel: fila.nivel, tipo: "subida-lenta", detalle: `${fila.enemigosParaSubir} enemigos para subir de nivel` });
  }
  return { filas, avisos };
}
