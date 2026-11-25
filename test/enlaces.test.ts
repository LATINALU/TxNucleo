// Red TxNucleo: contratos, registro y adaptadores contra salidas REALES guardadas de cada herramienta
// (test/fixtures/red/: pxl, kiln, reference-to-game y CLI-Anything con Godot 4.7). No requieren instalarlas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enlaces } from "../src/index.ts";
import { hojasDeSalidaPxl, registrarRecursos, verificarManifiesto } from "../src/infraestructura/enlaces.ts";

const FIX = new URL("./fixtures/red/", import.meta.url);
const json = (r: string): unknown => JSON.parse(readFileSync(new URL(r, FIX), "utf8"));
const temporal = (): string => mkdtempSync(join(tmpdir(), "txnucleo-red-"));

test("registro: ids únicos, licencias, commits fijados de 40 hex y contrato declarado", () => {
  const ids = enlaces.REGISTRO.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const h of enlaces.REGISTRO) {
    assert.ok(h.licencia && h.contrato && h.repo.startsWith("https://github.com/"), h.id);
    if (h.instalacion.tipo === "git" || h.instalacion.tipo === "pip-git") assert.match(h.instalacion.commit, /^[0-9a-f]{40}$/, h.id);
  }
  for (const rol of ["arte2d", "arte3d", "motor", "referencia", "estudio"]) assert.ok(enlaces.REGISTRO.some((h) => h.rol === rol), rol);
  assert.equal(enlaces.herramienta("kiln")?.rol, "arte3d");
  assert.equal(enlaces.herramienta("nada"), undefined);
});

test("pxl: hoja estática y animación (frameTags + duration) → HojaSprites válida", () => {
  const hoja = enlaces.pxl.hojaDesdePxl(json("pxl/salida/bichos.json"), { fuente: "arte.px.js" });
  assert.ok(hoja.ok, !hoja.ok ? hoja.error : "");
  assert.deepEqual(hoja.valor.cuadros.map((c) => c.nombre), ["bicho", "bicho_rojo", "gema"]);
  assert.equal(hoja.valor.imagen, "bichos.png");
  assert.equal(hoja.valor.animaciones.length, 0);
  assert.deepEqual(enlaces.validarHoja(hoja.valor), []);

  const anim = enlaces.pxl.hojaDesdePxl(json("pxl/salida/anims/respira.json"), { sinBucle: ["respira"] });
  assert.ok(anim.ok);
  assert.deepEqual(anim.valor.animaciones, [{ nombre: "respira", desde: 0, hasta: 1, bucle: false, ms: [250, 250] }]);
  assert.deepEqual(enlaces.pxl.clipsDesdeHoja(anim.valor), { respira: { cuadros: [0, 1], fps: 4, bucle: false } });
});

test("pxl: rechaza JSON roto y cuadros fuera de la imagen", () => {
  assert.equal(enlaces.pxl.hojaDesdePxl({ nada: 1 }).ok, false);
  const malo = structuredClone(json("pxl/salida/bichos.json")) as any;
  malo.frames.gema.frame.x = 999;
  const r = enlaces.pxl.hojaDesdePxl(malo);
  assert.ok(!r.ok && r.error.includes("se sale"));
});

test("pxl: plantilla .px.js con la paleta fija del estilo y teclas únicas", () => {
  const estilo = enlaces.r2g.estiloDesdePaleta(json("r2g/paleta.json"), { nombre: "bichos" });
  assert.ok(estilo.ok);
  const teclas = enlaces.pxl.teclasDePaleta(estilo.valor);
  assert.equal(new Set(teclas.values()).size, estilo.valor.paleta.length);
  const px = enlaces.pxl.plantillaPx(estilo.valor, ["heroe", "cofre"], 4);
  assert.match(px, /pal\(\{ c: "#38b764"/);
  assert.match(px, /sprite\("heroe"/);
  assert.match(px, /sheet\("bichos", \["heroe","cofre"\]/);
});

test("kiln: GLB real → nodos y materiales; recibo → Modelo3D con colisión y QA", () => {
  const glb = new Uint8Array(readFileSync(new URL("kiln/caja.glb", FIX)));
  const info = enlaces.kiln.leerGlb(glb);
  assert.ok(info.ok);
  assert.deepEqual(info.valor.nodos, ["CajaSuministros", "Mesh_Cuerpo", "Mesh_Banda"]);
  assert.equal(info.valor.materiales, 2);
  assert.equal(info.valor.generador, "Kiln");

  const m = enlaces.kiln.modeloDesdeKiln(json("kiln/recibo.json"), glb, { glb: "caja.glb", fuente: "caja.kiln.js", etiquetas: ["cobertura"] });
  assert.ok(m.ok, !m.ok ? m.error : "");
  assert.equal(m.valor.triangulos, 24);
  assert.equal(m.valor.qa, "aprobado");
  assert.equal(m.valor.colision.forma, "caja");
  assert.deepEqual(m.valor.caja.tamano, [0.612, 0.42, 0.612]);
  assert.deepEqual(m.valor.parametros, { lado: 0.6, color: "#6b5a3a" });
  assert.match(m.valor.sha256 ?? "", /^[0-9a-f]{64}$/);
  assert.deepEqual(enlaces.validarModelo3D(m.valor), []);
});

test("kiln: fallos esperados (no es GLB, build fallido) y colisión cápsula para cosas altas", () => {
  assert.equal(enlaces.kiln.leerGlb(new Uint8Array(32)).ok, false);
  const r = enlaces.kiln.modeloDesdeKiln({ ok: false, error: "sintaxis" }, null, { glb: "x.glb" });
  assert.ok(!r.ok && r.error.includes("sintaxis"));
  assert.equal(enlaces.colisionSugerida([0.5, 1.8, 0.5], [0, 0.9, 0]).forma, "capsula");
});

test("kiln: programa de bloques con parámetro de escala y nombres seguros", () => {
  const p = enlaces.kiln.programaBloques("Caja de munición", [
    { nombre: "cuerpo", tamano: [0.4, 0.2, 0.2], posicion: [0, 0.1, 0], color: "#55603a" },
    { nombre: "tapa", tamano: [0.42, 0.03, 0.22], posicion: [0, 0.21, 0], color: "#2c2f33", metal: 0.6 },
  ]);
  assert.match(p, /const meta = \{ name: 'Caja_de_munici_n' \}/);
  assert.match(p, /defineParams/);
  assert.equal(p.match(/createPart/g)?.length, 2);
  assert.match(p, /gameMaterial\('#2c2f33', \{ metalness: 0.6 \}\)/);
});

test("r2g: paleta por roles → ContratoEstilo con OKLab; grilla y reducción", () => {
  const e = enlaces.r2g.estiloDesdePaleta(json("r2g/paleta.json"), { nombre: "bichos", pixel: { resolucion: [320, 180], escala: 4 } });
  assert.ok(e.ok);
  assert.deepEqual(e.valor.paleta.map((c) => c.rol), ["cuerpo", "cuerpo_rojo", "contorno"]);
  assert.equal(e.valor.referencias.length, 1);
  assert.ok(e.valor.paleta[2]!.oklab[0] < 0.3, "el contorno es oscuro");
  assert.deepEqual(enlaces.validarEstilo(e.valor), []);
  assert.equal(enlaces.r2g.puntosEnGrilla(3).length, 9);
  const duplicado = { ...e.valor, paleta: [...e.valor.paleta, { ...e.valor.paleta[0]!, rol: "casi_igual" }] };
  assert.equal(enlaces.r2g.reducirPaleta(duplicado).paleta.length, 3);
  assert.equal(enlaces.r2g.estiloDesdePaleta([{ role: "x", hex: "rojo" }], { nombre: "m" }).ok, false);
});

test("cli-anything: respuestas reales de Godot, errores y argv seguros", () => {
  const leer = (f: string) => enlaces.cliAnything.leerRespuesta(readFileSync(new URL(f, FIX), "utf8"));
  const info = leer("godot/info.json"), escenas = leer("godot/escenas.json"), ok = leer("godot/validar.json"), mal = leer("godot/validar_error.json");
  assert.ok(info.ok && escenas.ok && ok.ok);
  assert.ok(!mal.ok && mal.error.includes("not found"));
  assert.equal(enlaces.cliAnything.leerRespuesta("Traceback...").ok, false);
  const inf = enlaces.cliAnything.informeGodot(info.valor, escenas.valor, [{ script: "prueba.gd", respuesta: ok }, { script: "no_existe.gd", respuesta: mal }]);
  assert.equal(inf.escenaPrincipal, "res://horda.tscn");
  assert.deepEqual(inf.escenas, ["horda.tscn"]);
  assert.deepEqual(inf.scriptsInvalidos.map((s) => s.script), ["no_existe.gd"]);
  assert.equal(enlaces.cliAnything.godot.validar("p", "../fuera.gd").ok, false);
  assert.equal(enlaces.cliAnything.godot.validar("p", "x.gd; rm -rf").ok, false);
  assert.deepEqual(enlaces.cliAnything.godot.exportar("p", "Windows", "a.exe"), ["--json", "-p", "p", "export", "build", "--preset", "Windows", "--output", "a.exe"]);
});

test("manifiesto: registrar, verificar hashes, detectar cambios y rutas que escapan", () => {
  const dir = temporal();
  try {
    cpSync(new URL("pxl/salida", FIX), join(dir, "arte"), { recursive: true });
    const hojas = hojasDeSalidaPxl(join(dir, "arte"), "arte.px.js");
    assert.ok(hojas.ok);
    assert.equal(hojas.valor.length, 2);
    registrarRecursos(dir, [
      { ruta: "arte/bichos.hoja.json", tipo: "sprites", origen: { herramienta: "pxl" }, licencia: "propia" },
      { ruta: "arte/bichos.png", tipo: "imagen", origen: { herramienta: "pxl" }, licencia: "propia" },
    ]);
    assert.deepEqual(verificarManifiesto(dir), []);
    writeFileSync(join(dir, "arte", "bichos.png"), "otro");
    assert.match(verificarManifiesto(dir)[0]!, /cambió/);
    rmSync(join(dir, "arte", "bichos.png"));
    assert.match(verificarManifiesto(dir)[0]!, /no existe/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(enlaces.rutaSegura("../x.png"), false);
  assert.equal(enlaces.rutaSegura("C:/x.png"), false);
  assert.equal(enlaces.rutaSegura("arte/x.png"), true);
  assert.ok(enlaces.validarManifiesto({ version: "txnucleo.recursos.v1", recursos: [{ ruta: "/etc/x", tipo: "imagen", sha256: "0", licencia: "", origen: {} }] }).length >= 3);
});

test("vectores/contratos.json: los validadores TS dan el veredicto guardado (Python comparte los mismos casos)", async () => {
  const { generarCasos, VALIDADORES } = await import("../vectores/contratos.ts");
  const guardado = JSON.parse(readFileSync(new URL("../vectores/contratos.json", import.meta.url), "utf8")).casos as { nombre: string; tipo: keyof typeof VALIDADORES; dato: unknown; valido: boolean }[];
  assert.deepEqual(guardado.map((c) => c.nombre), generarCasos().map((c) => c.nombre));
  for (const c of guardado) assert.equal(VALIDADORES[c.tipo](c.dato).length === 0, c.valido, c.nombre);
});

test("plan de arte: 2D/3D/interfaz según perspectiva o reglas, tareas por módulo y bloques de arma a escala", async () => {
  const { combinar, modelo } = await import("../src/modelos/index.ts");
  const shooter = combinar(["shooter-extraccion", "mod-zombis"].map(modelo));
  assert.equal(enlaces.dimensionDe(shooter), "3d");
  assert.equal(enlaces.dimensionDe(shooter, "lateral"), "2d");
  assert.equal(enlaces.dimensionDe(shooter, "sin-mapa"), "interfaz");
  const t3 = enlaces.tareasDeArte(shooter, "3d");
  assert.ok(t3.every((t) => t.herramienta === "kiln"));
  assert.ok(["jugador", "armas", "enemigos", "botin", "escenario"].every((id) => t3.some((t) => t.id === id)));
  const t2 = enlaces.tareasDeArte(shooter, "2d");
  assert.ok(t2.every((t) => t.herramienta === "pxl" && t.archivo.endsWith(".px.js")));
  assert.deepEqual(enlaces.tareasDeArte(shooter, "interfaz").map((t) => t.id), ["iconos"]);
  const b = enlaces.bloquesDeArma("pistola");
  assert.equal(b.length, 3);
  assert.ok(Math.abs(b[0]!.tamano[0] / 0.55 - 0.2) < 1e-9, "el cuerpo sale del largo real de la categoría");
  assert.deepEqual(enlaces.bloquesDeArma("desconocida")[0]!.tamano, enlaces.bloquesDeArma("fusil")[0]!.tamano);
  const md = enlaces.seccionPlanArte("3d", t3).join("\n");
  assert.match(md, /`construir`: construye solo lo que cambió/);
  assert.match(md, /npm run red -- estilo/);
});

test("mcp: initialize, lista de herramientas, búsqueda real en el índice, combinación, balance y errores", async () => {
  const { atender } = await import("../mcp/servidor.ts");
  const pedir = async (m: object) => (await atender(m as never))!;
  const ini = await pedir({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.equal(ini.result.serverInfo.name, "txnucleo");
  assert.equal(ini.result.serverInfo.version, "0.6.0");
  assert.equal(await atender({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const nombres = (await pedir({ jsonrpc: "2.0", id: 2, method: "tools/list" })).result.tools.map((x: { name: string }) => x.name);
  assert.deepEqual(nombres, [
    "buscar_mecanica", "crear_modelo", "red_doctor", "contrato_estilo", "generar_sprites", "generar_modelo", "verificar_juego",
    "iniciar_juego", "estado_juego", "construir_juego", "nuevo_prototipo", "probar_prototipo", "balance_prototipo", "revisar_estilo",
  ]);
  const llamar = async (name: string, args: object) => (await pedir({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } })).result;
  const texto = async (name: string, args: object) => JSON.parse((await llamar(name, args)).content[0].text);
  const b = await texto("buscar_mecanica", { consulta: "retroceso dispersion", limite: 3 });
  assert.equal(b.mecanicas[0].espacio, "disparos");
  const c = await texto("crear_modelo", { modelos: ["shooter-extraccion"] });
  assert.equal(c.arte.dimension, "3d");
  assert.ok(c.plan.length > 3);
  const r = await texto("crear_modelo", { respuestas: { nucleo: ["cuerpo-a-cuerpo"], perspectiva: "lateral" } });
  assert.equal(r.arte.dimension, "2d");
  assert.ok(r.sugeridos.length > 0);
  assert.match((await llamar("verificar_juego", { juego: "no-existe-esta-carpeta" })).content[0].text, /falta txnucleo.recursos.json/);
  const est = await llamar("estado_juego", { juego: "no-existe-esta-carpeta" });
  assert.ok(est.isError && /iniciar/.test(est.content[0].text), "sin proyecto: el error dice cómo iniciarlo");
  assert.ok((await llamar("balance_prototipo", { juego: "no-existe-esta-carpeta" })).isError);
  assert.equal((await pedir({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "nada" } })).error.code, -32602);
  assert.equal((await pedir({ jsonrpc: "2.0", id: 9, method: "otro" })).error.code, -32601);
});
