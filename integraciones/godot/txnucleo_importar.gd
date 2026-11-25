## Importadores de los contratos de la red TxNucleo para Godot 4 (sin plugins).
class_name TxNucleoImportar

## HojaSprites (.hoja.json) → SpriteFrames. Usa el PNG importado por Godot (funciona exportado); si todavía no
## se importó (herramientas, pruebas sin editor), lo lee del disco.
static func sprite_frames(ruta_hoja: String) -> SpriteFrames:
	var hoja: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(ruta_hoja))
	var ruta_png := ruta_hoja.get_base_dir().path_join(hoja.imagen)
	var textura: Texture2D
	if ResourceLoader.exists(ruta_png):
		textura = load(ruta_png)
	else:
		textura = ImageTexture.create_from_image(Image.load_from_file(ruta_png))
	var regiones: Array[AtlasTexture] = []
	for c in hoja.cuadros:
		var at := AtlasTexture.new()
		at.atlas = textura
		at.region = Rect2(c.x, c.y, c.w, c.h)
		at.filter_clip = true
		regiones.append(at)
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	if hoja.animaciones.is_empty():
		# Hoja estática: una "animación" de un cuadro por sprite, con su nombre.
		for i in regiones.size():
			var nombre: String = hoja.cuadros[i].nombre
			frames.add_animation(nombre)
			frames.add_frame(nombre, regiones[i])
	for a in hoja.animaciones:
		var base: float = a.ms.min()
		frames.add_animation(a.nombre)
		frames.set_animation_loop(a.nombre, a.bucle)
		frames.set_animation_speed(a.nombre, 1000.0 / base)
		for i in range(int(a.desde), int(a.hasta) + 1):
			frames.add_frame(a.nombre, regiones[i], a.ms[i - int(a.desde)] / base)
	return frames

## Modelo3D (.modelo.json) → nodo con el GLB, colisión sugerida (StaticBody3D) y etiquetas como grupos.
static func modelo(ruta_modelo: String) -> Node3D:
	var m: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(ruta_modelo))
	var ruta_glb := ruta_modelo.get_base_dir().path_join(m.glb)
	var raiz: Node3D
	if ResourceLoader.exists(ruta_glb):
		raiz = (load(ruta_glb) as PackedScene).instantiate()
	else:
		var doc := GLTFDocument.new()
		var estado := GLTFState.new()
		if doc.append_from_file(ruta_glb, estado) != OK:
			return null
		raiz = doc.generate_scene(estado)
	var cuerpo := StaticBody3D.new()
	cuerpo.name = "Colision"
	var forma := CollisionShape3D.new()
	var c: Dictionary = m.colision
	match c.forma:
		"caja":
			var b := BoxShape3D.new()
			b.size = Vector3(c.tamano[0], c.tamano[1], c.tamano[2])
			forma.shape = b
		"capsula":
			var k := CapsuleShape3D.new()
			k.radius = c.radio
			k.height = c.alto
			forma.shape = k
		"esfera":
			var s := SphereShape3D.new()
			s.radius = c.radio
			forma.shape = s
	forma.position = Vector3(c.centro[0], c.centro[1], c.centro[2])
	cuerpo.add_child(forma)
	raiz.add_child(cuerpo)
	for e in m.etiquetas:
		raiz.add_to_group(e)
	return raiz
