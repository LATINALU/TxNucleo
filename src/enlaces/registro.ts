// Registro de la red TxNucleo: las herramientas externas que el núcleo sabe instalar, ejecutar y traducir a sus
// contratos. No se copia su código: cada una se instala desde su repositorio oficial, fijada a un commit o versión,
// y conserva su propia licencia. Ver docs/RED.md.

/** Para qué sirve cada nodo de la red. */
export type RolHerramienta = "arte2d" | "arte3d" | "motor" | "referencia" | "estudio";

/** Cómo se instala: clon git, paquete npm, paquete pip en un venv propio, o a mano (app de escritorio). */
export type Instalacion =
  | { readonly tipo: "git"; readonly url: string; readonly commit: string; readonly pip?: string }
  | { readonly tipo: "npm"; readonly paquete: string; readonly version: string }
  | { readonly tipo: "pip-git"; readonly url: string; readonly commit: string; readonly subdirectorio: string }
  | { readonly tipo: "manual"; readonly descarga: string };

/** Una herramienta de la red. */
export interface Herramienta {
  readonly id: string;
  readonly nombre: string;
  readonly repo: string;
  readonly licencia: string;
  readonly rol: RolHerramienta;
  readonly descripcion: string;
  readonly instalacion: Instalacion;
  /** Programas que deben existir en el sistema: node, python, git, godot, blender, ffmpeg. */
  readonly requisitos: readonly string[];
  /** Contrato TxNucleo que produce o consume. */
  readonly contrato: string;
  /** Plugin o skill para agentes, que solo se INDICA (el usuario lo instala en su agente). */
  readonly pluginAgente?: string;
}

/** Herramientas conocidas, en el orden en que suelen usarse dentro de un proyecto. */
export const REGISTRO: readonly Herramienta[] = [
  {
    id: "r2g",
    nombre: "reference-to-game",
    repo: "https://github.com/gokayfem/reference-to-game",
    licencia: "MIT",
    rol: "referencia",
    descripcion: "Imágenes, video o audio de referencia → paleta por roles, comparación lado a lado y caso de estilo.",
    instalacion: { tipo: "git", url: "https://github.com/gokayfem/reference-to-game", commit: "6a00e491f578bbfcbdba45f0c7bddf4693016e61", pip: "skills/reference-to-game/scripts/requirements.txt" },
    requisitos: ["git", "python"],
    contrato: "ContratoEstilo",
    pluginAgente: "claude plugin marketplace add gokayfem/reference-to-game && claude plugin install reference-to-game@reference-to-game",
  },
  {
    id: "pxl",
    nombre: "claude-pxl",
    repo: "https://github.com/crsolver/claude-pxl",
    licencia: "MIT",
    rol: "arte2d",
    descripcion: "Pixel art como código (.px.js) → PNG, hojas de sprites con JSON y animaciones.",
    instalacion: { tipo: "git", url: "https://github.com/crsolver/claude-pxl", commit: "21fee41f7ecce00bc868d7567f24ffd0f3acc8fa" },
    requisitos: ["git", "node"],
    contrato: "HojaSprites",
    pluginAgente: "git clone https://github.com/crsolver/claude-pxl ~/.claude/skills/pxl-pixel-art",
  },
  {
    id: "kiln",
    nombre: "Kiln",
    repo: "https://github.com/instruktlabs/kiln",
    licencia: "MIT",
    rol: "arte3d",
    descripcion: "Modelos 3D procedurales (.kiln.js) → GLB con medidas, QA estructural y variantes por parámetros.",
    instalacion: { tipo: "npm", paquete: "@instruktlabs/kiln", version: "1.9.0" },
    requisitos: ["node"],
    contrato: "Modelo3D",
    pluginAgente: "npx --no -- kiln-init <carpeta> --harness claude   (dentro de una instalación de @instruktlabs/kiln)",
  },
  {
    id: "cli-anything-godot",
    nombre: "CLI-Anything · Godot",
    repo: "https://github.com/HKUDS/CLI-Anything",
    licencia: "Apache-2.0",
    rol: "motor",
    descripcion: "Godot 4 sin interfaz para agentes: info del proyecto, escenas, validar scripts, reimportar y exportar.",
    instalacion: { tipo: "pip-git", url: "https://github.com/HKUDS/CLI-Anything", commit: "34f519533bc175d2fe287ab8316b0dd99bb9cc43", subdirectorio: "godot/agent-harness" },
    requisitos: ["git", "python", "godot"],
    contrato: "ManifiestoRecursos (verificación del proyecto)",
    pluginAgente: "/plugin marketplace add HKUDS/CLI-Anything  y  /plugin install cli-anything",
  },
  {
    id: "cli-anything-blender",
    nombre: "CLI-Anything · Blender",
    repo: "https://github.com/HKUDS/CLI-Anything",
    licencia: "Apache-2.0",
    rol: "motor",
    descripcion: "Blender sin interfaz para agentes: revisar, convertir y retocar modelos (GLB/FBX/OBJ).",
    instalacion: { tipo: "pip-git", url: "https://github.com/HKUDS/CLI-Anything", commit: "34f519533bc175d2fe287ab8316b0dd99bb9cc43", subdirectorio: "blender/agent-harness" },
    requisitos: ["git", "python", "blender"],
    contrato: "Modelo3D",
  },
  {
    id: "ohmygame",
    nombre: "OhMyGame",
    repo: "https://github.com/WhiteTowerAI/ohmygame",
    licencia: "Apache-2.0 (sin nombre ni logo)",
    rol: "estudio",
    descripcion: "Estudio de escritorio con lienzo, generación de medios y playtest; habla MCP con agentes externos.",
    instalacion: { tipo: "manual", descarga: "https://ohmygame.ai/download/windows" },
    requisitos: [],
    contrato: "MCP (txnucleo-mcp ↔ OhMyGame)",
  },
];

/** Busca una herramienta por id. */
export function herramienta(id: string): Herramienta | undefined {
  return REGISTRO.find((h) => h.id === id);
}
