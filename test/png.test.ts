// Decodificador PNG contra archivos de otro codificador (Pillow, con filtros y compresión real) y ida y vuelta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { codificarPng, decodificarPng } from "../src/grafico/png.ts";

const inflar = (b: Uint8Array): Uint8Array => new Uint8Array(inflateSync(b));
const leer = (n: string) => decodificarPng(new Uint8Array(readFileSync(new URL(`./fixtures/png/${n}`, import.meta.url))), inflar);
/** El patrón con el que se generaron rgba.png, rgb.png y gris_alfa.png. */
const esperado = (x: number, y: number) => [(x * 11) % 256, (y * 23) % 256, (x * y * 7) % 256, (x + y) % 5 ? 255 : 0] as const;

test("png: RGBA y RGB con filtros de Pillow, pixel por pixel", () => {
  const rgba = leer("rgba.png")!, rgb = leer("rgb.png")!;
  assert.equal(rgba.w, 23);
  assert.equal(rgba.h, 11);
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 23; x++) {
      const [r, g, b, a] = esperado(x, y);
      const i = (y * 23 + x) * 4;
      assert.deepEqual([...rgba.datos.subarray(i, i + 4)], [r, g, b, a], `rgba ${x},${y}`);
      assert.deepEqual([...rgb.datos.subarray(i, i + 4)], [r, g, b, 255], `rgb ${x},${y}`);
    }
  }
});

test("png: paleta con transparencia y gris con alfa", () => {
  const p = leer("paleta.png")!;
  assert.equal(p.w, 9);
  assert.deepEqual([...p.datos.subarray(0, 4)], [20, 10, 30, 0], "índice 0 transparente por tRNS");
  assert.deepEqual([...p.datos.subarray(4, 8)], [200, 40, 40, 255]);
  assert.deepEqual([...p.datos.subarray(8, 12)], [56, 183, 100, 255]);
  const ga = leer("gris_alfa.png")!;
  assert.equal(ga.datos[3], 0, "alfa del (0,0)");
  assert.equal(ga.datos[0], ga.datos[1]);
});

test("png: ida y vuelta con el codificador propio; basura → null", () => {
  const im = leer("rgba.png")!;
  const otra = decodificarPng(codificarPng(im), inflar)!;
  assert.deepEqual([...otra.datos], [...im.datos]);
  assert.equal(decodificarPng(new Uint8Array(40), inflar), null);
});
