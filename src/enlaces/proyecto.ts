// Proyecto de red de un juego (`txnucleo.red.json` en su raíz): dónde están las fuentes editables de arte, qué
// estilo y motor usa y con qué licencia se registra lo generado. Con él, `npm run red -- construir` sabe qué
// reconstruir (solo las fuentes que cambiaron, por hash), y `revisar-estilo` cruza los sprites con la paleta.
// Lógica pura: leer archivos y ejecutar herramientas vive en src/infraestructura/enlaces.ts.

import type { Imagen } from "../grafico/imagen.ts";
import { oklabDeHex } from "./adaptadores/r2g.ts";
import { rutaSegura, type ContratoEstilo, type ManifiestoRecursos } from "./contratos.ts";

/** Motores conocidos (solo cambia qué verificación se corre: Godot se verifica con CLI-Anything). */
export type MotorJuego = "godot" | "web" | "unity" | "unreal" | "otro";

/** Configuración de red de un juego. */
export interface ProyectoRed {
  readonly version: "txnucleo.red.v1";
  readonly nombre: string;
  readonly motor: MotorJuego;
  /** Ruta del ContratoEstilo, o null si todavía no hay. */
  readonly estilo: string | null;
  /** Carpeta con las fuentes .px.js (arte 2D). */
  readonly arte2d: string;
  /** Carpeta con las fuentes .kiln.js (arte 3D). */
  readonly arte3d: string;
  /** Licencia con que se registran los recursos generados ("propia", "CC0"...). */
  readonly licencia: string;
  /** Animaciones de pxl que se reproducen una vez (muerte, ataque...). */
  readonly sinBucle: readonly string[];
  /** Distancia OKLab hasta la que un color cuenta como "de la paleta" al revisar el estilo. */
  readonly toleranciaColor: number;
}

/** Nombre del archivo de proyecto en la raíz del juego. */
export const ARCHIVO_PROYECTO = "txnucleo.red.json";

/** Proyecto con los valores por defecto. */
export function proyectoPorDefecto(nombre: string, motor: MotorJuego = "otro", estilo: string | null = null): ProyectoRed {
  return { version: "txnucleo.red.v1", nombre, motor, estilo, arte2d: "arte", arte3d: "modelos", licencia: "propia", sinBucle: [], toleranciaColor: 0.02 };
}

/** Valida un ProyectoRed; devuelve los errores (vacío = válido). */
export function validarProyecto(p: unknown): string[] {
  const e: string[] = [];
  if (!p || typeof p !== "object") return ["el proyecto no es un objeto"];
  const r = p as Record<string, unknown>;
  if (r.version !== "txnucleo.red.v1") e.push("version: se esperaba txnucleo.red.v1");
  if (typeof r.nombre !== "string" || !r.nombre) e.push("nombre");
  if (!["godot", "web", "unity", "unreal", "otro"].includes(r.motor as string)) e.push("motor: godot | web | unity | unreal | otro");
  if (r.estilo !== null && !rutaSegura(r.estilo)) e.push("estilo: ruta relativa o null");
  if (!rutaSegura(r.arte2d)) e.push("arte2d: carpeta relativa");
  if (!rutaSegura(r.arte3d)) e.push("arte3d: carpeta relativa");
  if (typeof r.licencia !== "string" || !r.licencia) e.push("licencia");
  if (!Array.isArray(r.sinBucle)) e.push("sinBucle: lista");
  if (typeof r.toleranciaColor !== "number" || r.toleranciaColor < 0) e.push("toleranciaColor: número ≥ 0");
  return e;
}

/** Tipo de fuente editable según su extensión. */
export function tipoDeFuente(ruta: string): "pxl" | "kiln" | null {
  return ruta.endsWith(".px.js") || ruta.endsWith(".px.ts") ? "pxl" : ruta.endsWith(".kiln.js") ? "kiln" : null;
}

/** Dónde deja sus salidas cada fuente: pxl → `<carpeta>/out/<nombre>/`, kiln → `<nombre>.glb` al lado. */
export function salidaDeFuente(ruta: string): string {
  const base = ruta.replace(/\.(px\.js|px\.ts|kiln\.js)$/, "");
  if (tipoDeFuente(ruta) === "kiln") return `${base}.glb`;
  const i = base.lastIndexOf("/");
  return `${i >= 0 ? base.slice(0, i + 1) : ""}out/${base.slice(i + 1)}`;
}

/** Estado de una fuente respecto del manifiesto. */
export type EstadoFuente = "nueva" | "cambio" | "al-dia";

/** Una fuente editable con su hash actual. */
export interface FuenteArte {
  readonly ruta: string;
  readonly sha256: string;
}

/**
 * Qué fuentes hay que construir: "nueva" si nada en el manifiesto sale de ella; "cambio" si su hash no es el que
 * se registró o si alguno de sus recursos falta o cambió (`rutasConError`); "al-dia" si no.
 */
export function planConstruccion(fuentes: readonly FuenteArte[], manifiesto: ManifiestoRecursos, rutasConError: ReadonlySet<string> = new Set()): { ruta: string; estado: EstadoFuente }[] {
  return fuentes.map((f) => {
    const suyos = manifiesto.recursos.filter((r) => r.origen.fuente === f.ruta);
    if (suyos.length === 0) return { ruta: f.ruta, estado: "nueva" as const };
    const alDia = suyos.every((r) => r.origen.fuenteSha256 === f.sha256 && !rutasConError.has(r.ruta));
    return { ruta: f.ruta, estado: alDia ? ("al-dia" as const) : ("cambio" as const) };
  });
}

/** Un color de la imagen que no está en la paleta. */
export interface ColorAjeno {
  readonly hex: string;
  readonly pixeles: number;
  readonly rolCercano: string;
  readonly distancia: number;
}

/** Resultado de cruzar una imagen con la paleta del estilo. */
export interface RevisionEstilo {
  readonly pixelesOpacos: number;
  readonly pixelesAjenos: number;
  /** Fracción de píxeles visibles fuera de la paleta (0..1). */
  readonly fraccionAjena: number;
  /** Los colores ajenos más usados (máx. 12), con el rol de la paleta más parecido. */
  readonly colores: readonly ColorAjeno[];
}

const hex2 = (n: number): string => n.toString(16).padStart(2, "0");

/**
 * Cruza una imagen con la paleta del estilo en OKLab: cada color visible (alfa > 0) cuya distancia al color más
 * cercano de la paleta supere `tolerancia` cuenta como ajeno. Sombras y luces calculadas (pxl `light`, `shade`)
 * suelen aparecer acá: no es un error, es la lista para decidir si se agregan como roles del estilo.
 */
export function revisarColores(im: Imagen, estilo: ContratoEstilo, tolerancia = 0.02): RevisionEstilo {
  const cuentas = new Map<number, number>();
  let opacos = 0;
  for (let i = 0; i < im.w * im.h; i++) {
    if (im.datos[i * 4 + 3] === 0) continue;
    opacos++;
    const rgb = (im.datos[i * 4]! << 16) | (im.datos[i * 4 + 1]! << 8) | im.datos[i * 4 + 2]!;
    cuentas.set(rgb, (cuentas.get(rgb) ?? 0) + 1);
  }
  const ajenos: ColorAjeno[] = [];
  for (const [rgb, pixeles] of cuentas) {
    const hex = `#${hex2((rgb >> 16) & 255)}${hex2((rgb >> 8) & 255)}${hex2(rgb & 255)}`;
    const lab = oklabDeHex(hex);
    let mejor = { rol: "", d: Infinity };
    for (const c of estilo.paleta) {
      const d = Math.hypot(lab[0] - c.oklab[0], lab[1] - c.oklab[1], lab[2] - c.oklab[2]);
      if (d < mejor.d) mejor = { rol: c.rol, d };
    }
    if (mejor.d > tolerancia) ajenos.push({ hex, pixeles, rolCercano: mejor.rol, distancia: Math.round(mejor.d * 1e4) / 1e4 });
  }
  const pixelesAjenos = ajenos.reduce((s, c) => s + c.pixeles, 0);
  return {
    pixelesOpacos: opacos,
    pixelesAjenos,
    fraccionAjena: opacos ? Math.round((pixelesAjenos / opacos) * 1e4) / 1e4 : 0,
    colores: ajenos.sort((a, b) => b.pixeles - a.pixeles || a.hex.localeCompare(b.hex)).slice(0, 12),
  };
}
