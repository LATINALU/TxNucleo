// Genera vectores/contratos.json: casos válidos e inválidos de los contratos de la red (HojaSprites, Modelo3D,
// ContratoEstilo, ManifiestoRecursos) construidos desde las salidas reales de test/fixtures/red. TypeScript y
// Python deben dar el mismo veredicto (test/enlaces.test.ts y python/pruebas). Uso: node vectores/contratos.ts

import { readFileSync, writeFileSync } from "node:fs";
import { enlaces } from "../src/index.ts";

const FIX = new URL("../test/fixtures/red/", import.meta.url);
const fx = (r: string): unknown => JSON.parse(readFileSync(new URL(r, FIX), "utf8"));
const valor = <T>(r: { ok: true; valor: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.valor;
};

/** Un caso compartido. */
export interface CasoContrato {
  readonly nombre: string;
  readonly tipo: "hoja" | "modelo3d" | "estilo" | "recursos";
  readonly dato: unknown;
  readonly valido: boolean;
}

/** Validador de TS para cada tipo. */
export const VALIDADORES = {
  hoja: enlaces.validarHoja,
  modelo3d: enlaces.validarModelo3D,
  estilo: enlaces.validarEstilo,
  recursos: enlaces.validarManifiesto,
} as const;

/** Construye los casos desde las fixtures. */
export function generarCasos(): CasoContrato[] {
  const hoja = valor(enlaces.pxl.hojaDesdePxl(fx("pxl/salida/anims/respira.json"), { fuente: "arte.px.js" }));
  const glb = new Uint8Array(readFileSync(new URL("kiln/caja.glb", FIX)));
  const modelo = valor(enlaces.kiln.modeloDesdeKiln(fx("kiln/recibo.json"), glb, { glb: "caja.glb", fuente: "caja.kiln.js" }));
  const estilo = valor(enlaces.r2g.estiloDesdePaleta(fx("r2g/paleta.json"), { nombre: "bichos", pixel: { resolucion: [320, 180], escala: 4 } }));
  const manifiesto = { version: "txnucleo.recursos.v1", recursos: [{ ruta: "arte/bichos.png", tipo: "imagen", sha256: "a".repeat(64), origen: { herramienta: "pxl" }, licencia: "propia" }] };
  const casos: CasoContrato[] = [];
  const caso = (nombre: string, tipo: CasoContrato["tipo"], dato: unknown, valido: boolean): void => {
    casos.push({ nombre, tipo, dato, valido });
  };
  const mut = <T>(o: T, fn: (x: any) => void): T => {
    const c = structuredClone(o);
    fn(c);
    return c;
  };
  caso("hoja válida (animación pxl)", "hoja", hoja, true);
  caso("hoja: cuadro fuera de la imagen", "hoja", mut(hoja, (h) => { h.cuadros[1].x = 500; }), false);
  caso("hoja: ms no coincide con el tramo", "hoja", mut(hoja, (h) => { h.animaciones[0].ms = [100]; }), false);
  caso("hoja: imagen con ruta que escapa", "hoja", mut(hoja, (h) => { h.imagen = "../x.png"; }), false);
  caso("hoja: nombre de cuadro repetido", "hoja", mut(hoja, (h) => { h.cuadros[1].nombre = h.cuadros[0].nombre; }), false);
  caso("modelo válido (kiln)", "modelo3d", modelo, true);
  caso("modelo: min mayor que max", "modelo3d", mut(modelo, (m) => { m.caja.min = [1, 1, 1]; }), false);
  caso("modelo: no es .glb", "modelo3d", mut(modelo, (m) => { m.glb = "caja.fbx"; }), false);
  caso("modelo: qa desconocido", "modelo3d", mut(modelo, (m) => { m.qa = "quizas"; }), false);
  caso("modelo: colisión cápsula", "modelo3d", mut(modelo, (m) => { m.colision = { forma: "capsula", radio: 0.3, alto: 1.8, centro: [0, 0.9, 0] }; }), true);
  caso("estilo válido (r2g)", "estilo", estilo, true);
  caso("estilo: hex inválido", "estilo", mut(estilo, (s) => { s.paleta[0].hex = "#zzz"; }), false);
  caso("estilo: rol repetido", "estilo", mut(estilo, (s) => { s.paleta[1].rol = s.paleta[0].rol; }), false);
  caso("estilo: escala no entera", "estilo", mut(estilo, (s) => { s.pixel.escala = 2.5; }), false);
  caso("estilo: sin pixel (arte no pixelado)", "estilo", mut(estilo, (s) => { delete s.pixel; }), true);
  caso("manifiesto válido", "recursos", manifiesto, true);
  caso("manifiesto: ruta absoluta", "recursos", mut(manifiesto, (m) => { m.recursos[0].ruta = "C:/x.png"; }), false);
  caso("manifiesto: sha corto", "recursos", mut(manifiesto, (m) => { m.recursos[0].sha256 = "abc"; }), false);
  caso("manifiesto: ruta repetida", "recursos", mut(manifiesto, (m) => { m.recursos.push(structuredClone(m.recursos[0])); }), false);
  caso("manifiesto: sin licencia", "recursos", mut(manifiesto, (m) => { m.recursos[0].licencia = ""; }), false);
  caso("manifiesto: tipo desconocido", "recursos", mut(manifiesto, (m) => { m.recursos[0].tipo = "video"; }), false);
  caso("manifiesto: con fuente y hash de la fuente", "recursos", mut(manifiesto, (m) => { m.recursos[0].origen = { herramienta: "pxl", fuente: "arte/a.px.js", fuenteSha256: "b".repeat(64) }; }), true);
  caso("manifiesto: hash de la fuente inválido", "recursos", mut(manifiesto, (m) => { m.recursos[0].origen = { herramienta: "pxl", fuenteSha256: "xyz" }; }), false);
  return casos;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop()!)) {
  const casos = generarCasos();
  for (const c of casos) {
    const obtenido = VALIDADORES[c.tipo](c.dato).length === 0;
    if (obtenido !== c.valido) throw new Error(`el validador TS no coincide en "${c.nombre}"`);
  }
  const salida = { version: 1, nota: "Casos compartidos de validación de contratos de la red; TS y Python deben coincidir. Regenerar: node vectores/contratos.ts", casos };
  writeFileSync(new URL("./contratos.json", import.meta.url), JSON.stringify(salida, null, 1) + "\n");
  console.log(`vectores/contratos.json: ${casos.length} casos`);
}
