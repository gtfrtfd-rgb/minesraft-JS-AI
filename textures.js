/* ============================================================
   textures.js — процедурная генерация текстур блоков.
   Изолирован от логики мира, экспортирует готовый canvas.
   ============================================================ */
window.MC = window.MC || {};
(function (MC) {
'use strict';

// Увеличиваем атлас до 8x8, чтобы вместить разные варианты листвы
const TILE = 16, ACOLS = 8, AROWS = 8;
const atlasCanvas = document.createElement('canvas');
atlasCanvas.width  = TILE * ACOLS;
atlasCanvas.height = TILE * AROWS;
const actx = atlasCanvas.getContext('2d');
const tileImg = actx.createImageData(TILE, TILE);

let _r = 777;
function rnd() {
  _r = (Math.imul(_r, 1103515245) + 12345) & 0x7fffffff;
  return _r / 0x7fffffff;
}

const cl = v => v < 0 ? 0 : v > 255 ? 255 : (v | 0);
function nc(r, g, b, amt) {
  const d = (rnd() - 0.5) * amt;
  return [cl(r + d), cl(g + d), cl(b + d)];
}

function drawTile(index, fn) {
  const tx = (index % ACOLS) * TILE;
  const ty = Math.floor(index / ACOLS) * TILE;
  const d = tileImg.data;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const c = fn(x, y);
      const o = (y * TILE + x) * 4;
      d[o] = c[0]; d[o+1] = c[1]; d[o+2] = c[2];
      d[o+3] = c.length > 3 ? c[3] : 255;
    }
  }
  actx.putImageData(tileImg, tx, ty);
}

// 0: Grass Top (Трава)
drawTile(0, (x, y) => {
  let v = 0;
  if (rnd() > 0.85) v = -12;
  else if (rnd() > 0.85) v = 12;
  return nc(75 + v, 125 + v, 45 + v, 20);
});

// 1: Grass Side (Бок травы)
drawTile(1, (x, y) => {
  let v = 0;
  const edge = 3 + ((x * 5 + 1) % 3);
  if (y < edge) {
    if (rnd() > 0.85) v = -12;
    return nc(75 + v, 125 + v, 45 + v, 20);
  } else {
    if (rnd() > 0.85) v = -15;
    return nc(134 + v, 96 + v, 67 + v, 22);
  }
});

// 2: Dirt (Земля)
drawTile(2, (x, y) => {
  let v = 0;
  if (rnd() > 0.85) v = -20;
  else if (rnd() > 0.85) v = 15;
  return nc(134 + v, 96 + v, 67 + v, 22);
});

// 3: Stone (Камень)
drawTile(3, (x, y) => {
  let c = 130;
  c += (rnd() - 0.5) * 16;
  if (rnd() > 0.88) c -= 18;
  else if (rnd() < 0.08) c += 12;
  if (x === y && x > 2 && x < 12) c -= 12;
  if (x + y === 15 && x > 4 && x < 10) c -= 8;
  return nc(c, c, c, 0);
});

// 4: Cobblestone (Булыжник)
const cSeeds = [];
for (let i = 0; i < 16; i++) {
  const gx = (i % 4) * 4 + 2;
  const gy = Math.floor(i / 4) * 4 + 2;
  cSeeds.push({ x: gx + (rnd() - 0.5) * 3.0, y: gy + (rnd() - 0.5) * 3.0 });
}

drawTile(4, (x, y) => {
  let d1 = 999, d2 = 999, cx = 0, cy = 0;
  for (let i = 0; i < cSeeds.length; i++) {
    const dx = x - cSeeds[i].x;
    const dy = y - cSeeds[i].y;
    const dist = dx * dx + dy * dy;
    if (dist < d1) { d2 = d1; d1 = dist; cx = cSeeds[i].x; cy = cSeeds[i].y; } 
    else if (dist < d2) { d2 = dist; }
  }
  if (d2 - d1 < 2.5) return nc(50, 50, 50, 15);
  let c = 110 + ((Math.floor(cx) * 7 + Math.floor(cy) * 13) % 4) * 12;
  c += (rnd() - 0.5) * 12;
  if (d2 - d1 < 12.0) {
    if (y < cy) c += 18;
    if (y > cy) c -= 18;
    if (x < cx) c += 8;
    if (x > cx) c -= 8;
  }
  return nc(c, c, c, 0);
});

// 5: Sand (Песок)
drawTile(5, (x, y) => {
  let v = 0;
  if (rnd() > 0.9) v = -15;
  return nc(218 + v, 206 + v, 158 + v, 12);
});

// 6: Wood Side (Бок дерева)
drawTile(6, (x, y) => {
  let v = 0;
  if (x % 4 === 0 || x % 4 === 1) v = -20;
  else if (x % 4 === 3) v = 10;
  return nc(108 + v, 82 + v, 48 + v, 12);
});

// 7: Wood Top (Срез дерева)
drawTile(7, (x, y) => {
  const dx = x - 7.5, dy = y - 7.5;
  const dist = Math.sqrt(dx * dx + dy * dy);
  let v = 0;
  if (dist > 6) return nc(108, 82, 48, 10);
  v = Math.sin(dist * 2.5) * 12;
  return nc(152 + v, 118 + v, 74 + v, 10);
});

// --- ЛИСТВА (Прозрачные) ---
function drawLeafTile(index, seed) {
  let _lr = seed;
  function lrnd() {
    _lr = (Math.imul(_lr, 1103515245) + 12345) & 0x7fffffff;
    return _lr / 0x7fffffff;
  }
  drawTile(index, (x, y) => {
    const isEdge = (x === 0 || x === 15 || y === 0 || y === 15);
    const r = lrnd();
    if (!isEdge && r < 0.12) return [0, 0, 0, 0];
    if (!isEdge && r < 0.32) return [25, 50, 20, 255];
    let c = 0;
    if (r > 0.85) c = 20;
    else c = (lrnd() - 0.5) * 15;
    return nc(55 + c, 125 + c, 40 + c, 10);
  });
}
drawLeafTile(8, 123);  // Бок (ось Z)
drawLeafTile(14, 456); // Верх и низ
drawLeafTile(15, 789); // Бок (ось X)

// --- ЛИСТВА (Непрозрачные) ---
function drawOpaqueLeafTile(index, seed) {
  let _lr = seed;
  function lrnd() {
    _lr = (Math.imul(_lr, 1103515245) + 12345) & 0x7fffffff;
    return _lr / 0x7fffffff;
  }
  drawTile(index, (x, y) => {
    const r = lrnd();
    let c = 0;
    // "Дырки" закрашиваются темно-зеленым, чтобы создать иллюзию глубины
    if (r < 0.32) c = -30; 
    else if (r > 0.85) c = 20;
    else c = (lrnd() - 0.5) * 15;
    return nc(55 + c, 125 + c, 40 + c, 10);
  });
}
drawOpaqueLeafTile(16, 123);  // Бок (ось Z)
drawOpaqueLeafTile(17, 456);  // Верх и низ
drawOpaqueLeafTile(18, 789);  // Бок (ось X)

// 9: Planks (Доски)
drawTile(9, (x, y) => {
  let v = 0;
  if (y % 4 === 0) v = -30;
  else if (((x + ((y / 4) | 0) * 7) % 8) === 0) v = -20;
  return nc(166 + v, 134 + v, 84 + v, 16);
});

// 10: Brick (Кирпич)
drawTile(10, (x, y) => {
  const row = (y / 4) | 0;
  const off = (row % 2) * 4;
  if (y % 4 === 0 || ((x + off) % 8) === 0) return nc(190, 185, 180, 10);
  return nc(155, 70, 50, 15);
});

// 11: Glass (Стекло)
drawTile(11, (x, y) => {
  if (x === 0 || y === 0 || x === 15 || y === 15) return [212, 236, 245, 255];
  if ((x === 2 && y < 6) || (y === 2 && x < 6)) return [238, 250, 255, 170];
  return [188, 226, 240, 55];
});

// 12: Snow (Снег)
drawTile(12, (x, y) => nc(242, 246, 250, 12));

// 13: Obsidian (Обсидиан)
drawTile(13, (x, y) => {
  let v = 0;
  if (rnd() > 0.9) v = 15;
  return nc(38 + v, 28 + v, 58 + v + 10, 18);
});

MC.atlasCanvas = atlasCanvas;
MC.ACOLS = ACOLS;
MC.AROWS = AROWS;

console.log('[textures.js] атлас текстур сгенерирован (8x8).');

})(window.MC);