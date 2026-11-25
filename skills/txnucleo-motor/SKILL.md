---
name: txnucleo-motor
description: Conectar los contratos de TxNucleo con el motor del juego y verificarlo desde un agente con CLI-Anything (Godot 4 sin interfaz). Usar para importar sprites y modelos construidos, validar scripts, listar escenas, reimportar recursos o exportar builds de un proyecto Godot.
---

# Motor con CLI-Anything + TxNucleo

## Verificar y operar Godot

- Con `"motor": "godot"` en `txnucleo.red.json`, `construir_juego` ya **reimporta y verifica** (escenas y sintaxis
  de todos los `.gd`) cuando cambió algo. Leer `godot.scriptsInvalidos` del informe.
- Suelto: `red godot <proyecto> [--reimportar]` o `verificar_juego` (además revisa los hashes del manifiesto).
- Exportar: `cli-anything-godot --json -p <proyecto> export build --preset <nombre> --output <archivo>`
  (necesita `export_presets.cfg`; el binario está en `$TXNUCLEO_RED/cli-anything-godot/venv`).
- Godot se encuentra por `GODOT_BIN` (o `GODOT`). No uses `script inline` (ejecuta GDScript arbitrario).

## Importar contratos (neutros a motores)

Godot: copiar `integraciones/godot/txnucleo_importar.gd` al proyecto (probado en Godot 4.7).

```gdscript
$Sprite.sprite_frames = TxNucleoImportar.sprite_frames("res://arte/out/personajes/personajes.hoja.json")
var caja := TxNucleoImportar.modelo("res://modelos/caja.modelo.json")  # GLB + StaticBody3D + grupos por etiqueta
```

- Hoja estática → una animación de un cuadro por sprite (con su nombre); `animaciones` → animaciones con su fps y
  bucle.
- Usa el recurso importado si existe (sirve exportado); si no, lo lee del disco.
- Web (Three.js) y Unity: ejemplos en `docs/RED.md`.
- Mecánicas de alto rendimiento (rayos 3D, hordas, niebla): GDExtension de `rust/godot/`.

## Reglas

- Fijá la versión de Godot del proyecto y verificá después de cada cambio de recursos.
- Los fallos del harness llegan como `status: "error"`: mostralos tal cual, no los ocultes.
