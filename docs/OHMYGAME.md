# TxNucleo + OhMyGame

[OhMyGame](https://github.com/WhiteTowerAI/ohmygame) es un estudio de escritorio para hacer juegos con IA:
lienzo, documento de diseño, generación de imágenes, audio y 3D, vista previa, playtest y publicación. Es una app
aparte (Apache-2.0, beta). TxNucleo no incluye su código: se conectan por **MCP**, en los dos sentidos.

| Dirección | Para qué |
|---|---|
| OhMyGame usa TxNucleo | El agente de OhMyGame busca mecánicas reales, combina modelos y construye sprites y modelos con la red. |
| Claude Code usa OhMyGame | Claude Code trabaja con TxNucleo y pide a OhMyGame lo que solo él tiene: lienzo, generación de medios y playtest. |

## 1. TxNucleo dentro de OhMyGame

En OhMyGame: **Settings → MCP Connections**, agregar una conexión pegando el JSON `mcpServers` (cada clave se
vuelve una conexión). Cambiar `<TxNucleo>` por la ruta absoluta del repositorio:

```json
{
  "mcpServers": {
    "txnucleo": {
      "command": "node",
      "args": ["<TxNucleo>/mcp/servidor.ts"],
      "env": { "GODOT_BIN": "<ruta al ejecutable de Godot>" }
    }
  }
}
```

Requiere Node ≥ 23.6 en el PATH (TxNucleo ejecuta TypeScript directo). La conexión puede limitarse a ciertos tipos
de proyecto. Con **Test**, OhMyGame lista las herramientas sin llamarlas: deben aparecer `buscar_mecanica`,
`crear_modelo`, `red_doctor`, `contrato_estilo`, `generar_sprites`, `generar_modelo` y `verificar_juego`.

Sugerencia para el agente de OhMyGame: "Antes de escribir lógica de juego, usa `buscar_mecanica`; para un
prototipo nuevo, `crear_modelo` y sigue su plan de arte".

## 2. OhMyGame desde Claude Code

En OhMyGame: **Settings → MCP Server** (marcado como Legacy), activarlo y pulsar **Connect**. Muestra el comando
exacto con la ruta de su lanzador `ohmygame-mcp`, que viene con la app y no necesita Node:

```bash
claude mcp add --scope user ohmygame-studio -- <lanzador que muestra Settings>
```

y la carpeta de su Skill, que se copia a `~/.claude/skills`. Algunas herramientas que expone: `list_projects`,
`open_project`, `generate_image`, `generate_3d_asset`, `generate_audio`, `canvas_check` y `game_use` (playtest en
su ventana). La generación usa los modelos que el usuario conectó en OhMyGame (con su propia clave).

## Reparto de trabajo recomendado

| Tarea | Quién |
|---|---|
| Reglas, balance, IA, netcode, guardado | TxNucleo (mecánicas con pruebas deterministas) |
| Paleta y contrato de estilo | reference-to-game vía TxNucleo (`contrato_estilo`) |
| Pixel art editable y animaciones | pxl vía TxNucleo (`generar_sprites`) |
| Modelos 3D editables, a escala | kiln vía TxNucleo (`generar_modelo`) |
| Imágenes, audio o 3D generados por modelo | OhMyGame (registrar el resultado en `txnucleo.recursos.json` con su licencia) |
| Probar el juego y mostrarlo | OhMyGame (`game_use`, vista previa, publicación) |
| Verificar Godot y los recursos | TxNucleo (`verificar_juego`, CLI-Anything) |

OhMyGame trae su propio plugin de Godot (tipo de juego Godot, ejecución sin interfaz y exportación web).
Convive con la verificación de TxNucleo: ellos corren el juego, TxNucleo revisa scripts, escenas y recursos.

> Las rutas de menú y comandos de esta guía salen de la documentación de OhMyGame (`docs/external-agents.md` y
> `docs/plugins.md`, commit `d6eac67`). Si la app cambia, manda lo que muestra su pantalla de Settings.
