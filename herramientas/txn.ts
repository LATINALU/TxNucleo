#!/usr/bin/env node
// `txn`: el comando de TxNucleo. De una idea a un prototipo que se juega, y el ciclo diario del juego.
// Instalar una vez (desde la carpeta de TxNucleo):  npm link   → queda `txn` en el PATH.
// Sin instalar:  node <TxNucleo>/herramientas/txn.ts <comando>
// Cada comando que trabaja sobre un juego anota su duración en <juego>/.txnucleo/bitacora.jsonl (lo usa `informe`).

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { combinar, modelo } from "../src/modelos/index.ts";
import { analizarBalance, bloquesDeArma, hornearReglas, type ReglasHorneadas } from "../src/enlaces/index.ts";
import { programaBloques } from "../src/enlaces/adaptadores/kiln.ts";
import { ARMAS } from "../src/datos/armas.ts";
import { binarioGodot, nuevoJuego, type MotorPrototipo } from "../src/infraestructura/enlaces-node.ts";
import { generarInforme } from "../src/infraestructura/informe.ts";

const RAIZ = fileURLToPath(new URL("../", import.meta.url));
if (process.env.INIT_CWD) process.chdir(process.env.INIT_CWD);

const args = process.argv.slice(2);
const cmd = args[0] ?? "ayuda";
const opcion = (n: string): string | undefined => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const posicional = (i: number): string | undefined => args.filter((a, k) => k > 0 && !a.startsWith("--") && !args[k - 1]?.startsWith("--"))[i];
function salir(e: string): never {
  console.error(`✗ ${e}`);
  process.exit(1);
}

const AYUDA = `txn — TxNucleo: de una idea a un juego que se juega. Guía: docs/USO.md

  EMPEZAR
  nuevo "<idea>" [--salida carpeta] [--motor godot|web|ambos] [--referencia img.png] [--nombre N]
                     idea → modelos → reglas horneadas → arte desde datos → plantilla jugable → bot
  jugar [carpeta] [--web] [--puerto 8080]      abre el prototipo en Godot o en el navegador

  PROBAR Y AJUSTAR
  probar [carpeta] [--segundos 120] [--semillas 5] [--godot] [--captura]
                     el bot juega sin pantalla (misma lógica y reglas); --godot lo corre en Godot; --captura guarda una imagen
  balance [carpeta]  tiempo para matar, golpes que aguanta, enemigos por nivel, avisos
  rehornear [carpeta] [--progresion prototipo|modelo]   recalcula reglas.json desde los modelos
  variantes armas [carpeta] [--categoria fusil]         un modelo kiln a escala por arma del catálogo
  informe [carpeta]  informe/index.html: lo que hizo TxNucleo, medido

  RED DE HERRAMIENTAS (igual que npm run red --)
  doctor · instalar <id|todo> · lista · iniciar · estado · construir · revisar-estilo · verificar
  estilo · plantilla-px · sprites · modelo · godot
`;

/** Carpeta de juego del comando (posicional o la actual). */
const juegoDe = (i = 0): string => resolve(posicional(i) ?? ".");

/** Anota el comando en la bitácora del juego (si la carpeta es un juego de TxNucleo). */
function anotar(juego: string, comando: string, ms: number, ok: boolean): void {
  if (!existsSync(join(juego, "txnucleo.red.json"))) return;
  mkdirSync(join(juego, ".txnucleo"), { recursive: true });
  appendFileSync(join(juego, ".txnucleo", "bitacora.jsonl"), JSON.stringify({ fecha: new Date().toISOString(), comando, ms: Math.round(ms), ok }) + "\n");
}

const leerReglas = (juego: string): ReglasHorneadas => {
  const p = join(juego, "reglas.json");
  if (!existsSync(p)) salir(`no hay reglas.json en ${juego} (¿es un prototipo de txn nuevo?)`);
  return JSON.parse(readFileSync(p, "utf8"));
};

async function probar(juego: string): Promise<boolean> {
  const reglas = leerReglas(juego);
  const segundos = Number(opcion("segundos") ?? 120), semillas = Number(opcion("semillas") ?? 5);
  const sim = await import(pathToFileURL(join(existsSync(join(juego, "web", "simulacion.js")) ? join(juego, "web") : join(RAIZ, "plantillas", "accion-cenital", "web"), "simulacion.js")).href);
  const partidas = Array.from({ length: semillas }, (_, i) => sim.probarConBot(JSON.parse(JSON.stringify(reglas)), segundos, i + 1));
  const media = (k: string) => Math.round((partidas.reduce((s: number, p: Record<string, number>) => s + p[k]!, 0) / partidas.length) * 10) / 10;
  const r = { segundos, semillas, vivos: partidas.filter((p: { vivo: boolean }) => p.vivo).length, media: { segundos: media("segundos"), oleada: media("oleada"), nivel: media("nivel"), bajas: media("bajas"), botin: media("botin") }, partidas };
  mkdirSync(join(juego, ".txnucleo"), { recursive: true });
  writeFileSync(join(juego, ".txnucleo", "bot.json"), JSON.stringify(r, null, 2) + "\n");
  console.log(`Bot (JS): ${r.vivos}/${semillas} vivos a los ${segundos} s · oleada ${r.media.oleada} · nivel ${r.media.nivel} · ${r.media.bajas} bajas · ${r.media.botin} botín`);
  let ok = true;
  if (args.includes("--godot") || args.includes("--captura")) {
    if (!existsSync(join(juego, "project.godot"))) return salir("no es un proyecto Godot");
    if (args.includes("--godot")) {
      const g = spawnSync(binarioGodot(), ["--headless", "--path", juego, "--", "--bot", String(segundos), String(semillas)], { encoding: "utf8", timeout: 600_000 });
      const linea = (g.stdout ?? "").split(/\r?\n/).find((l) => l.startsWith("{"));
      if (!linea) { console.log(`✗ Godot: ${(g.stderr || g.stdout || String(g.error)).trim().slice(-400)}`); ok = false; }
      else {
        const gd = JSON.parse(linea);
        // Godot ordena las claves del JSON: se compara valor por valor.
        const iguales = partidas.every((p: Record<string, unknown>, i: number) => Object.keys(p).every((k) => JSON.stringify(p[k]) === JSON.stringify(gd.partidas[i]?.[k])));
        console.log(`Bot (Godot): ${gd.vivos}/${semillas} vivos · oleada ${gd.media.oleada} · nivel ${gd.media.nivel} · ${iguales ? "✓ idéntico a la versión web (misma partida en los dos motores)" : "≠ distinto de la versión web"}`);
      }
    }
    if (args.includes("--captura")) {
      const destino = join(juego, ".txnucleo", "captura.png");
      const g = spawnSync(binarioGodot(), ["--path", juego, "--", "--captura", destino, "30"], { encoding: "utf8", timeout: 120_000 });
      console.log(existsSync(destino) && /captura/.test(g.stdout ?? "") ? `✓ captura: ${destino}` : `✗ captura: ${(g.stderr || "").trim().slice(-300)}`);
    }
  }
  return ok;
}

function balance(juego: string): boolean {
  const a = analizarBalance(leerReglas(juego));
  console.log("nivel  matar(golpes/s)  aguanta(golpes)  enemigos→subir  jefe(s)");
  for (const f of a.filas.filter((f) => f.nivel === 1 || f.nivel % 5 === 0)) {
    console.log(`${String(f.nivel).padStart(5)}  ${`${f.golpesParaMatar} / ${f.segundosParaMatar}`.padStart(15)}  ${String(f.golpesParaMorir).padStart(15)}  ${String(f.enemigosParaSubir).padStart(14)}  ${String(f.segundosJefe).padStart(7)}`);
  }
  if (a.avisos.length) for (const v of a.avisos.slice(0, 10)) console.log(`  ! nivel ${v.nivel}: ${v.detalle}`);
  else console.log("✓ sin avisos de balance");
  writeFileSync(join(juego, ".txnucleo", "balance.json"), JSON.stringify(a, null, 2) + "\n");
  return true;
}

function rehornear(juego: string): boolean {
  const info = JSON.parse(readFileSync(join(juego, "txnucleo.juego.json"), "utf8"));
  const c = combinar((info.ids as string[]).map((id) => modelo(id)));
  const prog = (opcion("progresion") as "prototipo" | "modelo" | undefined) ?? "prototipo";
  const r = hornearReglas(c, { nombre: info.nombre, progresion: prog, ...(info.horneado?.familia ? { familia: info.horneado.familia } : {}), ...(info.horneado?.arma ? { arma: info.horneado.arma } : {}) });
  writeFileSync(join(juego, "reglas.json"), JSON.stringify(r, null, 1) + "\n");
  console.log(`✓ reglas.json recalculado (${prog}): ${r.niveles} niveles, ${r.enemigos.length} enemigos, ${r.oleadas.length} oleadas`);
  return true;
}

function variantes(juego: string): boolean {
  if (posicional(0) !== "armas") salir("uso: txn variantes armas [carpeta] [--categoria fusil]");
  const dir = resolve(posicional(1) ?? ".");
  const cat = opcion("categoria");
  const lista = ARMAS.filter((a) => !cat || a.categoria === cat);
  if (!lista.length) salir(`no hay armas de la categoría ${cat}`);
  mkdirSync(join(dir, "modelos", "armas"), { recursive: true });
  let nuevos = 0;
  for (const a of lista) {
    const f = join(dir, "modelos", "armas", `${a.arma.id}.kiln.js`);
    if (existsSync(f)) continue;
    writeFileSync(f, programaBloques(a.arma.id, bloquesDeArma(a.categoria)));
    nuevos++;
  }
  console.log(`✓ ${nuevos} modelos nuevos en modelos/armas/ (${lista.length} armas del catálogo, a escala por categoría). Siguiente: txn construir`);
  void juego;
  return true;
}

const TIPOS: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".css": "text/css" };

function jugar(juego: string): void {
  if (args.includes("--web")) {
    if (!existsSync(join(juego, "web", "index.html"))) salir("este juego no tiene versión web (txn nuevo --motor web|ambos)");
    const puerto = Number(opcion("puerto") ?? 8080);
    createServer((req, res) => {
      const ruta = normalize(join(juego, decodeURIComponent((req.url ?? "/").split("?")[0]!)));
      if (!ruta.startsWith(juego + sep) && ruta !== juego) { res.writeHead(403).end(); return; }
      const f = existsSync(ruta) && statSync(ruta).isDirectory() ? join(ruta, "index.html") : ruta;
      if (!existsSync(f)) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "content-type": TIPOS[extname(f)] ?? "application/octet-stream", "cache-control": "no-store" });
      createReadStream(f).pipe(res);
    }).listen(puerto, "127.0.0.1", () => console.log(`Jugando en http://127.0.0.1:${puerto}/web/  (Ctrl+C para cerrar)`));
    return;
  }
  if (!existsSync(join(juego, "project.godot"))) salir("no hay project.godot (usá --web o txn nuevo --motor godot)");
  spawn(binarioGodot(), ["--path", juego], { detached: true, stdio: "ignore" }).unref();
  console.log("Abriendo en Godot…");
}

/** Comandos que ejecuta herramientas/red.ts tal cual. */
const DE_RED = new Set(["doctor", "instalar", "lista", "iniciar", "estado", "construir", "revisar-estilo", "verificar", "estilo", "plantilla-px", "sprites", "modelo", "godot"]);

const inicio = performance.now();
let juego = juegoDe();
let ok = true;
switch (cmd) {
  case "nuevo": {
    const idea = posicional(0) ?? salir('falta la idea: txn nuevo "un roguelite de zombis visto desde arriba"');
    const salida = resolve(opcion("salida") ?? idea.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40));
    console.log(`TxNucleo · nuevo prototipo en ${salida}`);
    const r = await nuevoJuego(idea, {
      salida,
      ...(opcion("motor") ? { motor: opcion("motor") as MotorPrototipo } : {}),
      ...(opcion("nombre") ? { nombre: opcion("nombre")! } : {}),
      ...(opcion("referencia") ? { referencia: resolve(opcion("referencia")!) } : {}),
      log: (s) => console.log(s),
    });
    if (!r.ok) salir(r.error);
    juego = salida;
    const ms = performance.now() - inicio;
    console.log(`\n✓ Prototipo jugable en ${(ms / 1000).toFixed(1)} s: ${r.valor.combinacion.ids.join(" + ")}, arma ${r.valor.arma}, enemigos ${r.valor.familia}.`);
    console.log(`  Jugar: cd "${salida}" && txn jugar${r.valor.motor === "web" ? " --web" : ""}   ·   Plan: PLAN.md   ·   Informe: txn informe`);
    break;
  }
  case "jugar":
    jugar(juego);
    break;
  case "probar":
    ok = await probar(juego);
    break;
  case "balance":
    mkdirSync(join(juego, ".txnucleo"), { recursive: true });
    ok = balance(juego);
    break;
  case "rehornear":
    ok = rehornear(juego);
    break;
  case "variantes":
    juego = resolve(posicional(1) ?? ".");
    ok = variantes(juego);
    break;
  case "informe": {
    mkdirSync(join(juego, "informe"), { recursive: true });
    anotar(juego, "informe", performance.now() - inicio, true);
    writeFileSync(join(juego, "informe", "index.html"), generarInforme(juego));
    console.log(`✓ ${join(juego, "informe", "index.html")}`);
    process.exit(0);
  }
  case "ayuda":
  case "--help":
  case "-h":
    console.log(AYUDA);
    process.exit(0);
  default:
    if (!DE_RED.has(cmd)) { console.log(AYUDA); salir(`comando desconocido: ${cmd}`); }
    {
      const r = spawnSync(process.execPath, [join(RAIZ, "herramientas", "red.ts"), ...args], { stdio: "inherit" });
      ok = r.status === 0;
    }
}
if (cmd !== "jugar") anotar(juego, cmd, performance.now() - inicio, ok);
if (!ok) process.exit(1);
