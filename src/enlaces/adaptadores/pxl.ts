// Adaptador de claude-pxl (pixel art como código). Traduce su JSON de hoja (formato "hash" de TexturePacker con
// `duration` y `meta.frameTags` estilo Aseprite) a HojaSprites, y escribe plantillas .px.js desde un ContratoEstilo.
// Puro: recibe el JSON ya leído; ejecutar pxl vive en src/infraestructura/enlaces.ts.

import { exito, fallo, type Resultado } from "../../nucleo/resultado.ts";
import { validarHoja, type AnimacionSprite, type ContratoEstilo, type CuadroSprite, type HojaSprites } from "../contratos.ts";

/** Opciones al convertir una hoja de pxl. */
export interface OpcionesPxl {
  /** Archivo .px.js de origen (se guarda en `origen.fuente`). */
  readonly fuente?: string;
  /** Pivote normalizado; por defecto [0.5, 1] (pies). */
  readonly pivote?: readonly [number, number];
  /** Animaciones que NO se repiten (pxl lo define en la fuente con loop:false y no lo escribe en el JSON). */
  readonly sinBucle?: readonly string[];
}

const esObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

/** Convierte el JSON de hoja o animación que escribe `pxl build` en una HojaSprites validada. */
export function hojaDesdePxl(json: unknown, op: OpcionesPxl = {}): Resultado<HojaSprites, string> {
  if (!esObj(json) || !esObj(json.frames) || !esObj(json.meta)) return fallo("pxl: se esperaba { frames, meta }");
  const meta = json.meta;
  if (!esObj(meta.size) || typeof meta.image !== "string") return fallo("pxl: meta.image y meta.size requeridos");
  const cuadros: CuadroSprite[] = [];
  for (const [nombre, f] of Object.entries(json.frames)) {
    if (!esObj(f) || !esObj(f.frame)) return fallo(`pxl: cuadro ${nombre} sin frame`);
    if (f.rotated) return fallo(`pxl: cuadro ${nombre} rotado (no soportado)`);
    const { x, y, w, h } = f.frame;
    cuadros.push(typeof f.duration === "number" ? { nombre, x, y, w, h, ms: f.duration } : { nombre, x, y, w, h });
  }
  const sinBucle = new Set(op.sinBucle ?? []);
  const etiquetas: unknown[] = Array.isArray(meta.frameTags) ? meta.frameTags : [];
  const animaciones: AnimacionSprite[] = [];
  for (const t of etiquetas) {
    if (!esObj(t) || typeof t.name !== "string") return fallo("pxl: frameTag inválido");
    const desde = Number(t.from), hasta = Number(t.to);
    const ms = cuadros.slice(desde, hasta + 1).map((c) => c.ms ?? 100);
    animaciones.push({ nombre: t.name, desde, hasta, bucle: !sinBucle.has(t.name), ms });
  }
  const hoja: HojaSprites = {
    version: "txnucleo.hoja.v1",
    imagen: meta.image,
    ancho: meta.size.w,
    alto: meta.size.h,
    cuadros,
    animaciones,
    pivote: op.pivote ?? [0.5, 1],
    origen: op.fuente ? { herramienta: "pxl", fuente: op.fuente } : { herramienta: "pxl" },
  };
  const errores = validarHoja(hoja);
  return errores.length ? fallo(`pxl: ${errores.join("; ")}`) : exito(hoja);
}

/** Asigna a cada rol de la paleta una tecla de un carácter para la DSL de pxl (la primera libre de su nombre). */
export function teclasDePaleta(estilo: ContratoEstilo): Map<string, string> {
  const usadas = new Set(["."]);
  const reserva = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const teclas = new Map<string, string>();
  for (const c of estilo.paleta) {
    const letras = (c.rol + c.rol.toUpperCase()).replace(/[^a-zA-Z]/g, "");
    const candidata = [...(letras + reserva)].find((ch) => !usadas.has(ch));
    if (!candidata) break; // más de 62 colores: la DSL no tiene más teclas
    usadas.add(candidata);
    teclas.set(c.rol, candidata);
  }
  return teclas;
}

/**
 * Plantilla .px.js con la paleta fija del contrato de estilo, un sprite de ejemplo por cada nombre pedido y una hoja
 * (`hoja`, por defecto el nombre del estilo; conviene el nombre del archivo fuente) que los agrupa.
 * Es un punto de partida para el agente o el artista: los sprites de ejemplo son un bloque del primer color.
 */
export function plantillaPx(estilo: ContratoEstilo, sprites: readonly string[], lado = 8, hoja = estilo.nombre): string {
  const teclas = teclasDePaleta(estilo);
  const pal = [...teclas].map(([rol, k]) => `${k}: "${estilo.paleta.find((c) => c.rol === rol)!.hex}"`).join(", ");
  const comentario = [...teclas].map(([rol, k]) => `${k}=${rol}`).join("  ");
  const k0 = [...teclas.values()][0] ?? "a";
  // Contorno = el color más oscuro (menor L en OKLab); relleno = el primero que no sea el contorno.
  const oscuro = [...estilo.paleta].filter((c) => teclas.has(c.rol)).sort((a, b) => a.oklab[0] - b.oklab[0])[0];
  const kContorno = oscuro ? teclas.get(oscuro.rol)! : k0;
  const kRelleno = [...teclas.values()].find((k) => k !== kContorno) ?? k0;
  const fila = kRelleno.repeat(lado);
  const cuerpo = sprites
    .map((s) => `sprite("${s}", { outline: "${kContorno}" }, \`\n${Array.from({ length: lado }, () => "  " + fila).join("\n")}\`)`)
    .join("\n\n");
  const bloqueHoja = sprites.length ? `\n\nsheet("${hoja.replace(/[^a-zA-Z0-9_]/g, "_")}", ${JSON.stringify(sprites)}, { pad: 1 })` : "";
  return `// Generado por TxNucleo desde el contrato de estilo "${estilo.nombre}". Paleta fija: ${comentario}\npal({ ${pal} })\n\n${cuerpo}${bloqueHoja}\n`;
}

/**
 * Clips para `motor.Animador` desde una HojaSprites: `{ nombre: { cuadros, fps, bucle } }`. Los índices de cuadro
 * son los de `hoja.cuadros`; fps sale de la duración media del tramo (como `motor.clipsDesdeAseprite`).
 */
export function clipsDesdeHoja(hoja: HojaSprites): Record<string, { cuadros: number[]; fps: number; bucle: boolean }> {
  const r: Record<string, { cuadros: number[]; fps: number; bucle: boolean }> = {};
  for (const a of hoja.animaciones) {
    const cuadros = Array.from({ length: a.hasta - a.desde + 1 }, (_, i) => a.desde + i);
    const media = a.ms.reduce((s, m) => s + m, 0) / a.ms.length;
    r[a.nombre] = { cuadros, fps: 1000 / media, bucle: a.bucle };
  }
  return r;
}
