// Adaptador de reference-to-game. Convierte la paleta por roles que escribe `r2g.py palette` (colores muestreados
// en coordenadas normalizadas de una imagen de referencia) en un ContratoEstilo con OKLab, y arma los puntos de
// muestreo. Puro: ejecutar r2g vive en src/infraestructura/enlaces.ts.

import { exito, fallo, type Resultado } from "../../nucleo/resultado.ts";
import { aOklab } from "../../grafico/color.ts";
import { validarEstilo, type ColorEstilo, type ContratoEstilo, type V3 } from "../contratos.ts";

/** Opciones del contrato de estilo. */
export interface OpcionesEstilo {
  readonly nombre: string;
  readonly pixel?: { readonly resolucion: readonly [number, number]; readonly escala: number };
  readonly luz?: readonly [number, number];
  readonly notas?: readonly string[];
}

/** Punto de muestreo para `r2g.py palette --points`. */
export interface PuntoMuestra {
  readonly role: string;
  readonly uv: readonly [number, number];
  readonly radius?: number;
}

const r5 = (x: number): number => Math.round(x * 1e5) / 1e5;

/** Color hex "#rrggbb" a OKLab redondeado. */
export function oklabDeHex(hex: string): V3 {
  const n = parseInt(hex.slice(1), 16);
  const [l, a, b] = aOklab([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
  return [r5(l), r5(a), r5(b)];
}

/** Convierte la salida de `r2g.py palette` en un ContratoEstilo validado. */
export function estiloDesdePaleta(filas: unknown, op: OpcionesEstilo): Resultado<ContratoEstilo, string> {
  if (!Array.isArray(filas) || filas.length === 0) return fallo("r2g: se esperaba una lista de colores");
  const paleta: ColorEstilo[] = [];
  const shas = new Set<string>();
  for (const f of filas as any[]) {
    if (!f || typeof f.role !== "string" || typeof f.hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(f.hex)) return fallo("r2g: fila sin role/hex");
    paleta.push({ rol: f.role, hex: f.hex.toLowerCase(), oklab: oklabDeHex(f.hex) });
    if (typeof f.source_sha256 === "string") shas.add(f.source_sha256);
  }
  const estilo: ContratoEstilo = {
    version: "txnucleo.estilo.v1",
    nombre: op.nombre,
    paleta,
    ...(op.pixel ? { pixel: op.pixel } : {}),
    ...(op.luz ? { luz: op.luz } : {}),
    referencias: [...shas].map((sha256) => ({ sha256 })),
    notas: [...(op.notas ?? []), "Colores muestreados con r2g (mediana RGB); revisar perfil de color antes de fijarlos."],
  };
  const errores = validarEstilo(estilo);
  return errores.length ? fallo(`r2g: ${errores.join("; ")}`) : exito(estilo);
}

/** Puntos en grilla n×n para muestrear una imagen sin elegir a mano (roles "c_<fila>_<col>"). */
export function puntosEnGrilla(n: number, radio = 2): PuntoMuestra[] {
  const pts: PuntoMuestra[] = [];
  for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) pts.push({ role: `c_${f}_${c}`, uv: [(c + 0.5) / n, (f + 0.5) / n], radius: radio });
  return pts;
}

/**
 * Fusiona colores casi iguales (distancia OKLab menor que `umbral`) y conserva el primero de cada grupo.
 * Útil tras muestrear en grilla: deja la paleta real de la referencia.
 */
export function reducirPaleta(estilo: ContratoEstilo, umbral = 0.04): ContratoEstilo {
  const quedan: ColorEstilo[] = [];
  for (const c of estilo.paleta) {
    if (!quedan.some((q) => Math.hypot(q.oklab[0] - c.oklab[0], q.oklab[1] - c.oklab[1], q.oklab[2] - c.oklab[2]) < umbral)) quedan.push(c);
  }
  return { ...estilo, paleta: quedan };
}
