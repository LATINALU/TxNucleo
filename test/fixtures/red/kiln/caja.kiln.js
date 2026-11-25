const meta = { name: 'CajaSuministros' };
const P = defineParams({
  lado: { type: 'range', default: 0.6, min: 0.3, max: 1.2, step: 0.05, unit: 'm' },
  color: { type: 'color', default: '#6b5a3a' },
});
function build() {
  const root = createRoot('CajaSuministros');
  const madera = gameMaterial(P.color);
  const metal = gameMaterial('#3a3f44', { metalness: 0.6 });
  createPart('Cuerpo', boxGeo(P.lado, P.lado * 0.7, P.lado), madera, { parent: root, position: [0, P.lado * 0.35, 0] });
  createPart('Banda', boxGeo(P.lado * 1.02, P.lado * 0.08, P.lado * 1.02), metal, { parent: root, position: [0, P.lado * 0.5, 0] });
  return root;
}
