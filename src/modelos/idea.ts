// Intérprete de ideas: una frase libre ("un roguelite de zombis con armas, visto desde arriba") → respuestas del
// asistente (las mismas 12 preguntas de `PREGUNTAS`) + qué palabra activó cada respuesta, para mostrarlo y que la
// persona corrija. Diccionario propio en español (con algunas palabras en inglés frecuentes en el oficio).

import type { Respuestas } from "./asistente.ts";

/** Una respuesta deducida y la palabra que la activó. */
export interface Coincidencia {
  readonly pregunta: string;
  readonly valor: string;
  readonly palabra: string;
}

/** Resultado de interpretar una idea. */
export interface IdeaInterpretada {
  readonly respuestas: Respuestas;
  readonly coincidencias: readonly Coincidencia[];
  /** Preguntas que la frase no respondió (el asistente usa lo más común). */
  readonly sinRespuesta: readonly string[];
}

/** Preguntas de respuesta múltiple (las demás guardan la primera coincidencia). */
const MULTIPLES = new Set(["nucleo", "progresion", "enemigos"]);

/** [pregunta, valor, raíces de palabras]. Las raíces se buscan al inicio de cada palabra, sin acentos. */
const DICCIONARIO: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ["nucleo", "disparar", ["dispar", "shooter", "arma", "pistol", "rifle", "fusil", "bala", "tirador", "shoot", "gun"]],
  ["nucleo", "cuerpo-a-cuerpo", ["espada", "pelea", "golpe", "melee", "hack", "slash", "beat", "lucha", "punio", "hacha"]],
  ["nucleo", "habilidades", ["magia", "hechiz", "habilidad", "poder", "mago", "skill", "spell", "arpg", "moba"]],
  ["nucleo", "estrategia", ["estrateg", "rts", "tactic", "ejercito", "tropa", "torre", "defensa", "tower"]],
  ["nucleo", "gestion", ["gestion", "base", "colonia", "ciudad", "granja", "tycoon", "construir", "fabrica"]],
  ["nucleo", "conducir", ["auto", "carro", "coche", "carrera", "vehicul", "conduc", "racing", "moto", "rally"]],
  ["nucleo", "cartas", ["carta", "mazo", "deck", "naipe"]],
  ["nucleo", "plataformas", ["plataforma", "saltar", "salto", "metroidvania", "platformer"]],
  ["nucleo", "supervivencia", ["sobreviv", "superviv", "survival", "hambre", "refugio", "recolect", "extraccion"]],
  ["nucleo", "sigilo", ["sigilo", "stealth", "escabull", "esconder", "asesin"]],
  ["nucleo", "narrativa", ["historia", "narrativ", "decision", "novela", "dialogo"]],
  ["nucleo", "coleccion", ["coleccion", "gacha", "colecc", "criaturas", "monstruos para"]],
  ["nucleo", "puzle", ["puzle", "puzzle", "acertijo", "rompecabeza"]],
  ["perspectiva", "primera", ["primera persona", "fps", "first person"]],
  ["perspectiva", "tercera", ["tercera persona", "third person", "tps"]],
  ["perspectiva", "isometrica", ["isometric", "camara alta", "vista alta", "diablo"]],
  ["perspectiva", "superior", ["desde arriba", "cenital", "top down", "top-down", "vista superior", "arriba"]],
  ["perspectiva", "lateral", ["de costado", "lateral", "side scroll", "2d de lado", "plataforma", "metroidvania"]],
  ["perspectiva", "sin-mapa", ["sin mapa", "solo menu", "texto", "idle"]],
  ["ritmo", "turnos", ["turno", "turn based", "por turnos"]],
  ["ritmo", "pausa-tactica", ["pausa tactica", "pausa"]],
  ["ritmo", "inactivo", ["incremental", "idle", "clicker", "avanza solo"]],
  ["ritmo", "tiempo-real", ["tiempo real", "accion", "rapido", "frenetic"]],
  ["jugadores", "cooperativo", ["coop", "cooperativ", "con amigos", "en equipo"]],
  ["jugadores", "competitivo", ["competitiv", "pvp", "versus", "contra otros", "ranked", "battle royale"]],
  ["jugadores", "masivo", ["mmo", "masivo", "persistente"]],
  ["jugadores", "solo", ["un jugador", "single", "solitario", "offline"]],
  ["sesion", "corridas", ["roguelite", "roguelike", "rogue", "corrida", "run", "permadeath"]],
  ["sesion", "partidas", ["partida", "arena", "match", "ronda"]],
  ["sesion", "campania", ["campania", "historia", "aventura", "capitulo"]],
  ["sesion", "sin-fin", ["sin fin", "infinit", "sandbox", "endless"]],
  ["progresion", "botin", ["botin", "loot", "equipo", "armadura", "objetos", "items"]],
  ["progresion", "niveles", ["nivel", "experiencia", "talento", "rpg", "subir de"]],
  ["progresion", "meta", ["mejoras permanentes", "meta", "desbloque", "roguelite"]],
  ["progresion", "base", ["base", "refugio", "aldea"]],
  ["progresion", "habilidad-jugador", ["habilidad del jugador", "skill based", "dificil", "souls"]],
  ["muerte", "permanente", ["permadeath", "muerte permanente", "hardcore"]],
  ["muerte", "pierde-lo-que-lleva", ["extraccion", "pierdes todo", "tarkov"]],
  ["muerte", "tumba", ["souls", "tumba", "recuperar el cuerpo"]],
  ["realismo", "simulacion", ["realista", "simulacion", "simulador", "tactico realista"]],
  ["realismo", "arcade", ["arcade", "casual", "simple", "retro"]],
  ["ambientacion", "zombis", ["zombi", "zombie", "infectad", "postapocal", "apocalip", "muerto"]],
  ["ambientacion", "militar", ["militar", "soldado", "guerra", "moderno", "comando", "ejercito"]],
  ["ambientacion", "ciencia-ficcion", ["espacio", "nave", "robot", "alien", "ciencia ficcion", "sci-fi", "scifi", "futur", "cyber"]],
  ["ambientacion", "terror", ["terror", "horror", "miedo", "susto"]],
  ["ambientacion", "fantasia", ["fantasia", "dragon", "mago", "espada", "castillo", "mazmorra", "dungeon", "elfo", "orco", "magia"]],
  ["ambientacion", "motor", ["carrera", "auto", "deporte", "futbol", "racing"]],
  ["ambientacion", "cotidiano", ["granja", "pueblo", "cocina", "vida diaria", "cozy"]],
  ["enemigos", "hordas", ["horda", "oleada", "muchos enemigos", "survivors", "masas"]],
  ["enemigos", "jefes", ["jefe", "boss"]],
  ["enemigos", "tacticos", ["inteligente", "tactic", "cobertura", "flanque"]],
  ["enemigos", "jugadores", ["pvp", "contra otros jugadores"]],
  ["economia", "tienda", ["tienda", "comprar", "mercader", "shop"]],
  ["economia", "comercio", ["comercio", "subasta", "intercambi", "trade"]],
  ["economia", "cajas", ["caja", "gacha", "loot box", "cofre de pago"]],
  ["contenido", "infinito", ["infinit", "sin fin", "endless", "procedural", "generado"]],
  ["contenido", "finito", ["final", "campania", "capitulo"]],
];

/** Texto sin acentos, en minúsculas, con espacios simples. */
export function normalizarTexto(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ñ/g, "ni").replace(/[^a-z0-9\- ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Interpreta una frase libre. Una raíz de una palabra coincide al inicio de cualquier palabra; una raíz de varias
 * palabras debe aparecer completa. Las preguntas simples se quedan con la primera coincidencia del diccionario.
 */
export function interpretarIdea(texto: string): IdeaInterpretada {
  const t = ` ${normalizarTexto(texto)} `;
  const coincidencias: Coincidencia[] = [];
  const r: Record<string, string | string[]> = {};
  for (const [pregunta, valor, raices] of DICCIONARIO) {
    const palabra = raices.find((raiz) => (raiz.includes(" ") ? t.includes(` ${raiz} `) || t.includes(` ${raiz}`) : t.includes(` ${raiz}`)));
    if (!palabra) continue;
    if (MULTIPLES.has(pregunta)) {
      const lista = (r[pregunta] as string[] | undefined) ?? [];
      if (!lista.includes(valor)) lista.push(valor);
      r[pregunta] = lista;
    } else if (r[pregunta] !== undefined) continue;
    else r[pregunta] = valor;
    coincidencias.push({ pregunta, valor, palabra });
  }
  const todas = ["nucleo", "perspectiva", "ritmo", "jugadores", "sesion", "progresion", "muerte", "realismo", "ambientacion", "enemigos", "economia", "contenido"];
  return { respuestas: r, coincidencias, sinRespuesta: todas.filter((p) => r[p] === undefined) };
}
