// Plan de arte de la red TxNucleo: a partir de la combinación de modelos (src/modelos) y, si existe, del contrato
// de estilo, decide si el juego pide arte 2D (pxl) o 3D (kiln) y lista los recursos mínimos para un prototipo
// jugable, con archivos de partida (.px.js con la paleta fija, .kiln.js de bloques con medidas reales).

import type { Combinacion } from "../modelos/tipos.ts";
import type { ContratoEstilo } from "./contratos.ts";
import type { PiezaBloque } from "./adaptadores/kiln.ts";

/** Tipo de arte que pide el juego. */
export type DimensionArte = "2d" | "3d" | "interfaz";

/** Un recurso a producir con una herramienta de la red. */
export interface TareaArte {
  readonly id: string;
  readonly herramienta: "pxl" | "kiln";
  /** Archivo fuente editable a crear (relativo a la carpeta del juego). */
  readonly archivo: string;
  readonly descripcion: string;
}

/** Decide 2D/3D desde la respuesta "perspectiva" del asistente o, si no hay, desde las reglas combinadas. */
export function dimensionDe(c: Combinacion, perspectiva?: string): DimensionArte {
  if (perspectiva === "primera" || perspectiva === "tercera") return "3d";
  if (perspectiva === "superior" || perspectiva === "lateral" || perspectiva === "isometrica") return "2d";
  if (perspectiva === "sin-mapa") return "interfaz";
  return c.reglas.movimiento3d ? "3d" : "2d";
}

const usa = (c: Combinacion, m: string): boolean => c.modulos.includes(m);

/** Recursos mínimos para un prototipo jugable de la combinación. */
export function tareasDeArte(c: Combinacion, dimension: DimensionArte): TareaArte[] {
  const t: TareaArte[] = [];
  if (dimension === "interfaz") {
    t.push({ id: "iconos", herramienta: "pxl", archivo: "arte/iconos.px.js", descripcion: "Iconos de interfaz (recursos, cartas, botones) en una hoja." });
    return t;
  }
  if (dimension === "2d") {
    t.push({ id: "jugador", herramienta: "pxl", archivo: "arte/personajes.px.js", descripcion: "Jugador: quieto, caminar (4 cuadros) y golpe/disparo como anim()." });
    if (usa(c, "ia") || usa(c, "encuentros") || usa(c, "combate")) t.push({ id: "enemigos", herramienta: "pxl", archivo: "arte/personajes.px.js", descripcion: "2-3 enemigos base y variantes de color con swap (élite, jefe)." });
    if (usa(c, "botin") || usa(c, "inventario")) t.push({ id: "objetos", herramienta: "pxl", archivo: "arte/objetos.px.js", descripcion: "Iconos de objetos y cofres por rareza (mismo sprite, swap de color)." });
    t.push({ id: "escenario", herramienta: "pxl", archivo: "arte/escenario.px.js", descripcion: "Tiles del escenario (suelo, pared, borde) y utilería." });
    return t;
  }
  t.push({ id: "jugador", herramienta: "kiln", archivo: "modelos/jugador.kiln.js", descripcion: "Silueta del jugador a escala (≈1,8 m) para cámara, colisión y animación de prueba." });
  if (c.datos.includes("armas") || usa(c, "disparos")) t.push({ id: "armas", herramienta: "kiln", archivo: "modelos/<arma>.kiln.js", descripcion: "Un bloque por arma del catálogo (datos.armas) con su largo real; luego refinar." });
  if (usa(c, "ia") || usa(c, "encuentros")) t.push({ id: "enemigos", herramienta: "kiln", archivo: "modelos/enemigo.kiln.js", descripcion: "Enemigo base con piezas nombradas (cabeza, torso, brazos) para hitboxes por parte." });
  if (usa(c, "botin") || usa(c, "inventario") || usa(c, "supervivencia")) t.push({ id: "botin", herramienta: "kiln", archivo: "modelos/contenedor.kiln.js", descripcion: "Contenedores de botín y suministros (etiqueta: botin)." });
  if (usa(c, "carreras")) t.push({ id: "vehiculo", herramienta: "kiln", archivo: "modelos/vehiculo.kiln.js", descripcion: "Vehículo con medidas de datos.vehiculos (ruedas como piezas separadas)." });
  t.push({ id: "escenario", herramienta: "kiln", archivo: "modelos/cobertura.kiln.js", descripcion: "Kit de escenario: muros, coberturas y puertas a escala (etiqueta: cobertura)." });
  return t;
}

/** Medidas de referencia (largo, alto, ancho en metros) por categoría de arma, para los bloques iniciales. */
export const MEDIDAS_ARMA: Readonly<Record<string, readonly [number, number, number]>> = {
  pistola: [0.2, 0.14, 0.035],
  revolver: [0.27, 0.15, 0.04],
  subfusil: [0.6, 0.2, 0.05],
  pdw: [0.55, 0.2, 0.05],
  carabina: [0.85, 0.22, 0.06],
  fusil: [0.95, 0.22, 0.06],
  batalla: [1.05, 0.23, 0.065],
  tirador: [1.1, 0.23, 0.065],
  francotirador: [1.2, 0.22, 0.07],
  antimaterial: [1.45, 0.25, 0.1],
  escopeta: [1.05, 0.18, 0.06],
  ametralladora: [1.1, 0.25, 0.1],
};

/** Bloques de un arma: cuerpo, cañón y empuñadura, a partir de su categoría (o de un fusil si no se conoce). */
export function bloquesDeArma(categoria: string): PiezaBloque[] {
  const [l, h, a] = MEDIDAS_ARMA[categoria] ?? MEDIDAS_ARMA.fusil!;
  const y = 1.2; // altura de manos aproximada, para verla en mano en el visor
  return [
    { nombre: "cuerpo", tamano: [l * 0.55, h * 0.55, a], posicion: [0, y, 0], color: "#2c2f33", metal: 0.5 },
    { nombre: "canon", tamano: [l * 0.45, h * 0.18, a * 0.5], posicion: [l * 0.5, y + h * 0.1, 0], color: "#1d1f22", metal: 0.8 },
    { nombre: "empunadura", tamano: [l * 0.1, h * 0.6, a * 0.9], posicion: [-l * 0.12, y - h * 0.45, 0], color: "#3b3a36" },
  ];
}

/** Sección de PLAN.md con el estilo y las tareas de arte. */
export function seccionPlanArte(dimension: DimensionArte, tareas: readonly TareaArte[], estilo?: ContratoEstilo): string[] {
  const l: string[] = ["## Arte con la red TxNucleo", "", `Tipo de arte: **${dimension}**. Herramientas: \`npm run red -- doctor\` (guía en docs/RED.md).`, ""];
  if (estilo) l.push(`Estilo \`${estilo.nombre}\`: ${estilo.paleta.map((c) => `${c.rol} ${c.hex}`).join(" · ")}${estilo.pixel ? ` · ${estilo.pixel.resolucion.join("×")} ×${estilo.pixel.escala}` : ""}`, "");
  else l.push("Sin contrato de estilo todavía: `npm run red -- estilo <referencia.png> --nombre <juego>` y volver a correr el asistente con `--estilo estilo.json`.", "");
  for (const t of tareas) l.push(`- [ ] **${t.id}** (${t.herramienta}) \`${t.archivo}\`: ${t.descripcion}`);
  l.push(
    "",
    "Ciclo de trabajo (desde la carpeta del juego, con `npm --prefix <TxNucleo> run red -- ...`):",
    "",
    "1. Editar las fuentes (`.px.js` / `.kiln.js`). Son el arte de verdad: van al repositorio.",
    "2. `estado`: qué fuentes son nuevas o cambiaron y qué herramientas faltan.",
    "3. `construir`: construye solo lo que cambió, escribe los contratos (`*.hoja.json`, `*.modelo.json`), los registra en `txnucleo.recursos.json`, revisa los colores contra el estilo y, en Godot, reimporta y verifica.",
    "4. Importar en el motor: Godot con `integraciones/godot/txnucleo_importar.gd` (ver docs/RED.md para web y Unity).",
    "",
  );
  return l;
}
