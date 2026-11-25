# Reglas horneadas y prototipos jugables

`txn nuevo "<idea>"` convierte una frase en un juego que se puede jugar. Esta página explica cómo, y por qué los
números son los que son.

## La idea central: hornear las reglas

TxNucleo calcula con sus mecánicas reales (`ModeloBalance`, curvas de experiencia, tablas de rareza, arquetipos de
`datos.criaturas`) **las tablas** que un juego necesita, y las escribe en `reglas.json`:

| Tabla | De dónde sale |
|---|---|
| `jugador.porNivel` (vida, golpe, defensa) | `ModeloBalance.poder(nivel)` con la curva de poder del modelo |
| `jugador.expParaSubir` | Curva de experiencia del modelo, o la de prototipo (ver abajo) |
| `enemigos[].porNivel` (vida, daño efectivo, golpe recibido, exp) | `ModeloBalance.enemigo(nivel, pesoVida, pesoAtaque)` con la mitigación ya aplicada |
| `jefe.porNivel` | `ModeloBalance.jefe(nivel)` |
| `botin.probabilidades` | `botin.probabilidadesRareza(tabla, nivel)` |
| `oleadas` | Presupuesto creciente repartido por peso y costo de los arquetipos (azar con semilla) |

El motor (Godot, web, Unity…) **no reimplementa fórmulas**: lee tablas. El bot de pruebas usa exactamente los mismos
números. Cambiar el modelo de balance y volver a hornear (`txn rehornear`) cambia todo el juego de una vez.

Código: `src/enlaces/horneado.ts` (`hornearReglas`, `analizarBalance`, `armaDe`, `familiaDe`).

## Del texto a los modelos

`modelos.interpretarIdea(frase)` (`src/modelos/idea.ts`) busca raíces de palabras (sin acentos) y responde las 12
preguntas del asistente. Devuelve también qué palabra activó cada respuesta, para que la persona vea qué entendió y
lo corrija. Después `recomendar` elige y combina los modelos de género.

- **Arma del jugador**: si la idea lo dice ("espada" → cuerpo a cuerpo, "armas"/"magia" → a distancia), manda la
  idea; si no, `armaDe` compara los rasgos `nucleo:disparar` + `nucleo:habilidades` contra `nucleo:cuerpo-a-cuerpo`
  de los modelos combinados.
- **Enemigos**: la ambientación de la idea elige la familia del catálogo (zombi, soldado, fantasía, máquina).

## Modo prototipo: medido con el bot

`ModeloBalance` razona peleas **de a uno** ("el jugador aguanta 12 golpes de un común"). En un juego de hordas al
jugador lo tocan varios a la vez, y la curva de experiencia de un RPG completo es lenta para un prototipo. Por eso
el horneado tiene dos modos (`progresion` en `reglas.json`):

- **`prototipo`** (por defecto en `txn nuevo`): experiencia para subir = experiencia del común × (8 + 1,5 · nivel),
  y un **ajuste de multitud** registrado en `reglas.json` (`ajusteMultitud`): vida de comunes × 0,35, daño de
  comunes ÷ 3, vida del jefe × 0,12, daño del jefe ÷ 3.
- **`modelo`**: las curvas del modelo tal cual (`txn rehornear --progresion modelo`).

Los multiplicadores no son a ojo. Se midieron con el bot (8 semillas, 300 s) sobre varias combinaciones:

| Ajuste | Zombis (a distancia) | ARPG (a distancia) | Hack and slash (cuerpo) |
|---|---|---|---|
| Sin ajuste | muere en oleada 2 (≈23 s) | oleada 2 (≈18 s) | oleada 3,6 (≈49 s) |
| Comunes × 0,35 / ÷ 3, jefe × 0,25 / ÷ 3 | oleada 12,8 (≈200 s) | — | muere en el primer jefe |
| **Final** (jefe × 0,12, jefe ataca cada 1,5 s, tiradores retroceden a media velocidad) | oleada 21, 8/8 vivos | oleada 27, 8/8 | oleada 18, 5/8 |

`txn balance` muestra la tabla por nivel y marca lo que sale de rango (un común muere de un golpe, el jugador muere
en menos de 3, más de 60 enemigos para subir, más de 6 s para matar a un común).

## La plantilla jugable: acción cenital

Una arena vista desde arriba con movimiento, esquive, ataque automático (a distancia o en arco cuerpo a cuerpo),
oleadas con jefe cada 5, experiencia por gemas con imán, subida de nivel, cofres de botín por rareza que suben el
poder, interfaz y fin de partida. Es el punto de partida de muchos géneros de acción; para otros (cartas,
carreras, estrategia) el `PLAN.md` dice qué módulos de TxNucleo usar para reemplazarla.

- `web/simulacion.js`: lógica pura y determinista (sin DOM). La usan el navegador (`web/juego.js`) y el bot.
- `simulacion.gd`: la **misma lógica** portada a GDScript, con el **mismo generador de azar** (mulberry32).
- `herramientas/paridad.ts` (corre en `verificar.sh`): el bot juega en JS y en Godot con las mismas semillas y
  los resultados deben ser **idénticos** (bajas, botín por rareza, vida final). La misma partida en dos motores.

## Arte desde los datos

`arteDePlantilla(reglas, paleta)` escribe `arte/personajes.px.js` con sprites base propios (jugador, criatura, jefe,
gema, cofre, proyectil) y **variantes derivadas de las tablas**: un enemigo por tipo de `reglas.enemigos` (tono
girado en OKLab) y un cofre por rareza de `reglas.botin` (con los colores de la tabla). La paleta sale del contrato
de estilo (`--referencia img.png`) o de una paleta propia por familia. Es una **fuente**: se edita y se construye
con `txn construir`.

Para 3D, `txn variantes armas` escribe un `.kiln.js` a escala por cada arma del catálogo (largo real por categoría).
