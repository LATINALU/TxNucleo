// Proyecto de red de un juego: configuración, plan incremental por hash de la fuente, revisión de colores contra
// la paleta (con el PNG real de pxl) y el lado Node (iniciar, estado, revisar estilo) sin herramientas instaladas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { enlaces } from "../src/index.ts";
import { decodificarPng } from "../src/grafico/png.ts";
import { estadoJuego, iniciarJuego, leerProyecto, registrarRecursos, revisarEstilo, quitarRecursosDeFuente, leerManifiesto } from "../src/infraestructura/enlaces-node.ts";

const FIX = new URL("./fixtures/red/", import.meta.url);
const SHA_A = "a".repeat(64), SHA_B = "b".repeat(64);
const estilo = (): enlaces.ContratoEstilo => {
  const r = enlaces.r2g.estiloDesdePaleta(JSON.parse(readFileSync(new URL("r2g/paleta.json", FIX), "utf8")), { nombre: "bichos" });
  assert.ok(r.ok);
  return r.valor;
};

test("proyecto: valores por defecto válidos, errores claros y salidas por tipo de fuente", () => {
  const p = enlaces.proyectoPorDefecto("mi-juego", "godot");
  assert.deepEqual(enlaces.validarProyecto(p), []);
  assert.ok(enlaces.validarProyecto({ ...p, motor: "cryengine", arte2d: "../fuera" }).length === 2);
  assert.equal(enlaces.tipoDeFuente("arte/a.px.js"), "pxl");
  assert.equal(enlaces.tipoDeFuente("modelos/b.kiln.js"), "kiln");
  assert.equal(enlaces.tipoDeFuente("otro.js"), null);
  assert.equal(enlaces.salidaDeFuente("arte/personajes.px.js"), "arte/out/personajes");
  assert.equal(enlaces.salidaDeFuente("modelos/armas/fusil.kiln.js"), "modelos/armas/fusil.glb");
});

test("plan de construcción: nueva, cambio por hash o por recurso roto, al día", () => {
  const recurso = (ruta: string, fuente: string, sha: string) => ({ ruta, tipo: "imagen" as const, sha256: SHA_A, licencia: "propia", origen: { herramienta: "pxl", fuente, fuenteSha256: sha } });
  const m = { version: "txnucleo.recursos.v1" as const, recursos: [recurso("arte/out/a/a.png", "arte/a.px.js", SHA_A), recurso("arte/out/b/b.png", "arte/b.px.js", SHA_A), recurso("arte/out/c/c.png", "arte/c.px.js", SHA_A)] };
  const plan = enlaces.planConstruccion(
    [{ ruta: "arte/a.px.js", sha256: SHA_A }, { ruta: "arte/b.px.js", sha256: SHA_B }, { ruta: "arte/c.px.js", sha256: SHA_A }, { ruta: "arte/d.px.js", sha256: SHA_A }],
    m,
    new Set(["arte/out/c/c.png"]),
  );
  assert.deepEqual(plan.map((p) => p.estado), ["al-dia", "cambio", "cambio", "nueva"]);
});

test("revisar colores: el PNG real de pxl contra la paleta muestreada de él mismo", () => {
  const im = decodificarPng(new Uint8Array(readFileSync(new URL("pxl/salida/bichos.png", FIX))), (b) => new Uint8Array(inflateSync(b)))!;
  const r = enlaces.revisarColores(im, estilo(), 0.02);
  assert.ok(r.pixelesOpacos > 0);
  assert.ok(r.pixelesAjenos > 0 && r.fraccionAjena < 0.2, "la paleta muestreada cubre la mayoría; brillo y ojos quedan afuera");
  assert.ok(r.colores.some((c) => c.hex === "#f4f4f4"), "el blanco de los ojos no estaba en la paleta");
  assert.ok(r.colores.every((c) => c.distancia > 0.02 && c.rolCercano));
  const todo = enlaces.revisarColores(im, estilo(), 2);
  assert.equal(todo.pixelesAjenos, 0, "con tolerancia enorme todo es de la paleta");
});

test("lado Node: iniciar (sin pisar), estado sin herramientas, quitar recursos de una fuente y revisar estilo", () => {
  const dir = mkdtempSync(join(tmpdir(), "txnucleo-proyecto-"));
  try {
    writeFileSync(join(dir, "estilo.json"), JSON.stringify(estilo()));
    const ini = iniciarJuego(dir, { nombre: "prueba", motor: "web" });
    assert.ok(ini.ok);
    assert.equal(ini.valor.proyecto.estilo, "estilo.json", "detecta el estilo.json de la carpeta");
    assert.match(readFileSync(join(dir, ".gitignore"), "utf8"), /\.kiln\//);
    assert.ok(existsSync(join(dir, "arte")) && existsSync(join(dir, "modelos")));
    const otra = iniciarJuego(dir, { nombre: "otro nombre" });
    assert.ok(otra.ok && otra.valor.proyecto.nombre === "prueba", "no pisa un proyecto existente");
    assert.equal(readFileSync(join(dir, ".gitignore"), "utf8").match(/\.kiln\//g)?.length, 1, "no duplica la línea");

    writeFileSync(join(dir, "arte/bichos.px.js"), readFileSync(new URL("pxl/arte.px.js", FIX)));
    const e1 = estadoJuego(dir);
    assert.ok(e1.ok);
    assert.deepEqual(e1.valor.fuentes, [{ ruta: "arte/bichos.px.js", estado: "nueva" }]);

    // Simular una construcción hecha: copiar la salida real de pxl y registrarla como lo hace `construir`.
    cpSync(new URL("pxl/salida", FIX), join(dir, "arte/out/bichos"), { recursive: true });
    const fuenteSha256 = createHash("sha256").update(readFileSync(join(dir, "arte/bichos.px.js"))).digest("hex");
    registrarRecursos(dir, [{ ruta: "arte/out/bichos/bichos.png", tipo: "imagen", licencia: "propia", origen: { herramienta: "pxl", fuente: "arte/bichos.px.js", fuenteSha256 } }]);
    const e2 = estadoJuego(dir);
    assert.ok(e2.ok);
    assert.equal(e2.valor.fuentes[0]!.estado, "al-dia");

    const rev = revisarEstilo(dir);
    assert.ok(rev.ok);
    assert.equal(rev.valor.length, 1);
    assert.equal(rev.valor[0]!.imagen, "arte/out/bichos/bichos.png");

    writeFileSync(join(dir, "arte/bichos.px.js"), "// editado\n" + readFileSync(join(dir, "arte/bichos.px.js"), "utf8"));
    const e3 = estadoJuego(dir);
    assert.ok(e3.ok && e3.valor.fuentes[0]!.estado === "cambio");

    quitarRecursosDeFuente(dir, "arte/bichos.px.js");
    assert.equal(leerManifiesto(dir).recursos.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(leerProyecto(tmpdir() + "/no-existe-txn").ok, false);
});
