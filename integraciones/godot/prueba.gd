## Prueba sin interfaz de los importadores: godot --headless --path integraciones/godot --script res://prueba.gd
extends SceneTree

var fallos := 0

func ok(cond: bool, texto: String) -> void:
	print(("  ok  " if cond else "  MAL ") + texto)
	if not cond:
		fallos += 1

func _init() -> void:
	print("== importadores TxNucleo")
	var f := TxNucleoImportar.sprite_frames("res://ejemplo/bichos.hoja.json")
	ok(f.get_animation_names() == PackedStringArray(["bicho", "bicho_rojo", "gema"]), "hoja estática: un sprite por cuadro")
	ok((f.get_frame_texture("gema", 0) as AtlasTexture).region == Rect2(30, 0, 7, 6), "región del cuadro desde la hoja")
	var a := TxNucleoImportar.sprite_frames("res://ejemplo/anims/respira.hoja.json")
	ok(a.get_frame_count("respira") == 2 and is_equal_approx(a.get_animation_speed("respira"), 4.0), "animación: 2 cuadros a 4 fps")
	var m := TxNucleoImportar.modelo("res://ejemplo/caja.modelo.json")
	ok(m != null and m.is_in_group("cobertura"), "modelo GLB con etiquetas como grupos")
	var forma := (m.get_node("Colision").get_child(0) as CollisionShape3D).shape as BoxShape3D
	ok(forma != null and forma.size.is_equal_approx(Vector3(0.612, 0.42, 0.612)), "colisión sugerida (caja) a escala")
	m.free()
	print("== todo ok" if fallos == 0 else "== %d fallos" % fallos)
	quit(fallos)
