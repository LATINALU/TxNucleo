# Cambios

Formato: una sección por versión, la más nueva arriba. Versiones con [SemVer](https://semver.org/lang/es/): antes
de 1.0 puede cambiar la API de los contratos entre versiones menores (0.x).

## 0.5.0 (25 nov 2026)

Primera versión de TxNucleo. Continúa *ludokit* (mismo autor) y lo convierte en el centro de una red de
herramientas para hacer videojuegos más rápido.

### Mecánicas (de ludokit)

- 28 contextos de dominio, 58 modelos de género combinables, asistente de preguntas, catálogos de datos propios,
  curvas de escalado sin tope, netcode, protocolo de feedback.
- Núcleo Rust de alto rendimiento con ABI C (`txn_*`, `rust/include/txnucleo.h`), adaptador C#, GDExtension para
  Godot 4 (`TxnEscena3D`, `TxnHorda`, `TxnNiebla`, `TxnCurva`), ports Python y C++.

### Red de herramientas

- Registro con versiones fijadas e instalador: reference-to-game, claude-pxl, Kiln, CLI-Anything (Godot, Blender),
  OhMyGame (`npm run red -- lista | doctor | instalar`).
- Contratos neutros a motores con validadores TS y Python y esquemas JSON: `HojaSprites`, `Modelo3D`,
  `ContratoEstilo`, `ManifiestoRecursos`, `ProyectoRed`.
- Proyecto por juego (`txnucleo.red.json`): `iniciar`, `estado`, `construir` incremental (hash de cada fuente),
  `revisar-estilo` (colores de los PNG contra la paleta en OKLab), `verificar`; en Godot, reimporta y valida
  escenas y scripts con CLI-Anything.
- El asistente `npm run crear` crea el proyecto de red, el plan de arte (2D/3D/interfaz) y fuentes de partida:
  `.px.js` con la paleta del estilo y `.kiln.js` de bloques a escala real.
- Servidor MCP `txnucleo` (11 herramientas), skills `txnucleo-prototipo`, `txnucleo-arte`, `txnucleo-motor`.
- Importador Godot (`integraciones/godot/txnucleo_importar.gd`): `SpriteFrames` desde hojas y GLB con colisión y
  grupos.
- `grafico.decodificarPng`: decodificador PNG puro (8 bits, todos los tipos de color, filtros).

### Documentación

- `docs/USO.md` (guía para personas), `docs/IA.md` §15 (protocolo para agentes), `docs/RED.md` (referencia de la
  red), `docs/OHMYGAME.md`, `docs/HOJA_DE_RUTA.md`.

### Licencia

- LLVA 1.1: igual a la 1.0 con el nombre TxNucleo; aclara que deriva de ludokit.
