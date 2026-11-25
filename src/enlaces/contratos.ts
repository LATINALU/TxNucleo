// Contratos de datos de la red TxNucleo: lo que intercambian las herramientas externas (arte 2D, arte 3D, estilo,
// motores) y el juego. Son JSON simples y neutros a motores: Godot, Unity, Unreal o la web los importan a su manera.
// Validadores sin dependencias: devuelven la lista de errores (vacía = válido). Esquemas JSON en docs/esquemas/.

/** Vector 3D como tupla [x, y, z]. */
export type V3 = readonly [number, number, number];

// ─────────────────────────────── Hoja de sprites ───────────────────────────────

/** Un cuadro dentro de la imagen de una hoja de sprites. */
export interface CuadroSprite {
  readonly nombre: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Duración en milisegundos (solo cuadros de animación). */
  readonly ms?: number;
}

/** Tramo de cuadros consecutivos que forman una animación. */
export interface AnimacionSprite {
  readonly nombre: string;
  /** Índices de cuadros, inclusivos. */
  readonly desde: number;
  readonly hasta: number;
  readonly bucle: boolean;
  /** Duración de cada cuadro del tramo, en ms. */
  readonly ms: readonly number[];
}

/** Hoja de sprites neutra a motores (imagen + cuadros + animaciones). */
export interface HojaSprites {
  readonly version: "txnucleo.hoja.v1";
  /** Ruta de la imagen relativa a este JSON. */
  readonly imagen: string;
  readonly ancho: number;
  readonly alto: number;
  readonly cuadros: readonly CuadroSprite[];
  readonly animaciones: readonly AnimacionSprite[];
  /** Punto de anclaje normalizado (0..1) para colocar el sprite: [0.5, 1] = pies. */
  readonly pivote: readonly [number, number];
  readonly origen: Origen;
}

// ─────────────────────────────── Modelo 3D ───────────────────────────────

/** Forma de colisión simple sugerida para un modelo. */
export type FormaColision =
  | { readonly forma: "caja"; readonly tamano: V3; readonly centro: V3 }
  | { readonly forma: "capsula"; readonly radio: number; readonly alto: number; readonly centro: V3 }
  | { readonly forma: "esfera"; readonly radio: number; readonly centro: V3 };

/** Ficha de un modelo .glb: medidas, nodos, colisión sugerida y etiquetas de juego. */
export interface Modelo3D {
  readonly version: "txnucleo.modelo3d.v1";
  /** Ruta del .glb relativa a este JSON. */
  readonly glb: string;
  readonly bytes: number;
  readonly sha256?: string;
  readonly unidades: "m";
  readonly ejes: { readonly arriba: string; readonly adelante: string };
  readonly caja: { readonly min: V3; readonly max: V3; readonly tamano: V3; readonly centro: V3 };
  readonly triangulos: number;
  readonly nodos: readonly string[];
  readonly materiales: number;
  /** Valores de parámetros con los que se construyó (p. ej. defineParams de kiln). */
  readonly parametros: Readonly<Record<string, unknown>>;
  /** Colisión sugerida desde la caja envolvente; el juego puede reemplazarla. */
  readonly colision: FormaColision;
  /** Etiquetas de juego libres: "cobertura", "botin", "destructible"... */
  readonly etiquetas: readonly string[];
  readonly qa: "aprobado" | "rechazado" | "desconocido";
  readonly avisos: readonly string[];
  readonly origen: Origen;
}

// ─────────────────────────────── Estilo ───────────────────────────────

/** Color con rol semántico, en hex y en OKLab. */
export interface ColorEstilo {
  /** Rol semántico: "cuerpo", "contorno", "cielo", "peligro"... */
  readonly rol: string;
  readonly hex: string;
  readonly oklab: V3;
}

/** Contrato de estilo visual: paleta, resolución de píxel, luz y referencias. */
export interface ContratoEstilo {
  readonly version: "txnucleo.estilo.v1";
  readonly nombre: string;
  readonly paleta: readonly ColorEstilo[];
  /** Resolución lógica en píxeles y escala entera (arte pixel); se omite en estilos no pixelados. */
  readonly pixel?: { readonly resolucion: readonly [number, number]; readonly escala: number };
  /** Dirección de la luz principal en pantalla (x derecha, y abajo), normalizada. */
  readonly luz?: readonly [number, number];
  readonly referencias: readonly { readonly sha256: string; readonly id?: string }[];
  readonly notas: readonly string[];
}

// ─────────────────────────────── Manifiesto ───────────────────────────────

/** Tipos de recurso que lista el manifiesto. */
export type TipoRecurso = "sprites" | "modelo3d" | "imagen" | "audio" | "estilo" | "otro";

/** Un recurso del juego con su hash, origen y licencia. */
export interface Recurso {
  readonly ruta: string;
  readonly tipo: TipoRecurso;
  readonly sha256: string;
  readonly origen: Origen;
  /** Licencia del recurso generado (no de la herramienta): "propia", "CC0", "MIT"... */
  readonly licencia: string;
}

/** Lista de recursos del juego (para verificar que nada cambió ni falta). */
export interface ManifiestoRecursos {
  readonly version: "txnucleo.recursos.v1";
  readonly recursos: readonly Recurso[];
}

/** Qué herramienta produjo el dato y desde qué fuente editable. */
export interface Origen {
  readonly herramienta: string;
  /** Fuente editable, relativa a la raíz del juego (p. ej. "arte/personajes.px.js"). */
  readonly fuente?: string;
  /** Hash de la fuente cuando se construyó: si cambia, `red construir` la vuelve a construir. */
  readonly fuenteSha256?: string;
  readonly version?: string;
}

// ─────────────────────────────── Validación ───────────────────────────────

const esNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const esTexto = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const esV3 = (v: unknown): boolean => Array.isArray(v) && v.length === 3 && v.every(esNum);
const esObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const HEX = /^#[0-9a-fA-F]{6}$/;
const SHA = /^[0-9a-f]{64}$/;

function validarOrigen(o: unknown, ruta: string, e: string[]): void {
  if (!esObj(o) || !esTexto(o.herramienta)) e.push(`${ruta}.herramienta: falta`);
  else if (o.fuenteSha256 !== undefined && !(typeof o.fuenteSha256 === "string" && SHA.test(o.fuenteSha256))) e.push(`${ruta}.fuenteSha256: 64 hex`);
}

/** Ruta relativa sin salir de la carpeta del juego (sin "..", sin absoluta). */
export function rutaSegura(r: unknown): boolean {
  if (!esTexto(r)) return false;
  const n = r.replace(/\\/g, "/");
  return !n.startsWith("/") && !/^[a-zA-Z]:/.test(n) && !n.split("/").includes("..");
}

/** Valida una HojaSprites; devuelve los errores (vacío = válida). */
export function validarHoja(h: unknown): string[] {
  const e: string[] = [];
  if (!esObj(h)) return ["la hoja no es un objeto"];
  if (h.version !== "txnucleo.hoja.v1") e.push("version: se esperaba txnucleo.hoja.v1");
  if (!rutaSegura(h.imagen)) e.push("imagen: ruta relativa requerida");
  if (!esNum(h.ancho) || h.ancho <= 0 || !esNum(h.alto) || h.alto <= 0) e.push("ancho/alto: positivos");
  const cuadros = Array.isArray(h.cuadros) ? h.cuadros : [];
  if (!Array.isArray(h.cuadros) || cuadros.length === 0) e.push("cuadros: al menos uno");
  const nombres = new Set<string>();
  cuadros.forEach((c: unknown, i) => {
    if (!esObj(c) || !esTexto(c.nombre)) { e.push(`cuadros[${i}]: nombre`); return; }
    if (nombres.has(c.nombre)) e.push(`cuadros[${i}]: nombre repetido ${c.nombre}`);
    nombres.add(c.nombre);
    if (![c.x, c.y, c.w, c.h].every(esNum)) { e.push(`cuadros[${i}]: x/y/w/h`); return; }
    const [x, y, w, hh] = [c.x, c.y, c.w, c.h] as number[];
    if (w <= 0 || hh <= 0 || x < 0 || y < 0) e.push(`cuadros[${i}]: tamaño o posición inválidos`);
    else if (esNum(h.ancho) && esNum(h.alto) && (x + w > h.ancho || y + hh > h.alto)) e.push(`cuadros[${i}]: se sale de la imagen`);
  });
  const anims = Array.isArray(h.animaciones) ? h.animaciones : [];
  if (!Array.isArray(h.animaciones)) e.push("animaciones: lista requerida");
  anims.forEach((a: unknown, i) => {
    if (!esObj(a) || !esTexto(a.nombre) || !esNum(a.desde) || !esNum(a.hasta)) { e.push(`animaciones[${i}]: nombre/desde/hasta`); return; }
    if (a.desde < 0 || a.hasta < a.desde || a.hasta >= cuadros.length) e.push(`animaciones[${i}]: tramo fuera de los cuadros`);
    if (!Array.isArray(a.ms) || a.ms.length !== a.hasta - a.desde + 1 || !a.ms.every((m) => esNum(m) && m > 0)) e.push(`animaciones[${i}]: ms por cuadro`);
  });
  if (!Array.isArray(h.pivote) || h.pivote.length !== 2 || !h.pivote.every(esNum)) e.push("pivote: [x, y]");
  validarOrigen(h.origen, "origen", e);
  return e;
}

/** Valida un Modelo3D; devuelve los errores (vacío = válido). */
export function validarModelo3D(m: unknown): string[] {
  const e: string[] = [];
  if (!esObj(m)) return ["el modelo no es un objeto"];
  if (m.version !== "txnucleo.modelo3d.v1") e.push("version: se esperaba txnucleo.modelo3d.v1");
  if (!rutaSegura(m.glb) || !String(m.glb).toLowerCase().endsWith(".glb")) e.push("glb: ruta relativa a un .glb");
  if (!esNum(m.bytes) || m.bytes <= 0) e.push("bytes: positivo");
  if (m.sha256 !== undefined && !(typeof m.sha256 === "string" && SHA.test(m.sha256))) e.push("sha256: 64 hex");
  const c = m.caja;
  if (!esObj(c) || !esV3(c.min) || !esV3(c.max) || !esV3(c.tamano) || !esV3(c.centro)) e.push("caja: min/max/tamano/centro");
  else if ((c.min as number[]).some((v, i) => v > (c.max as number[])[i])) e.push("caja: min > max");
  if (!esNum(m.triangulos) || m.triangulos < 0) e.push("triangulos");
  if (!Array.isArray(m.nodos)) e.push("nodos: lista");
  const col = m.colision;
  if (!esObj(col) || !["caja", "capsula", "esfera"].includes(col.forma as string)) e.push("colision.forma");
  if (!["aprobado", "rechazado", "desconocido"].includes(m.qa as string)) e.push("qa");
  if (!Array.isArray(m.etiquetas)) e.push("etiquetas: lista");
  validarOrigen(m.origen, "origen", e);
  return e;
}

/** Valida un ContratoEstilo; devuelve los errores (vacío = válido). */
export function validarEstilo(s: unknown): string[] {
  const e: string[] = [];
  if (!esObj(s)) return ["el estilo no es un objeto"];
  if (s.version !== "txnucleo.estilo.v1") e.push("version: se esperaba txnucleo.estilo.v1");
  if (!esTexto(s.nombre)) e.push("nombre");
  const pal = Array.isArray(s.paleta) ? s.paleta : [];
  if (pal.length === 0) e.push("paleta: al menos un color");
  const roles = new Set<string>();
  pal.forEach((c: unknown, i) => {
    if (!esObj(c) || !esTexto(c.rol) || typeof c.hex !== "string" || !HEX.test(c.hex) || !esV3(c.oklab)) { e.push(`paleta[${i}]: rol/hex/oklab`); return; }
    if (roles.has(c.rol)) e.push(`paleta[${i}]: rol repetido ${c.rol}`);
    roles.add(c.rol);
  });
  if (s.pixel !== undefined) {
    const p = s.pixel;
    if (!esObj(p) || !Array.isArray(p.resolucion) || !p.resolucion.every((v) => esNum(v) && v > 0) || !esNum(p.escala) || p.escala < 1 || !Number.isInteger(p.escala)) e.push("pixel: resolucion y escala entera ≥ 1");
  }
  if (!Array.isArray(s.referencias)) e.push("referencias: lista");
  return e;
}

/** Valida un ManifiestoRecursos; devuelve los errores (vacío = válido). */
export function validarManifiesto(m: unknown): string[] {
  const e: string[] = [];
  if (!esObj(m)) return ["el manifiesto no es un objeto"];
  if (m.version !== "txnucleo.recursos.v1") e.push("version: se esperaba txnucleo.recursos.v1");
  const rs = Array.isArray(m.recursos) ? m.recursos : [];
  if (!Array.isArray(m.recursos)) e.push("recursos: lista");
  const rutas = new Set<string>();
  rs.forEach((r: unknown, i) => {
    if (!esObj(r)) { e.push(`recursos[${i}]: objeto`); return; }
    if (!rutaSegura(r.ruta)) e.push(`recursos[${i}].ruta: relativa y dentro del juego`);
    else if (rutas.has(r.ruta as string)) e.push(`recursos[${i}].ruta: repetida`);
    else rutas.add(r.ruta as string);
    if (!["sprites", "modelo3d", "imagen", "audio", "estilo", "otro"].includes(r.tipo as string)) e.push(`recursos[${i}].tipo`);
    if (typeof r.sha256 !== "string" || !SHA.test(r.sha256)) e.push(`recursos[${i}].sha256: 64 hex`);
    if (!esTexto(r.licencia)) e.push(`recursos[${i}].licencia: requerida`);
    validarOrigen(r.origen, `recursos[${i}].origen`, e);
  });
  return e;
}

/** Colisión sugerida a partir de la caja envolvente: alto y delgado → cápsula; casi cúbico y redondo → esfera; resto → caja. */
export function colisionSugerida(tamano: V3, centro: V3): FormaColision {
  const [x, y, z] = tamano;
  const ancho = Math.max(x, z);
  if (y > 1.6 * ancho && Math.abs(x - z) <= 0.35 * ancho) return { forma: "capsula", radio: ancho / 2, alto: y, centro };
  return { forma: "caja", tamano, centro };
}
