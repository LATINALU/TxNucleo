// Infraestructura de la red TxNucleo (solo Node): instala las herramientas del registro en una carpeta propia,
// las ejecuta SIN shell (argumentos como lista) y escribe los contratos (HojaSprites, Modelo3D, ContratoEstilo,
// ManifiestoRecursos) junto a lo que generan. Se importa como "txnucleo/enlaces-node". Guía: docs/RED.md.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { exito, fallo, type Resultado } from "../nucleo/resultado.ts";
import { herramienta, REGISTRO, type Herramienta } from "../enlaces/registro.ts";
import { validarManifiesto, type ContratoEstilo, type HojaSprites, type ManifiestoRecursos, type Modelo3D, type Recurso } from "../enlaces/contratos.ts";
import { hojaDesdePxl } from "../enlaces/adaptadores/pxl.ts";
import { modeloDesdeKiln } from "../enlaces/adaptadores/kiln.ts";
import { estiloDesdePaleta, puntosEnGrilla, reducirPaleta, type OpcionesEstilo, type PuntoMuestra } from "../enlaces/adaptadores/r2g.ts";
import { godot, informeGodot, leerRespuesta, type InformeGodot } from "../enlaces/adaptadores/cli-anything.ts";

const WIN = process.platform === "win32";

/** Carpeta donde se instalan las herramientas: $TXNUCLEO_RED o ~/.txnucleo/red. */
export function carpetaRed(): string {
  return process.env.TXNUCLEO_RED || join(homedir(), ".txnucleo", "red");
}

/** Carpeta de una herramienta instalada. */
export const carpetaDe = (id: string): string => join(carpetaRed(), id);

/** Resultado de ejecutar un programa. */
export interface Salida {
  readonly codigo: number;
  readonly salida: string;
  readonly error: string;
}

/** Ejecuta un programa sin shell. Nunca interpola texto en una línea de comandos. */
export function correr(programa: string, args: readonly string[], op: { cwd?: string; env?: Record<string, string>; tiempoMs?: number } = {}): Salida {
  const r = spawnSync(programa, args as string[], {
    cwd: op.cwd,
    env: { ...process.env, ...op.env },
    encoding: "utf8",
    timeout: op.tiempoMs ?? 600_000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return { codigo: r.status ?? (r.error ? 127 : 1), salida: r.stdout ?? "", error: r.error ? String(r.error.message) : (r.stderr ?? "") };
}

// ─────────────────────────────── Requisitos ───────────────────────────────

/** Python del sistema. */
const pythonSistema = (): string => process.env.TXNUCLEO_PYTHON || (WIN ? "python" : "python3");
/** Python del venv propio de una herramienta. */
const pythonVenv = (dir: string): string => (WIN ? join(dir, "venv", "Scripts", "python.exe") : join(dir, "venv", "bin", "python"));
/** Binario de Godot: $GODOT_BIN, $GODOT o "godot" en el PATH. */
export const binarioGodot = (): string => process.env.GODOT_BIN || process.env.GODOT || "godot";
const binarioBlender = (): string => process.env.BLENDER_BIN || "blender";

/** Versión de un requisito o null si no está. */
export function detectar(requisito: string): string | null {
  const primera = (s: Salida): string | null => (s.codigo === 0 ? (s.salida || s.error).trim().split(/\r?\n/)[0] || "ok" : null);
  switch (requisito) {
    case "node": return process.version;
    case "python": return primera(correr(pythonSistema(), ["--version"], { tiempoMs: 20_000 }));
    case "git": return primera(correr("git", ["--version"], { tiempoMs: 20_000 }));
    case "godot": return primera(correr(binarioGodot(), ["--version", "--headless"], { tiempoMs: 60_000 }));
    case "blender": return primera(correr(binarioBlender(), ["--version"], { tiempoMs: 60_000 }));
    case "ffmpeg": return primera(correr("ffmpeg", ["-version"], { tiempoMs: 20_000 }));
    default: return null;
  }
}

/** Ruta del ejecutable principal de una herramienta instalada (o null si no aplica). */
export function ejecutableDe(h: Herramienta): string | null {
  const d = carpetaDe(h.id);
  switch (h.instalacion.tipo) {
    case "git":
      return h.id === "pxl" ? join(d, "bin", "pxl.js") : h.id === "r2g" ? join(d, "skills", "reference-to-game", "scripts", "r2g.py") : d;
    case "npm":
      return join(d, "node_modules", ...h.instalacion.paquete.split("/"), "dist", "cli.mjs");
    case "pip-git": {
      const nombre = "cli-anything-" + h.instalacion.subdirectorio.split("/")[0];
      return WIN ? join(d, "venv", "Scripts", nombre + ".exe") : join(d, "venv", "bin", nombre);
    }
    case "manual":
      return null;
  }
}

/** Estado de una herramienta para `red doctor`. */
export interface EstadoHerramienta {
  readonly id: string;
  readonly instalada: boolean;
  readonly faltan: readonly string[];
  readonly ejecutable: string | null;
}

/** Revisa qué herramientas están instaladas y qué requisitos faltan. */
export function doctor(ids: readonly string[] = REGISTRO.map((h) => h.id)): { requisitos: Record<string, string | null>; herramientas: EstadoHerramienta[] } {
  const reqs = [...new Set(ids.flatMap((id) => herramienta(id)?.requisitos ?? []))];
  const requisitos: Record<string, string | null> = {};
  for (const r of reqs) requisitos[r] = detectar(r);
  const herramientas = ids.map((id) => {
    const h = herramienta(id)!;
    const ej = ejecutableDe(h);
    return { id, instalada: ej !== null && existsSync(ej), faltan: h.requisitos.filter((r) => !requisitos[r]), ejecutable: ej };
  });
  return { requisitos, herramientas };
}

// ─────────────────────────────── Instalación ───────────────────────────────

/** Ruta del npm-cli.js que acompaña a este Node (para no depender de npm.cmd ni de un shell en Windows). */
function npmCli(): string | null {
  const candidatos = [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")];
  return candidatos.find((c) => existsSync(c)) ?? null;
}

/** Instala una herramienta del registro en su carpeta. Las de tipo "manual" devuelven las instrucciones. */
export function instalar(id: string, log: (s: string) => void = () => {}): Resultado<string, string> {
  const h = herramienta(id);
  if (!h) return fallo(`no existe la herramienta "${id}" (ver: npm run red -- lista)`);
  const d = carpetaDe(id);
  const paso = (titulo: string, prog: string, args: string[], cwd?: string): string | null => {
    log(`· ${titulo}`);
    const s = correr(prog, args, cwd ? { cwd } : {});
    return s.codigo === 0 ? null : `${titulo} falló (${s.codigo}): ${(s.error || s.salida).trim().slice(-600)}`;
  };
  const ins = h.instalacion;
  let error: string | null = null;
  switch (ins.tipo) {
    case "manual":
      return exito(`instalación manual: ${ins.descarga}`);
    case "git":
      if (!existsSync(join(d, ".git"))) error = paso(`clonar ${ins.url}`, "git", ["clone", "--quiet", ins.url, d]);
      error ??= paso(`fijar commit ${ins.commit.slice(0, 12)}`, "git", ["-C", d, "-c", "advice.detachedHead=false", "checkout", "--quiet", ins.commit]);
      if (!error && ins.pip) {
        if (!existsSync(pythonVenv(d))) error = paso("crear venv", pythonSistema(), ["-m", "venv", join(d, "venv")]);
        error ??= paso("instalar dependencias de Python", pythonVenv(d), ["-m", "pip", "install", "--quiet", "-r", join(d, ins.pip)]);
      }
      break;
    case "npm": {
      const npm = npmCli();
      if (!npm) return fallo("no se encontró npm junto a este Node");
      mkdirSync(d, { recursive: true });
      if (!existsSync(join(d, "package.json"))) writeFileSync(join(d, "package.json"), JSON.stringify({ name: `txnucleo-red-${id}`, private: true }, null, 2));
      error = paso(`npm install ${ins.paquete}@${ins.version}`, process.execPath, [npm, "install", "--no-audit", "--no-fund", "--loglevel=error", `${ins.paquete}@${ins.version}`], d);
      break;
    }
    case "pip-git":
      mkdirSync(d, { recursive: true });
      if (!existsSync(pythonVenv(d))) error = paso("crear venv", pythonSistema(), ["-m", "venv", join(d, "venv")]);
      error ??= paso(`pip install ${ins.subdirectorio}`, pythonVenv(d), ["-m", "pip", "install", "--quiet", `git+${ins.url}.git@${ins.commit}#subdirectory=${ins.subdirectorio}`]);
      break;
  }
  return error ? fallo(error) : exito(`instalada en ${d}`);
}

/** Exige que la herramienta esté instalada y devuelve su ejecutable. */
function requerir(id: string): Resultado<string, string> {
  const h = herramienta(id);
  const ej = h ? ejecutableDe(h) : null;
  if (!ej || !existsSync(ej)) return fallo(`"${id}" no está instalada: npm run red -- instalar ${id}`);
  return exito(ej);
}

// ─────────────────────────────── Archivos ───────────────────────────────

/** SHA-256 hex de un archivo. */
export const sha256Archivo = (ruta: string): string => createHash("sha256").update(readFileSync(ruta)).digest("hex");

const escribirJson = (ruta: string, dato: unknown): void => {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify(dato, null, 2) + "\n");
};

/** Lista recursiva de archivos con cierta extensión, sin entrar a carpetas ocultas ni de compilación. */
export function archivosCon(dir: string, ext: string): string[] {
  const out: string[] = [];
  const ignorar = new Set(["node_modules", "target", "addons"]);
  for (const n of readdirSync(dir)) {
    if (n.startsWith(".") || ignorar.has(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...archivosCon(p, ext));
    else if (n.endsWith(ext)) out.push(p);
  }
  return out;
}

// ─────────────────────────────── Arte 2D (pxl) ───────────────────────────────

/** Construye un .px.js con pxl y escribe un `<nombre>.hoja.json` (HojaSprites) junto a cada hoja o animación. */
export function generarSprites(fuente: string, salida: string, op: { sinBucle?: string[] } = {}): Resultado<{ ruta: string; hoja: HojaSprites }[], string> {
  const ej = requerir("pxl");
  if (!ej.ok) return ej;
  const s = correr(process.execPath, [ej.valor, "build", resolve(fuente), "--out", resolve(salida), "--no-preview"]);
  if (s.codigo !== 0) return fallo(`pxl: ${(s.error || s.salida).trim().slice(-800)}`);
  return hojasDeSalidaPxl(salida, fuente, op);
}

/** Convierte todos los JSON de hoja que dejó pxl en `salida` (raíz y anims/) en HojaSprites. */
export function hojasDeSalidaPxl(salida: string, fuente?: string, op: { sinBucle?: string[] } = {}): Resultado<{ ruta: string; hoja: HojaSprites }[], string> {
  const jsons = [salida, join(salida, "anims")].filter(existsSync).flatMap((d) => readdirSync(d).filter((n) => n.endsWith(".json") && !n.endsWith(".hoja.json")).map((n) => join(d, n)));
  const hechas: { ruta: string; hoja: HojaSprites }[] = [];
  for (const j of jsons) {
    const r = hojaDesdePxl(JSON.parse(readFileSync(j, "utf8")), { ...(fuente ? { fuente: basename(fuente) } : {}), ...(op.sinBucle ? { sinBucle: op.sinBucle } : {}) });
    if (!r.ok) return fallo(`${basename(j)}: ${r.error}`);
    const ruta = j.replace(/\.json$/, ".hoja.json");
    escribirJson(ruta, r.valor);
    hechas.push({ ruta, hoja: r.valor });
  }
  return exito(hechas);
}

// ─────────────────────────────── Arte 3D (kiln) ───────────────────────────────

/** Construye un .kiln.js a GLB (render CPU, sin claves) y escribe `<nombre>.modelo.json` (Modelo3D) al lado. kiln guarda
 * su caché `.kiln/` en `op.cwd` (por defecto el directorio actual): usar la raíz del juego. */
export function generarModelo(fuente: string, glb: string, op: { etiquetas?: string[]; cwd?: string } = {}): Resultado<{ ruta: string; modelo: Modelo3D }, string> {
  const ej = requerir("kiln");
  if (!ej.ok) return ej;
  mkdirSync(dirname(resolve(glb)), { recursive: true });
  const s = correr(process.execPath, [ej.valor, "render", resolve(fuente), "--out", resolve(glb), "--render", "cpu", "--json", "--detail", "lean"], { cwd: op.cwd ?? process.cwd() });
  let recibo: unknown;
  try {
    recibo = JSON.parse(s.salida);
  } catch {
    return fallo(`kiln: ${(s.error || s.salida).trim().slice(-800)}`);
  }
  const bytes = existsSync(glb) ? new Uint8Array(readFileSync(glb)) : null;
  const r = modeloDesdeKiln(recibo, bytes, { glb: basename(glb), fuente: basename(fuente), ...(op.etiquetas ? { etiquetas: op.etiquetas } : {}) });
  if (!r.ok) return r;
  const ruta = glb.replace(/\.glb$/i, "") + ".modelo.json";
  escribirJson(ruta, r.valor);
  return exito({ ruta, modelo: r.valor });
}

// ─────────────────────────────── Estilo (reference-to-game) ───────────────────────────────

/** Muestrea una imagen de referencia con r2g (puntos dados o grilla n×n) y escribe un ContratoEstilo. */
export function estiloDesdeImagen(imagen: string, salida: string, op: OpcionesEstilo & { puntos?: readonly PuntoMuestra[]; grilla?: number }): Resultado<ContratoEstilo, string> {
  const ej = requerir("r2g");
  if (!ej.ok) return ej;
  const puntos = op.puntos ?? puntosEnGrilla(op.grilla ?? 4);
  const tmp = resolve(salida) + ".puntos.tmp.json";
  const paleta = resolve(salida) + ".paleta.tmp.json";
  escribirJson(tmp, puntos);
  const s = correr(pythonVenv(carpetaDe("r2g")), [ej.valor, "palette", resolve(imagen), "--points", tmp, "--out", paleta]);
  if (s.codigo !== 0) return fallo(`r2g: ${(s.error || s.salida).trim().slice(-800)}`);
  const r = estiloDesdePaleta(JSON.parse(readFileSync(paleta, "utf8")), op);
  for (const f of [tmp, paleta]) rmSync(f, { force: true });
  if (!r.ok) return r;
  const estilo = op.puntos ? r.valor : reducirPaleta(r.valor);
  escribirJson(salida, estilo);
  return exito(estilo);
}

// ─────────────────────────────── Motor (CLI-Anything · Godot) ───────────────────────────────

/** Ejecuta el harness de Godot con argumentos ya armados. */
function harnessGodot(args: string[]): ReturnType<typeof leerRespuesta> {
  const ej = requerir("cli-anything-godot");
  if (!ej.ok) return ej;
  const s = correr(ej.valor, args, { env: { GODOT_BIN: binarioGodot(), PYTHONIOENCODING: "utf-8" } });
  return leerRespuesta(s.salida || s.error);
}

/** Verifica un proyecto Godot: info, escenas y sintaxis de todos sus .gd (o de los indicados). */
export function verificarGodot(proyecto: string, scripts?: readonly string[]): Resultado<InformeGodot, string> {
  const info = harnessGodot(godot.info(proyecto));
  if (!info.ok) return info;
  const escenas = harnessGodot(godot.escenas(proyecto));
  if (!escenas.ok) return escenas;
  const lista = scripts ?? archivosCon(proyecto, ".gd").map((f) => relative(proyecto, f).replace(/\\/g, "/"));
  const validaciones = lista.map((script) => {
    const args = godot.validar(proyecto, script);
    return { script, respuesta: args.ok ? harnessGodot(args.valor) : args };
  });
  return exito(informeGodot(info.valor, escenas.valor, validaciones));
}

/** Reimporta los recursos de un proyecto Godot (tras sumar PNG o GLB). */
export const reimportarGodot = (proyecto: string) => harnessGodot(godot.reimportar(proyecto));

// ─────────────────────────────── Manifiesto ───────────────────────────────

/** Nombre del manifiesto en la raíz del juego. */
export const MANIFIESTO = "txnucleo.recursos.json";

/** Lee el manifiesto de un juego (o uno vacío). */
export function leerManifiesto(juego: string): ManifiestoRecursos {
  const p = join(juego, MANIFIESTO);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : { version: "txnucleo.recursos.v1", recursos: [] };
}

/** Agrega o actualiza recursos del manifiesto (recalcula el hash del archivo). */
export function registrarRecursos(juego: string, nuevos: readonly Omit<Recurso, "sha256">[]): ManifiestoRecursos {
  const m = leerManifiesto(juego);
  const porRuta = new Map(m.recursos.map((r) => [r.ruta, r]));
  for (const n of nuevos) porRuta.set(n.ruta, { ...n, sha256: sha256Archivo(join(juego, n.ruta)) });
  const final: ManifiestoRecursos = { version: "txnucleo.recursos.v1", recursos: [...porRuta.values()].sort((a, b) => a.ruta.localeCompare(b.ruta)) };
  escribirJson(join(juego, MANIFIESTO), final);
  return final;
}

/** Valida el manifiesto: esquema, que cada archivo exista y que su hash coincida. */
export function verificarManifiesto(juego: string): string[] {
  const p = join(juego, MANIFIESTO);
  if (!existsSync(p)) return [`falta ${MANIFIESTO}`];
  const m = JSON.parse(readFileSync(p, "utf8"));
  const errores = validarManifiesto(m);
  if (errores.length) return errores;
  for (const r of (m as ManifiestoRecursos).recursos) {
    const f = join(juego, r.ruta);
    if (!existsSync(f)) errores.push(`${r.ruta}: no existe`);
    else if (sha256Archivo(f) !== r.sha256) errores.push(`${r.ruta}: cambió desde que se registró (hash distinto)`);
  }
  return errores;
}
