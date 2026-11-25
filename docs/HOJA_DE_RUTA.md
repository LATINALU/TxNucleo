# Hoja de ruta de TxNucleo

Objetivo: que TxNucleo sea el centro de una red de repositorios que acelere un videojuego de la idea al prototipo
jugable. Las mecánicas son propias; el estilo, el arte y el motor los aportan herramientas externas conectadas
por contratos JSON neutros a motores. Uso: [USO.md](USO.md) · referencia: [RED.md](RED.md) · cambios:
[CHANGELOG](../CHANGELOG.md).

## Repositorios de la red (analizados el 25 nov 2026)

| Repositorio | Qué es | Cómo se conecta | Licencia | Encaje |
|---|---|---|---|---|
| crsolver/claude-pxl | Pixel art como código (`.px.js`), CLI sin dependencias | `pxl build` → JSON tipo TexturePacker/Aseprite | MIT | Arte 2D editable y versionable |
| instruktlabs/kiln | Modelos 3D procedurales (`.kiln.js`) con QA y variantes | `kiln render --json` → GLB + recibo | MIT | Arte 3D a escala, sin claves |
| HKUDS/CLI-Anything | Harnesses que vuelven programas operables por agentes | `cli-anything-godot --json` (también Blender, GIMP, Inkscape, Audacity) | Apache-2.0 | Verificar y exportar el motor |
| gokayfem/reference-to-game | De referencias a un juego que respeta el estilo | `r2g.py palette/inspect/compare` | MIT | Contrato de estilo |
| WhiteTowerAI/ohmygame | Estudio de escritorio (lienzo, generación, playtest) | MCP en ambos sentidos | Apache-2.0 | Frente visual opcional |

## 0.5.0: primera versión (hecha)

- Núcleo de mecánicas (heredado de ludokit, del mismo autor): 28 contextos, 58 modelos, asistente, datos propios,
  núcleo Rust con ABI C, GDExtension de Godot, ports Python/C++.
- Red: registro con commits fijados e instalador; contratos `HojaSprites`, `Modelo3D`, `ContratoEstilo`,
  `ManifiestoRecursos`, `ProyectoRed` (TS + Python + esquemas JSON); adaptadores pxl, kiln, reference-to-game,
  CLI-Anything.
- Proyecto por juego: `iniciar`, `estado`, `construir` incremental por hash de la fuente, `revisar-estilo` (PNG vs
  paleta en OKLab), reimportar y verificar Godot.
- Asistente que crea el proyecto de red y las fuentes de partida (paleta fija en 2D, bloques a escala en 3D).
- MCP `txnucleo` (11 herramientas), 3 skills, importador Godot probado, guía de OhMyGame.
- Documentación: USO.md (personas), IA.md §15 (agentes), RED.md (referencia).

## Próximas versiones

| Versión | Contenido |
|---|---|
| 0.6 | `red vigilar`: reconstruir al guardar una fuente. `red comparar` con r2g (captura del juego vs referencia, lado a lado). Plantillas `.px.js` con animaciones base (quieto, caminar, golpe). |
| 0.7 | Blender por CLI-Anything probado: revisar y convertir GLB/FBX/OBJ al contrato `Modelo3D`. Importadores probados para Unity (glTFast + hojas) y web (Three.js, en navegador). |
| 0.8 | Plugin propio de OhMyGame (`contributes.mcpServers` + skill) para que TxNucleo aparezca sin configurar. Registrar en el manifiesto lo que genera OhMyGame. |
| 0.9 | Contratos de audio (`BancoSonidos` ↔ archivos, Audacity por CLI-Anything) y de niveles (Tiled/LDtk → `mundo`). |
| 1.0 | API de contratos estable, validador también en Rust, guía de publicación del juego (exportar con CLI-Anything). |
