---
name: txnucleo-arte
description: Producir arte de juego con la red TxNucleo - sprites de pixel art con claude-pxl (.px.js) o modelos 3D con Kiln (.kiln.js) - respetando el contrato de estilo, construyendo con `construir` y leyendo la revisión de estilo. Usar al crear o cambiar sprites, animaciones, iconos, tiles, armas, enemigos o utilería.
---

# Arte con pxl (2D) y kiln (3D)

Editás **fuentes**; `construir_juego` (o `red construir`) genera PNG/GLB, contratos y manifiesto. Las carpetas
salen de `txnucleo.red.json` (`arte2d`, por defecto `arte/`; `arte3d`, por defecto `modelos/`).

| Pide | Herramienta | Fuente | Salidas |
|---|---|---|---|
| Sprites, animaciones, tiles, iconos | pxl | `arte/<nombre>.px.js` | `arte/out/<nombre>/*.png` + `*.hoja.json` |
| Modelos, armas, utilería, escenario 3D | kiln | `modelos/<nombre>.kiln.js` | `modelos/<nombre>.glb` + `.modelo.json` |

## Pixel art (pxl)

1. Partir de la plantilla con la paleta del estilo: `plantilla-px estilo.json --sprites a,b --out arte/x.px.js`
   (la hoja se llama como el archivo). **No agregues colores fuera de `pal(...)`**.
2. Dibujar con la DSL: sprites como grillas de letras (`.` = transparente), `mx` simetría, `outline`, `swap` para
   variantes de color, `anim()` + `frame()` para animación. Referencia: `reference.md` de pxl en
   `$TXNUCLEO_RED/pxl` (o `~/.txnucleo/red/pxl`).
3. Animaciones de una sola vez (muerte, ataque): agregarlas a `sinBucle` en `txnucleo.red.json`.
4. `construir_juego` y leer `estilo`: cada imagen trae `fraccionAjena` y los colores ajenos con su `rolCercano`.
   Si vienen de `light`/`shade`, proponé sumarlos al estilo o subir `toleranciaColor`; si no, usá las letras de
   la paleta.
5. En código TxNucleo: `enlaces.pxl.clipsDesdeHoja(hoja)` da los clips de `motor.Animador`.

## Modelos 3D (kiln)

1. Partir de los bloques del asistente (`modelos/*.kiln.js`, ya a escala en metros, +Y arriba) o de
   `enlaces.kiln.programaBloques(nombre, piezas)` / `enlaces.bloquesDeArma(categoria)`.
2. Refinar con los helpers de kiln (`kiln discover --query <helper>`): `gameMaterial(color, { metalness })`
   lleva el color PRIMERO. Nombrá las piezas (`createPart('cabeza', ...)`): el juego las usa para hitboxes.
3. `construir_juego` y leer el `.modelo.json`: `qa` (aprobado/rechazado), `avisos`, `caja` (medidas) y la
   `colision` sugerida (caja o cápsula).

## Reglas

- La fuente es el arte de verdad y va al repositorio; nunca edites PNG/GLB ni contratos a mano.
- Nada de arte calcado de juegos comerciales ni packs sin licencia: la licencia va en el manifiesto.
