// Tipos de simulacion.js (la simulación del prototipo es JS sin compilar para correr directo en el navegador).

/** Métricas de una partida jugada por el bot. */
export interface MetricasBot {
  segundos: number;
  vivo: boolean;
  oleada: number;
  nivel: number;
  bajas: number;
  botin: number;
  botinPorRareza: number[];
  vidaFinal: number;
  danioRecibido: number;
}

/** Entrada de un paso: dirección (-1..1) y esquive. */
export interface EntradaJuego {
  x: number;
  y: number;
  dash: boolean;
}

/** Partida en curso. */
export interface Juego {
  estado: any;
  reglas: any;
  paso(dt: number, entrada: EntradaJuego): void;
  vidaMax(): number;
}

export const ANCHO: number;
export const ALTO: number;
export function crearAzar(semilla: number): () => number;
export function crearJuego(reglas: unknown, semilla?: number): Juego;
export function politicaBot(juego: Juego): EntradaJuego;
export function probarConBot(reglas: unknown, segundos?: number, semilla?: number): MetricasBot;
