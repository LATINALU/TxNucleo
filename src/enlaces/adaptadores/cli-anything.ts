// Adaptador de CLI-Anything (harnesses que vuelven programas operables por agentes). Arma los argumentos de
// `cli-anything-godot --json ...` y lee sus respuestas JSON. Puro: ejecutar vive en src/infraestructura/enlaces.ts.
// Por seguridad no expone `script inline` (ejecuta GDScript arbitrario): solo scripts que ya están en el proyecto.

import { exito, fallo, type Resultado } from "../../nucleo/resultado.ts";

/** Respuesta JSON de un harness. */
export type RespuestaHarness = Readonly<Record<string, unknown>>;

/** Lee la salida de un harness con --json: `status: "error"` o JSON roto son fallos. */
export function leerRespuesta(salida: string): Resultado<RespuestaHarness, string> {
  let j: unknown;
  try {
    j = JSON.parse(salida);
  } catch {
    return fallo(`harness: salida no es JSON (${salida.trim().slice(0, 120)})`);
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return fallo("harness: se esperaba un objeto JSON");
  const r = j as Record<string, unknown>;
  if (r.status === "error") return fallo(`harness: ${String(r.message ?? "error sin mensaje")}`);
  if (typeof r.returncode === "number" && r.returncode !== 0) return fallo(`harness: código de salida ${r.returncode}`);
  return exito(r);
}

/** Script relativo al proyecto, sin salir de él. */
const scriptSeguro = (s: string): boolean => /^[\w\-./]+\.gd$/.test(s.replace(/^res:\/\//, "")) && !s.split("/").includes("..");

/** Comandos de Godot que TxNucleo usa (argv para `cli-anything-godot`, sin shell). */
export const godot = {
  /** Versión del motor (también prueba que GODOT_BIN apunta a un binario válido). */
  version: (): string[] => ["--json", "engine", "version"],
  /** Nombre, escena principal y secciones de project.godot. */
  info: (proyecto: string): string[] => ["--json", "-p", proyecto, "project", "info"],
  /** Escenas .tscn del proyecto. */
  escenas: (proyecto: string): string[] => ["--json", "-p", proyecto, "project", "scenes"],
  /** Reimporta recursos (tras agregar PNG o GLB nuevos). */
  reimportar: (proyecto: string): string[] => ["--json", "-p", proyecto, "project", "reimport"],
  /** Comprueba la sintaxis de un script del proyecto (ruta relativa, p. ej. "jugador.gd"). */
  validar: (proyecto: string, script: string): Resultado<string[], string> =>
    scriptSeguro(script) ? exito(["--json", "-p", proyecto, "script", "validate", script.replace(/^res:\/\//, "")]) : fallo("godot: script fuera del proyecto o no .gd"),
  /** Exporta con un preset de export_presets.cfg (sin preset: todos, Godot ≥ 4.3). */
  exportar: (proyecto: string, preset?: string, salida?: string): string[] => [
    "--json", "-p", proyecto, "export", "build",
    ...(preset ? ["--preset", preset] : []),
    ...(salida ? ["--output", salida] : []),
  ],
};

/** Resumen de una verificación de proyecto Godot. */
export interface InformeGodot {
  readonly nombre: string;
  readonly escenaPrincipal: string | null;
  readonly escenas: readonly string[];
  readonly scriptsInvalidos: readonly { readonly script: string; readonly error: string }[];
}

/** Arma el informe a partir de las respuestas de info, escenas y validaciones. */
export function informeGodot(info: RespuestaHarness, escenas: RespuestaHarness, validaciones: readonly { script: string; respuesta: Resultado<RespuestaHarness, string> }[]): InformeGodot {
  const malos = validaciones.flatMap(({ script, respuesta }) => {
    if (!respuesta.ok) return [{ script, error: respuesta.error }];
    return respuesta.valor.valid === false ? [{ script, error: String(respuesta.valor.errors ?? "inválido") }] : [];
  });
  return {
    nombre: String(info.name ?? ""),
    escenaPrincipal: typeof info.main_scene === "string" ? info.main_scene : null,
    escenas: Array.isArray(escenas.scenes) ? escenas.scenes.map(String) : [],
    scriptsInvalidos: malos,
  };
}
