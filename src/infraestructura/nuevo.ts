// `txn nuevo "<idea>"`: de una frase a un prototipo QUE SE JUEGA. Interpreta la idea, combina modelos de género,
// hornea las reglas en tablas (reglas.json), genera el arte de partida desde esos datos (pxl), copia la plantilla
// jugable (Godot, web o ambas), construye el arte, prueba la partida con un bot y deja el PLAN.md con qué cambiar.
// Nunca escribe en una carpeta que ya tiene archivos.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { exito, fallo, type Resultado } from "../nucleo/resultado.ts";
import { interpretarIdea, planDeImplementacion, recomendar, type IdeaInterpretada } from "../modelos/index.ts";
import {
  analizarBalance, arteDePlantilla, hornearReglas, paletaDesdeEstilo, PALETAS_FAMILIA, familiaDe,
  type ContratoEstilo, type ReglasHorneadas,
} from "../enlaces/index.ts";
import type { Arquetipo } from "../datos/criaturas.ts";
import type { Combinacion } from "../modelos/tipos.ts";
import { doctor, estiloDesdeImagen } from "./enlaces.ts";
import { construirJuego, iniciarJuego } from "./proyecto-red.ts";

/** Motor(es) del prototipo. */
export type MotorPrototipo = "godot" | "web" | "ambos";

/** Raíz del repositorio de TxNucleo (para leer plantillas e integraciones). */
const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PLANTILLA = join(RAIZ, "plantillas", "accion-cenital");

/** Resumen de lo que hizo `nuevoJuego`. */
export interface ResumenNuevo {
  readonly carpeta: string;
  readonly idea: IdeaInterpretada;
  readonly combinacion: Combinacion;
  readonly familia: string;
  readonly arma: "distancia" | "cuerpo";
  readonly motor: MotorPrototipo;
  readonly estilo: "referencia" | "paleta propia";
  readonly arteConstruido: boolean;
  readonly bot: Record<string, unknown>;
  readonly avisosBalance: number;
  readonly archivos: readonly string[];
}

const FAMILIA_POR_AMBIENTACION: Readonly<Record<string, Arquetipo["familia"]>> = {
  zombis: "zombi", terror: "zombi", militar: "soldado", "ciencia-ficcion": "maquina", fantasia: "fantasia",
};

/** Arma del jugador según lo que dice la idea (si lo dice). */
function armaDeIdea(i: IdeaInterpretada): "distancia" | "cuerpo" | undefined {
  const n = (i.respuestas.nucleo as readonly string[] | undefined) ?? [];
  if (n.includes("disparar") || n.includes("habilidades")) return "distancia";
  if (n.includes("cuerpo-a-cuerpo")) return "cuerpo";
  return undefined;
}

/** Copia una carpeta de plantilla reemplazando {{NOMBRE}} y {{MODELOS}} en archivos de texto. */
function copiarPlantilla(origen: string, destino: string, vars: Record<string, string>, hechos: string[], raiz: string): void {
  mkdirSync(destino, { recursive: true });
  for (const n of readdirSync(origen)) {
    const o = join(origen, n), d = join(destino, n);
    if (statSync(o).isDirectory()) { copiarPlantilla(o, d, vars, hechos, raiz); continue; }
    if (existsSync(d)) continue;
    if (/\.(gd|js|html|godot|tscn|json|md)$/.test(n)) {
      let t = readFileSync(o, "utf8");
      for (const [k, v] of Object.entries(vars)) t = t.split(`{{${k}}}`).join(v);
      writeFileSync(d, t);
    } else copyFileSync(o, d);
    hechos.push(d.slice(raiz.length + 1).replace(/\\/g, "/"));
  }
}

/** PLAN.md del prototipo: qué entendió, qué combinó, cómo se juega, qué probó el bot y qué cambiar primero. */
function planMd(nombre: string, idea: string, r: ResumenNuevo, reglas: ReglasHorneadas): string {
  const bal = analizarBalance(reglas);
  const f = (n: number) => bal.filas[n - 1];
  const l = [
    `# ${nombre}`, "",
    `> Idea: "${idea}"`, "",
    "## Qué entendió TxNucleo", "",
    ...r.idea.coincidencias.map((c) => `- **${c.pregunta}** = ${c.valor} (por "${c.palabra}")`),
    r.idea.sinRespuesta.length ? `- Sin datos (se usó lo más común): ${r.idea.sinRespuesta.join(", ")}` : "",
    "", `Modelos combinados: ${r.combinacion.ids.map((x) => `\`${x}\``).join(" + ")} · enemigos: familia **${r.familia}** (${reglas.enemigos.map((e) => e.id).join(", ")}) · arma del jugador: **${r.arma}**.`, "",
    "## Jugar", "",
    r.motor !== "web" ? "- Godot: `txn jugar` (o abrir `project.godot` con Godot 4.5+)." : "",
    r.motor !== "godot" ? "- Navegador: `txn jugar --web` y abrir la dirección que muestra." : "",
    "- Controles: WASD/flechas mover · Espacio esquivar · R reiniciar · B bot.", "",
    "## Cómo está hecho", "",
    "- `reglas.json`: tablas horneadas por TxNucleo con sus mecánicas (balance por nivel, experiencia, oleadas, rareza del botín). Regenerar: `txn rehornear`.",
    "- `arte/personajes.px.js`: arte de partida generado desde esas tablas (un enemigo por tipo, un cofre por rareza). Es la FUENTE: editala y `txn construir`.",
    "- `simulacion.gd` / `web/simulacion.js`: la misma lógica de juego, pura y determinista; el bot de pruebas la usa sin pantalla.", "",
    "## Lo que midió el bot", "",
    "```json", JSON.stringify(r.bot, null, 2), "```", "",
    "## Balance (nivel 1 · 10 · 30)", "",
    "| | n1 | n10 | n30 |", "|---|---|---|---|",
    `| golpes para matar a un común | ${f(1)?.golpesParaMatar} | ${f(10)?.golpesParaMatar} | ${f(30)?.golpesParaMatar} |`,
    `| golpes que aguanta el jugador | ${f(1)?.golpesParaMorir} | ${f(10)?.golpesParaMorir} | ${f(30)?.golpesParaMorir} |`,
    `| enemigos para subir de nivel | ${f(1)?.enemigosParaSubir} | ${f(10)?.enemigosParaSubir} | ${f(30)?.enemigosParaSubir} |`,
    `| segundos para matar al jefe | ${f(1)?.segundosJefe} | ${f(10)?.segundosJefe} | ${f(30)?.segundosJefe} |`, "",
    bal.avisos.length ? `Avisos: ${bal.avisos.slice(0, 5).map((a) => `n${a.nivel} ${a.detalle}`).join(" · ")}` : "Sin avisos de balance.", "",
    "## Siguientes pasos (de TxNucleo, para esta combinación)", "",
    ...planDeImplementacion(r.combinacion).map((p) => `- ${p}`), "",
    "## Ciclo de trabajo", "",
    "`txn estado` → editar fuentes → `txn construir` → `txn probar` (bot) → `txn balance` → `txn informe`.", "",
  ];
  return l.filter((x, i) => x !== "" || l[i - 1] !== "").join("\n");
}

/** Crea el prototipo jugable. Requiere una carpeta nueva o vacía. */
export async function nuevoJuego(idea: string, op: { salida: string; motor?: MotorPrototipo; nombre?: string; referencia?: string; log?: (s: string) => void }): Promise<Resultado<ResumenNuevo, string>> {
  const log = op.log ?? (() => {});
  const carpeta = resolve(op.salida);
  if (existsSync(carpeta) && readdirSync(carpeta).length) return fallo(`${carpeta} ya tiene archivos: elegí una carpeta nueva (txn nuevo nunca pisa nada)`);
  const motor = op.motor ?? "ambos";
  const nombre = op.nombre ?? basename(carpeta);

  // 1) Idea → modelos.
  const interp = interpretarIdea(idea);
  const rec = recomendar(interp.respuestas);
  const c = rec.combinacion;
  const amb = interp.respuestas.ambientacion as string | undefined;
  const familia = (amb && FAMILIA_POR_AMBIENTACION[amb]) || familiaDe(c);
  const armaIdea = armaDeIdea(interp);
  log(`· idea → ${c.ids.join(" + ")} (enemigos: ${familia})`);

  // 2) Proyecto de red + estilo.
  mkdirSync(carpeta, { recursive: true });
  const ini = iniciarJuego(carpeta, { nombre, motor: motor === "web" ? "web" : "godot", estilo: null });
  if (!ini.ok) return ini;
  let estilo: ContratoEstilo | null = null;
  if (op.referencia) {
    const e = estiloDesdeImagen(op.referencia, join(carpeta, "estilo.json"), { nombre, grilla: 6 });
    if (!e.ok) return fallo(`estilo desde la referencia: ${e.error}`);
    estilo = e.valor;
    const p = JSON.parse(readFileSync(join(carpeta, "txnucleo.red.json"), "utf8"));
    writeFileSync(join(carpeta, "txnucleo.red.json"), JSON.stringify({ ...p, estilo: "estilo.json" }, null, 2) + "\n");
    log(`· estilo desde ${basename(op.referencia)}: ${estilo.paleta.length} colores`);
  }

  // 3) Reglas horneadas + arte desde datos.
  const reglas = hornearReglas(c, { nombre, familia, ...(armaIdea ? { arma: armaIdea } : {}) });
  const arma = reglas.jugador.aDistancia ? "distancia" : "cuerpo";
  writeFileSync(join(carpeta, "reglas.json"), JSON.stringify(reglas, null, 1) + "\n");
  writeFileSync(join(carpeta, "txnucleo.juego.json"), JSON.stringify({ ...c, nombre, idea, interpretacion: interp, horneado: { familia, arma: armaIdea ?? null } }, null, 2) + "\n");
  const paleta = estilo ? paletaDesdeEstilo(estilo) : PALETAS_FAMILIA[familia] ?? PALETAS_FAMILIA.fantasia!;
  writeFileSync(join(carpeta, "arte", "personajes.px.js"), arteDePlantilla(reglas, paleta));
  log(`· reglas horneadas: ${reglas.niveles} niveles, ${reglas.enemigos.length} enemigos, ${reglas.oleadas.length} oleadas; arte: ${reglas.enemigos.length + reglas.botin.nombres.length + 5} sprites`);

  // 4) Plantilla jugable.
  const archivos: string[] = [];
  const vars = { NOMBRE: nombre, MODELOS: c.ids.join(" + ") };
  if (motor !== "web") {
    copiarPlantilla(join(PLANTILLA, "godot"), carpeta, vars, archivos, carpeta);
    copyFileSync(join(RAIZ, "integraciones", "godot", "txnucleo_importar.gd"), join(carpeta, "txnucleo_importar.gd"));
    archivos.push("txnucleo_importar.gd");
    const gi = join(carpeta, ".gitignore");
    writeFileSync(gi, readFileSync(gi, "utf8") + ".godot/\n");
  }
  if (motor !== "godot") {
    copiarPlantilla(join(PLANTILLA, "web"), join(carpeta, "web"), vars, archivos, carpeta);
    writeFileSync(join(carpeta, "web", ".gdignore"), "");
  }
  log(`· plantilla acción cenital (${motor}): ${archivos.length} archivos`);

  // 5) Construir el arte (si pxl está) y probar con el bot.
  let arteConstruido = false;
  if (doctor(["pxl"]).herramientas[0]!.instalada) {
    const b = construirJuego(carpeta);
    arteConstruido = b.ok && b.valor.construidas.includes("arte/personajes.px.js");
    log(arteConstruido ? "· arte construido con pxl" : `· arte sin construir: ${b.ok ? b.valor.errores.join("; ") : b.error}`);
    if (b.ok) for (const a of b.valor.avisos) log(`  aviso: ${a}`);
  } else log("· pxl no está instalado: el juego dibuja figuras hasta `txn instalar pxl` + `txn construir`");
  const sim = await import(pathToFileURL(join(PLANTILLA, "web", "simulacion.js")).href);
  const partidas = [1, 2, 3].map((s) => sim.probarConBot(JSON.parse(JSON.stringify(reglas)), 120, s));
  const bot = { segundos: 120, semillas: 3, vivos: partidas.filter((p: { vivo: boolean }) => p.vivo).length, partidas };
  mkdirSync(join(carpeta, ".txnucleo"), { recursive: true });
  writeFileSync(join(carpeta, ".txnucleo", "bot.json"), JSON.stringify(bot, null, 2) + "\n");
  log(`· bot: ${bot.vivos}/3 vivos a los 120 s; oleada media ${(partidas.reduce((s: number, p: { oleada: number }) => s + p.oleada, 0) / 3).toFixed(1)}`);

  const resumen: ResumenNuevo = {
    carpeta, idea: interp, combinacion: c, familia, arma, motor, estilo: estilo ? "referencia" : "paleta propia",
    arteConstruido, bot, avisosBalance: analizarBalance(reglas).avisos.length, archivos,
  };
  writeFileSync(join(carpeta, "PLAN.md"), planMd(nombre, idea, resumen, reglas));
  return exito(resumen);
}
