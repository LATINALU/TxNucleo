// Red TxNucleo: contratos neutros a motores, registro de herramientas externas y adaptadores puros que traducen
// sus salidas (pxl, kiln, reference-to-game, CLI-Anything). Ejecutar las herramientas (Node) vive en
// src/infraestructura/enlaces.ts, exportado aparte como "txnucleo/enlaces-node". Guía: docs/RED.md.

export * from "./contratos.ts";
export * from "./registro.ts";
export * as pxl from "./adaptadores/pxl.ts";
export * as kiln from "./adaptadores/kiln.ts";
export * as r2g from "./adaptadores/r2g.ts";
export * as cliAnything from "./adaptadores/cli-anything.ts";
export * from "./plan-arte.ts";
export * from "./proyecto.ts";
export * from "./horneado.ts";
export * from "./arte-plantilla.ts";
