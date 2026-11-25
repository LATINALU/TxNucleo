// `npm run red -- <comando>`: la red TxNucleo desde la terminal. Lista, revisa e instala las herramientas externas
// (pxl, kiln, reference-to-game, CLI-Anything, OhMyGame), genera recursos con ellas, escribe los contratos y
// verifica el juego. Guía completa: docs/RED.md.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { REGISTRO, herramienta } from "../src/enlaces/registro.ts";
import { plantillaPx } from "../src/enlaces/adaptadores/pxl.ts";
import { validarEstilo, type ContratoEstilo, type TipoRecurso } from "../src/enlaces/contratos.ts";
import {
  carpetaRed, construirJuego, doctor, estadoJuego, estiloDesdeImagen, generarModelo, generarSprites, iniciarJuego, instalar,
  registrarRecursos, reimportarGodot, revisarEstilo, verificarGodot, verificarManifiesto,
} from "../src/infraestructura/enlaces-node.ts";
import type { MotorJuego, RevisionEstilo } from "../src/enlaces/proyecto.ts";

const AYUDA = `Red TxNucleo — herramientas externas para hacer juegos más rápido. Guía: docs/USO.md · docs/RED.md

Desde la carpeta del juego:  npm --prefix <TxNucleo> run red -- <comando>

  HERRAMIENTAS
  lista                                  qué herramientas conoce la red (repo, licencia, contrato)
  doctor                                 qué está instalado y qué requisitos faltan
  instalar <id...|todo>                  instala en ${carpetaRed()}

  TU JUEGO (flujo diario)
  iniciar [carpeta] [--motor godot|web|unity|unreal|otro] [--nombre N] [--estilo estilo.json]
                                         crea txnucleo.red.json, arte/, modelos/ y .gitignore (.kiln/)
  estado [carpeta]                       fuentes nuevas, cambiadas o al día; recursos rotos; herramientas faltantes
  construir [carpeta] [--todo]           construye SOLO lo que cambió, registra, revisa estilo y verifica Godot
  revisar-estilo [carpeta]               colores de los sprites que no están en la paleta del estilo
  verificar [carpeta]                    manifiesto (hashes) + escenas y scripts de Godot

  PASOS SUELTOS
  estilo <imagen> --nombre N [--grilla 4 | --puntos p.json] [--pixel 320x180x4] [--out estilo.json]
  plantilla-px <estilo.json> --sprites a,b [--out arte.px.js]
  sprites <arte.px.js> [--out carpeta] [--sin-bucle a,b] [--juego carpeta]
  modelo <obj.kiln.js> [--out obj.glb] [--etiquetas cobertura,botin] [--juego carpeta]
  godot <proyecto> [--reimportar]        escenas y sintaxis de scripts con CLI-Anything

Variables: TXNUCLEO_RED (carpeta de herramientas), GODOT_BIN, BLENDER_BIN, TXNUCLEO_PYTHON.`;

/** Una línea por imagen con colores fuera de la paleta. */
function imprimirEstilo(lista: readonly { imagen: string; revision: RevisionEstilo }[]): void {
  for (const { imagen, revision: r } of lista) {
    if (r.pixelesAjenos === 0) console.log(`  ✓ ${imagen}: todos los colores son de la paleta`);
    else console.log(`  ! ${imagen}: ${(r.fraccionAjena * 100).toFixed(1)} % fuera de la paleta (${r.colores.slice(0, 4).map((c) => `${c.hex}≈${c.rolCercano}`).join(", ")})`);
  }
}

// `npm --prefix <TxNucleo> run red` corre en la carpeta de TxNucleo: las rutas del usuario son relativas a donde lo llamó.
if (process.env.INIT_CWD) process.chdir(process.env.INIT_CWD);

const args = process.argv.slice(2);
const cmd = args[0];
/** Valor de una opción --nombre valor. */
const opcion = (n: string): string | undefined => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const lista = (n: string): string[] | undefined => opcion(n)?.split(",").map((s) => s.trim()).filter(Boolean);
const posicional = (i: number): string | undefined => args.filter((a, k) => k > 0 && !a.startsWith("--") && !args[k - 1]?.startsWith("--"))[i];

function salir(error: string): never {
  console.error(`✗ ${error}`);
  process.exit(1);
}

/** Registra archivos generados en el manifiesto del juego, si se pidió --juego. */
function registrar(rutas: { ruta: string; tipo: TipoRecurso; herramienta: string; fuente?: string }[]): void {
  const juego = opcion("juego");
  if (!juego) return;
  const raiz = resolve(juego);
  const nuevos = rutas.map((r) => {
    const rel = relative(raiz, resolve(r.ruta)).replace(/\\/g, "/");
    if (rel.startsWith("..")) salir(`${r.ruta} está fuera del juego ${juego}`);
    return { ruta: rel, tipo: r.tipo, origen: { herramienta: r.herramienta, ...(r.fuente ? { fuente: r.fuente } : {}) }, licencia: opcion("licencia") ?? "propia" };
  });
  const m = registrarRecursos(raiz, nuevos);
  console.log(`  manifiesto: ${m.recursos.length} recursos en ${join(juego, "txnucleo.recursos.json")}`);
}

switch (cmd) {
  case "iniciar": {
    const r = iniciarJuego(posicional(0) ?? ".", {
      ...(opcion("nombre") ? { nombre: opcion("nombre")! } : {}),
      ...(opcion("motor") ? { motor: opcion("motor") as MotorJuego } : {}),
      ...(opcion("estilo") ? { estilo: opcion("estilo")! } : {}),
    });
    if (!r.ok) salir(r.error);
    for (const h of r.valor.hechos) console.log(`✓ ${h}`);
    console.log(`\nSiguiente: poner fuentes en ${r.valor.proyecto.arte2d}/*.px.js o ${r.valor.proyecto.arte3d}/*.kiln.js y correr \`construir\`.`);
    break;
  }

  case "estado": {
    const r = estadoJuego(posicional(0) ?? ".");
    if (!r.ok) salir(r.error);
    const e = r.valor;
    console.log(`Juego "${e.proyecto.nombre}" · motor ${e.proyecto.motor} · estilo ${e.proyecto.estilo ?? "ninguno"} · licencia ${e.proyecto.licencia}`);
    if (!e.fuentes.length) console.log(`  (sin fuentes: crear ${e.proyecto.arte2d}/*.px.js o ${e.proyecto.arte3d}/*.kiln.js)`);
    const icono = { "al-dia": "✓", nueva: "+", cambio: "~" } as const;
    for (const f of e.fuentes) console.log(`  ${icono[f.estado]} ${f.ruta}  ${f.estado}`);
    for (const m of e.manifiesto) console.log(`  ✗ ${m}`);
    if (e.faltan.length) console.log(`  falta instalar: ${e.faltan.join(", ")} (npm run red -- instalar ${e.faltan.join(" ")})`);
    const pendientes = e.fuentes.filter((f) => f.estado !== "al-dia").length;
    console.log(pendientes ? `\n${pendientes} para construir: npm run red -- construir` : "\nTodo al día.");
    break;
  }

  case "construir": {
    const r = construirJuego(posicional(0) ?? ".", { todo: args.includes("--todo"), log: (s) => console.log(s) });
    if (!r.ok) salir(r.error);
    const i = r.valor;
    console.log(`\nConstruidas: ${i.construidas.length} · al día: ${i.alDia.length}`);
    for (const e of i.errores) console.log(`  ✗ ${e}`);
    if (i.estilo.length) { console.log("Estilo:"); imprimirEstilo(i.estilo); }
    if (i.godot) console.log(`Godot: ${i.godot.escenas.length} escenas, ${i.godot.scriptsInvalidos.length ? i.godot.scriptsInvalidos.map((s) => `✗ ${s.script}: ${s.error}`).join("; ") : "scripts válidos"}`);
    for (const m of i.manifiesto) console.log(`  ✗ manifiesto: ${m}`);
    if (i.errores.length || i.manifiesto.length || (i.godot?.scriptsInvalidos.length ?? 0)) process.exit(1);
    console.log("✓ listo");
    break;
  }

  case "revisar-estilo": {
    const r = revisarEstilo(posicional(0) ?? ".");
    if (!r.ok) salir(r.error);
    if (!r.valor.length) console.log("Sin estilo en txnucleo.red.json o sin sprites registrados.");
    imprimirEstilo(r.valor);
    break;
  }

  case "lista":
    for (const h of REGISTRO) console.log(`${h.id.padEnd(22)} ${h.rol.padEnd(10)} ${h.licencia.padEnd(12)} ${h.descripcion}\n${"".padEnd(22)} ${h.repo}  → ${h.contrato}`);
    break;

  case "doctor": {
    const d = doctor();
    console.log("Requisitos:");
    for (const [r, v] of Object.entries(d.requisitos)) console.log(`  ${v ? "✓" : "✗"} ${r.padEnd(8)} ${v ?? "no encontrado"}`);
    console.log(`\nHerramientas (${carpetaRed()}):`);
    for (const h of d.herramientas) {
      const reg = herramienta(h.id)!;
      const estado = reg.instalacion.tipo === "manual" ? "manual" : h.instalada ? "instalada" : "no instalada";
      console.log(`  ${h.instalada ? "✓" : "·"} ${h.id.padEnd(22)} ${estado}${h.faltan.length ? `  (falta: ${h.faltan.join(", ")})` : ""}`);
      if (reg.pluginAgente) console.log(`      plugin para agentes: ${reg.pluginAgente}`);
    }
    break;
  }

  case "instalar": {
    const ids = args.slice(1).includes("todo") ? REGISTRO.filter((h) => h.instalacion.tipo !== "manual").map((h) => h.id) : args.slice(1);
    if (!ids.length) salir("indicá qué instalar: npm run red -- instalar pxl kiln (o todo)");
    let malas = 0;
    for (const id of ids) {
      console.log(`→ ${id}`);
      const r = instalar(id, (s) => console.log(`  ${s}`));
      if (r.ok) console.log(`  ✓ ${r.valor}`);
      else { console.error(`  ✗ ${r.error}`); malas++; }
    }
    if (malas) process.exit(1);
    break;
  }

  case "estilo": {
    const img = posicional(0) ?? salir("falta la imagen");
    const pixel = opcion("pixel")?.split("x").map(Number);
    const puntos = opcion("puntos");
    const r = estiloDesdeImagen(img, opcion("out") ?? "estilo.json", {
      nombre: opcion("nombre") ?? basename(img).replace(/\.[^.]+$/, ""),
      ...(pixel && pixel.length === 3 ? { pixel: { resolucion: [pixel[0], pixel[1]] as [number, number], escala: pixel[2] } } : {}),
      ...(puntos ? { puntos: JSON.parse(readFileSync(puntos, "utf8")) } : { grilla: Number(opcion("grilla") ?? 4) }),
    });
    if (!r.ok) salir(r.error);
    console.log(`✓ ${opcion("out") ?? "estilo.json"}: ${r.valor.paleta.map((c) => `${c.rol}=${c.hex}`).join(" ")}`);
    break;
  }

  case "plantilla-px": {
    const f = posicional(0) ?? salir("falta estilo.json");
    const estilo = JSON.parse(readFileSync(f, "utf8")) as ContratoEstilo;
    const errores = validarEstilo(estilo);
    if (errores.length) salir(errores.join("; "));
    const out = opcion("out") ?? "arte.px.js";
    if (existsSync(out)) salir(`${out} ya existe (no se sobrescribe)`);
    writeFileSync(out, plantillaPx(estilo, lista("sprites") ?? ["sprite"], 8, basename(out).replace(/\.px\.(js|ts)$/, "")));
    console.log(`✓ ${out}`);
    break;
  }

  case "sprites": {
    const f = posicional(0) ?? salir("falta el .px.js");
    const out = opcion("out") ?? join(dirname(f), "out");
    const r = generarSprites(f, out, { ...(lista("sin-bucle") ? { sinBucle: lista("sin-bucle")! } : {}) });
    if (!r.ok) salir(r.error);
    for (const h of r.valor) console.log(`✓ ${h.ruta}: ${h.hoja.cuadros.length} cuadros, ${h.hoja.animaciones.length} animaciones`);
    registrar(r.valor.flatMap((h) => [
      { ruta: h.ruta, tipo: "sprites" as const, herramienta: "pxl", fuente: basename(f) },
      { ruta: join(dirname(h.ruta), h.hoja.imagen), tipo: "imagen" as const, herramienta: "pxl", fuente: basename(f) },
    ]));
    break;
  }

  case "modelo": {
    const f = posicional(0) ?? salir("falta el .kiln.js");
    const glb = opcion("out") ?? f.replace(/(\.kiln)?\.js$/, "") + ".glb";
    const r = generarModelo(f, glb, { ...(lista("etiquetas") ? { etiquetas: lista("etiquetas")! } : {}) });
    if (!r.ok) salir(r.error);
    const m = r.valor.modelo;
    console.log(`✓ ${glb}: ${m.triangulos} triángulos, ${m.caja.tamano.map((x) => x.toFixed(2)).join("×")} m, colisión ${m.colision.forma}, QA ${m.qa}`);
    registrar([
      { ruta: glb, tipo: "modelo3d", herramienta: "kiln", fuente: basename(f) },
      { ruta: r.valor.ruta, tipo: "otro", herramienta: "kiln", fuente: basename(f) },
    ]);
    break;
  }

  case "godot": {
    const p = resolve(posicional(0) ?? salir("falta la carpeta del proyecto Godot"));
    if (args.includes("--reimportar")) {
      const r = reimportarGodot(p);
      if (!r.ok) salir(r.error);
      console.log("✓ reimportado");
    }
    const r = verificarGodot(p);
    if (!r.ok) salir(r.error);
    console.log(`Proyecto "${r.valor.nombre}" · principal ${r.valor.escenaPrincipal ?? "(ninguna)"} · ${r.valor.escenas.length} escenas`);
    for (const m of r.valor.scriptsInvalidos) console.log(`  ✗ ${m.script}: ${m.error}`);
    if (r.valor.scriptsInvalidos.length) process.exit(1);
    console.log("✓ scripts válidos");
    break;
  }

  case "verificar": {
    const juego = resolve(posicional(0) ?? ".");
    const errores = verificarManifiesto(juego);
    for (const e of errores) console.log(`  ✗ ${e}`);
    if (!errores.length) console.log("✓ manifiesto: todos los recursos existen y coinciden");
    let fallos = errores.length;
    if (existsSync(join(juego, "project.godot"))) {
      const r = verificarGodot(juego);
      if (!r.ok) { console.log(`  ✗ godot: ${r.error}`); fallos++; }
      else {
        for (const m of r.valor.scriptsInvalidos) console.log(`  ✗ ${m.script}: ${m.error}`);
        fallos += r.valor.scriptsInvalidos.length;
        if (!r.valor.scriptsInvalidos.length) console.log(`✓ godot: ${r.valor.escenas.length} escenas, scripts válidos`);
      }
    }
    if (fallos) process.exit(1);
    break;
  }

  default:
    console.log(AYUDA);
    if (cmd && cmd !== "ayuda") process.exit(1);
}
