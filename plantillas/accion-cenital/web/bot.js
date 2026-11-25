// Bot de pruebas sin pantalla: juega el prototipo con la MISMA simulación del navegador y las mismas reglas.json.
// Uso: node web/bot.js [segundos=120] [semillas=5]  → imprime un JSON con las métricas por semilla y el promedio.

import { readFileSync } from "node:fs";
import { probarConBot } from "./simulacion.js";

const reglas = JSON.parse(readFileSync(new URL("../reglas.json", import.meta.url), "utf8"));
const segundos = Number(process.argv[2] ?? 120);
const semillas = Number(process.argv[3] ?? 5);
const partidas = Array.from({ length: semillas }, (_, i) => probarConBot(reglas, segundos, i + 1));
const media = (f) => Math.round((partidas.reduce((s, p) => s + f(p), 0) / partidas.length) * 10) / 10;
console.log(JSON.stringify({
  segundos, semillas,
  vivos: partidas.filter((p) => p.vivo).length,
  media: { segundos: media((p) => p.segundos), oleada: media((p) => p.oleada), nivel: media((p) => p.nivel), bajas: media((p) => p.bajas), botin: media((p) => p.botin) },
  partidas,
}, null, 2));
