// Paridad entre motores: genera un prototipo con `nuevoJuego`, lo juega el bot en la simulación JS y en Godot
// (simulacion.gd, sin pantalla) con las mismas semillas, y exige resultados IDÉNTICOS. Uso (lo corre verificar.sh):
//   GODOT=<ruta a Godot 4> node herramientas/paridad.ts

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nuevoJuego } from "../src/infraestructura/nuevo.ts";
import { probarConBot } from "../plantillas/accion-cenital/web/simulacion.js";
import { readFileSync } from "node:fs";

const godot = process.env.GODOT_BIN || process.env.GODOT;
if (!godot) {
  console.log("(sin GODOT: se salta la paridad entre motores)");
  process.exit(0);
}
process.env.TXNUCLEO_RED = join(tmpdir(), "txnucleo-paridad-sin-herramientas");
const dir = mkdtempSync(join(tmpdir(), "txnucleo-paridad-"));
let fallos = 0;
try {
  for (const [i, idea] of ["un roguelite de zombis con armas visto desde arriba", "hack and slash de fantasía con espada"].entries()) {
    const salida = join(dir, `juego${i}`);
    const r = await nuevoJuego(idea, { salida, motor: "godot" });
    if (!r.ok) throw new Error(r.error);
    const reglas = JSON.parse(readFileSync(join(salida, "reglas.json"), "utf8"));
    const js = [1, 2, 3].map((s) => probarConBot(reglas, 60, s));
    spawnSync(godot, ["--headless", "--path", salida, "--import", "--quit"], { encoding: "utf8", timeout: 300_000 });
    const g = spawnSync(godot, ["--headless", "--path", salida, "--", "--bot", "60", "3"], { encoding: "utf8", timeout: 300_000 });
    const linea = (g.stdout ?? "").split(/\r?\n/).find((l) => l.startsWith("{"));
    if (!linea) { console.log(`  MAL ${idea}: Godot no devolvió métricas`); fallos++; continue; }
    const gd = JSON.parse(linea).partidas as Record<string, unknown>[];
    const dif = js.flatMap((p, k) => Object.keys(p).filter((c) => JSON.stringify((p as unknown as Record<string, unknown>)[c]) !== JSON.stringify(gd[k]?.[c])).map((c) => `semilla ${k + 1} ${c}`));
    if (dif.length) { console.log(`  MAL ${idea}: difiere en ${dif.join(", ")}`); fallos++; }
    else console.log(`  ok  ${idea}: 3 partidas idénticas en JS y Godot (${r.valor.combinacion.ids.join(" + ")}, arma ${r.valor.arma})`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(fallos ? `== ${fallos} fallos de paridad` : "== paridad ok");
process.exit(fallos ? 1 : 0);
