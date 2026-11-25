// Ejemplo de punta a punta de la red TxNucleo, con el mismo flujo que usa una persona o una IA:
//   1. mecánicas (modelos combinados)          → TxNucleo
//   2. estilo desde una referencia propia       → reference-to-game  → estilo.json (ContratoEstilo)
//   3. iniciar el proyecto de red del juego     → txnucleo.red.json
//   4. fuentes de arte con la paleta del estilo → arte/personajes.px.js (pxl) + modelos/fusil.kiln.js (kiln, a escala)
//   5. estado → construir → construir otra vez  → solo lo que cambió; contratos + manifiesto con hashes
//   6. revisar estilo                           → colores de los sprites fuera de la paleta
// Usa las herramientas reales si están instaladas (`npm run red -- instalar pxl kiln r2g`); si falta alguna, sigue
// con las salidas reales guardadas en test/fixtures/red/ y lo dice. Uso: npm run ejemplo:red → ejemplos/salida/red/

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { combinar, modelo } from "../../src/modelos/index.ts";
import { bloquesDeArma, dimensionDe, kiln, pxl, r2g, seccionPlanArte, tareasDeArte, type ContratoEstilo } from "../../src/enlaces/index.ts";
import {
  construirJuego, doctor, estadoJuego, estiloDesdeImagen, hojasDeSalidaPxl, iniciarJuego, registrarRecursos, revisarEstilo,
} from "../../src/infraestructura/enlaces-node.ts";

const aqui = (r: string): string => fileURLToPath(new URL(r, import.meta.url));
const FIX = aqui("../../test/fixtures/red/");
const JUEGO = aqui("../salida/red/");
rmSync(JUEGO, { recursive: true, force: true });
mkdirSync(JUEGO, { recursive: true });

function fallar(e: string): never {
  console.error(`✗ ${e}`);
  process.exit(1);
}
const instaladas = new Set(doctor(["r2g", "pxl", "kiln"]).herramientas.filter((h) => h.instalada).map((h) => h.id));
const como = (id: string): string => (instaladas.has(id) ? "herramienta real" : "salida guardada: herramienta no instalada");

// 1) Mecánicas: un roguelite de acción con zombis, 2D lateral (más utilería 3D para mostrar kiln).
const juego = combinar(["roguelite-accion", "mod-zombis"].map(modelo));
const dimension = dimensionDe(juego, "lateral");
console.log(`1. Mecánicas: ${juego.ids.join(" + ")} → ${juego.modulos.length} módulos (${juego.modulos.join(", ")}), arte ${dimension}`);

// 2) Estilo desde una referencia propia.
let estilo: ContratoEstilo;
if (instaladas.has("r2g")) {
  const r = estiloDesdeImagen(aqui("referencias/referencia.png"), join(JUEGO, "estilo.json"), { nombre: "ceniza", grilla: 6, pixel: { resolucion: [320, 180], escala: 4 } });
  estilo = r.ok ? r.valor : fallar(r.error);
} else {
  const r = r2g.estiloDesdePaleta(JSON.parse(readFileSync(join(FIX, "r2g/paleta.json"), "utf8")), { nombre: "ceniza", pixel: { resolucion: [320, 180], escala: 4 } });
  estilo = r.ok ? r.valor : fallar(r.error);
  writeFileSync(join(JUEGO, "estilo.json"), JSON.stringify(estilo, null, 2));
}
console.log(`2. Estilo (${como("r2g")}): ${estilo.paleta.map((c) => `${c.rol} ${c.hex}`).join(" · ")}`);

// 3) Proyecto de red del juego.
const ini = iniciarJuego(JUEGO, { nombre: "ceniza", motor: "web", estilo: "estilo.json" });
if (!ini.ok) fallar(ini.error);
console.log(`3. Proyecto: ${ini.valor.hechos.join(" · ")}`);

// 4) Fuentes de arte: plantilla pxl con la paleta fija y bloques kiln con el largo real de un fusil.
const tareas = tareasDeArte(juego, dimension);
const sprites = tareas.filter((t) => t.archivo === "arte/personajes.px.js").map((t) => t.id);
writeFileSync(join(JUEGO, "arte/personajes.px.js"), pxl.plantillaPx(estilo, sprites, 8, "personajes"));
writeFileSync(join(JUEGO, "modelos/fusil.kiln.js"), kiln.programaBloques("fusil", bloquesDeArma("fusil")));
writeFileSync(join(JUEGO, "PLAN.md"), ["# Prototipo de ejemplo", "", ...seccionPlanArte(dimension, tareas, estilo)].join("\n"));
console.log(`4. Fuentes: arte/personajes.px.js (${sprites.join(", ")}) · modelos/fusil.kiln.js`);

// 5) Estado → construir → construir de nuevo (incremental).
const antes = estadoJuego(JUEGO);
if (!antes.ok) fallar(antes.error);
console.log(`5. Estado: ${antes.valor.fuentes.map((f) => `${f.ruta}=${f.estado}`).join(", ")}`);
if (instaladas.has("pxl") && instaladas.has("kiln")) {
  const b1 = construirJuego(JUEGO);
  if (!b1.ok || b1.valor.errores.length) fallar(b1.ok ? b1.valor.errores.join("; ") : b1.error);
  console.log(`   construir: ${b1.valor.construidas.length} construidas (herramientas reales)`);
  const b2 = construirJuego(JUEGO);
  if (!b2.ok) fallar(b2.error);
  console.log(`   construir otra vez: ${b2.valor.construidas.length} construidas, ${b2.valor.alDia.length} al día (incremental)`);
} else {
  cpSync(join(FIX, "pxl/salida"), join(JUEGO, "arte/out/personajes"), { recursive: true });
  const h = hojasDeSalidaPxl(join(JUEGO, "arte/out/personajes"), "personajes.px.js");
  if (!h.ok) fallar(h.error);
  registrarRecursos(JUEGO, [{ ruta: "arte/out/personajes/bichos.png", tipo: "imagen", licencia: "propia", origen: { herramienta: "pxl", fuente: "arte/personajes.px.js" } }]);
  console.log(`   construir: ${como("pxl")} / ${como("kiln")} → se usaron las salidas guardadas`);
}

// 6) Revisar estilo.
const rev = revisarEstilo(JUEGO);
if (!rev.ok) fallar(rev.error);
for (const { imagen, revision: r } of rev.valor) {
  console.log(`6. Estilo ${imagen}: ${r.pixelesAjenos ? `${(r.fraccionAjena * 100).toFixed(1)} % fuera de la paleta` : "todos los colores son de la paleta"}`);
}
console.log(`\nListo en ${JUEGO}. Probá: npm --prefix <TxNucleo> run red -- estado ${JUEGO}`);
