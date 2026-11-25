// Adaptador de Kiln (modelos 3D procedurales). Lee el recibo JSON de `kiln render --json` y la cabecera del .glb
// para producir un Modelo3D (medidas, nodos, colisión sugerida, QA), y escribe programas .kiln.js de bloques
// (blockout) desde datos del juego. Puro: ejecutar kiln vive en src/infraestructura/enlaces.ts.

import { exito, fallo, type Resultado } from "../../nucleo/resultado.ts";
import { colisionSugerida, validarModelo3D, type Modelo3D, type V3 } from "../contratos.ts";

/** Lo que interesa del JSON interno de un .glb. */
export interface InfoGlb {
  readonly version: number;
  readonly nodos: readonly string[];
  readonly materiales: number;
  readonly mallas: number;
  readonly generador?: string;
}

const MAGIA_GLB = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

/** Lee la cabecera y el bloque JSON de un .glb (glTF 2.0 binario) sin decodificar mallas. */
export function leerGlb(bytes: Uint8Array): Resultado<InfoGlb, string> {
  if (bytes.byteLength < 20) return fallo("glb: archivo demasiado corto");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0, true) !== MAGIA_GLB) return fallo("glb: no es un archivo glTF binario");
  const version = v.getUint32(4, true);
  if (version !== 2) return fallo(`glb: versión ${version} no soportada`);
  if (v.getUint32(8, true) > bytes.byteLength) return fallo("glb: largo declarado mayor que el archivo");
  const largo = v.getUint32(12, true);
  if (v.getUint32(16, true) !== CHUNK_JSON || 20 + largo > bytes.byteLength) return fallo("glb: falta el bloque JSON");
  let j: any;
  try {
    j = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + largo)));
  } catch {
    return fallo("glb: JSON interno ilegible");
  }
  const nodos = Array.isArray(j.nodes) ? j.nodes.map((n: any, i: number) => (typeof n?.name === "string" ? n.name : `nodo_${i}`)) : [];
  return exito({
    version,
    nodos,
    materiales: Array.isArray(j.materials) ? j.materials.length : 0,
    mallas: Array.isArray(j.meshes) ? j.meshes.length : 0,
    ...(typeof j.asset?.generator === "string" ? { generador: j.asset.generator } : {}),
  });
}

/** Opciones al convertir un recibo de kiln. */
export interface OpcionesKiln {
  /** Ruta del .glb relativa al JSON del modelo. */
  readonly glb: string;
  readonly fuente?: string;
  readonly etiquetas?: readonly string[];
}

const v3 = (a: unknown): V3 | null =>
  Array.isArray(a) && a.length === 3 && a.every((x) => typeof x === "number" && Number.isFinite(x)) ? [a[0], a[1], a[2]] : null;
/** Redondeo a micras para que el JSON sea estable entre máquinas. */
const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;
const r6v = (a: V3): V3 => [r6(a[0]), r6(a[1]), r6(a[2])];

/** Convierte el recibo de `kiln render --json` (y opcionalmente los bytes del .glb) en un Modelo3D validado. */
export function modeloDesdeKiln(recibo: unknown, glb: Uint8Array | null, op: OpcionesKiln): Resultado<Modelo3D, string> {
  const r = recibo as any;
  if (!r || typeof r !== "object") return fallo("kiln: recibo vacío");
  if (r.ok === false) return fallo(`kiln: ${typeof r.error === "string" ? r.error : "la construcción falló"}`);
  const b = r.bounds ?? {};
  const min = v3(b.min), max = v3(b.max);
  if (!min || !max) return fallo("kiln: el recibo no trae bounds");
  const tamano = r6v([max[0] - min[0], max[1] - min[1], max[2] - min[2]]);
  const centro = r6v([(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2]);
  let info: InfoGlb | null = null;
  if (glb) {
    const g = leerGlb(glb);
    if (!g.ok) return g;
    info = g.valor;
  }
  const aceptacion = r.qaReport?.acceptance;
  const marco = r.requirements?.requirements?.frame ?? {};
  const sha = typeof r.artifactGlbSha256 === "string" ? r.artifactGlbSha256.replace(/^sha256:/, "") : undefined;
  const modelo: Modelo3D = {
    version: "txnucleo.modelo3d.v1",
    glb: op.glb,
    bytes: glb?.byteLength ?? Number(r.glbBytes ?? 0),
    ...(sha ? { sha256: sha } : {}),
    unidades: "m",
    ejes: { arriba: typeof marco.up === "string" ? marco.up : "+Y", adelante: typeof marco.forward === "string" ? marco.forward : "+X" },
    caja: { min: r6v(min), max: r6v(max), tamano, centro },
    triangulos: Number(r.tris ?? 0),
    nodos: info?.nodos ?? [],
    materiales: info?.materiales ?? 0,
    parametros: r.params?.values && typeof r.params.values === "object" ? r.params.values : {},
    colision: colisionSugerida(tamano, centro),
    etiquetas: op.etiquetas ?? [],
    qa: aceptacion === "accepted" ? "aprobado" : aceptacion === "rejected" ? "rechazado" : "desconocido",
    avisos: Array.isArray(r.warnings) ? r.warnings.map((w: any) => (typeof w === "string" ? w : String(w?.code ?? w?.message ?? "aviso"))) : [],
    origen: op.fuente ? { herramienta: "kiln", fuente: op.fuente } : { herramienta: "kiln" },
  };
  const errores = validarModelo3D(modelo);
  return errores.length ? fallo(`kiln: ${errores.join("; ")}`) : exito(modelo);
}

/** Pieza de un bloque (blockout): caja con nombre, tamaño, posición del centro y color. */
export interface PiezaBloque {
  readonly nombre: string;
  readonly tamano: V3;
  readonly posicion: V3;
  readonly color: string;
  readonly metal?: number;
}

const nombreKiln = (s: string): string => s.replace(/[^a-zA-Z0-9_]/g, "_") || "Modelo";

/**
 * Programa .kiln.js de bloques: una caja por pieza, con un parámetro `escala` para variantes. Sirve para tener
 * en minutos un modelo con las medidas correctas (de un catálogo de armas, vehículos o utilería) y refinarlo luego.
 */
export function programaBloques(nombre: string, piezas: readonly PiezaBloque[]): string {
  const n = nombreKiln(nombre);
  const lineas = piezas.map((p, i) => {
    const mat = p.metal !== undefined ? `gameMaterial('${p.color}', { metalness: ${p.metal} })` : `gameMaterial('${p.color}')`;
    const t = p.tamano.map((x) => `${x} * s`).join(", ");
    const pos = p.posicion.map((x) => `${x} * s`).join(", ");
    return `  createPart('${nombreKiln(p.nombre) || "Pieza" + i}', boxGeo(${t}), ${mat}, { parent: root, position: [${pos}] });`;
  });
  return [
    `// Generado por TxNucleo: bloques de "${nombre}". Refinar a mano o con el agente de kiln.`,
    `const meta = { name: '${n}' };`,
    `const P = defineParams({ escala: { type: 'range', default: 1, min: 0.25, max: 4, step: 0.05 } });`,
    `function build() {`,
    `  const root = createRoot('${n}');`,
    `  const s = P.escala;`,
    ...lineas,
    `  return root;`,
    `}`,
    ``,
  ].join("\n");
}
