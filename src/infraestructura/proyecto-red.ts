// Proyecto de red de un juego, lado Node: crea `txnucleo.red.json`, calcula el estado de las fuentes de arte,
// construye solo lo que cambió (pxl, kiln), lo registra en el manifiesto con el hash de su fuente, revisa los
// sprites contra la paleta del estilo y, si el motor es Godot, reimporta y verifica. Se exporta con
// "txnucleo/enlaces-node". La lógica pura está en src/enlaces/proyecto.ts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { exito, fallo, type Resultado } from "../nucleo/resultado.ts";
import { decodificarPng } from "../grafico/png.ts";
import { validarEstilo, type ContratoEstilo } from "../enlaces/contratos.ts";
import {
  ARCHIVO_PROYECTO, planConstruccion, proyectoPorDefecto, revisarColores, salidaDeFuente, tipoDeFuente, validarProyecto,
  type EstadoFuente, type MotorJuego, type ProyectoRed, type RevisionEstilo,
} from "../enlaces/proyecto.ts";
import type { InformeGodot } from "../enlaces/adaptadores/cli-anything.ts";
import {
  archivosCon, doctor, generarModelo, generarSprites, leerManifiesto, MANIFIESTO, registrarRecursos, reimportarGodot,
  sha256Archivo, verificarGodot, verificarManifiesto,
} from "./enlaces.ts";

/** Ruta relativa con barras "/" (lo que se guarda en contratos y manifiesto). */
const rel = (raiz: string, ruta: string): string => relative(raiz, resolve(ruta)).replace(/\\/g, "/");

const escribirJson = (ruta: string, dato: unknown): void => {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify(dato, null, 2) + "\n");
};

/** Quita del manifiesto todo lo que salió de una fuente (antes de reconstruirla: sus salidas pueden cambiar). */
export function quitarRecursosDeFuente(juego: string, fuente: string): void {
  const m = leerManifiesto(juego);
  escribirJson(join(juego, MANIFIESTO), { ...m, recursos: m.recursos.filter((r) => r.origen.fuente !== fuente) });
}

/** Lee y valida txnucleo.red.json. */
export function leerProyecto(juego: string): Resultado<ProyectoRed, string> {
  const p = join(juego, ARCHIVO_PROYECTO);
  if (!existsSync(p)) return fallo(`falta ${ARCHIVO_PROYECTO}: npm run red -- iniciar <carpeta del juego>`);
  let d: unknown;
  try {
    d = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallo(`${ARCHIVO_PROYECTO} no es JSON válido`);
  }
  const e = validarProyecto(d);
  return e.length ? fallo(`${ARCHIVO_PROYECTO}: ${e.join("; ")}`) : exito(d as ProyectoRed);
}

/** Crea txnucleo.red.json (si no existe), las carpetas de fuentes y agrega `.kiln/` al .gitignore. Devuelve qué hizo. */
export function iniciarJuego(juego: string, op: { nombre?: string; motor?: MotorJuego; estilo?: string | null } = {}): Resultado<{ proyecto: ProyectoRed; hechos: string[] }, string> {
  const raiz = resolve(juego);
  mkdirSync(raiz, { recursive: true });
  const hechos: string[] = [];
  let proyecto: ProyectoRed;
  if (existsSync(join(raiz, ARCHIVO_PROYECTO))) {
    const r = leerProyecto(raiz);
    if (!r.ok) return r;
    proyecto = r.valor;
    hechos.push(`${ARCHIVO_PROYECTO} ya existía (no se tocó)`);
  } else {
    const motor = op.motor ?? (existsSync(join(raiz, "project.godot")) ? "godot" : "otro");
    const estilo = op.estilo !== undefined ? op.estilo : existsSync(join(raiz, "estilo.json")) ? "estilo.json" : null;
    proyecto = proyectoPorDefecto(op.nombre ?? basename(raiz), motor, estilo);
    escribirJson(join(raiz, ARCHIVO_PROYECTO), proyecto);
    hechos.push(`${ARCHIVO_PROYECTO} (motor ${motor}, estilo ${estilo ?? "ninguno"})`);
  }
  for (const d of [proyecto.arte2d, proyecto.arte3d]) {
    if (!existsSync(join(raiz, d))) {
      mkdirSync(join(raiz, d), { recursive: true });
      hechos.push(`${d}/`);
    }
  }
  const gi = join(raiz, ".gitignore");
  const actual = existsSync(gi) ? readFileSync(gi, "utf8") : "";
  if (!actual.split(/\r?\n/).includes(".kiln/")) {
    writeFileSync(gi, actual + (actual && !actual.endsWith("\n") ? "\n" : "") + "# caché de revisiones de kiln\n.kiln/\n");
    hechos.push(".gitignore: .kiln/");
  }
  return exito({ proyecto, hechos });
}

/** Fuentes editables del juego (.px.js en arte2d, .kiln.js en arte3d), con su hash, en rutas relativas. */
export function fuentesDe(juego: string, p: ProyectoRed): { ruta: string; sha256: string }[] {
  const raiz = resolve(juego);
  const lista = (carpeta: string, ext: readonly string[]): string[] =>
    existsSync(join(raiz, carpeta))
      ? archivosCon(join(raiz, carpeta), "").filter((f) => ext.some((e) => f.endsWith(e)) && !f.split(/[\\/]/).includes("out"))
      : [];
  return [...lista(p.arte2d, [".px.js", ".px.ts"]), ...lista(p.arte3d, [".kiln.js"])]
    .map((f) => ({ ruta: rel(raiz, f), sha256: sha256Archivo(f) }))
    .sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/** Estado de un juego: proyecto, fuentes (nueva / cambio / al día), problemas del manifiesto y herramientas que faltan. */
export interface EstadoJuego {
  readonly proyecto: ProyectoRed;
  readonly fuentes: readonly { ruta: string; estado: EstadoFuente }[];
  readonly manifiesto: readonly string[];
  readonly faltan: readonly string[];
}

/** Calcula el estado sin construir nada. */
export function estadoJuego(juego: string): Resultado<EstadoJuego, string> {
  const raiz = resolve(juego);
  const p = leerProyecto(raiz);
  if (!p.ok) return p;
  const fuentes = fuentesDe(raiz, p.valor);
  const errores = existsSync(join(raiz, MANIFIESTO)) ? verificarManifiesto(raiz) : [];
  const conError = new Set(errores.map((e) => e.split(":")[0]!));
  const plan = planConstruccion(fuentes, leerManifiesto(raiz), conError);
  const necesita = new Set<string>(fuentes.map((f) => tipoDeFuente(f.ruta)!));
  if (p.valor.motor === "godot" && existsSync(join(raiz, "project.godot"))) necesita.add("cli-anything-godot");
  const faltan = [...necesita].filter((id) => !doctor([id]).herramientas[0]!.instalada);
  return exito({ proyecto: p.valor, fuentes: plan, manifiesto: errores, faltan });
}

/** Informe de `construirJuego`. */
export interface InformeConstruccion {
  readonly construidas: readonly string[];
  readonly alDia: readonly string[];
  readonly errores: readonly string[];
  readonly estilo: readonly { imagen: string; revision: RevisionEstilo }[];
  readonly godot: InformeGodot | null;
  readonly manifiesto: readonly string[];
}

/**
 * Construye las fuentes nuevas o cambiadas (o todas con `todo`), registra sus salidas en el manifiesto con el hash
 * de la fuente, revisa los sprites contra la paleta del estilo y, si el motor es Godot, reimporta y verifica.
 */
export function construirJuego(juego: string, op: { todo?: boolean; log?: (s: string) => void } = {}): Resultado<InformeConstruccion, string> {
  const raiz = resolve(juego);
  const log = op.log ?? (() => {});
  const est = estadoJuego(raiz);
  if (!est.ok) return est;
  const proyecto = est.valor.proyecto;
  const sha = new Map(fuentesDe(raiz, proyecto).map((f) => [f.ruta, f.sha256]));
  const construidas: string[] = [], alDia: string[] = [], errores: string[] = [];
  for (const f of est.valor.fuentes) {
    if (f.estado === "al-dia" && !op.todo) {
      alDia.push(f.ruta);
      continue;
    }
    log(`· ${f.ruta} (${f.estado})`);
    const origen = { fuente: f.ruta, fuenteSha256: sha.get(f.ruta)! };
    const salida = join(raiz, salidaDeFuente(f.ruta));
    if (tipoDeFuente(f.ruta) === "pxl") {
      const r = generarSprites(join(raiz, f.ruta), salida, { sinBucle: [...proyecto.sinBucle] });
      if (!r.ok) { errores.push(`${f.ruta}: ${r.error}`); continue; }
      quitarRecursosDeFuente(raiz, f.ruta);
      registrarRecursos(raiz, r.valor.flatMap((h) => [
        { ruta: rel(raiz, h.ruta), tipo: "sprites" as const, origen: { herramienta: "pxl", ...origen }, licencia: proyecto.licencia },
        { ruta: rel(raiz, join(dirname(h.ruta), h.hoja.imagen)), tipo: "imagen" as const, origen: { herramienta: "pxl", ...origen }, licencia: proyecto.licencia },
      ]));
    } else {
      const r = generarModelo(join(raiz, f.ruta), salida, { cwd: raiz });
      if (!r.ok) { errores.push(`${f.ruta}: ${r.error}`); continue; }
      quitarRecursosDeFuente(raiz, f.ruta);
      registrarRecursos(raiz, [
        { ruta: rel(raiz, salida), tipo: "modelo3d", origen: { herramienta: "kiln", ...origen }, licencia: proyecto.licencia },
        { ruta: rel(raiz, r.valor.ruta), tipo: "otro", origen: { herramienta: "kiln", ...origen }, licencia: proyecto.licencia },
      ]);
    }
    construidas.push(f.ruta);
  }
  const estilo = revisarEstilo(raiz);
  if (!estilo.ok) errores.push(estilo.error);
  let godotInf: InformeGodot | null = null;
  if (proyecto.motor === "godot" && existsSync(join(raiz, "project.godot")) && doctor(["cli-anything-godot"]).herramientas[0]!.instalada) {
    if (construidas.length) {
      log("· Godot: reimportar recursos");
      const ri = reimportarGodot(raiz);
      if (!ri.ok) errores.push(`godot reimportar: ${ri.error}`);
    }
    const g = verificarGodot(raiz);
    if (g.ok) godotInf = g.valor;
    else errores.push(`godot: ${g.error}`);
  }
  return exito({
    construidas, alDia, errores,
    estilo: estilo.ok ? estilo.valor : [],
    godot: godotInf,
    manifiesto: existsSync(join(raiz, MANIFIESTO)) ? verificarManifiesto(raiz) : [],
  });
}

/** Cruza cada PNG de sprites del manifiesto con la paleta del estilo del proyecto. Sin estilo, lista vacía. */
export function revisarEstilo(juego: string): Resultado<{ imagen: string; revision: RevisionEstilo }[], string> {
  const raiz = resolve(juego);
  const p = leerProyecto(raiz);
  if (!p.ok) return p;
  if (!p.valor.estilo) return exito([]);
  const rutaEstilo = join(raiz, p.valor.estilo);
  if (!existsSync(rutaEstilo)) return fallo(`no existe el estilo ${p.valor.estilo}`);
  const estilo = JSON.parse(readFileSync(rutaEstilo, "utf8")) as ContratoEstilo;
  const e = validarEstilo(estilo);
  if (e.length) return fallo(`estilo inválido: ${e.join("; ")}`);
  const salida: { imagen: string; revision: RevisionEstilo }[] = [];
  for (const r of leerManifiesto(raiz).recursos) {
    if (r.tipo !== "imagen" || !r.ruta.toLowerCase().endsWith(".png") || !existsSync(join(raiz, r.ruta))) continue;
    const im = decodificarPng(new Uint8Array(readFileSync(join(raiz, r.ruta))), (b) => new Uint8Array(inflateSync(b)));
    if (im) salida.push({ imagen: r.ruta, revision: revisarColores(im, estilo, p.valor.toleranciaColor) });
  }
  return exito(salida);
}
