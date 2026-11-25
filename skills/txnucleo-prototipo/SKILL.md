---
name: txnucleo-prototipo
description: Llevar una idea de videojuego a un prototipo jugable con TxNucleo. Usar cuando el usuario pide "hacer un juego", "un prototipo", "un shooter / RPG / roguelike / MOBA...", combinar géneros, o trabaja en una carpeta con txnucleo.red.json. Elige mecánicas, prepara el proyecto de red, fija el estilo, produce arte con pxl o kiln y verifica.
---

# De idea a prototipo con TxNucleo

TxNucleo trae las **mecánicas** (reglas puras, 58 modelos de género combinables) y coordina una **red de
herramientas** para el arte y el motor. Manual completo: `docs/IA.md` (sección 15 = protocolo de la red);
guía humana: `docs/USO.md`.

Las acciones existen como MCP (`txnucleo`) y como CLI (`npm --prefix <TxNucleo> run red -- <comando>` desde la
carpeta del juego). Usá el MCP si está conectado.

## Flujo

1. **Mecánicas.** `buscar_mecanica` antes de escribir cualquier regla. Combinar con `crear_modelo`, o
   `npm run crear -- --salida <juego> --motor godot` (escribe `PLAN.md`, `txnucleo.juego.json` y
   `txnucleo.red.json`).
2. **Proyecto.** Si falta `txnucleo.red.json`: `iniciar_juego`. Leelo: carpetas de fuentes, motor, estilo.
3. **Estilo.** Con referencias del usuario: `contrato_estilo` → `estilo.json`, y anotarlo en `txnucleo.red.json`.
4. **Arte.** Seguir "Arte con la red TxNucleo" del `PLAN.md` con la skill `txnucleo-arte`: editar SOLO fuentes
   (`.px.js`, `.kiln.js`).
5. **Construir.** `estado_juego` → `construir_juego`. Leer el informe entero (errores, estilo, Godot, manifiesto)
   y corregir las fuentes hasta que salga limpio.
6. **Motor.** Importar los contratos (skill `txnucleo-motor`) y escribir las reglas con los módulos del plan.
7. **Verificar.** `verificar_juego` + pruebas de reglas con semilla fija.

## Reglas

- Nunca inventes una mecánica ni una API: si no está en `docs/INDICE.md` o en `buscar_mecanica`, no existe.
- Nunca edites salidas (PNG, GLB, `*.hoja.json`, `*.modelo.json`): se regeneran desde la fuente.
- Si falta una herramienta (`estado_juego.faltan`), decilo y ofrecé instalarla; seguí con lo que no la necesita.
- No copies personajes, nombres, arte ni números de juegos comerciales. Las referencias dan estilo, no contenido.
