// `txn informe`: una página HTML autocontenida por juego que muestra lo que hizo TxNucleo con números MEDIDOS (nada
// estimado): mecánicas reutilizadas, valores de reglas calculados, arte generado desde datos, recursos verificados,
// lo que midió el bot, el balance por nivel y la bitácora de comandos con su duración (incluido el tiempo de idea a
// prototipo jugable). Lee lo que dejaron los otros comandos en la carpeta del juego.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analizarBalance, type ReglasHorneadas } from "../enlaces/index.ts";
import { leerManifiesto, verificarManifiesto } from "./enlaces.ts";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

/** Una entrada de la bitácora (`.txnucleo/bitacora.jsonl`, la escribe `txn`). */
export interface EntradaBitacora {
  readonly fecha: string;
  readonly comando: string;
  readonly ms: number;
  readonly ok: boolean;
}

const esc = (s: unknown): string => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const leer = <T>(ruta: string): T | null => (existsSync(ruta) ? (JSON.parse(readFileSync(ruta, "utf8")) as T) : null);
const seg = (ms: number): string => (ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`);

/** Cuenta los números que contiene un JSON (los valores que TxNucleo calculó al hornear). */
function contarNumeros(x: unknown): number {
  if (typeof x === "number") return 1;
  if (Array.isArray(x)) return x.reduce((s: number, v) => s + contarNumeros(v), 0);
  if (x && typeof x === "object") return Object.values(x).reduce((s: number, v) => s + contarNumeros(v), 0);
  return 0;
}

/** Línea SVG simple de una serie (para el balance por nivel). */
function linea(valores: readonly number[], color: string, w = 560, h = 120): string {
  const max = Math.max(1, ...valores);
  const pts = valores.map((v, i) => `${((i / Math.max(1, valores.length - 1)) * w).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(" ");
  return `<polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}"/>`;
}

/** Genera el HTML del informe de un juego. */
export function generarInforme(juego: string): string {
  const raiz = resolve(juego);
  const info = leer<{ nombre?: string; idea?: string; ids?: string[]; modulos?: string[]; generos?: string[] }>(join(raiz, "txnucleo.juego.json")) ?? {};
  const reglas = leer<ReglasHorneadas>(join(raiz, "reglas.json"));
  const bot = leer<{ segundos: number; semillas: number; vivos: number; partidas: { oleada: number; nivel: number; bajas: number; botin: number }[] }>(join(raiz, ".txnucleo", "bot.json"));
  const hoja = leer<{ cuadros: { nombre: string }[] }>(join(raiz, "arte", "out", "personajes", "personajes.hoja.json"));
  const catalogo = leer<{ espacios: { nombre: string; archivos: { exportaciones: unknown[] }[] }[] }>(join(RAIZ, "docs", "catalogo.json"));
  const bitacora: EntradaBitacora[] = existsSync(join(raiz, ".txnucleo", "bitacora.jsonl"))
    ? readFileSync(join(raiz, ".txnucleo", "bitacora.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const manifiesto = leerManifiesto(raiz);
  const errores = existsSync(join(raiz, "txnucleo.recursos.json")) ? verificarManifiesto(raiz) : ["sin manifiesto"];

  const modulos = info.modulos ?? [];
  const exportaciones = (catalogo?.espacios ?? []).filter((e) => modulos.includes(e.nombre)).reduce((s, e) => s + e.archivos.reduce((t, a) => t + a.exportaciones.length, 0), 0);
  const valores = reglas ? contarNumeros(reglas) : 0;
  const sprites = hoja?.cuadros.length ?? 0;
  const variantes = hoja ? hoja.cuadros.filter((c) => c.nombre.startsWith("enemigo_") || c.nombre.startsWith("botin_")).length : 0;
  const bal = reglas ? analizarBalance(reglas) : null;
  const nuevo = bitacora.find((b) => b.comando === "nuevo");
  const total = bitacora.reduce((s, b) => s + b.ms, 0);
  const media = (f: (p: { oleada: number; nivel: number; bajas: number; botin: number }) => number) => (bot ? (bot.partidas.reduce((s, p) => s + f(p), 0) / bot.partidas.length).toFixed(1) : "–");
  const captura = existsSync(join(raiz, ".txnucleo", "captura.png")) ? `<figure><img src="../.txnucleo/captura.png" alt="Captura del prototipo jugado por el bot"><figcaption>Captura del prototipo (Godot) después de jugar el bot.</figcaption></figure>` : "";

  const tarjeta = (num: string | number, titulo: string, detalle: string) => `<div class="t"><b>${esc(num)}</b><span>${esc(titulo)}</span><small>${esc(detalle)}</small></div>`;
  const tarjetas = [
    tarjeta(nuevo ? seg(nuevo.ms) : "–", "de idea a prototipo jugable", nuevo ? "medido: comando txn nuevo" : "sin registro de txn nuevo"),
    tarjeta(exportaciones, "piezas de mecánica disponibles", `${modulos.length} módulos de TxNucleo (${modulos.join(", ")})`),
    tarjeta(valores, "valores de reglas calculados", reglas ? `${reglas.niveles} niveles × ${reglas.enemigos.length} enemigos, ${reglas.oleadas.length} oleadas, rareza por nivel` : "sin reglas.json"),
    tarjeta(sprites, "sprites generados", `${variantes} variantes salieron de los datos (enemigos y rarezas)`),
    tarjeta(`${manifiesto.recursos.length}`, "recursos con huella", errores.length ? `${errores.length} problemas` : "todos verificados"),
    tarjeta(bot ? `${bot.vivos}/${bot.semillas}` : "–", "partidas del bot sobreviven", bot ? `${bot.segundos} s · oleada ${media((p) => p.oleada)} · nivel ${media((p) => p.nivel)} · ${media((p) => p.bajas)} bajas` : "correr txn probar"),
  ].join("");

  const grafico = bal
    ? `<svg viewBox="0 0 560 120" role="img" aria-label="Balance por nivel">${linea(bal.filas.map((f) => f.enemigosParaSubir), "#58a6ff")}${linea(bal.filas.map((f) => f.golpesParaMorir), "#f0883e")}${linea(bal.filas.map((f) => f.golpesParaMatar), "#3fb950")}</svg>
       <p class="ley"><i style="background:#3fb950"></i>golpes para matar a un común <i style="background:#f0883e"></i>golpes que aguanta el jugador <i style="background:#58a6ff"></i>enemigos para subir de nivel · niveles 1 a ${bal.filas.length}</p>
       ${bal.avisos.length ? `<ul>${bal.avisos.slice(0, 8).map((a) => `<li>Nivel ${a.nivel}: ${esc(a.detalle)}</li>`).join("")}</ul>` : "<p>Sin avisos de balance.</p>"}`
    : "<p>Sin reglas horneadas.</p>";

  const filas = bitacora.map((b) => `<tr><td>${esc(b.fecha.replace("T", " ").slice(0, 19))}</td><td>txn ${esc(b.comando)}</td><td>${seg(b.ms)}</td><td>${b.ok ? "✓" : "✗"}</td></tr>`).join("");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(info.nombre ?? "Juego")} · informe TxNucleo</title>
<style>
:root{color-scheme:light dark;--f:#0d1117;--p:#161b22;--b:#30363d;--t:#e6edf3;--s:#8b949e}
@media (prefers-color-scheme: light){:root{--f:#f6f8fa;--p:#fff;--b:#d0d7de;--t:#1f2328;--s:#59636e}}
body{margin:0;background:var(--f);color:var(--t);font:15px/1.5 system-ui,sans-serif}
main{max-width:980px;margin:auto;padding:32px 20px}
h1{margin:0 0 4px;font-size:28px} h2{margin:32px 0 12px;font-size:18px} .s{color:var(--s)}
.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.t{background:var(--p);border:1px solid var(--b);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:2px}
.t b{font-size:26px} .t small{color:var(--s)}
svg{width:100%;height:140px;background:var(--p);border:1px solid var(--b);border-radius:10px;padding:10px;box-sizing:border-box}
.ley i{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 12px}
table{width:100%;border-collapse:collapse;background:var(--p);border:1px solid var(--b);border-radius:10px;overflow:hidden}
td,th{padding:6px 10px;border-bottom:1px solid var(--b);text-align:left} th{color:var(--s);font-weight:500}
figure{margin:0} img{width:100%;image-rendering:pixelated;border:1px solid var(--b);border-radius:10px} figcaption{color:var(--s);font-size:13px}
</style></head><body><main>
<h1>${esc(info.nombre ?? "Juego")}</h1>
<p class="s">${info.idea ? `Idea: “${esc(info.idea)}” · ` : ""}modelos: ${esc((info.ids ?? []).join(" + "))} · géneros: ${esc((info.generos ?? []).join(", "))}</p>
<h2>Lo que hizo TxNucleo</h2><div class="g">${tarjetas}</div>
${captura ? `<h2>Así se ve</h2>${captura}` : ""}
<h2>Balance por nivel</h2>${grafico}
<h2>Bitácora</h2>
${filas ? `<table><thead><tr><th>Fecha</th><th>Comando</th><th>Duración</th><th></th></tr></thead><tbody>${filas}</tbody></table><p class="s">Tiempo total en comandos de TxNucleo: ${seg(total)}.</p>` : "<p>Sin comandos registrados todavía.</p>"}
<p class="s">Generado por <code>txn informe</code>. Todos los números salen de los archivos del juego; nada es estimado.</p>
</main></body></html>
`;
}
