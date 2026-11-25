// Codificador y decodificador PNG puros (sin dependencias, funcionan en Node, navegador y servidor).
// Codificar: RGBA8 → bytes .png con bloques deflate "almacenados" (sin compresión): archivos más grandes, código
// mínimo, capturas deterministas. Decodificar: PNG de 8 bits (gris, RGB, paleta, gris+alfa, RGBA) sin entrelazado →
// RGBA8; la descompresión zlib se INYECTA (node:zlib inflateSync, DecompressionStream o la que haya).

import type { Imagen } from "./imagen.ts";

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 de PNG/zlib sobre un tramo de bytes. */
export function crc32(datos: Uint8Array, inicio = 0, fin = datos.length): number {
  let c = 0xffffffff;
  for (let i = inicio; i < fin; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(d: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < d.length; i++) {
    a = (a + d[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** zlib con bloques almacenados (máx. 65535 bytes por bloque). */
function zlibAlmacenado(crudo: Uint8Array): Uint8Array {
  const bloques = Math.max(1, Math.ceil(crudo.length / 65535));
  const out = new Uint8Array(2 + crudo.length + bloques * 5 + 4);
  let o = 0;
  out[o++] = 0x78;
  out[o++] = 0x01;
  for (let b = 0; b < bloques; b++) {
    const ini = b * 65535;
    const len = Math.min(65535, crudo.length - ini);
    out[o++] = b === bloques - 1 ? 1 : 0;
    out[o++] = len & 0xff;
    out[o++] = len >>> 8;
    out[o++] = ~len & 0xff;
    out[o++] = (~len >>> 8) & 0xff;
    out.set(crudo.subarray(ini, ini + len), o);
    o += len;
  }
  const ad = adler32(crudo);
  out[o++] = ad >>> 24;
  out[o++] = (ad >>> 16) & 0xff;
  out[o++] = (ad >>> 8) & 0xff;
  out[o++] = ad & 0xff;
  return out;
}

/** Imagen RGBA8 → bytes de un .png válido. */
export function codificarPng(im: Imagen): Uint8Array {
  const fila = im.w * 4 + 1;
  const crudo = new Uint8Array(fila * im.h);
  for (let y = 0; y < im.h; y++) {
    crudo[y * fila] = 0; // filtro "ninguno"
    crudo.set(im.datos.subarray(y * im.w * 4, (y + 1) * im.w * 4), y * fila + 1);
  }
  const idat = zlibAlmacenado(crudo);
  const trozos: Array<[string, Uint8Array]> = [];
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, im.w);
  v.setUint32(4, im.h);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, sin entrelazado
  trozos.push(["IHDR", ihdr], ["IDAT", idat], ["IEND", new Uint8Array(0)]);
  const total = 8 + trozos.reduce((s, [, d]) => s + 12 + d.length, 0);
  const out = new Uint8Array(total);
  out.set([137, 80, 78, 71, 13, 10, 26, 10]);
  let o = 8;
  const dv = new DataView(out.buffer);
  for (const [tipo, d] of trozos) {
    dv.setUint32(o, d.length);
    for (let i = 0; i < 4; i++) out[o + 4 + i] = tipo.charCodeAt(i);
    out.set(d, o + 8);
    dv.setUint32(o + 8 + d.length, crc32(out, o + 4, o + 8 + d.length));
    o += 12 + d.length;
  }
  return out;
}

/** Función que descomprime un flujo zlib (p. ej. `inflateSync` de node:zlib). */
export type Inflar = (datos: Uint8Array) => Uint8Array;

const CANALES: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Bytes de un .png → Imagen RGBA8. Devuelve null si no es un PNG que se pueda leer (16 bits, entrelazado, roto). */
export function decodificarPng(bytes: Uint8Array, inflar: Inflar): Imagen | null {
  const firma = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || firma.some((b, i) => bytes[i] !== b)) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let w = 0, h = 0, prof = 0, tipo = 0, entrelazado = 0;
  let paleta: Uint8Array | null = null, transparencia: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  for (let o = 8; o + 12 <= bytes.length; ) {
    const largo = dv.getUint32(o);
    const nombre = String.fromCharCode(bytes[o + 4]!, bytes[o + 5]!, bytes[o + 6]!, bytes[o + 7]!);
    const d = bytes.subarray(o + 8, o + 8 + largo);
    if (nombre === "IHDR") {
      w = dv.getUint32(o + 8); h = dv.getUint32(o + 12);
      prof = d[8]!; tipo = d[9]!; entrelazado = d[12]!;
    } else if (nombre === "PLTE") paleta = d;
    else if (nombre === "tRNS") transparencia = d;
    else if (nombre === "IDAT") idat.push(d);
    else if (nombre === "IEND") break;
    o += 12 + largo;
  }
  const canales = CANALES[tipo];
  if (!w || !h || prof !== 8 || entrelazado !== 0 || canales === undefined || (tipo === 3 && !paleta)) return null;
  const junto = new Uint8Array(idat.reduce((s, d) => s + d.length, 0));
  idat.reduce((o, d) => (junto.set(d, o), o + d.length), 0);
  const crudo = inflar(junto);
  const bpp = canales, fila = w * bpp;
  if (crudo.length < (fila + 1) * h) return null;
  const px = new Uint8Array(fila * h);
  for (let y = 0; y < h; y++) {
    const filtro = crudo[y * (fila + 1)]!;
    const ent = y * (fila + 1) + 1, sal = y * fila;
    for (let x = 0; x < fila; x++) {
      const a = x >= bpp ? px[sal + x - bpp]! : 0;
      const b = y > 0 ? px[sal - fila + x]! : 0;
      const c = x >= bpp && y > 0 ? px[sal - fila + x - bpp]! : 0;
      const v = crudo[ent + x]!;
      let r: number;
      switch (filtro) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: return null;
      }
      px[sal + x] = r & 255;
    }
  }
  const datos = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * bpp, o = i * 4;
    if (tipo === 6) datos.set(px.subarray(s, s + 4), o);
    else if (tipo === 2) { datos[o] = px[s]!; datos[o + 1] = px[s + 1]!; datos[o + 2] = px[s + 2]!; datos[o + 3] = 255; }
    else if (tipo === 0 || tipo === 4) { datos[o] = datos[o + 1] = datos[o + 2] = px[s]!; datos[o + 3] = tipo === 4 ? px[s + 1]! : 255; }
    else {
      const k = px[s]!;
      datos[o] = paleta![k * 3]!; datos[o + 1] = paleta![k * 3 + 1]!; datos[o + 2] = paleta![k * 3 + 2]!;
      datos[o + 3] = transparencia && k < transparencia.length ? transparencia[k]! : 255;
    }
  }
  return { w, h, datos };
}
