// Simulación del prototipo "acción cenital" de TxNucleo: PURA (sin DOM ni tiempo real), determinista con la
// semilla, alimentada por reglas.json (las tablas que TxNucleo hornea con sus mecánicas: vida/daño por nivel,
// experiencia, oleadas, rareza del botín). La usan el juego del navegador (juego.js) y el bot de pruebas (bot.js).
// La misma lógica está portada a GDScript en godot/simulacion.gd.
// Unidades: casillas (1 casilla = 16 px en pantalla), segundos.

export const ANCHO = 40;
export const ALTO = 24;

/** Generador determinista (mulberry32), igual al de TxNucleo y al de la versión Godot. */
export function crearAzar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

/** Crea una partida. `reglas` es el contenido de reglas.json. */
export function crearJuego(reglas, semilla = 1) {
  const azar = crearAzar(semilla);
  const J = reglas.jugador;
  const tipos = new Map(reglas.enemigos.map((e) => [e.id, e]));
  const e = {
    t: 0, nivel: 1, exp: 0, oleada: 0, bajas: 0, fin: false,
    botin: reglas.botin.nombres.map(() => 0),
    danioRecibido: 0,
    jugador: { x: ANCHO / 2, y: ALTO / 2, vida: J.porNivel[0].vida, cd: 0, dash: 0, dashCd: 0, invul: 0, poder: 1, dirX: 1, dirY: 0 },
    enemigos: [], balas: [], balasEnemigas: [], gemas: [], cofres: [],
    esperaOleada: 1.2, tiempoOleada: 0,
    eventos: [],
  };
  const vidaMax = () => J.porNivel[Math.min(e.nivel, reglas.niveles) - 1].vida;

  function aparecer(tipo, nivel, jefe) {
    const lado = Math.floor(azar() * 4);
    const t = azar();
    const x = lado === 0 ? 0.5 : lado === 1 ? ANCHO - 0.5 : t * ANCHO;
    const y = lado === 2 ? 0.5 : lado === 3 ? ALTO - 0.5 : t * ALTO;
    const n = Math.min(nivel, reglas.niveles) - 1;
    const s = jefe ? reglas.jefe.porNivel[n] : tipo.porNivel[n];
    e.enemigos.push({
      id: jefe ? "jefe" : tipo.id, jefe, x, y, nivel: n + 1,
      vida: s.vida, vidaMax: s.vida, danio: s.danio, golpeRecibido: s.golpeRecibido, exp: s.exp,
      velocidad: jefe ? 1.6 : tipo.velocidad, alcance: jefe ? 1.4 : tipo.alcance, distancia: !jefe && tipo.distancia,
      radio: jefe ? 1.1 : 0.45, cd: 1 + azar(),
    });
  }

  function iniciarOleada() {
    e.oleada++;
    const lista = reglas.oleadas;
    const base = lista[Math.min(e.oleada, lista.length) - 1];
    const extra = Math.max(0, e.oleada - lista.length);
    const nivel = base.nivel + Math.floor(extra / 2);
    for (const g of base.enemigos) {
      const tipo = tipos.get(g.id);
      for (let i = 0; i < g.cantidad + Math.floor(extra / 3); i++) aparecer(tipo, nivel, false);
    }
    if (base.jefe || (extra > 0 && e.oleada % reglas.jefe.cada === 0)) aparecer(null, nivel, true);
    e.tiempoOleada = 0;
    e.eventos.push({ tipo: "oleada", numero: e.oleada });
  }

  function matar(en) {
    e.bajas++;
    e.gemas.push({ x: en.x, y: en.y, exp: en.exp * (en.jefe ? 1 : 1) });
    const prob = en.jefe ? 1 : reglas.botin.probSoltar;
    if (azar() < prob) {
      const p = reglas.botin.probabilidades[en.nivel - 1];
      let x = azar(), r = 0;
      while (r < p.length - 1 && (x -= p[r]) >= 0) r++;
      if (en.jefe) r = Math.max(r, Math.min(2, p.length - 1));
      e.cofres.push({ x: en.x + 0.3, y: en.y, rareza: r });
    }
    e.eventos.push({ tipo: "baja", x: en.x, y: en.y, jefe: en.jefe });
  }

  function golpear(en, mult) {
    en.vida -= en.golpeRecibido * e.jugador.poder * mult;
    e.eventos.push({ tipo: "golpe", x: en.x, y: en.y });
  }

  /** Avanza la simulación `dt` segundos con la entrada { x, y, dash } (x, y en -1..1). */
  function paso(dt, entrada) {
    if (e.fin) return;
    e.t += dt;
    const j = e.jugador;
    // Movimiento y esquive.
    let mx = entrada.x || 0, my = entrada.y || 0;
    const m = Math.hypot(mx, my);
    if (m > 1e-6) { mx /= m; my /= m; j.dirX = mx; j.dirY = my; }
    j.dashCd -= dt; j.invul -= dt;
    if (entrada.dash && j.dashCd <= 0 && m > 1e-6) { j.dash = 0.18; j.dashCd = 1.2; j.invul = 0.3; e.eventos.push({ tipo: "dash" }); }
    const vel = J.velocidad * (j.dash > 0 ? 3 : 1);
    j.dash -= dt;
    j.x = limitar(j.x + mx * vel * dt, 0.5, ANCHO - 0.5);
    j.y = limitar(j.y + my * vel * dt, 0.5, ALTO - 0.5);

    // Ataque automático al más cercano dentro del alcance.
    j.cd -= dt;
    if (j.cd <= 0) {
      let obj = null, mejor = J.alcance;
      for (const en of e.enemigos) { const d = dist(j, en) - en.radio; if (d < mejor) { mejor = d; obj = en; } }
      if (obj) {
        j.cd = 1 / J.ritmo;
        if (J.aDistancia) {
          const d = Math.max(1e-6, dist(j, obj));
          e.balas.push({ x: j.x, y: j.y, vx: ((obj.x - j.x) / d) * 14, vy: ((obj.y - j.y) / d) * 14, vida: 1 });
        } else {
          for (const en of e.enemigos) if (dist(j, en) - en.radio <= J.alcance) golpear(en, en === obj ? 1 : 0.6);
          e.eventos.push({ tipo: "tajo", x: obj.x, y: obj.y });
        }
      }
    }

    // Balas del jugador.
    for (const b of e.balas) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.vida -= dt;
      for (const en of e.enemigos) if (b.vida > 0 && dist(b, en) < en.radio + 0.2) { golpear(en, 1); b.vida = 0; }
    }
    e.balas = e.balas.filter((b) => b.vida > 0);

    // Enemigos: perseguir o mantener distancia, separarse entre sí, atacar.
    for (const en of e.enemigos) {
      const d = Math.max(1e-6, dist(j, en));
      let dx = (j.x - en.x) / d, dy = (j.y - en.y) / d;
      // Los tiradores mantienen distancia, pero retroceden caminando de espaldas (a media velocidad).
      let v = en.velocidad;
      if (en.distancia && d < 4.5) { dx = -dx; dy = -dy; v *= 0.5; }
      if (!(en.distancia && d > 4.5 && d < 6.5)) {
        en.x = limitar(en.x + dx * v * dt, 0.5, ANCHO - 0.5);
        en.y = limitar(en.y + dy * v * dt, 0.5, ALTO - 0.5);
      }
      en.cd -= dt;
      if (en.distancia) {
        if (en.cd <= 0 && d < 8) { en.cd = 2.2; e.balasEnemigas.push({ x: en.x, y: en.y, vx: ((j.x - en.x) / d) * 6, vy: ((j.y - en.y) / d) * 6, vida: 2, danio: en.danio }); }
      } else if (en.cd <= 0 && d < en.radio + en.alcance * 0.5 + 0.3) {
        en.cd = en.jefe ? 1.5 : 1;
        if (j.invul <= 0) { j.vida -= en.danio; e.danioRecibido += en.danio; e.eventos.push({ tipo: "herido" }); }
      }
    }
    for (let a = 0; a < e.enemigos.length; a++) {
      for (let b = a + 1; b < e.enemigos.length; b++) {
        const p = e.enemigos[a], q = e.enemigos[b];
        const d = dist(p, q), min = p.radio + q.radio;
        if (d > 1e-6 && d < min) { const k = (min - d) / (2 * d); p.x -= (q.x - p.x) * k; p.y -= (q.y - p.y) * k; q.x += (q.x - p.x) * k; q.y += (q.y - p.y) * k; }
      }
    }
    for (const b of e.balasEnemigas) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.vida -= dt;
      if (b.vida > 0 && dist(b, j) < 0.6) { b.vida = 0; if (j.invul <= 0) { j.vida -= b.danio; e.danioRecibido += b.danio; e.eventos.push({ tipo: "herido" }); } }
    }
    e.balasEnemigas = e.balasEnemigas.filter((b) => b.vida > 0);
    for (const en of e.enemigos) if (en.vida <= 0) matar(en);
    e.enemigos = e.enemigos.filter((en) => en.vida > 0);

    // Recoger experiencia (imán) y botín.
    for (const g of e.gemas) {
      const d = dist(g, j);
      if (d < 2.5) { g.x += ((j.x - g.x) / Math.max(d, 1e-6)) * 9 * dt; g.y += ((j.y - g.y) / Math.max(d, 1e-6)) * 9 * dt; }
      if (d < 0.6) { e.exp += g.exp; g.exp = 0; }
    }
    e.gemas = e.gemas.filter((g) => g.exp > 0);
    while (e.nivel < reglas.niveles && e.exp >= J.expParaSubir[e.nivel - 1]) {
      e.exp -= J.expParaSubir[e.nivel - 1];
      e.nivel++;
      j.vida = Math.min(vidaMax(), j.vida + vidaMax() * 0.3);
      e.eventos.push({ tipo: "nivel", nivel: e.nivel });
    }
    for (const c of e.cofres) {
      if (dist(c, j) < 0.8) { e.botin[c.rareza]++; j.poder *= 1 + 0.04 * (c.rareza + 1); c.tomado = true; e.eventos.push({ tipo: "botin", rareza: c.rareza }); }
    }
    e.cofres = e.cofres.filter((c) => !c.tomado);

    // Oleadas.
    e.tiempoOleada += dt;
    if (e.enemigos.length === 0 || e.tiempoOleada > 40) {
      e.esperaOleada -= dt;
      if (e.esperaOleada <= 0) { e.esperaOleada = 1.5; iniciarOleada(); }
    }
    if (j.vida <= 0) { j.vida = 0; e.fin = true; e.eventos.push({ tipo: "fin" }); }
  }

  return { estado: e, paso, vidaMax, reglas };
}

/**
 * Política del bot de pruebas: esquiva lo que está demasiado cerca, junta experiencia y botín cercanos y, si no,
 * se acerca o mantiene distancia según su arma. Es simple a propósito: mide si el juego es jugable, no lo "gana".
 */
export function politicaBot(juego) {
  const e = juego.estado, j = e.jugador, R = juego.reglas.jugador;
  let cerca = null, dc = Infinity;
  for (const en of e.enemigos) { const d = dist(j, en) - en.radio; if (d < dc) { dc = d; cerca = en; } }
  let premio = null, dp = 8;
  for (const p of [...e.cofres, ...e.gemas]) { const d = dist(j, p); if (d < dp) { dp = d; premio = p; } }
  const hacia = (o, s = 1) => { const d = Math.max(1e-6, dist(j, o)); return { x: ((o.x - j.x) / d) * s, y: ((o.y - j.y) / d) * s }; };
  if (cerca && dc < (R.aDistancia ? 2.6 : 0.9)) {
    const h = hacia(cerca, -1);
    const centro = hacia({ x: ANCHO / 2, y: ALTO / 2 }, 0.6);
    return { x: h.x - h.y * 0.5 + centro.x, y: h.y + h.x * 0.5 + centro.y, dash: dc < 0.6 };
  }
  if (premio && (!cerca || dc > 2.5)) return { ...hacia(premio), dash: false };
  if (!R.aDistancia) {
    // Cuerpo a cuerpo: primero los tiradores (si no, te desgastan de lejos); esquive para cerrar distancia.
    let tirador = null, dt = 10;
    for (const en of e.enemigos) { const d = dist(j, en); if (en.distancia && d < dt) { dt = d; tirador = en; } }
    if (tirador && (!cerca || dc > 1.5)) return { ...hacia(tirador), dash: dt > 2 && dt < 4.5 };
  }
  if (cerca) {
    if (R.aDistancia && dc < R.alcance * 0.7) { const h = hacia(cerca); return { x: -h.y, y: h.x, dash: false }; }
    return { ...hacia(cerca), dash: false };
  }
  return { ...hacia({ x: ANCHO / 2, y: ALTO / 2 }, 0.5), dash: false };
}

/** Juega `segundos` con el bot a 60 pasos por segundo y devuelve las métricas de la partida. */
export function probarConBot(reglas, segundos = 120, semilla = 1) {
  const juego = crearJuego(reglas, semilla);
  const pasos = Math.round(segundos * 60);
  for (let i = 0; i < pasos && !juego.estado.fin; i++) { juego.paso(1 / 60, politicaBot(juego)); juego.estado.eventos.length = 0; }
  const e = juego.estado;
  return {
    segundos: Math.round(e.t * 10) / 10, vivo: !e.fin, oleada: e.oleada, nivel: e.nivel, bajas: e.bajas,
    botin: e.botin.reduce((s, x) => s + x, 0), botinPorRareza: e.botin,
    vidaFinal: Math.round(e.jugador.vida), danioRecibido: Math.round(e.danioRecibido),
  };
}
