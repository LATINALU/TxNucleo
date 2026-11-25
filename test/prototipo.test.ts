// De idea a prototipo: intérprete de ideas, reglas horneadas (deterministas), análisis de balance, arte desde datos,
// simulación de la plantilla jugable (la misma que corre en Godot) y `nuevoJuego` de punta a punta sin herramientas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enlaces, modelos } from "../src/index.ts";
import * as sim from "../plantillas/accion-cenital/web/simulacion.js";

const combinar = (...ids: string[]) => modelos.combinar(ids.map((id) => modelos.modelo(id)));

test("idea: frases libres → respuestas del asistente con la palabra que las activó", () => {
  const i = modelos.interpretarIdea("Un roguelite de ZOMBIS con armas, visto desde arriba");
  assert.deepEqual(i.respuestas.nucleo, ["disparar"]);
  assert.equal(i.respuestas.perspectiva, "superior");
  assert.equal(i.respuestas.ambientacion, "zombis");
  assert.equal(i.respuestas.sesion, "corridas");
  assert.ok(i.coincidencias.some((c) => c.pregunta === "ambientacion" && c.palabra === "zombi"));
  assert.ok(i.sinRespuesta.includes("economia"));
  const rpg = modelos.interpretarIdea("RPG de fantasía con magia y botín, isométrico, con jefes");
  assert.equal(modelos.recomendar(rpg.respuestas).combinacion.ids[0], "arpg-botin");
  assert.deepEqual(modelos.interpretarIdea("").respuestas, {});
});

test("horneado: tablas completas, deterministas, arma según rasgos y familia según modelos", () => {
  const c = combinar("roguelite-accion", "mod-zombis");
  const a = enlaces.hornearReglas(c), b = enlaces.hornearReglas(c);
  assert.deepEqual(a, b, "misma combinación y semilla → mismas tablas");
  assert.equal(a.version, "txnucleo.reglas.v1");
  assert.equal(a.jugador.porNivel.length, 30);
  assert.equal(a.jugador.expParaSubir.length, 30);
  assert.equal(a.enemigos[0]!.familia, "zombi");
  assert.ok(a.enemigos.every((e) => e.porNivel.length === 30 && e.porNivel.every((s) => s.vida >= 1 && s.danio >= 1)));
  assert.equal(a.oleadas.length, 30);
  assert.ok(a.oleadas[4]!.jefe && !a.oleadas[3]!.jefe);
  assert.ok(a.botin.probabilidades.every((p) => Math.abs(p.reduce((s, x) => s + x, 0) - 1) < 1e-3));
  assert.notDeepEqual(enlaces.hornearReglas(c, { semilla: 2 }).oleadas, a.oleadas);
  assert.equal(enlaces.armaDe(combinar("hack-and-slash")), "cuerpo");
  assert.equal(enlaces.armaDe(combinar("arpg-botin")), "distancia");
  assert.equal(enlaces.hornearReglas(combinar("hack-and-slash"), { arma: "distancia" }).jugador.aDistancia, true);
  assert.equal(enlaces.familiaDe(combinar("shooter-tactico")), "soldado");
  assert.ok(a.ajusteMultitud && enlaces.hornearReglas(c, { progresion: "modelo" }).ajusteMultitud === null);
});

test("análisis de balance: el modo prototipo no tiene avisos; la curva RPG completa sí (subida lenta)", () => {
  const c = combinar("arpg-botin");
  const proto = enlaces.analizarBalance(enlaces.hornearReglas(c));
  assert.equal(proto.avisos.length, 0);
  assert.equal(proto.filas.length, 30);
  const modelo = enlaces.analizarBalance(enlaces.hornearReglas(c, { progresion: "modelo" }));
  assert.ok(modelo.avisos.some((x) => x.tipo === "subida-lenta"));
});

test("arte desde datos: un sprite por tipo de enemigo y un cofre por rareza, con colores de la tabla", () => {
  const r = enlaces.hornearReglas(combinar("roguelite-accion", "mod-zombis"));
  const px = enlaces.arteDePlantilla(r, enlaces.PALETAS_FAMILIA.zombi!);
  for (const e of r.enemigos) assert.match(px, new RegExp(`sprite\\("${enlaces.spriteDeEnemigo(e.id)}"`));
  r.botin.nombres.forEach((_, i) => assert.match(px, new RegExp(`sprite\\("botin_${i}"`)));
  assert.ok(px.includes(r.botin.colores[0]!), "los cofres usan los colores de la rareza");
  assert.match(px, /sheet\("personajes"/);
  const est = enlaces.r2g.estiloDesdePaleta(JSON.parse(readFileSync(new URL("./fixtures/red/r2g/paleta.json", import.meta.url), "utf8")), { nombre: "x" });
  assert.ok(est.ok);
  const p = enlaces.paletaDesdeEstilo(est.valor);
  assert.equal(p.contorno, "#1a1c2c", "el más oscuro es el contorno");
  assert.notEqual(enlaces.girarTono("#6f8a5c", 120), "#6f8a5c");
});

test("simulación de la plantilla: determinista, el bot juega y los números salen de reglas.json", () => {
  const r = JSON.parse(JSON.stringify(enlaces.hornearReglas(combinar("roguelite-accion", "mod-zombis"))));
  const a = sim.probarConBot(r, 60, 7), b = sim.probarConBot(r, 60, 7);
  assert.deepEqual(a, b);
  assert.ok(a.bajas > 10 && a.oleada >= 3, `el bot avanza: ${JSON.stringify(a)}`);
  const j = sim.crearJuego(r, 1);
  assert.equal(j.estado.jugador.vida, r.jugador.porNivel[0].vida);
  for (let i = 0; i < 120; i++) j.paso(1 / 60, { x: 0, y: 0, dash: false });
  assert.ok(j.estado.oleada >= 1 && j.estado.enemigos.length > 0, "aparece la primera oleada");
  assert.ok(j.estado.enemigos.every((e: { vidaMax: number; jefe: boolean }) => e.jefe || r.enemigos.some((t: { porNivel: { vida: number }[] }) => t.porNivel[0]!.vida === e.vidaMax)));
});

test("nuevoJuego sin herramientas: prototipo completo, PLAN y bot; nunca escribe en una carpeta con archivos", async () => {
  const { nuevoJuego } = await import("../src/infraestructura/nuevo.ts");
  const dir = mkdtempSync(join(tmpdir(), "txnucleo-nuevo-"));
  const antes = process.env.TXNUCLEO_RED;
  process.env.TXNUCLEO_RED = join(dir, "sin-herramientas");
  try {
    const salida = join(dir, "juego");
    const r = await nuevoJuego("un hack and slash de fantasía con espada y jefes", { salida, motor: "ambos" });
    assert.ok(r.ok, !r.ok ? r.error : "");
    assert.equal(r.valor.arma, "cuerpo");
    assert.equal(r.valor.arteConstruido, false, "sin pxl el juego dibuja figuras");
    for (const f of ["project.godot", "main.tscn", "juego.gd", "simulacion.gd", "txnucleo_importar.gd", "web/index.html", "web/simulacion.js", "web/.gdignore", "reglas.json", "arte/personajes.px.js", "PLAN.md", "txnucleo.red.json", ".txnucleo/bot.json"]) {
      assert.ok(existsSync(join(salida, f)), f);
    }
    assert.match(readFileSync(join(salida, "PLAN.md"), "utf8"), /Lo que midió el bot/);
    assert.match(readFileSync(join(salida, "project.godot"), "utf8"), /config\/name="juego"/);
    writeFileSync(join(dir, "ocupada.txt"), "x");
    const otra = await nuevoJuego("lo que sea", { salida: dir });
    assert.ok(!otra.ok && /ya tiene archivos/.test(otra.error));
  } finally {
    if (antes === undefined) delete process.env.TXNUCLEO_RED;
    else process.env.TXNUCLEO_RED = antes;
    rmSync(dir, { recursive: true, force: true });
  }
});
