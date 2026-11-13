/* ECO - confere se toda fase dá para terminar: saída e todos os cristais
   alcançáveis a partir do início sem atravessar parede nem buraco.
   Uso: node tools/checa-fases.mjs */
import { EcoLevels } from '../js/levels.js';

let falhas = 0;
for (let i = 0; i < EcoLevels.count; i++) {
  const lv = EcoLevels.parse(i);
  const larg = new Set(lv.tiles.map((r) => r.length));
  if (larg.size !== 1) { console.log(`Fase ${i + 1}: linhas com larguras diferentes`); falhas++; }
  const k = (x, y) => `${x},${y}`;
  const ini = [Math.floor(lv.start.x), Math.floor(lv.start.y)];
  const visto = new Set([k(...ini)]);
  const fila = [ini];
  while (fila.length) {
    const [x, y] = fila.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const t = lv.tiles[ny] && lv.tiles[ny][nx];
      if (!t || t === 'wall' || t === 'pit' || visto.has(k(nx, ny))) continue;
      visto.add(k(nx, ny));
      fila.push([nx, ny]);
    }
  }
  const saida = visto.has(k(Math.floor(lv.exit.x), Math.floor(lv.exit.y)));
  const presos = lv.crystals.filter((c) => !visto.has(k(Math.floor(c.x), Math.floor(c.y))));
  const ok = saida && !presos.length;
  if (!ok) falhas++;
  console.log(`Fase ${i + 1} (${lv.name}): ${ok ? 'OK' : 'FALHA'} - saída ${saida ? 'alcançável' : 'FECHADA'}, cristais presos ${presos.length}/${lv.totalCrystals}`);
}
process.exit(falhas ? 1 : 0);
