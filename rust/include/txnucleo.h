/* txnucleo.h — ABI C del núcleo Rust de txnucleo (ver rust/src/ffi.rs y docs/RUST.md).
 *
 * Compilar la biblioteca:   cd rust && cargo build --release
 *   Windows: target/release/txnucleo.dll   Linux: target/release/libtxnucleo.so   macOS: target/release/libtxnucleo.dylib
 *
 * Reglas: los objetos opacos se crean con *_nueva y se liberan con *_liberar. Pasar lotes (muchos rayos, todos los
 * agentes) por llamada: cruzar la frontera nativa cuesta. Punteros nulos devuelven 0/NULL, nunca abortan.
 */
#ifndef TXNUCLEO_H
#define TXNUCLEO_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct Escena3D Escena3D;
typedef struct Horda Horda;
typedef struct NieblaGuerra NieblaGuerra;

/* Dueño especial: sin dueño (paredes). */
#define TXN_SIN_DUENIO 0xFFFFFFFFu

typedef struct TxnImpacto {
  uint32_t id;
  uint32_t duenio;
  uint32_t etiqueta;
  float t; /* distancia; negativa = sin impacto */
} TxnImpacto;

uint32_t txn_version_abi(void);

/* ---- Escena 3D (disparos, línea de visión) ---- */
Escena3D* txn_escena_nueva(float celda);
void txn_escena_liberar(Escena3D* e);
void txn_escena_esfera(Escena3D* e, uint32_t id, uint32_t duenio, uint32_t etiqueta, float x, float y, float z, float radio);
void txn_escena_caja(Escena3D* e, uint32_t id, uint32_t duenio, uint32_t etiqueta, float x0, float y0, float z0, float x1, float y1, float z1);
void txn_escena_capsula(Escena3D* e, uint32_t id, uint32_t duenio, uint32_t etiqueta, float ax, float ay, float az, float bx, float by, float bz, float radio);
void txn_escena_mover(Escena3D* e, uint32_t duenio, float dx, float dy, float dz);
void txn_escena_limpiar(Escena3D* e);
/* rayos: n × [ox, oy, oz, dx, dy, dz, largo]; ignorar: n dueños (o NULL); salida: n impactos. Devuelve cuántos pegaron. */
uint32_t txn_escena_rayos(Escena3D* e, const float* rayos, const uint32_t* ignorar, uint32_t n, TxnImpacto* salida);

/* ---- Horda: campo de flujo + multitud ---- */
Horda* txn_horda_nueva(int32_t cols, int32_t filas, const uint8_t* bloqueo, float tile, float velocidad, float aceleracion, float radio, float separacion);
void txn_horda_liberar(Horda* h);
uint32_t txn_horda_agregar(Horda* h, float x, float y);
void txn_horda_objetivo(Horda* h, int32_t c, int32_t f);
void txn_horda_paso(Horda* h, float dt);
/* Copia [x0, y0, x1, y1, ...]; devuelve cuántos agentes copió. */
uint32_t txn_horda_posiciones(const Horda* h, float* salida, uint32_t capacidad);

/* ---- Niebla de guerra ---- */
NieblaGuerra* txn_niebla_nueva(int32_t cols, int32_t filas, const uint8_t* bloqueo);
void txn_niebla_liberar(NieblaGuerra* n);
/* fuentes: k × [x, y, radio]. Devuelve cols×filas bytes (0 oculta, 1 explorada, 2 visible) válidos hasta la próxima llamada. */
const uint8_t* txn_niebla_actualizar(NieblaGuerra* n, const float* fuentes, uint32_t k);

#ifdef __cplusplus
}
#endif

#endif /* TXNUCLEO_H */
