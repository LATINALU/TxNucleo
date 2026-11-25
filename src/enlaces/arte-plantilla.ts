// Arte de partida generado DESDE LOS DATOS: sprites base propios (jugador, criatura, jefe, gema, cofre, proyectil)
// en la DSL de claude-pxl, y variantes que salen de las reglas horneadas: un color por cada tipo de enemigo del
// juego y un cofre por cada rareza del botín (con los colores de la tabla de rareza). Cambian los datos → cambia el
// arte, sin dibujar de nuevo. La paleta sale del contrato de estilo o, si no hay, de una paleta propia por familia.

import { aOklab, desdeOklab, hexARgb, rgbAHex } from "../grafico/color.ts";
import type { ContratoEstilo } from "./contratos.ts";
import type { ReglasHorneadas } from "./horneado.ts";

/** Seis colores con función: contorno, sombra, cuerpo, luz, acento, ojo/brillo. */
export interface PaletaPlantilla {
  readonly contorno: string;
  readonly sombra: string;
  readonly cuerpo: string;
  readonly luz: string;
  readonly acento: string;
  readonly brillo: string;
}

/** Paletas propias por familia de enemigos (cuando el juego aún no tiene contrato de estilo). */
export const PALETAS_FAMILIA: Readonly<Record<string, PaletaPlantilla>> = {
  zombi: { contorno: "#16181d", sombra: "#3d4a3a", cuerpo: "#6f8a5c", luz: "#b4c98f", acento: "#a33b3b", brillo: "#eef0d8" },
  soldado: { contorno: "#15181c", sombra: "#3b4436", cuerpo: "#66734f", luz: "#a9b38a", acento: "#c08a3e", brillo: "#f1ecd9" },
  fantasia: { contorno: "#1a1626", sombra: "#43356b", cuerpo: "#6b5bb5", luz: "#b3a6ee", acento: "#e0a13a", brillo: "#fbf3e0" },
  maquina: { contorno: "#11161c", sombra: "#2f4555", cuerpo: "#4f7d96", luz: "#9fd0e0", acento: "#ff7a3d", brillo: "#f2fbff" },
  bestia: { contorno: "#1c140f", sombra: "#5a3a26", cuerpo: "#8f6440", luz: "#d1a877", acento: "#c9452e", brillo: "#fff4e2" },
};

const hex = (n: number): string => `#${n.toString(16).padStart(6, "0")}`;
const rgb = (h: string): [number, number, number] => [...hexARgb(parseInt(h.slice(1), 16))] as [number, number, number];
const lab = (h: string): [number, number, number] => aOklab(rgb(h));
const deLab = (l: readonly [number, number, number]): string => hex(rgbAHex(desdeOklab(l)));
const croma = (h: string): number => Math.hypot(lab(h)[1], lab(h)[2]);

/** Mezcla perceptual de dos colores hex (t = 0 → a, 1 → b). */
export function mezclar(a: string, b: string, t: number): string {
  const x = lab(a), y = lab(b);
  return deLab([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Gira el tono de un color en OKLab (grados), conservando luminosidad y croma. */
export function girarTono(h: string, grados: number): string {
  const [L, a, b] = lab(h);
  const r = (grados * Math.PI) / 180;
  return deLab([L, a * Math.cos(r) - b * Math.sin(r), a * Math.sin(r) + b * Math.cos(r)]);
}

/**
 * Paleta de plantilla desde un contrato de estilo: el más oscuro es el contorno, el más claro el brillo, el de
 * más croma entre los medios el acento y otro medio el cuerpo; sombra y luz se derivan si faltan colores.
 */
export function paletaDesdeEstilo(estilo: ContratoEstilo): PaletaPlantilla {
  const cols = [...new Set(estilo.paleta.map((c) => c.hex.toLowerCase()))].sort((a, b) => lab(a)[0] - lab(b)[0]);
  const contorno = cols[0] ?? "#111111";
  const brillo = cols.length > 1 ? cols[cols.length - 1]! : "#f4f4f4";
  const medios = cols.slice(1, -1);
  const acento = [...medios].sort((a, b) => croma(b) - croma(a))[0] ?? girarTono(contorno, 180);
  const cuerpo = medios.find((c) => c !== acento) ?? mezclar(acento, brillo, 0.35);
  return { contorno, sombra: mezclar(cuerpo, contorno, 0.45), cuerpo, luz: mezclar(cuerpo, brillo, 0.5), acento, brillo };
}

// Sprites base PROPIOS (mitad izquierda; pxl los espeja). Letras: k contorno, s sombra, c cuerpo, l luz, a acento, o brillo.
const JUGADOR = `
  ....kk
  ...kll
  ..klcc
  ..kokc
  ..kccc
  ...kkk
  ..kaaa
  .kaaal
  .kcaaa
  ..kaaa
  ..ksk.
  ..kk..`;
const CRIATURA = `
  ....kk
  ..kkcc
  .kccll
  .kokcc
  kccccc
  kscccc
  ksscca
  .ksscc
  ..kkkk`;
const JEFE = `
  .....kkk
  ...kkccc
  ..kcccll
  .kccccll
  .kcookcc
  kccccccc
  kcaacccc
  kccaaccc
  kscccccc
  ksscccca
  .ksscccc
  .kssss.k
  ..kkkkk.`;
const GEMA = `
  ..k
  .kl
  klo
  kll
  .kl
  ..k`;
const COFRE = `
  .kkkkk
  kclccc
  kccccc
  kkkkkk
  kccckk
  kccckl
  kscccc
  kkkkkk`;
const BALA = `
  .l
  lo
  lo
  .l`;

/** Teclas de un carácter para las variantes (pxl usa un carácter por color). */
const TECLAS_ENEMIGO = ["1", "2", "3", "4", "5", "6"];
const TECLAS_SOMBRA = ["E", "F", "G", "H", "I", "J"];
const TECLAS_RAREZA = ["M", "N", "P", "Q", "T", "U", "V", "W"];

/** Nombre seguro para un sprite (pxl usa los nombres en globs). */
const nombreSprite = (s: string): string => s.toLowerCase().replace(/[^a-z0-9_]/g, "_");

/**
 * Fuente .px.js con todo el arte de partida del juego: jugador, un enemigo por tipo de `reglas.enemigos` (variante
 * de color por tono), jefe, gema de experiencia, un cofre por rareza de `reglas.botin` y proyectiles. Una hoja
 * `personajes` los agrupa; los nombres de sprite son los que usan las plantillas jugables.
 */
export function arteDePlantilla(reglas: ReglasHorneadas, p: PaletaPlantilla): string {
  const enemigos = reglas.enemigos.slice(0, TECLAS_ENEMIGO.length);
  const rarezas = reglas.botin.nombres.slice(0, TECLAS_RAREZA.length);
  const pal: Record<string, string> = { k: p.contorno, s: p.sombra, c: p.cuerpo, l: p.luz, a: p.acento, o: p.brillo };
  enemigos.forEach((_, i) => {
    const cuerpo = i === 0 ? p.cuerpo : girarTono(p.cuerpo, (360 / enemigos.length) * i);
    pal[TECLAS_ENEMIGO[i]!] = cuerpo;
    pal[TECLAS_SOMBRA[i]!] = mezclar(cuerpo, p.contorno, 0.45);
  });
  rarezas.forEach((_, i) => {
    pal[TECLAS_RAREZA[i]!] = reglas.botin.colores[i] ?? girarTono(p.acento, 50 * i);
  });
  const l: string[] = [
    `// Arte de partida generado por TxNucleo desde reglas.json (${reglas.juego}). Editalo libremente: es la FUENTE.`,
    `// k contorno · s sombra · c cuerpo · l luz · a acento · o brillo · ${enemigos.map((e, i) => `${TECLAS_ENEMIGO[i]} ${e.id}`).join(" · ")}`,
    `pal(${JSON.stringify(pal).replace(/"([^"]+)":/g, "$1: ")})`,
    "",
    `sprite("jugador", { mx: true }, \`${JUGADOR}\`)`,
    `sprite("_criatura", { mx: true }, \`${CRIATURA}\`)`,
    ...enemigos.map((e, i) => `sprite("enemigo_${nombreSprite(e.id)}", { base: "_criatura", swap: { c: "${TECLAS_ENEMIGO[i]}", s: "${TECLAS_SOMBRA[i]}" } })`),
    `sprite("jefe", { mx: true }, \`${JEFE}\`)`,
    `sprite("gema", { mx: "c" }, \`${GEMA}\`)`,
    `sprite("_cofre", { mx: true }, \`${COFRE}\`)`,
    ...rarezas.map((_, i) => `sprite("botin_${i}", { base: "_cofre", swap: { c: "${TECLAS_RAREZA[i]}" } })`),
    `sprite("bala", { mx: true }, \`${BALA}\`)`,
    `sprite("bala_enemiga", { base: "bala", swap: { l: "a", o: "a" } })`,
    "",
    `sheet("personajes", ["jugador", "enemigo_*", "jefe", "gema", "botin_*", "bala", "bala_enemiga"], { pad: 1 })`,
    "",
  ];
  return l.join("\n");
}

/** Nombre del sprite de un enemigo en la hoja (el que buscan las plantillas). */
export const spriteDeEnemigo = (id: string): string => `enemigo_${nombreSprite(id)}`;
