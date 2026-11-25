## Simulación del prototipo "acción cenital" de TxNucleo (port de web/simulacion.js, misma lógica y mismo azar).
## PURA: no dibuja ni lee entrada; se alimenta de reglas.json (tablas horneadas por TxNucleo). Unidades: casillas.
class_name SimulacionTxn
extends RefCounted

const ANCHO := 40.0
const ALTO := 24.0

var reglas: Dictionary
var estado := {}
var _s: int

func _init(r: Dictionary, semilla: int = 1) -> void:
	reglas = r
	_s = semilla & 0xFFFFFFFF
	var J: Dictionary = reglas.jugador
	estado = {
		"t": 0.0, "nivel": 1, "exp": 0.0, "oleada": 0, "bajas": 0, "fin": false,
		"botin": [], "danio_recibido": 0.0,
		"jugador": {"x": ANCHO / 2, "y": ALTO / 2, "vida": float(J.porNivel[0].vida), "cd": 0.0, "dash": 0.0, "dash_cd": 0.0, "invul": 0.0, "poder": 1.0},
		"enemigos": [], "balas": [], "balas_enemigas": [], "gemas": [], "cofres": [],
		"espera_oleada": 1.2, "tiempo_oleada": 0.0, "eventos": [],
	}
	for _n in reglas.botin.nombres:
		estado.botin.append(0)

## mulberry32, idéntico a crearAzar() de simulacion.js.
func azar() -> float:
	_s = (_s + 0x6d2b79f5) & 0xFFFFFFFF
	var t := _s
	t = _imul(t ^ (t >> 15), t | 1)
	t ^= (t + _imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
	return float((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

func _imul(a: int, b: int) -> int:
	return (a * b) & 0xFFFFFFFF

func vida_max() -> float:
	return float(reglas.jugador.porNivel[mini(estado.nivel, int(reglas.niveles)) - 1].vida)

func _dist(a: Dictionary, b: Dictionary) -> float:
	return Vector2(a.x - b.x, a.y - b.y).length()

func _tipo(id: String) -> Dictionary:
	for e in reglas.enemigos:
		if e.id == id:
			return e
	return reglas.enemigos[0]

func _aparecer(tipo, nivel: int, jefe: bool) -> void:
	var lado := int(floor(azar() * 4))
	var t := azar()
	var x := 0.5 if lado == 0 else (ANCHO - 0.5 if lado == 1 else t * ANCHO)
	var y := 0.5 if lado == 2 else (ALTO - 0.5 if lado == 3 else t * ALTO)
	var n := mini(nivel, int(reglas.niveles)) - 1
	var s: Dictionary = reglas.jefe.porNivel[n] if jefe else tipo.porNivel[n]
	estado.enemigos.append({
		"id": "jefe" if jefe else tipo.id, "jefe": jefe, "x": x, "y": y, "nivel": n + 1,
		"vida": float(s.vida), "vida_max": float(s.vida), "danio": float(s.danio), "golpe_recibido": float(s.golpeRecibido), "exp": float(s.exp),
		"velocidad": 1.6 if jefe else float(tipo.velocidad), "alcance": 1.4 if jefe else float(tipo.alcance),
		"distancia": (not jefe) and bool(tipo.distancia), "radio": 1.1 if jefe else 0.45, "cd": 1.0 + azar(),
	})

func _iniciar_oleada() -> void:
	estado.oleada += 1
	var lista: Array = reglas.oleadas
	var base: Dictionary = lista[mini(estado.oleada, lista.size()) - 1]
	var extra := maxi(0, estado.oleada - lista.size())
	var nivel := int(base.nivel) + extra / 2
	for g in base.enemigos:
		var tipo := _tipo(g.id)
		for i in range(int(g.cantidad) + extra / 3):
			_aparecer(tipo, nivel, false)
	if base.jefe or (extra > 0 and estado.oleada % int(reglas.jefe.cada) == 0):
		_aparecer(null, nivel, true)
	estado.tiempo_oleada = 0.0
	estado.eventos.append({"tipo": "oleada", "numero": estado.oleada})

func _matar(en: Dictionary) -> void:
	estado.bajas += 1
	estado.gemas.append({"x": en.x, "y": en.y, "exp": en.exp})
	var prob: float = 1.0 if en.jefe else float(reglas.botin.probSoltar)
	if azar() < prob:
		var p: Array = reglas.botin.probabilidades[en.nivel - 1]
		var x := azar()
		var r := 0
		while r < p.size() - 1:
			x -= p[r]
			if x < 0:
				break
			r += 1
		if en.jefe:
			r = maxi(r, mini(2, p.size() - 1))
		estado.cofres.append({"x": en.x + 0.3, "y": en.y, "rareza": r})
	estado.eventos.append({"tipo": "baja", "x": en.x, "y": en.y, "jefe": en.jefe})

func _golpear(en: Dictionary, mult: float) -> void:
	en.vida -= en.golpe_recibido * estado.jugador.poder * mult
	estado.eventos.append({"tipo": "golpe", "x": en.x, "y": en.y})

## Avanza `dt` segundos con la entrada {x, y, dash}.
func paso(dt: float, entrada: Dictionary) -> void:
	if estado.fin:
		return
	estado.t += dt
	var j: Dictionary = estado.jugador
	var J: Dictionary = reglas.jugador
	var m := Vector2(entrada.get("x", 0.0), entrada.get("y", 0.0))
	if m.length() > 1e-6:
		m = m.normalized()
	j.dash_cd -= dt
	j.invul -= dt
	if entrada.get("dash", false) and j.dash_cd <= 0 and m.length() > 1e-6:
		j.dash = 0.18
		j.dash_cd = 1.2
		j.invul = 0.3
		estado.eventos.append({"tipo": "dash"})
	var vel: float = J.velocidad * (3.0 if j.dash > 0 else 1.0)
	j.dash -= dt
	j.x = clampf(j.x + m.x * vel * dt, 0.5, ANCHO - 0.5)
	j.y = clampf(j.y + m.y * vel * dt, 0.5, ALTO - 0.5)

	# Ataque automático al más cercano dentro del alcance.
	j.cd -= dt
	if j.cd <= 0:
		var obj = null
		var mejor: float = J.alcance
		for en in estado.enemigos:
			var d: float = _dist(j, en) - en.radio
			if d < mejor:
				mejor = d
				obj = en
		if obj != null:
			j.cd = 1.0 / float(J.ritmo)
			if J.aDistancia:
				var d := maxf(1e-6, _dist(j, obj))
				estado.balas.append({"x": j.x, "y": j.y, "vx": (obj.x - j.x) / d * 14.0, "vy": (obj.y - j.y) / d * 14.0, "vida": 1.0})
			else:
				for en in estado.enemigos:
					if _dist(j, en) - en.radio <= J.alcance:
						_golpear(en, 1.0 if en == obj else 0.6)
				estado.eventos.append({"tipo": "tajo", "x": obj.x, "y": obj.y})

	for b in estado.balas:
		b.x += b.vx * dt
		b.y += b.vy * dt
		b.vida -= dt
		for en in estado.enemigos:
			if b.vida > 0 and _dist(b, en) < en.radio + 0.2:
				_golpear(en, 1.0)
				b.vida = 0.0
	estado.balas = estado.balas.filter(func(b): return b.vida > 0)

	for en in estado.enemigos:
		var d := maxf(1e-6, _dist(j, en))
		var dx: float = (j.x - en.x) / d
		var dy: float = (j.y - en.y) / d
		var v: float = en.velocidad
		if en.distancia and d < 4.5:
			dx = -dx
			dy = -dy
			v *= 0.5
		if not (en.distancia and d > 4.5 and d < 6.5):
			en.x = clampf(en.x + dx * v * dt, 0.5, ANCHO - 0.5)
			en.y = clampf(en.y + dy * v * dt, 0.5, ALTO - 0.5)
		en.cd -= dt
		if en.distancia:
			if en.cd <= 0 and d < 8:
				en.cd = 2.2
				estado.balas_enemigas.append({"x": en.x, "y": en.y, "vx": (j.x - en.x) / d * 6.0, "vy": (j.y - en.y) / d * 6.0, "vida": 2.0, "danio": en.danio})
		elif en.cd <= 0 and d < en.radio + en.alcance * 0.5 + 0.3:
			en.cd = 1.5 if en.jefe else 1.0
			if j.invul <= 0:
				j.vida -= en.danio
				estado.danio_recibido += en.danio
				estado.eventos.append({"tipo": "herido"})
	var lista: Array = estado.enemigos
	for a in range(lista.size()):
		for b in range(a + 1, lista.size()):
			var p: Dictionary = lista[a]
			var q: Dictionary = lista[b]
			var d := _dist(p, q)
			var minimo: float = p.radio + q.radio
			if d > 1e-6 and d < minimo:
				var k := (minimo - d) / (2.0 * d)
				p.x -= (q.x - p.x) * k
				p.y -= (q.y - p.y) * k
				q.x += (q.x - p.x) * k
				q.y += (q.y - p.y) * k
	for b in estado.balas_enemigas:
		b.x += b.vx * dt
		b.y += b.vy * dt
		b.vida -= dt
		if b.vida > 0 and _dist(b, j) < 0.6:
			b.vida = 0.0
			if j.invul <= 0:
				j.vida -= b.danio
				estado.danio_recibido += b.danio
				estado.eventos.append({"tipo": "herido"})
	estado.balas_enemigas = estado.balas_enemigas.filter(func(b): return b.vida > 0)
	for en in estado.enemigos:
		if en.vida <= 0:
			_matar(en)
	estado.enemigos = estado.enemigos.filter(func(en): return en.vida > 0)

	for g in estado.gemas:
		var d := _dist(g, j)
		if d < 2.5:
			g.x += (j.x - g.x) / maxf(d, 1e-6) * 9.0 * dt
			g.y += (j.y - g.y) / maxf(d, 1e-6) * 9.0 * dt
		if d < 0.6:
			estado.exp += g.exp
			g.exp = 0.0
	estado.gemas = estado.gemas.filter(func(g): return g.exp > 0)
	while estado.nivel < int(reglas.niveles) and estado.exp >= float(J.expParaSubir[estado.nivel - 1]):
		estado.exp -= float(J.expParaSubir[estado.nivel - 1])
		estado.nivel += 1
		j.vida = minf(vida_max(), j.vida + vida_max() * 0.3)
		estado.eventos.append({"tipo": "nivel", "nivel": estado.nivel})
	for c in estado.cofres:
		if _dist(c, j) < 0.8:
			estado.botin[c.rareza] += 1
			j.poder *= 1.0 + 0.04 * (c.rareza + 1)
			c["tomado"] = true
			estado.eventos.append({"tipo": "botin", "rareza": c.rareza})
	estado.cofres = estado.cofres.filter(func(c): return not c.has("tomado"))

	estado.tiempo_oleada += dt
	if estado.enemigos.is_empty() or estado.tiempo_oleada > 40:
		estado.espera_oleada -= dt
		if estado.espera_oleada <= 0:
			estado.espera_oleada = 1.5
			_iniciar_oleada()
	if j.vida <= 0:
		j.vida = 0.0
		estado.fin = true
		estado.eventos.append({"tipo": "fin"})

## Política del bot de pruebas (igual que politicaBot de simulacion.js).
func politica_bot() -> Dictionary:
	var j: Dictionary = estado.jugador
	var R: Dictionary = reglas.jugador
	var cerca = null
	var dc := INF
	for en in estado.enemigos:
		var d: float = _dist(j, en) - en.radio
		if d < dc:
			dc = d
			cerca = en
	var premio = null
	var dp := 8.0
	for p in estado.cofres + estado.gemas:
		var d := _dist(j, p)
		if d < dp:
			dp = d
			premio = p
	var centro := {"x": ANCHO / 2, "y": ALTO / 2}
	if cerca != null and dc < (2.6 if R.aDistancia else 0.9):
		var h := _hacia(cerca, -1.0)
		var c := _hacia(centro, 0.6)
		return {"x": h.x - h.y * 0.5 + c.x, "y": h.y + h.x * 0.5 + c.y, "dash": dc < 0.6}
	if premio != null and (cerca == null or dc > 2.5):
		return _con_dash(_hacia(premio, 1.0), false)
	if not R.aDistancia:
		var tirador = null
		var dt := 10.0
		for en in estado.enemigos:
			var d := _dist(j, en)
			if en.distancia and d < dt:
				dt = d
				tirador = en
		if tirador != null and (cerca == null or dc > 1.5):
			return _con_dash(_hacia(tirador, 1.0), dt > 2 and dt < 4.5)
	if cerca != null:
		if R.aDistancia and dc < float(R.alcance) * 0.7:
			var h := _hacia(cerca, 1.0)
			return {"x": -h.y, "y": h.x, "dash": false}
		return _con_dash(_hacia(cerca, 1.0), false)
	return _con_dash(_hacia(centro, 0.5), false)

func _hacia(o: Dictionary, s: float) -> Vector2:
	var j: Dictionary = estado.jugador
	var d := maxf(1e-6, _dist(j, o))
	return Vector2((o.x - j.x) / d * s, (o.y - j.y) / d * s)

func _con_dash(v: Vector2, dash: bool) -> Dictionary:
	return {"x": v.x, "y": v.y, "dash": dash}

## Métricas de la partida (mismas claves que probarConBot de simulacion.js).
func metricas() -> Dictionary:
	var total := 0
	for x in estado.botin:
		total += x
	return {
		"segundos": snappedf(estado.t, 0.1), "vivo": not estado.fin, "oleada": estado.oleada, "nivel": estado.nivel,
		"bajas": estado.bajas, "botin": total, "botinPorRareza": estado.botin,
		"vidaFinal": roundi(estado.jugador.vida), "danioRecibido": roundi(estado.danio_recibido),
	}
