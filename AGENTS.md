# Instrucciones para agentes de IA que trabajan con TxNucleo

Leé **`docs/IA.md`** antes de escribir código: es el manual completo (modelo mental, flujo de 0 a 100, recetas por
género, feedback, red, errores típicos). Qué existe exactamente: **`docs/INDICE.md`** y **`docs/catalogo.json`**
(generados desde el código; si algo no está ahí, no existe: no lo inventes).

## Comandos

```bash
npm test             # todas las pruebas (incluye golden master y reglas de arquitectura)
npm run tipos        # TypeScript estricto (tsc --noEmit)
npm run indice       # regenera docs/INDICE.md y docs/catalogo.json (correr tras agregar/quitar exportaciones)
npm run golden       # regenera vectores/golden.json (solo si una simulación cambió A PROPÓSITO)
txn nuevo "<idea>"   # de una frase a un prototipo jugable (Godot + web), reglas horneadas, arte desde datos, bot
txn probar --godot   # bot sin pantalla en JS y Godot (misma partida) · txn balance · txn informe
node herramientas/paridad.ts   # (con GODOT) la simulación JS y la de Godot deben dar resultados idénticos
npm run crear        # asistente de preguntas → modelos combinados → txnucleo.juego.json + PLAN.md (+ --estilo estilo.json)
npm run red -- doctor   # red de herramientas externas (pxl, kiln, r2g, CLI-Anything): qué falta; ver docs/RED.md
npm --prefix <TxNucleo> run red -- estado|construir|revisar-estilo|verificar   # desde la carpeta de un juego
npm run ejemplo:red  # recorrido completo: estilo → sprites → modelo 3D → manifiesto verificado
node vectores/contratos.ts   # regenera vectores/contratos.json (validación de contratos TS = Python)
node vectores/generar.ts && (cd rust && cargo test && cargo build --release) && (cd python && python -I pruebas/test_herramientas.py)
(cd rust && cargo run --release --example rendimiento)   # benchmark (comparar con node ejemplos/rendimiento.ts)
```

Requiere Node ≥ 23.6 (ejecuta `.ts` directo, sin compilar).

## Reglas no negociables

1. **Dominio puro**: `src/contextos/*/dominio` y `src/nucleo` no importan de `motor`, `grafico`, `red`,
   `infraestructura`, `modelos` ni `datos` (hay un test).
2. **Azar y tiempo inyectados**: nada de `Math.random()`, `Date.now()`, `performance.now()` en reglas (hay un test).
3. **Sin números de ningún juego**: las reglas reciben su configuración; los números de partida viven en
   `src/modelos/piezas.ts` y `src/datos/`. Nunca copies estadísticas, nombres o textos de juegos comerciales.
4. **Sin topes artificiales**: todo escalado es una `Curva` (`src/nucleo/escalado.ts`) que acepta cualquier nivel.
5. **`Resultado`** (`exito`/`fallo`) para casos esperados; excepciones solo para bugs.
6. Cada archivo nuevo empieza con un comentario de cabecera y cada exportación con JSDoc (el índice los usa).
7. Cada regla nueva lleva test con semilla fija; cada simulación por pasos nueva, un escenario en `vectores/golden.ts`.
8. Español en nombres y comentarios (convención del proyecto).

## Mapa rápido

- `src/nucleo` azar (Pcg32), reloj, Resultado, eventos, geometría 2D, `vec3`, **curvas**.
- `src/motor` bucle fijo, ECS, FSM, entrada, cámara · `src/espacial` colisiones 2D y **3D** · `src/red` netcode y
  **compensación de lag**.
- `src/contextos/<x>` 28 contextos: combate, disparos, fisica, balance, botin, progresion, economia, encuentros, ia,
  navegacion, mundo, moba, vision, grupo, supervivencia, turnos, mazo, estrategia, carreras, competitivo, feedback,
  feel, audio, coleccion, inventario, narrativa, roguelite, social.
- `src/modelos` 58 modelos combinables, `combinar`, asistente (`PREGUNTAS`, `recomendar`, `planDeImplementacion`).
- `src/datos` catálogos propios: armas, vehículos, criaturas, rpg.
- `rust/` núcleo de ALTO RENDIMIENTO (rayos 3D con grilla, hordas paralelas, niebla, balística) + ABI C
  (`include/txnucleo.h`, `src/ffi.rs`) + adaptador C# para Unity/Godot + **GDExtension para Godot 4**
  (`rust/godot/`, `./construir.sh`, prueba: `godot --headless --path rust/godot/demo --script res://prueba.gd`).
  Cuándo usarlo: `docs/RUST.md`.
- `python/`, `cpp/` ports verificados contra `vectores/vectores.json`.
- `src/enlaces` **red de herramientas**: contratos (`HojaSprites`, `Modelo3D`, `ContratoEstilo`,
  `ManifiestoRecursos`), registro, adaptadores puros y plan de arte; procesos en `src/infraestructura/enlaces.ts`
  (siempre sin shell). MCP propio en `mcp/servidor.ts`, skills en `skills/`, importador Godot en
  `integraciones/godot/`. No copiar código de las herramientas: se instalan con `npm run red -- instalar`.
  Proyecto por juego: `txnucleo.red.json` (`src/enlaces/proyecto.ts`, `src/infraestructura/proyecto-red.ts`).
  Prototipos: `src/enlaces/horneado.ts` (reglas horneadas), `arte-plantilla.ts`, `src/modelos/idea.ts`,
  `src/infraestructura/nuevo.ts`, plantilla en `plantillas/accion-cenital/` (simulacion.js = simulacion.gd: si
  cambiás una, cambiá la otra). Protocolo de prototipos: `docs/IA.md` sección 16; detalle: `docs/HORNEADO.md`.
  Protocolo para agentes: `docs/IA.md` sección 15; guía humana: `docs/USO.md`. Editar solo fuentes
  (`.px.js`, `.kiln.js`); las salidas las regenera `construir`.
- Referencias: `docs/SHOOTER-3D.md` (pedido más común), `docs/MOTORES.md` (Unity/Godot/Unreal).
