// Fixture propia de TxNucleo: un bicho con dos colores, una gema y una animación de respirar.
pal({ k: "#1a1c2c", v: "#38b764", V: "#a7f070", r: "#b13e53", o: "#ef7d57", a: "#3b5dc9", w: "#f4f4f4" })

sprite("bicho", { mx: true, outline: "k" }, `
  ...vvv
  ..vVVv
  .vvwkv
  vvvvvv
  .vvvvv`)
sprite("bicho_rojo", { base: "bicho", swap: { v: "r", V: "o" } })
sprite("gema", { mx: "c", outline: "k" }, `
  .a.
  awa
  aaa
  .a.`)
anim("respira", { base: "bicho", fps: 4 }, frame(), frame(grid(5, 0, "VV")))

sheet("bichos", ["bicho*", "gema"], { cols: 3, pad: 1 })
