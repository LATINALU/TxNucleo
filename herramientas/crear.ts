// Asistente de creación: hace las preguntas para determinar qué juego se está desarrollando, recomienda modelos,
// los combina y escribe la configuración inicial + un plan de implementación.
//
//   npm run crear                                   interactivo
//   npm run crear -- --respuestas '{"nucleo":["disparar","supervivencia"],"perspectiva":"primera"}' --sumar mod-zombis
//   npm run crear -- --modelos shooter-extraccion,supervivencia-sandbox,mod-zombis   (sin preguntas)
//   opciones: --salida <carpeta> (por defecto ./mi-juego) · --nombre "Mi juego"
//             --estilo estilo.json (contrato de `npm run red -- estilo`) · --arte 2d|3d|interfaz (forzar)
//             --motor godot|web|unity|unreal|otro (para el proyecto de red; por defecto lo detecta)
//
// Escribe <salida>/txnucleo.juego.json (reglas combinadas, módulos, datos, conflictos, arte), <salida>/PLAN.md, el
// proyecto de red <salida>/txnucleo.red.json y las fuentes de arte de partida: .px.js con la paleta del estilo (2D)
// o .kiln.js de bloques a escala (3D). Después: `npm run red -- construir <salida>`.

import { createInterface } from "node:readline/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PREGUNTAS, MODELOS, combinar, modelo, planDeImplementacion, recomendar, type Combinacion, type Respuestas } from "../src/modelos/index.ts";
import { bloquesDeArma, dimensionDe, seccionPlanArte, tareasDeArte, validarEstilo, type ContratoEstilo, type DimensionArte } from "../src/enlaces/index.ts";
import { plantillaPx } from "../src/enlaces/adaptadores/pxl.ts";
import { programaBloques } from "../src/enlaces/adaptadores/kiln.ts";
import { ARMAS } from "../src/datos/armas.ts";
import { iniciarJuego } from "../src/infraestructura/proyecto-red.ts";
import type { MotorJuego } from "../src/enlaces/proyecto.ts";

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function preguntar(): Promise<Respuestas> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const r: Record<string, string | string[]> = {};
  console.log("\ntxnucleo · asistente de creación. Enter para saltear una pregunta.\n");
  for (const p of PREGUNTAS) {
    console.log(`${p.texto}${p.multiple ? "  (varias: 1,3,4)" : ""}`);
    p.opciones.forEach((o, i) => console.log(`  ${i + 1}. ${o.texto}`));
    const linea = (await rl.question("> ")).trim();
    if (!linea) continue;
    const elegidas = linea.split(/[\s,]+/).map((x) => p.opciones[Number(x) - 1]?.valor).filter((x): x is string => !!x);
    if (elegidas.length) r[p.id] = p.multiple ? elegidas : elegidas[0];
    console.log();
  }
  rl.close();
  return r;
}

function plan(c: Combinacion, nombre: string, sugeridos: string | undefined, arte: string[]): string {
  const l: string[] = [`# ${nombre}`, "", `Modelos combinados: ${c.ids.map((x) => `\`${x}\``).join(" + ")}`, "", `Géneros: ${c.generos.join(", ")}`, ""];
  if (sugeridos) l.push("## Sugerencias del asistente", "", sugeridos, "");
  l.push("## Módulos de txnucleo a usar", "", ...c.modulos.map((m) => `- \`${m}\``), "");
  if (c.datos.length) l.push("## Catálogos de datos", "", ...c.datos.map((d) => `- \`datos.${d}\``), "");
  l.push("## Mecánicas incluidas", "", ...c.mecanicas.map((m) => `- ${m}`), "");
  l.push("## Plan de implementación", "", ...planDeImplementacion(c).map((p) => `- ${p}`), "");
  l.push(...arte);
  if (c.conflictos.length) l.push("## Reglas en conflicto (revisar)", "", ...c.conflictos.map((x) => `- \`${x.ruta}\`: ${x.modelos.join(" vs ")} → ganó \`${x.ganador}\``), "");
  l.push("## Siguiente paso", "", "Leer `docs/IA.md` (o pedírselo a tu asistente de IA) y `docs/INDICE.md` para el detalle de cada módulo.", "");
  return l.join("\n");
}

/** Escribe un archivo solo si no existe (nunca pisa trabajo del usuario). */
function escribirNuevo(ruta: string, texto: string, escritos: string[]): void {
  if (existsSync(ruta)) return;
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, texto);
  escritos.push(ruta);
}

/** Decide 2D/3D, lee el contrato de estilo y deja las fuentes de arte de partida para la red. */
function prepararArte(c: Combinacion, salida: string, perspectiva?: string): { resumen: unknown; plan: string[]; escritos: string[] } {
  const forzada = argumento("arte") as DimensionArte | undefined;
  const dimension = forzada ?? dimensionDe(c, perspectiva);
  let estilo: ContratoEstilo | undefined;
  const rutaEstilo = argumento("estilo");
  if (rutaEstilo) {
    const e = JSON.parse(readFileSync(rutaEstilo, "utf8"));
    const errores = validarEstilo(e);
    if (errores.length) throw new Error(`estilo inválido: ${errores.join("; ")}`);
    estilo = e;
    writeFileSync(join(salida, "estilo.json"), JSON.stringify(e, null, 2) + "\n");
  }
  const tareas = tareasDeArte(c, dimension);
  const escritos: string[] = [];
  if (dimension !== "3d" && estilo) {
    for (const archivo of new Set(tareas.map((t) => t.archivo))) {
      const sprites = tareas.filter((t) => t.archivo === archivo).map((t) => t.id);
      escribirNuevo(join(salida, archivo), plantillaPx(estilo, sprites, 8, archivo.split("/").pop()!.replace(".px.js", "")), escritos);
    }
  }
  if (dimension === "3d") {
    const armas = tareas.some((t) => t.id === "armas") ? [...new Map(ARMAS.map((a) => [a.categoria, a])).values()].filter((a) => ["pistola", "fusil", "escopeta"].includes(a.categoria)) : [];
    for (const a of armas) escribirNuevo(join(salida, "modelos", `${a.arma.id}.kiln.js`), programaBloques(a.arma.id, bloquesDeArma(a.categoria)), escritos);
  }
  return { resumen: { dimension, estilo: estilo ? "estilo.json" : null, tareas }, plan: seccionPlanArte(dimension, tareas, estilo), escritos };
}

async function main(): Promise<void> {
  const salida = resolve(argumento("salida") ?? "mi-juego");
  const ids = argumento("modelos");
  let c: Combinacion;
  let sugeridos: string | undefined;
  let perspectiva: string | undefined;
  if (ids) {
    c = combinar(ids.split(",").map((x) => modelo(x.trim())));
  } else {
    const crudo = argumento("respuestas");
    const r: Respuestas = crudo ? JSON.parse(crudo) : await preguntar();
    perspectiva = typeof r.perspectiva === "string" ? r.perspectiva : undefined;
    const sumar = (argumento("sumar") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const bases = sumar.filter((x) => MODELOS.find((m) => m.id === x)?.tipo === "base");
    const mods = sumar.filter((x) => MODELOS.find((m) => m.id === x)?.tipo === "modificador");
    const rec = recomendar(r, bases);
    c = mods.length ? combinar([...rec.combinacion.ids.map(modelo), ...mods.map(modelo)]) : rec.combinacion;
    sugeridos = rec.sugeridos.map((s, i) => `${i + 1}. \`${s.modelo.id}\` (${Math.round(s.puntaje * 100)} %) — ${s.modelo.descripcion}`).join("\n");
    console.log("\nSugeridos:\n" + sugeridos.replace(/`/g, ""));
  }
  const nombre = argumento("nombre") ?? c.nombre;
  mkdirSync(salida, { recursive: true });
  const arte = prepararArte(c, salida, perspectiva);
  // Proyecto de red: deja el juego listo para `npm run red -- estado / construir` (no pisa uno existente).
  const red = iniciarJuego(salida, {
    nombre,
    ...(argumento("motor") ? { motor: argumento("motor") as MotorJuego } : {}),
    estilo: existsSync(join(salida, "estilo.json")) ? "estilo.json" : null,
  });
  if (!red.ok) throw new Error(red.error);
  arte.escritos.push(...red.valor.hechos.map((h) => `proyecto de red: ${h}`));
  writeFileSync(join(salida, "txnucleo.juego.json"), JSON.stringify({ ...c, nombre, arte: arte.resumen }, null, 2));
  writeFileSync(join(salida, "PLAN.md"), plan(c, nombre, sugeridos, arte.plan));
  console.log(`\nCombinación: ${c.ids.join(" + ")}`);
  console.log(`Módulos: ${c.modulos.join(", ")}`);
  if (c.conflictos.length) console.log(`Conflictos resueltos (revisar): ${c.conflictos.map((x) => x.ruta).join(", ")}`);
  console.log(`\nEscrito: ${join(salida, "txnucleo.juego.json")}\n         ${join(salida, "PLAN.md")}`);
  for (const f of arte.escritos) console.log(`         ${f}`);
  console.log(`\nSiguiente: cd ${salida} y \`npm --prefix ${process.cwd()} run red -- estado\` (guía: docs/USO.md).`);
}

await main();
