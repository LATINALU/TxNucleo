# La red TxNucleo

TxNucleo trae las **mecánicas** (reglas puras, 58 modelos de género combinables, catálogos de datos). La red le
suma **herramientas externas** para todo lo demás que frena un prototipo: estilo visual, arte 2D, arte 3D y el
manejo del motor. TxNucleo no copia su código: las instala desde su repositorio oficial, fijadas a un commit o
versión, las ejecuta y **traduce lo que producen a contratos JSON neutros a motores**.

```
            referencias (png, video)                     idea / respuestas del asistente
                     │                                               │
          reference-to-game (r2g)                           TxNucleo: modelos + mecánicas
                     │ ContratoEstilo (paleta OKLab)                 │ txnucleo.juego.json + PLAN.md
                     └───────────────┬───────────────────────────────┘
                                     │ plan de arte (2D / 3D / interfaz)
                 ┌───────────────────┴───────────────────┐
           claude-pxl (.px.js)                      Kiln (.kiln.js)
                 │ HojaSprites                           │ Modelo3D (GLB + medidas + colisión)
                 └───────────────────┬───────────────────┘
                                     │ txnucleo.recursos.json (hash, origen, licencia)
                      motor: Godot · Unity · Unreal · web
                                     │
               CLI-Anything (Godot / Blender sin interfaz) → verificar, reimportar, exportar
                                     │
              agentes: MCP txnucleo + skills  ·  OhMyGame (estudio visual, MCP en ambos sentidos)
```

## Nodos

| id | Repositorio | Rol | Licencia | Produce / usa | Instalación |
|---|---|---|---|---|---|
| `r2g` | [gokayfem/reference-to-game](https://github.com/gokayfem/reference-to-game) | referencia | MIT | `ContratoEstilo` | git (commit fijo) + venv con Pillow |
| `pxl` | [crsolver/claude-pxl](https://github.com/crsolver/claude-pxl) | arte 2D | MIT | `HojaSprites` | git (commit fijo), Node ≥ 22.18, sin dependencias |
| `kiln` | [instruktlabs/kiln](https://github.com/instruktlabs/kiln) | arte 3D | MIT | `Modelo3D` | npm `@instruktlabs/kiln@1.9.0`, render por CPU |
| `cli-anything-godot` | [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything) | motor | Apache-2.0 | verificación | venv + `pip` del subdirectorio `godot/agent-harness` (commit fijo) |
| `cli-anything-blender` | ídem | motor | Apache-2.0 | `Modelo3D` | ídem `blender/agent-harness`; necesita Blender |
| `ohmygame` | [WhiteTowerAI/ohmygame](https://github.com/WhiteTowerAI/ohmygame) | estudio | Apache-2.0 (sin nombre ni logo) | MCP | app de escritorio, instalación manual ([guía](OHMYGAME.md)) |

Ninguna necesita claves de API para lo que usa TxNucleo. La generación con fal de reference-to-game y los modelos
de OhMyGame son opcionales y quedan apagados.

**Qué NO se redistribuye:** el código de esas herramientas. Se descarga en `~/.txnucleo/red/<id>` (o
`$TXNUCLEO_RED`) y conserva su licencia. En el repositorio solo hay contratos, adaptadores propios y fixtures
generadas con arte propio (`test/fixtures/red/`).

## Cómo funciona: el ciclo de vida de un recurso

```
 fuente editable            construir (solo si cambió)                 contratos + manifiesto            motor
 arte/heroe.px.js  ──pxl──►  arte/out/heroe/heroe.png + heroe.hoja.json ─┐
 modelos/caja.kiln.js ─kiln─► modelos/caja.glb + caja.modelo.json ───────┼─► txnucleo.recursos.json ──► importador
 ref.png ──reference-to-game──► estilo.json (paleta) ───────────────────┘   (hash del recurso,          (Godot, web,
                                      │                                      fuente + hash de la fuente,   Unity…)
                                      └── revisar-estilo: PNG vs paleta       licencia)
                                                                             └── CLI-Anything: reimportar + verificar Godot
```

1. Las **fuentes** (`.px.js`, `.kiln.js`, `estilo.json`) son lo único que se edita y lo que va al repositorio.
2. `construir` compara el hash de cada fuente con el `fuenteSha256` guardado en el manifiesto; construye solo las
   nuevas, las cambiadas o las que tienen una salida alterada a mano.
3. Cada salida se traduce a un contrato (`*.hoja.json`, `*.modelo.json`) y se registra en `txnucleo.recursos.json`
   con su hash, la herramienta, la fuente y la licencia del proyecto.
4. Los PNG se cruzan con la paleta del estilo (OKLab, `toleranciaColor`). En Godot, CLI-Anything reimporta y
   valida escenas y scripts.
5. El motor importa los contratos (importador de Godot en `integraciones/godot/`).

## Comandos

```bash
npm run red -- lista                       # el registro (src/enlaces/registro.ts)
npm run red -- doctor                      # requisitos (git, python, node, godot, blender) y qué está instalado
npm run red -- instalar pxl kiln r2g cli-anything-godot      # o: instalar todo
```

Desde la carpeta del juego (las rutas son relativas a donde se llama; atajo `red` en `docs/USO.md`):

```bash
npm --prefix <TxNucleo> run red -- iniciar --motor godot     # txnucleo.red.json, arte/, modelos/, .gitignore
npm --prefix <TxNucleo> run red -- estado                    # + nueva  ~ cambio  ✓ al día; recursos rotos; faltantes
npm --prefix <TxNucleo> run red -- construir [--todo]        # incremental: construir, registrar, revisar, verificar
npm --prefix <TxNucleo> run red -- revisar-estilo            # colores fuera de la paleta por imagen
npm --prefix <TxNucleo> run red -- verificar                 # manifiesto (hashes) + Godot si hay project.godot
```

Pasos sueltos (lo que `construir` hace por dentro, útiles para probar una sola fuente):

```bash
npm --prefix <TxNucleo> run red -- estilo ref.png --nombre mi-juego --grilla 6 --pixel 320x180x4 --out estilo.json
npm --prefix <TxNucleo> run red -- plantilla-px estilo.json --sprites heroe,slime --out arte/personajes.px.js
npm --prefix <TxNucleo> run red -- sprites arte/personajes.px.js --sin-bucle muerte --juego .
npm --prefix <TxNucleo> run red -- modelo modelos/caja.kiln.js --etiquetas cobertura,botin --juego .
npm --prefix <TxNucleo> run red -- godot . [--reimportar]    # escenas + sintaxis de todos los .gd
```

`--juego <carpeta>` registra lo generado en `txnucleo.recursos.json` (`--licencia`, por defecto `propia`).

Variables: `TXNUCLEO_RED` (carpeta de instalación), `GODOT_BIN` (o `GODOT`), `BLENDER_BIN`, `TXNUCLEO_PYTHON`.

### El proyecto de red: `txnucleo.red.json`

```json
{
  "version": "txnucleo.red.v1",
  "nombre": "mi-juego",
  "motor": "godot",
  "estilo": "estilo.json",
  "arte2d": "arte",
  "arte3d": "modelos",
  "licencia": "propia",
  "sinBucle": ["muerte", "ataque"],
  "toleranciaColor": 0.02
}
```

| Campo | Para qué |
|---|---|
| `motor` | `godot` activa reimportar + verificar con CLI-Anything; `web`, `unity`, `unreal`, `otro` solo cambian la guía |
| `estilo` | Contrato de estilo para las plantillas y `revisar-estilo` (`null` si no hay) |
| `arte2d` / `arte3d` | Dónde se buscan `.px.js` y `.kiln.js` (las salidas van a `<carpeta>/out/<nombre>/` y `<nombre>.glb`) |
| `licencia` | Con qué licencia se registran los recursos generados |
| `sinBucle` | Animaciones de pxl que se reproducen una vez |
| `toleranciaColor` | Distancia OKLab hasta la que un color cuenta como de la paleta |

Esquema: `docs/esquemas/proyecto.schema.json`. Lógica pura en `src/enlaces/proyecto.ts`; ejecución en
`src/infraestructura/proyecto-red.ts`.

### Con el asistente

`npm run crear` ya conoce la red. Decide si el juego pide arte **2D, 3D o de interfaz** (según la perspectiva o
las reglas combinadas), agrega la sección "Arte con la red TxNucleo" al `PLAN.md` y deja fuentes de partida:

- `txnucleo.red.json` (con `--motor`; si no, lo detecta por `project.godot`);
- con `--estilo estilo.json`: `.px.js` con la paleta fija del estilo (2D);
- en 3D: `modelos/<arma>.kiln.js`, bloques con el largo real de cada categoría de `datos.armas`
  (`enlaces.MEDIDAS_ARMA`), para tener escala correcta desde el minuto uno.

```bash
npm run crear -- --respuestas '{"nucleo":["cuerpo-a-cuerpo"],"perspectiva":"lateral"}' --estilo estilo.json --salida mi-juego
```

## Contratos

Tipos y validadores en `src/enlaces/contratos.ts` (también en Python: `python/txnucleo_herramientas/contratos.py`).
Esquemas JSON en `docs/esquemas/`. Los dos lenguajes dan el mismo veredicto sobre `vectores/contratos.json`.

| Contrato | Archivo | Qué guarda |
|---|---|---|
| `HojaSprites` (`txnucleo.hoja.v1`) | `*.hoja.json` junto al PNG | cuadros (x, y, w, h, ms), animaciones (tramo, ms por cuadro, bucle), pivote, origen |
| `Modelo3D` (`txnucleo.modelo3d.v1`) | `*.modelo.json` junto al GLB | caja envolvente en metros, ejes, triángulos, nodos, parámetros, colisión sugerida, etiquetas, QA de kiln, sha256 |
| `ContratoEstilo` (`txnucleo.estilo.v1`) | `estilo.json` | paleta por roles en hex + OKLab, resolución de píxel y escala, luz, hash de las referencias |
| `ManifiestoRecursos` (`txnucleo.recursos.v1`) | `txnucleo.recursos.json` | cada recurso con ruta relativa segura, tipo, sha256, origen (herramienta, fuente, `fuenteSha256`) y licencia |
| `ProyectoRed` (`txnucleo.red.v1`) | `txnucleo.red.json` | carpetas de fuentes, motor, estilo, licencia, animaciones sin bucle, tolerancia de color |

Adaptadores puros (sin Node, usables en el navegador): `enlaces.pxl` (`hojaDesdePxl`, `plantillaPx`,
`clipsDesdeHoja` para `motor.Animador`), `enlaces.kiln` (`leerGlb`, `modeloDesdeKiln`, `programaBloques`),
`enlaces.r2g` (`estiloDesdePaleta`, `puntosEnGrilla`, `reducirPaleta`), `enlaces.cliAnything` (argumentos
seguros y lectura de respuestas), `enlaces` (`planConstruccion`, `revisarColores`, `salidaDeFuente`). Lo que ejecuta
procesos está en `txnucleo/enlaces-node` (`src/infraestructura/enlaces.ts` y `proyecto-red.ts`): siempre sin shell,
con los argumentos como lista. El PNG se lee con `grafico.decodificarPng` (puro, con `inflate` inyectado).

## Importar en el motor

Los contratos son JSON: cada motor los lee a su manera.

**Godot 4** — `integraciones/godot/txnucleo_importar.gd` (copiar al proyecto). Usa el recurso importado si
existe (sirve exportado) y si no, lo lee del disco. Probado con Godot 4.7:
`godot --headless --path integraciones/godot --script res://prueba.gd`.

```gdscript
$Sprite.sprite_frames = TxNucleoImportar.sprite_frames("res://arte/out/personajes/personajes.hoja.json")
$Sprite.play("caminar")
var caja := TxNucleoImportar.modelo("res://modelos/caja.modelo.json")   # GLB + StaticBody3D + grupos
add_child(caja)
```

**Web (Three.js)** — el GLB va directo a `GLTFLoader`; la colisión y las etiquetas salen del `.modelo.json`.
Para sprites, cada cuadro de la hoja es un recorte del PNG (`texture.repeat` / `offset` o un atlas del motor 2D).

```ts
const m = await (await fetch("modelos/caja.modelo.json")).json();
const gltf = await new GLTFLoader().loadAsync(`modelos/${m.glb}`);
gltf.scene.userData = { etiquetas: m.etiquetas, colision: m.colision };
```

**Unity** — GLB con glTFast; la hoja se corta con `Sprite.Create(textura, new Rect(x, alto - y - h, w, h), pivote)`
(Unity cuenta Y desde abajo). Las mecánicas de alto rendimiento siguen en `rust/integraciones/csharp/`.

## Agentes

- **MCP `txnucleo`** (`mcp/servidor.ts`, sin dependencias), 11 herramientas: `buscar_mecanica`, `crear_modelo`,
  `red_doctor`, `iniciar_juego`, `estado_juego`, `construir_juego`, `revisar_estilo`, `verificar_juego`,
  `contrato_estilo`, `generar_sprites`, `generar_modelo`. Protocolo para agentes: `docs/IA.md` sección 15. Dentro del repo, Claude Code lo toma
  de `.mcp.json`. Para usarlo en cualquier carpeta: `claude mcp add --scope user txnucleo -- node <TxNucleo>/mcp/servidor.ts`.
- **Skills** (`skills/`): `txnucleo-prototipo` (de idea a prototipo), `txnucleo-arte` (pxl / kiln),
  `txnucleo-motor` (CLI-Anything + importar contratos). Copiar a `~/.claude/skills/` o al `.claude/skills/` del juego.
- **Plugins de cada herramienta** (opcionales, los instala el usuario): `npm run red -- doctor` muestra el comando
  de cada una.
- **OhMyGame**: ver [OHMYGAME.md](OHMYGAME.md).

## Límites conocidos

- `cli-anything-blender` está registrado pero no se probó en esta máquina (no hay Blender instalado).
- kiln guarda revisiones y caché en `.kiln/` dentro de la carpeta donde se ejecuta: agregar `.kiln/` al `.gitignore` del juego.
- kiln usa render por CPU (suficiente para medidas y QA); para vistas fieles de materiales tiene un servicio GPU
  propio (`kiln service`).
- r2g muestrea colores; no reemplaza el criterio de un artista. Revisar el perfil de color antes de fijar la paleta.
- La plantilla `.px.js` es un punto de partida (bloques del color base), no arte terminado.
