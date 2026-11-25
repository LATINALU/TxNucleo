// Prototipo "acción cenital" de TxNucleo en el navegador: dibuja la simulación (simulacion.js) con los sprites que
// construye pxl (arte/out/personajes/personajes.hoja.json + .png). Si el arte todavía no se construyó, dibuja
// figuras simples: el juego funciona igual. Controles: WASD/flechas mover · Espacio esquivar · R reiniciar · B bot.

import { ALTO, ANCHO, crearJuego, politicaBot } from "./simulacion.js";

const C = 16; // píxeles por casilla
const E = 2; // escala entera de los sprites (pixel art nítido, personajes más grandes que su casilla)
const lienzo = document.getElementById("juego");
const ctx = lienzo.getContext("2d");
lienzo.width = ANCHO * C;
lienzo.height = ALTO * C;
ctx.imageSmoothingEnabled = false;

const reglas = await (await fetch("../reglas.json")).json();
let hoja = null, imagen = null;
try {
  hoja = await (await fetch("../arte/out/personajes/personajes.hoja.json")).json();
  imagen = new Image();
  imagen.src = "../arte/out/personajes/" + hoja.imagen;
  await imagen.decode();
} catch {
  hoja = null; // sin arte construido: figuras
}
const cuadros = new Map((hoja?.cuadros ?? []).map((c) => [c.nombre, c]));

let semilla = 1;
let juego = crearJuego(reglas, semilla);
let bot = new URLSearchParams(location.search).has("bot");
const teclas = new Set();
addEventListener("keydown", (ev) => {
  teclas.add(ev.code);
  if (ev.code === "KeyR") juego = crearJuego(reglas, ++semilla);
  if (ev.code === "KeyB") bot = !bot;
});
addEventListener("keyup", (ev) => teclas.delete(ev.code));

function entrada() {
  if (bot) return politicaBot(juego);
  const x = (teclas.has("KeyD") || teclas.has("ArrowRight") ? 1 : 0) - (teclas.has("KeyA") || teclas.has("ArrowLeft") ? 1 : 0);
  const y = (teclas.has("KeyS") || teclas.has("ArrowDown") ? 1 : 0) - (teclas.has("KeyW") || teclas.has("ArrowUp") ? 1 : 0);
  return { x, y, dash: teclas.has("Space") };
}

function sprite(nombre, x, y, color, radio, escala = 1) {
  const c = cuadros.get(nombre);
  if (c && imagen) {
    const w = c.w * escala * E, h = c.h * escala * E;
    ctx.drawImage(imagen, c.x, c.y, c.w, c.h, Math.round(x * C - w / 2), Math.round(y * C - h / 2), w, h);
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x * C, y * C, radio * C, 0, Math.PI * 2);
    ctx.fill();
  }
}

const destellos = [];
function dibujar() {
  const e = juego.estado, j = e.jugador;
  ctx.fillStyle = "#14161c";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.fillStyle = "#1b1e26";
  for (let y = 0; y < ALTO; y++) for (let x = (y % 2); x < ANCHO; x += 2) ctx.fillRect(x * C, y * C, C, C);
  for (const g of e.gemas) sprite("gema", g.x, g.y, "#7fe0a0", 0.2);
  for (const c of e.cofres) sprite(`botin_${c.rareza}`, c.x, c.y, reglas.botin.colores[c.rareza] ?? "#fff", 0.35);
  for (const en of e.enemigos) {
    sprite(en.jefe ? "jefe" : `enemigo_${en.id.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`, en.x, en.y, en.jefe ? "#d04040" : "#80a060", en.radio, en.jefe ? 1.5 : 1);
    if (en.vida < en.vidaMax) {
      ctx.fillStyle = "#000"; ctx.fillRect(en.x * C - 8, en.y * C - en.radio * C - 6, 16, 2);
      ctx.fillStyle = "#e04848"; ctx.fillRect(en.x * C - 8, en.y * C - en.radio * C - 6, 16 * (en.vida / en.vidaMax), 2);
    }
  }
  for (const b of e.balas) sprite("bala", b.x, b.y, "#fff7c0", 0.12);
  for (const b of e.balasEnemigas) sprite("bala_enemiga", b.x, b.y, "#ff6060", 0.15);
  if (!(j.invul > 0 && Math.floor(e.t * 20) % 2)) sprite("jugador", j.x, j.y, "#60a0ff", 0.45);
  for (const ev of e.eventos) if (ev.tipo === "tajo" || ev.tipo === "baja") destellos.push({ x: ev.x, y: ev.y, t: 0.15 });
  for (const d of destellos) { ctx.strokeStyle = `rgba(255,255,255,${d.t * 6})`; ctx.strokeRect(d.x * C - 6, d.y * C - 6, 12, 12); d.t -= 1 / 60; }
  for (let i = destellos.length - 1; i >= 0; i--) if (destellos[i].t <= 0) destellos.splice(i, 1);
  e.eventos.length = 0;

  // Interfaz.
  const vmax = juego.vidaMax();
  ctx.fillStyle = "#000a"; ctx.fillRect(4, 4, 150, 34);
  ctx.fillStyle = "#401818"; ctx.fillRect(8, 8, 100, 6);
  ctx.fillStyle = "#e04848"; ctx.fillRect(8, 8, 100 * (j.vida / vmax), 6);
  const sig = reglas.jugador.expParaSubir[e.nivel - 1] ?? 1;
  ctx.fillStyle = "#183040"; ctx.fillRect(8, 17, 100, 4);
  ctx.fillStyle = "#58c0ff"; ctx.fillRect(8, 17, 100 * Math.min(1, e.exp / sig), 4);
  ctx.fillStyle = "#e8e8e8"; ctx.font = "8px monospace";
  ctx.fillText(`Nv ${e.nivel}  Oleada ${e.oleada}  Bajas ${e.bajas}  Botín ${e.botin.reduce((s, x) => s + x, 0)}${bot ? "  [BOT]" : ""}`, 8, 32);
  if (e.fin) {
    ctx.fillStyle = "#000c"; ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.fillStyle = "#fff"; ctx.font = "16px monospace";
    ctx.fillText(`Fin: oleada ${e.oleada}, nivel ${e.nivel}, ${e.bajas} bajas`, 140, 180);
    ctx.font = "8px monospace"; ctx.fillText("R para reiniciar", 260, 200);
    const mejor = Math.max(e.oleada, Number(localStorage.getItem("txnucleo.mejor") ?? 0));
    localStorage.setItem("txnucleo.mejor", String(mejor));
    ctx.fillText(`Mejor oleada: ${mejor}`, 262, 214);
  }
}

// Paso fijo de 60 Hz (igual que el bot), dibujo por cuadro.
let acumulado = 0, antes = performance.now();
function cuadro(ahora) {
  acumulado = Math.min(0.25, acumulado + (ahora - antes) / 1000);
  antes = ahora;
  while (acumulado >= 1 / 60) { juego.paso(1 / 60, entrada()); acumulado -= 1 / 60; }
  dibujar();
  requestAnimationFrame(cuadro);
}
requestAnimationFrame(cuadro);
