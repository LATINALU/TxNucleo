# Cómo usar TxNucleo

Guía práctica, de cero a un prototipo con arte, para personas. Si sos una IA, leé además
[IA.md](IA.md) (manual completo) y su sección 15 (protocolo de la red).

## 1. Qué es, en una imagen

```
 ┌──────────────────────────── TU JUEGO ────────────────────────────┐
 │  reglas (código)      arte (fuentes editables)       motor        │
 │       ▲                     ▲      │                   ▲          │
 └───────┼─────────────────────┼──────┼───────────────────┼──────────┘
         │                     │      ▼                   │
   1. MECÁNICAS          2. RED DE HERRAMIENTAS      3. CONTRATOS
   TxNucleo:             reference-to-game → estilo  *.hoja.json
   58 modelos de         claude-pxl → sprites        *.modelo.json
   género, reglas        Kiln → modelos 3D           estilo.json
   puras, datos,         CLI-Anything → Godot        txnucleo.recursos.json
   asistente             OhMyGame (estudio, MCP)     → cualquier motor
```

1. **Mecánicas.** TxNucleo es una librería de reglas de juego (combate, disparos, botín, progresión, IA, red...)
   sin gráficos y sin números de ningún juego. Un asistente combina modelos de género y te da el plan.
2. **Red de herramientas.** TxNucleo instala y maneja herramientas externas para lo que no son reglas: tomar el
   estilo de una referencia, dibujar pixel art como código, modelar 3D a escala y operar el motor.
3. **Contratos.** Todo lo que producen esas herramientas se traduce a JSON simples que cualquier motor entiende.
   Un manifiesto guarda la huella (hash) de cada recurso, de dónde salió y con qué licencia.

## 2. Requisitos

| Para | Necesitás |
|---|---|
| TxNucleo (mecánicas, asistente, contratos) | Node.js 23.6 o más nuevo |
| pxl (sprites) y Kiln (modelos 3D) | Node.js (el mismo), git |
| reference-to-game (estilo) y CLI-Anything (motor) | Python 3.10+ y git |
| Verificar proyectos Godot | Godot 4 (variable `GODOT_BIN` con la ruta al ejecutable) |
| OhMyGame (opcional) | La app de escritorio |

Ninguna herramienta pide claves de API para lo que usa TxNucleo.

## 3. Instalar

```bash
git clone https://github.com/LATINALU/TxNucleo.git
cd TxNucleo
npm install
npm test                      # comprobar que todo anda
npm run red -- doctor         # qué herramientas faltan
npm run red -- instalar todo  # pxl, kiln, reference-to-game, CLI-Anything (Godot y Blender)
```

Las herramientas se instalan en `~/.txnucleo/red/` (cambiable con `TXNUCLEO_RED`), cada una fijada a una versión
probada. Su código no entra a tu juego ni a este repositorio.

Atajo recomendado para usar TxNucleo desde la carpeta de cualquier juego:

```bash
# bash / zsh
alias red='npm --prefix /ruta/a/TxNucleo run --silent red --'
# PowerShell
function red { npm --prefix C:\ruta\a\TxNucleo run --silent red -- @args }
```

En el resto de la guía, `red <comando>` significa eso.

## 4. Tu primer juego 2D (10 minutos)

**a) Elegir mecánicas.** Desde la carpeta de TxNucleo:

```bash
npm run crear -- --salida ../mi-juego --motor godot
```

Hace 12 preguntas (qué hace el jugador, cómo se ve, ritmo...). Con respuestas como "pelear cuerpo a cuerpo" y
"2D de costado" recomienda modelos (p. ej. `metroidvania`) y escribe en `../mi-juego/`:

- `PLAN.md`: qué módulos de TxNucleo usar, en qué orden, y la sección **Arte con la red**.
- `txnucleo.juego.json`: las reglas combinadas (curvas, números de partida) para cargar en tu juego.
- `txnucleo.red.json`: el proyecto de red (carpetas de arte, motor, estilo, licencia).

**b) Fijar el estilo** (opcional pero recomendado). Con una imagen de referencia PROPIA o con licencia:

```bash
cd ../mi-juego
red estilo referencia.png --nombre mi-juego --grilla 6 --pixel 320x180x4 --out estilo.json
```

Muestrea la imagen y deja una paleta por roles. Para que el asistente genere las plantillas con esa paleta, volvé
a correr `crear` con `--estilo estilo.json` (no pisa archivos existentes) o creá una plantilla suelta:

```bash
red plantilla-px estilo.json --sprites heroe,slime,cofre --out arte/personajes.px.js
```

**c) Dibujar.** Editá `arte/personajes.px.js`: cada sprite es una grilla de letras, una letra por color de la
paleta. Animaciones con `anim()` y `frame()`. Referencia de pxl: `~/.txnucleo/red/pxl/reference.md`
(o pedíselo a tu IA con la skill `txnucleo-arte`).

**d) Construir.**

```bash
red estado       # + arte/personajes.px.js  nueva
red construir    # pxl → PNG + hoja; contratos; manifiesto; revisión de estilo; Godot reimporta y verifica
red estado       # ✓ arte/personajes.px.js  al-dia
```

`construir` es **incremental**: solo reconstruye las fuentes que cambiaron, o cuyos recursos alguien tocó a mano.

**e) Usar en el motor.** En Godot, copiá `TxNucleo/integraciones/godot/txnucleo_importar.gd` al proyecto:

```gdscript
$Sprite.sprite_frames = TxNucleoImportar.sprite_frames("res://arte/out/personajes/personajes.hoja.json")
$Sprite.play("heroe")
```

## 5. Un juego 3D

Igual que el 2D, pero con perspectiva "primera" o "tercera persona". El asistente deja en `modelos/` bloques
`.kiln.js` **a escala real** (por ejemplo, un fusil con su largo real) para que cámara, colisiones y animaciones
se prueben con medidas correctas desde el primer día. Editalos (o pedíselo a tu IA) y:

```bash
red construir    # kiln → .glb + .modelo.json (medidas, nodos, colisión sugerida, QA)
```

En Godot: `TxNucleoImportar.modelo("res://modelos/fusil.modelo.json")` devuelve el modelo con un `StaticBody3D`
de colisión y sus etiquetas como grupos. En la web, el `.glb` va directo a `GLTFLoader` (ver [RED.md](RED.md)).

## 6. El ciclo de todos los días

```
editar fuentes (.px.js / .kiln.js) ──► red estado ──► red construir ──► probar en el motor
        ▲                                                   │
        └──────── red revisar-estilo (colores fuera de paleta) ◄┘
```

- **`estado`**: qué está nuevo (`+`), cambiado (`~`) o al día (`✓`), recursos rotos y herramientas faltantes.
- **`construir`**: construye, registra, revisa estilo y verifica Godot. Sale con error si algo falla.
- **`revisar-estilo`**: porcentaje de píxeles fuera de la paleta y qué colores son. Las sombras y luces
  calculadas por pxl aparecen acá: decidí si se agregan al estilo o se cambian.
- **`verificar`**: comprueba que cada recurso sigue igual que cuando se construyó (por hash).

## 7. Qué archivo es qué

| Archivo | Qué es | ¿Va a git? |
|---|---|---|
| `PLAN.md` | Plan de implementación y de arte | Sí |
| `txnucleo.juego.json` | Reglas combinadas de los modelos de género | Sí |
| `txnucleo.red.json` | Proyecto de red: carpetas, motor, estilo, licencia, animaciones sin bucle, tolerancia de color | Sí |
| `estilo.json` | Contrato de estilo: paleta por roles (hex + OKLab), resolución de píxel | Sí |
| `arte/*.px.js`, `modelos/*.kiln.js` | **Fuentes editables**: el arte de verdad | Sí |
| `arte/out/**` (PNG, `*.hoja.json`) y `modelos/*.glb`, `*.modelo.json` | Salidas construidas | Opcional (se regeneran; súbelas si tu motor las necesita sin construir) |
| `txnucleo.recursos.json` | Manifiesto: cada recurso con hash, fuente, hash de la fuente y licencia | Sí |
| `.kiln/` | Caché de revisiones de Kiln | No (el `.gitignore` ya lo excluye) |

## 8. Trabajar con una IA

**Claude Code dentro de TxNucleo:** el servidor MCP `txnucleo` ya está declarado en `.mcp.json`. Al abrir el
repositorio, aprobalo y la IA tiene 11 herramientas: buscar mecánicas, combinar modelos, iniciar, ver estado,
construir, revisar estilo y verificar.

**En la carpeta de tu juego:**

```bash
claude mcp add --scope user txnucleo -- node /ruta/a/TxNucleo/mcp/servidor.ts
cp -r /ruta/a/TxNucleo/skills/* ~/.claude/skills/      # txnucleo-prototipo, txnucleo-arte, txnucleo-motor
```

Pedidos que funcionan bien:

- "Quiero un roguelite de acción 2D con zombis. Usá TxNucleo: combiná los modelos, iniciá el proyecto y armá el plan."
- "Tomá el estilo de `ref/portada.png` y dibujá al héroe y dos enemigos con esa paleta; construí y revisá el estilo."
- "Hacé los modelos de las tres armas del plan a escala, construí y verificá el proyecto Godot."
- "¿Qué está desactualizado en el juego? Construí solo eso."

La IA debe **buscar antes de inventar** mecánicas, editar solo las **fuentes**, y usar `estado` y `construir` en
lugar de tocar PNG o GLB a mano.

## 9. Con OhMyGame

OhMyGame es un estudio visual (lienzo, generación de imágenes, 3D y audio, playtest). Se conecta con TxNucleo por
MCP en los dos sentidos: agregás `txnucleo` en sus *MCP Connections* y/o usás OhMyGame desde Claude Code. Pasos
exactos en [OHMYGAME.md](OHMYGAME.md). Lo que genere OhMyGame registralo en el manifiesto con su licencia.

## 10. Problemas comunes

| Síntoma | Causa y solución |
|---|---|
| `falta txnucleo.red.json` | La carpeta no es un proyecto de red: `red iniciar` |
| `"pxl" no está instalada` | `red instalar pxl` (o `red doctor` para ver todo) |
| Las rutas no se encuentran al usar `npm --prefix` | Las rutas son relativas a la carpeta desde donde llamás; usá el atajo `red` de la sección 3 |
| `godot: ...` al construir | Definí `GODOT_BIN` con el ejecutable de Godot 4 (en Windows, el `_console.exe`) |
| `construir` reconstruye algo que no cambiaste | Alguien modificó una salida a mano (el hash no coincide). Es a propósito: las salidas se regeneran desde la fuente |
| Muchos colores "fuera de la paleta" | Luces/sombras de pxl o un estilo muestreado incompleto: subí `toleranciaColor` en `txnucleo.red.json`, agregá roles al estilo o quitá los efectos |
| kiln: `gameMaterial ... take a color first` | En kiln el color va primero: `gameMaterial('#556b2f', { metalness: 0.5 })` |
| Quiero probar sin instalar nada | `npm run ejemplo:red`: usa salidas guardadas si faltan herramientas y lo avisa |
