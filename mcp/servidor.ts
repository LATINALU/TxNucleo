// txnucleo-mcp: servidor MCP (stdio, JSON-RPC 2.0 por líneas) para agentes como Claude Code u OhMyGame.
// Expone las mecánicas de TxNucleo (buscar, combinar modelos) y la red de herramientas (estilo, sprites, modelos,
// verificación) sin dependencias. Registro en Claude Code:
//   claude mcp add txnucleo -- node <ruta>/TxNucleo/mcp/servidor.ts
// Guía: docs/RED.md y docs/OHMYGAME.md.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { combinar, modelo, planDeImplementacion, recomendar, type Combinacion, type Respuestas } from "../src/modelos/index.ts";
import { REGISTRO, dimensionDe, seccionPlanArte, tareasDeArte, type DimensionArte } from "../src/enlaces/index.ts";
import {
  construirJuego, doctor, estadoJuego, estiloDesdeImagen, generarModelo, generarSprites, iniciarJuego, registrarRecursos,
  revisarEstilo, verificarGodot, verificarManifiesto,
} from "../src/infraestructura/enlaces-node.ts";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nuevoJuego } from "../src/infraestructura/nuevo.ts";
import { analizarBalance } from "../src/enlaces/index.ts";
import { basename, dirname, join, relative, resolve } from "node:path";

const VERSION = "0.6.0";
const PROTOCOLO = "2025-06-18";

type Json = Record<string, any>;

/** Una herramienta MCP: esquema de entrada y función que devuelve texto o JSON. */
interface HerramientaMcp {
  readonly descripcion: string;
  readonly entrada: Json;
  readonly correr: (a: Json) => unknown | Promise<unknown>;
}

const CATALOGO = JSON.parse(readFileSync(new URL("../docs/catalogo.json", import.meta.url), "utf8"));
const texto = (s: unknown): string => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Busca en el índice generado (espacios, archivos, exportaciones y modelos) por palabras. */
function buscar(consulta: string, limite = 10): unknown {
  const palabras = texto(consulta).split(/\W+/).filter((p) => p.length > 2);
  const puntuar = (s: string): number => palabras.reduce((t, p) => t + (s.includes(p) ? 1 : 0), 0);
  const archivos: { puntos: number; r: unknown }[] = [];
  for (const e of CATALOGO.espacios) {
    for (const a of e.archivos) {
      const nombres = a.exportaciones.map((x: Json) => x.nombre).join(" ");
      const puntos = puntuar(texto(`${e.nombre} ${a.ruta} ${a.descripcion} ${nombres}`)) + puntuar(texto(nombres));
      if (puntos > 0) archivos.push({ puntos, r: { espacio: e.nombre, importar: e.importar, ruta: a.ruta, descripcion: a.descripcion, exportaciones: a.exportaciones.map((x: Json) => x.nombre) } });
    }
  }
  const modelos = CATALOGO.modelos
    .map((m: Json) => ({ puntos: puntuar(texto(`${m.id} ${m.nombre} ${m.descripcion} ${m.generos.join(" ")}`)), r: { id: m.id, nombre: m.nombre, tipo: m.tipo, descripcion: m.descripcion } }))
    .filter((x: { puntos: number }) => x.puntos > 0);
  const top = <T extends { puntos: number; r: unknown }>(l: T[]) => l.sort((a, b) => b.puntos - a.puntos).slice(0, limite).map((x) => x.r);
  return { mecanicas: top(archivos), modelos: top(modelos) };
}

/** Resumen de una combinación para el agente. */
function resumen(c: Combinacion, dimension: DimensionArte): unknown {
  const tareas = tareasDeArte(c, dimension);
  return { modelos: c.ids, generos: c.generos, modulos: c.modulos, datos: c.datos, mecanicas: c.mecanicas, conflictos: c.conflictos, plan: planDeImplementacion(c), arte: { dimension, tareas, plan: seccionPlanArte(dimension, tareas).join("\n") }, reglas: c.reglas };
}

/** Registra en el manifiesto si se pidió `juego`. */
function alManifiesto(juego: string | undefined, rutas: { ruta: string; tipo: "sprites" | "modelo3d" | "imagen" | "otro"; herramienta: string; fuente: string }[]): void {
  if (!juego) return;
  const raiz = resolve(juego);
  registrarRecursos(raiz, rutas.map((r) => ({ ruta: relative(raiz, resolve(r.ruta)).replace(/\\/g, "/"), tipo: r.tipo, origen: { herramienta: r.herramienta, fuente: r.fuente }, licencia: "propia" })));
}

const HERRAMIENTAS: Record<string, HerramientaMcp> = {
  buscar_mecanica: {
    descripcion: "Busca mecánicas de TxNucleo (módulos, archivos y exportaciones reales del índice) y modelos de género. Usar ANTES de escribir lógica de juego: si existe, importarla en vez de inventarla.",
    entrada: { type: "object", properties: { consulta: { type: "string", description: "Palabras clave en español: 'retroceso arma', 'oleadas jefe', 'niebla de guerra'" }, limite: { type: "number" } }, required: ["consulta"] },
    correr: (a) => buscar(a.consulta, a.limite ?? 10),
  },
  crear_modelo: {
    descripcion: "Combina modelos de género (por ids o por respuestas del asistente) y devuelve módulos, reglas iniciales, plan de implementación y plan de arte (2D con pxl o 3D con kiln).",
    entrada: {
      type: "object",
      properties: {
        modelos: { type: "array", items: { type: "string" }, description: "Ids de modelos a combinar (ver buscar_mecanica)" },
        respuestas: { type: "object", description: "Respuestas del asistente: { nucleo: ['disparar'], perspectiva: 'primera', ... }" },
        arte: { type: "string", enum: ["2d", "3d", "interfaz"] },
      },
    },
    correr: (a) => {
      if (Array.isArray(a.modelos) && a.modelos.length) {
        const c = combinar(a.modelos.map((id: string) => modelo(id)));
        return resumen(c, a.arte ?? dimensionDe(c));
      }
      const r = (a.respuestas ?? {}) as Respuestas;
      const rec = recomendar(r);
      return { sugeridos: rec.sugeridos.map((s) => ({ id: s.modelo.id, puntaje: s.puntaje })), ...(resumen(rec.combinacion, a.arte ?? dimensionDe(rec.combinacion, typeof r.perspectiva === "string" ? r.perspectiva : undefined)) as Json) };
    },
  },
  red_doctor: {
    descripcion: "Qué herramientas de la red están instaladas (pxl, kiln, reference-to-game, CLI-Anything, OhMyGame) y qué requisitos faltan.",
    entrada: { type: "object", properties: {} },
    correr: () => ({ ...doctor(), registro: REGISTRO.map((h) => ({ id: h.id, rol: h.rol, licencia: h.licencia, descripcion: h.descripcion })) }),
  },
  contrato_estilo: {
    descripcion: "Muestrea una imagen de referencia con reference-to-game y escribe un ContratoEstilo (paleta por roles en hex y OKLab).",
    entrada: { type: "object", properties: { imagen: { type: "string" }, nombre: { type: "string" }, salida: { type: "string", description: "Ruta del estilo.json" }, grilla: { type: "number" }, pixel: { type: "array", items: { type: "number" }, description: "[ancho, alto, escala]" } }, required: ["imagen", "nombre", "salida"] },
    correr: (a) => estiloDesdeImagen(a.imagen, a.salida, { nombre: a.nombre, grilla: a.grilla ?? 4, ...(Array.isArray(a.pixel) && a.pixel.length === 3 ? { pixel: { resolucion: [a.pixel[0], a.pixel[1]], escala: a.pixel[2] } } : {}) }),
  },
  generar_sprites: {
    descripcion: "Construye un .px.js con pxl y escribe una HojaSprites (.hoja.json) por hoja o animación; con `juego` la registra en txnucleo.recursos.json.",
    entrada: { type: "object", properties: { fuente: { type: "string" }, salida: { type: "string" }, juego: { type: "string" }, sinBucle: { type: "array", items: { type: "string" } } }, required: ["fuente"] },
    correr: (a) => {
      const r = generarSprites(a.fuente, a.salida ?? join(dirname(a.fuente), "out"), { ...(a.sinBucle ? { sinBucle: a.sinBucle } : {}) });
      if (r.ok) alManifiesto(a.juego, r.valor.flatMap((h) => [
        { ruta: h.ruta, tipo: "sprites" as const, herramienta: "pxl", fuente: basename(a.fuente) },
        { ruta: join(dirname(h.ruta), h.hoja.imagen), tipo: "imagen" as const, herramienta: "pxl", fuente: basename(a.fuente) },
      ]));
      return r;
    },
  },
  generar_modelo: {
    descripcion: "Construye un .kiln.js a GLB con kiln (CPU, sin claves) y escribe un Modelo3D (.modelo.json) con medidas, nodos, colisión sugerida y QA.",
    entrada: { type: "object", properties: { fuente: { type: "string" }, salida: { type: "string", description: "Ruta del .glb" }, etiquetas: { type: "array", items: { type: "string" } }, juego: { type: "string" } }, required: ["fuente"] },
    correr: (a) => {
      const glb = a.salida ?? String(a.fuente).replace(/(\.kiln)?\.js$/, "") + ".glb";
      const r = generarModelo(a.fuente, glb, { ...(a.etiquetas ? { etiquetas: a.etiquetas } : {}) });
      if (r.ok) alManifiesto(a.juego, [
        { ruta: glb, tipo: "modelo3d", herramienta: "kiln", fuente: basename(a.fuente) },
        { ruta: r.valor.ruta, tipo: "otro", herramienta: "kiln", fuente: basename(a.fuente) },
      ]);
      return r;
    },
  },
  verificar_juego: {
    descripcion: "Verifica un juego: manifiesto de recursos (existencia y hash) y, si es un proyecto Godot, escenas y sintaxis de scripts con CLI-Anything.",
    entrada: { type: "object", properties: { juego: { type: "string" } }, required: ["juego"] },
    correr: (a) => {
      const juego = resolve(a.juego);
      const manifiesto = verificarManifiesto(juego);
      const godot = existsSync(join(juego, "project.godot")) ? verificarGodot(juego) : null;
      return { manifiesto: manifiesto.length ? manifiesto : "ok", godot };
    },
  },
  iniciar_juego: {
    descripcion: "Prepara la carpeta de un juego para la red: crea txnucleo.red.json (motor, estilo, carpetas arte/ y modelos/, licencia) y agrega .kiln/ al .gitignore. No pisa un proyecto existente.",
    entrada: { type: "object", properties: { juego: { type: "string" }, nombre: { type: "string" }, motor: { type: "string", enum: ["godot", "web", "unity", "unreal", "otro"] }, estilo: { type: "string", description: "Ruta relativa del estilo.json" } }, required: ["juego"] },
    correr: (a) => iniciarJuego(a.juego, { ...(a.nombre ? { nombre: a.nombre } : {}), ...(a.motor ? { motor: a.motor } : {}), ...(a.estilo ? { estilo: a.estilo } : {}) }),
  },
  estado_juego: {
    descripcion: "Estado del juego SIN construir: cada fuente de arte (.px.js/.kiln.js) como nueva, cambio o al-dia; recursos rotos del manifiesto; herramientas que faltan. Usar antes de construir_juego.",
    entrada: { type: "object", properties: { juego: { type: "string" } }, required: ["juego"] },
    correr: (a) => estadoJuego(a.juego),
  },
  construir_juego: {
    descripcion: "Construye SOLO las fuentes nuevas o cambiadas (todo=true: todas) con pxl y kiln, registra contratos y recursos en el manifiesto con el hash de su fuente, revisa los colores contra el estilo y, en Godot, reimporta y verifica. Devuelve un informe.",
    entrada: { type: "object", properties: { juego: { type: "string" }, todo: { type: "boolean" } }, required: ["juego"] },
    correr: (a) => construirJuego(a.juego, { todo: !!a.todo }),
  },
  nuevo_prototipo: {
    descripcion: "De una idea en lenguaje natural a un PROTOTIPO JUGABLE en una carpeta nueva: interpreta la idea, combina modelos, hornea reglas.json, genera el arte desde los datos (pxl), copia la plantilla (Godot, web o ambas), construye y prueba con un bot. Devuelve qué entendió, los modelos y lo que midió el bot.",
    entrada: { type: "object", properties: { idea: { type: "string" }, salida: { type: "string", description: "Carpeta nueva o vacía" }, motor: { type: "string", enum: ["godot", "web", "ambos"] }, nombre: { type: "string" }, referencia: { type: "string", description: "Imagen de referencia para el estilo (opcional)" } }, required: ["idea", "salida"] },
    correr: async (a) => {
      const r = await nuevoJuego(a.idea, { salida: a.salida, ...(a.motor ? { motor: a.motor } : {}), ...(a.nombre ? { nombre: a.nombre } : {}), ...(a.referencia ? { referencia: a.referencia } : {}) });
      return r.ok ? { ok: true, valor: { carpeta: r.valor.carpeta, entendio: r.valor.idea.coincidencias, modelos: r.valor.combinacion.ids, arma: r.valor.arma, familia: r.valor.familia, motor: r.valor.motor, arteConstruido: r.valor.arteConstruido, bot: r.valor.bot, avisosBalance: r.valor.avisosBalance, siguiente: "Leer PLAN.md; jugar con `txn jugar`; ajustar fuentes y `construir_juego`; `probar_prototipo`." } } : r;
    },
  },
  probar_prototipo: {
    descripcion: "El bot juega el prototipo sin pantalla con la misma simulación y reglas.json del juego (varias semillas) y devuelve métricas: si sobrevive, oleada, nivel, bajas, botín.",
    entrada: { type: "object", properties: { juego: { type: "string" }, segundos: { type: "number" }, semillas: { type: "number" } }, required: ["juego"] },
    correr: async (a) => {
      const juego = resolve(a.juego);
      if (!existsSync(join(juego, "reglas.json"))) return { ok: false, error: "no hay reglas.json (¿es un prototipo de nuevo_prototipo?)" };
      const reglas = JSON.parse(readFileSync(join(juego, "reglas.json"), "utf8"));
      const ruta = existsSync(join(juego, "web", "simulacion.js")) ? join(juego, "web", "simulacion.js") : fileURLToPath(new URL("../plantillas/accion-cenital/web/simulacion.js", import.meta.url));
      const sim = await import(pathToFileURL(ruta).href);
      const partidas = Array.from({ length: a.semillas ?? 5 }, (_, i) => sim.probarConBot(JSON.parse(JSON.stringify(reglas)), a.segundos ?? 120, i + 1));
      return { vivos: partidas.filter((p: { vivo: boolean }) => p.vivo).length, partidas };
    },
  },
  balance_prototipo: {
    descripcion: "Analiza reglas.json por nivel: golpes y segundos para matar a un común, golpes que aguanta el jugador, enemigos para subir de nivel, duración del jefe, y avisos fuera de rango.",
    entrada: { type: "object", properties: { juego: { type: "string" } }, required: ["juego"] },
    correr: (a) => {
      const p = join(resolve(a.juego), "reglas.json");
      if (!existsSync(p)) return { ok: false, error: "no hay reglas.json" };
      const r = analizarBalance(JSON.parse(readFileSync(p, "utf8")));
      return { avisos: r.avisos, filas: r.filas.filter((f) => f.nivel === 1 || f.nivel % 5 === 0) };
    },
  },
  revisar_estilo: {
    descripcion: "Cruza cada PNG de sprites del juego con la paleta del estilo (OKLab, tolerancia del proyecto): fracción de píxeles fuera de la paleta y los colores ajenos con su rol más cercano.",
    entrada: { type: "object", properties: { juego: { type: "string" } }, required: ["juego"] },
    correr: (a) => revisarEstilo(a.juego),
  },
};

/** Atiende un mensaje JSON-RPC y devuelve la respuesta (o null para notificaciones). */
export async function atender(m: Json): Promise<Json | null> {
  const ok = (result: unknown): Json => ({ jsonrpc: "2.0", id: m.id, result });
  const error = (code: number, message: string): Json => ({ jsonrpc: "2.0", id: m.id ?? null, error: { code, message } });
  if (m.id === undefined) return null; // notificación (initialized, cancelled...)
  switch (m.method) {
    case "initialize":
      return ok({ protocolVersion: m.params?.protocolVersion ?? PROTOCOLO, capabilities: { tools: {} }, serverInfo: { name: "txnucleo", version: VERSION }, instructions: "TxNucleo: mecánicas de videojuegos + red de herramientas (pxl, kiln, reference-to-game, CLI-Anything). Flujo: buscar_mecanica / crear_modelo → iniciar_juego → (contrato_estilo) → editar fuentes .px.js/.kiln.js → estado_juego → construir_juego → revisar_estilo → verificar_juego. Nunca inventes una mecánica sin buscarla. Manual: docs/IA.md y docs/USO.md." });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: Object.entries(HERRAMIENTAS).map(([name, h]) => ({ name, description: h.descripcion, inputSchema: h.entrada })) });
    case "tools/call": {
      const h = HERRAMIENTAS[m.params?.name];
      if (!h) return error(-32602, `herramienta desconocida: ${m.params?.name}`);
      try {
        const r = (await h.correr(m.params?.arguments ?? {})) as Json;
        const fallo = r && typeof r === "object" && r.ok === false;
        return ok({ content: [{ type: "text", text: JSON.stringify(fallo ? { error: r.error } : r && r.ok === true ? r.valor : r, null, 2) }], isError: !!fallo });
      } catch (e) {
        return ok({ content: [{ type: "text", text: `error: ${(e as Error).message}` }], isError: true });
      }
    }
    default:
      return error(-32601, `método no soportado: ${m.method}`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop()!)) {
  const rl = createInterface({ input: process.stdin });
  rl.on("line", async (linea) => {
    if (!linea.trim()) return;
    let m: Json;
    try {
      m = JSON.parse(linea);
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }) + "\n");
      return;
    }
    const r = await atender(m);
    if (r) process.stdout.write(JSON.stringify(r) + "\n");
  });
}
