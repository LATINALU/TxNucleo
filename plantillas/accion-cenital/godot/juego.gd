## Prototipo "acción cenital" de TxNucleo en Godot 4: dibuja SimulacionTxn con los sprites de pxl (importados con
## TxNucleoImportar) o, si el arte no se construyó todavía, con figuras. Controles: WASD/flechas mover, Espacio
## esquivar, R reiniciar, B bot.
## Bot sin pantalla: godot --headless --path . -- --bot 120 5   (segundos, semillas) → imprime JSON y sale.
extends Node2D

const C := 16.0
## Escala entera de los sprites (pixel art nítido): los personajes se leen mejor más grandes que su casilla.
const E := 2.0
var reglas: Dictionary
var sim: SimulacionTxn
var semilla := 1
var bot := false
var frames: SpriteFrames
var destellos: Array = []
var acumulado := 0.0

func _ready() -> void:
	reglas = JSON.parse_string(FileAccess.get_file_as_string("res://reglas.json"))
	var args := OS.get_cmdline_user_args()
	var i := args.find("--bot")
	if i >= 0:
		_bot_sin_pantalla(float(args[i + 1]) if args.size() > i + 1 else 120.0, int(args[i + 2]) if args.size() > i + 2 else 5)
		return
	var hoja := "res://arte/out/personajes/personajes.hoja.json"
	if FileAccess.file_exists(hoja):
		frames = TxNucleoImportar.sprite_frames(hoja)
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sim = SimulacionTxn.new(reglas, semilla)
	# Captura: el bot juega N segundos y se guarda una imagen (txn probar --captura). Necesita ventana (no headless).
	var k := args.find("--captura")
	if k >= 0 and args.size() > k + 1:
		bot = true
		var segundos := float(args[k + 2]) if args.size() > k + 2 else 20.0
		for _p in range(int(segundos * 60)):
			if sim.estado.fin:
				break
			sim.paso(1.0 / 60.0, sim.politica_bot())
			sim.estado.eventos.clear()
		queue_redraw()
		await RenderingServer.frame_post_draw
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(args[k + 1])
		print("captura: ", args[k + 1])
		get_tree().quit()

func _bot_sin_pantalla(segundos: float, semillas: int) -> void:
	var partidas: Array = []
	for s in range(1, semillas + 1):
		var b := SimulacionTxn.new(reglas, s)
		var pasos := int(round(segundos * 60))
		for _p in range(pasos):
			if b.estado.fin:
				break
			b.paso(1.0 / 60.0, b.politica_bot())
			b.estado.eventos.clear()
		partidas.append(b.metricas())
	var vivos := partidas.filter(func(p): return p.vivo).size()
	var media := func(k: String) -> float:
		var t := 0.0
		for p in partidas:
			t += float(p[k])
		return snappedf(t / partidas.size(), 0.1)
	print(JSON.stringify({"motor": "godot", "segundos": segundos, "semillas": semillas, "vivos": vivos,
		"media": {"segundos": media.call("segundos"), "oleada": media.call("oleada"), "nivel": media.call("nivel"), "bajas": media.call("bajas"), "botin": media.call("botin")},
		"partidas": partidas}))
	get_tree().quit()

func _unhandled_input(ev: InputEvent) -> void:
	if ev is InputEventKey and ev.pressed and not ev.echo:
		if ev.keycode == KEY_R:
			semilla += 1
			sim = SimulacionTxn.new(reglas, semilla)
		elif ev.keycode == KEY_B:
			bot = not bot

func _entrada() -> Dictionary:
	if bot:
		return sim.politica_bot()
	var x := float(Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT)) - float(Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT))
	var y := float(Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN)) - float(Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP))
	return {"x": x, "y": y, "dash": Input.is_key_pressed(KEY_SPACE)}

func _process(delta: float) -> void:
	if sim == null:
		return
	acumulado = minf(0.25, acumulado + delta)
	while acumulado >= 1.0 / 60.0:
		sim.paso(1.0 / 60.0, _entrada())
		acumulado -= 1.0 / 60.0
	queue_redraw()

func _sprite(nombre: String, x: float, y: float, color: Color, radio: float, escala := 1.0) -> void:
	if frames != null and frames.has_animation(nombre):
		var tex := frames.get_frame_texture(nombre, 0)
		var tam := tex.get_size() * escala * E
		draw_texture_rect(tex, Rect2(Vector2(x * C, y * C) - tam / 2, tam), false)
	else:
		draw_circle(Vector2(x * C, y * C), radio * C, color)

func _nombre_enemigo(id: String) -> String:
	var r := RegEx.new()
	r.compile("[^a-z0-9_]")
	return "enemigo_" + r.sub(id.to_lower(), "_", true)

func _draw() -> void:
	if sim == null:
		return
	var e: Dictionary = sim.estado
	var j: Dictionary = e.jugador
	draw_rect(Rect2(0, 0, SimulacionTxn.ANCHO * C, SimulacionTxn.ALTO * C), Color("#14161c"))
	for y in range(int(SimulacionTxn.ALTO)):
		for x in range(y % 2, int(SimulacionTxn.ANCHO), 2):
			draw_rect(Rect2(x * C, y * C, C, C), Color("#1b1e26"))
	for g in e.gemas:
		_sprite("gema", g.x, g.y, Color("#7fe0a0"), 0.2)
	for c in e.cofres:
		_sprite("botin_%d" % c.rareza, c.x, c.y, Color(reglas.botin.colores[c.rareza]) if c.rareza < reglas.botin.colores.size() else Color.WHITE, 0.35)
	for en in e.enemigos:
		_sprite("jefe" if en.jefe else _nombre_enemigo(en.id), en.x, en.y, Color("#d04040") if en.jefe else Color("#80a060"), en.radio, 1.5 if en.jefe else 1.0)
		if en.vida < en.vida_max:
			var p := Vector2(en.x * C - 8, en.y * C - en.radio * C - 6)
			draw_rect(Rect2(p, Vector2(16, 2)), Color.BLACK)
			draw_rect(Rect2(p, Vector2(16 * en.vida / en.vida_max, 2)), Color("#e04848"))
	for b in e.balas:
		_sprite("bala", b.x, b.y, Color("#fff7c0"), 0.12)
	for b in e.balas_enemigas:
		_sprite("bala_enemiga", b.x, b.y, Color("#ff6060"), 0.15)
	if not (j.invul > 0 and int(e.t * 20) % 2 == 1):
		_sprite("jugador", j.x, j.y, Color("#60a0ff"), 0.45)
	for ev in e.eventos:
		if ev.tipo == "tajo" or ev.tipo == "baja":
			destellos.append({"x": ev.x, "y": ev.y, "t": 0.15})
	e.eventos.clear()
	for d in destellos:
		draw_rect(Rect2(d.x * C - 6, d.y * C - 6, 12, 12), Color(1, 1, 1, d.t * 6), false)
		d.t -= 1.0 / 60.0
	destellos = destellos.filter(func(d): return d.t > 0)

	var fuente := ThemeDB.fallback_font
	var vmax := sim.vida_max()
	draw_rect(Rect2(4, 4, 150, 34), Color(0, 0, 0, 0.6))
	draw_rect(Rect2(8, 8, 100, 6), Color("#401818"))
	draw_rect(Rect2(8, 8, 100 * j.vida / vmax, 6), Color("#e04848"))
	var sig: float = reglas.jugador.expParaSubir[e.nivel - 1]
	draw_rect(Rect2(8, 17, 100, 4), Color("#183040"))
	draw_rect(Rect2(8, 17, 100 * minf(1.0, e.exp / sig), 4), Color("#58c0ff"))
	var total := 0
	for x in e.botin:
		total += x
	draw_string(fuente, Vector2(8, 33), "Nv %d  Oleada %d  Bajas %d  Botín %d%s" % [e.nivel, e.oleada, e.bajas, total, "  [BOT]" if bot else ""], HORIZONTAL_ALIGNMENT_LEFT, -1, 8)
	if e.fin:
		draw_rect(Rect2(0, 0, SimulacionTxn.ANCHO * C, SimulacionTxn.ALTO * C), Color(0, 0, 0, 0.8))
		draw_string(fuente, Vector2(140, 180), "Fin: oleada %d, nivel %d, %d bajas" % [e.oleada, e.nivel, e.bajas], HORIZONTAL_ALIGNMENT_LEFT, -1, 16)
		draw_string(fuente, Vector2(260, 200), "R para reiniciar", HORIZONTAL_ALIGNMENT_LEFT, -1, 8)
