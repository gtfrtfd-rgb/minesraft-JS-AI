/* ============================================================
   raycast.js — DDA-рейкаст, ломание/установка блоков,
   атака мобов, подсветка цели.
   ============================================================ */
(function () {
'use strict';

const G = window.GAME;
if (!G) return;

const SFX = G.SFX;

/* --- Подсветка блока --- */
const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
const hlMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 });
const hlBox = new THREE.LineSegments(hlGeo, hlMat);
hlBox.visible = false;
G.scene.add(hlBox);

/* --- ОПТИМИЗАЦИЯ: переиспользуемые объекты для результатов рейкаста --- */
const _hitResult = { x: 0, y: 0, z: 0, prev: { x: 0, y: 0, z: 0 } };
const _hitNoPrev = { x: 0, y: 0, z: 0, prev: null };

/* --- DDA-рейкаст --- */
function raycastBlock() {
  const camera = G.camera;
  G._dir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
  const dx = G._dir.x, dy = G._dir.y, dz = G._dir.z;
  const RANGE = 6;

  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  if (G.isSolid(x, y, z)) {
    _hitNoPrev.x = x; _hitNoPrev.y = y; _hitNoPrev.z = z;
    return _hitNoPrev;
  }

  const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
  const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
  const stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);

  const invX = dx !== 0 ? 1 / Math.abs(dx) : Infinity;
  const invY = dy !== 0 ? 1 / Math.abs(dy) : Infinity;
  const invZ = dz !== 0 ? 1 / Math.abs(dz) : Infinity;

  let tMaxX = stepX !== 0
    ? (stepX > 0 ? (x + 1 - ox) : (ox - x)) * invX
    : Infinity;
  let tMaxY = stepY !== 0
    ? (stepY > 0 ? (y + 1 - oy) : (oy - y)) * invY
    : Infinity;
  let tMaxZ = stepZ !== 0
    ? (stepZ > 0 ? (z + 1 - oz) : (oz - z)) * invZ
    : Infinity;

  const tDeltaX = stepX !== 0 ? invX : Infinity;
  const tDeltaY = stepY !== 0 ? invY : Infinity;
  const tDeltaZ = stepZ !== 0 ? invZ : Infinity;

  let prevX = x, prevY = y, prevZ = z;

  for (let i = 0; i < 64; i++) {
    let t;
    prevX = x; prevY = y; prevZ = z;

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; }
      else               { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; }
    } else {
      if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; }
      else               { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; }
    }

    if (t > RANGE) return null;

    if (G.isSolid(x, y, z)) {
      _hitResult.x = x; _hitResult.y = y; _hitResult.z = z;
      _hitResult.prev.x = prevX; _hitResult.prev.y = prevY; _hitResult.prev.z = prevZ;
      return _hitResult;
    }
  }
  return null;
}

function stopBreaking() {
  G.breaking.active = false;
  G.breaking.progress = 0;
  G.breaking.stage = 0;
  G.breaking.target = null;
  G.breaking.soundTimer = 0;
  if (G.crackMesh) G.crackMesh.visible = false;
}

function tryAttackMob() {
  if (G.attackTimer > 0) return false;
  G._hitDir.set(0, 0, -1).applyQuaternion(G.camera.quaternion);
  const hit = G.MOBS.raycast(G.camera.position, G._hitDir, G.ATTACK_RANGE);
  if (!hit) return false;
  G.MOBS.hit(hit.mob, G.PLAYER_DAMAGE, G.player.pos.x, G.player.pos.z);
  G.attackTimer = G.ATTACK_COOLDOWN;
  return true;
}

function updateBreaking(dt) {
  if (!G.locked || !G.mouseDown[0] || !G.currentTarget || G.dead || G.paused) {
    if (G.breaking.active) stopBreaking();
    else if (G.crackMesh) G.crackMesh.visible = false;
    return;
  }

  if (G.gameMode === 'creative' && G.creativeBrokeThisClick) {
    if (G.breaking.active) stopBreaking();
    else if (G.crackMesh) G.crackMesh.visible = false;
    return;
  }

  const t = G.currentTarget;
  if (t.y <= 0) { stopBreaking(); return; }

  const b = G.breaking;
  if (!b.active || !b.target ||
      b.target.x !== t.x || b.target.y !== t.y || b.target.z !== t.z) {
    b.active = true;
    b.target = { x: t.x, y: t.y, z: t.z };
    b.progress = 0;
    b.stage = 0;
    b.soundTimer = 0; // Сбрасываем таймер при смене цели
    G.crackMat.map = G.crackTextures[0];
  }

  const id = G.world[G.IDX(t.x, t.y, t.z)];

  if (G.gameMode === 'creative') {
    b.progress = 1;
  } else {
    const hardness = G.HARDNESS[id] || 1.0;
    b.progress += dt / hardness;
  }

  const stage = Math.min(10, Math.floor(b.progress * 10) + 1);
  if (stage !== b.stage) {
    b.stage = stage;
    G.crackMat.map = G.crackTextures[stage - 1];
  }

  // Воспроизводим ритмичный звук удара
  if (G.gameMode !== 'creative' && b.progress < 1) {
    b.soundTimer -= dt;
    if (b.soundTimer <= 0) {
      b.soundTimer = 0.22 + Math.random() * 0.08; // Интервал между ударами
      SFX.hit(id);
    }
  }

  if (G.crackMesh) {
    G.crackMesh.visible = true;
    G.crackMesh.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
  }

  if (b.progress >= 1) {
    G.world[G.IDX(t.x, t.y, t.z)] = 0;
    G.rebuildAround(t.x, t.z);
    if (G.api.save) G.api.save.markDirty();
    SFX.break(id); // Финальный звук разрушения

    if (G.gameMode === 'creative') G.creativeBrokeThisClick = true;
    stopBreaking();

    G.currentTarget = null;
    if (hlBox) hlBox.visible = false;
  }
}

function placeBlock() {
  if (!G.currentTarget || !G.currentTarget.prev) return;
  const p = G.currentTarget.prev;
  if (p.x < 0 || p.x >= G.SX || p.y < 0 || p.y >= G.SY || p.z < 0 || p.z >= G.SZ) return;
  if (G.world[G.IDX(p.x, p.y, p.z)] !== 0) return;

  const PR = G.PR, PH = G.PH;
  const pp = G.player.pos;
  const px0 = pp.x - PR, px1 = pp.x + PR;
  const py0 = pp.y,      py1 = pp.y + PH;
  const pz0 = pp.z - PR, pz1 = pp.z + PR;
  if (p.x + 1 > px0 && p.x < px1 && p.y + 1 > py0 && p.y < py1 && p.z + 1 > pz0 && p.z < pz1) return;

  if (G.MOBS.isBlockOccupied && G.MOBS.isBlockOccupied(p.x, p.y, p.z)) return;

  const id = G.HOTBAR[G.selected];
  G.world[G.IDX(p.x, p.y, p.z)] = id;
  G.rebuildAround(p.x, p.z);
  if (G.api.save) G.api.save.markDirty();
  SFX.place(id);
}

function updateHighlight() {
  const t = G.currentTarget;
  if (t) {
    hlBox.visible = true;
    hlBox.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
  } else {
    hlBox.visible = false;
  }
}

G.api.raycast = {
  raycastBlock,
  updateBreaking,
  placeBlock,
  stopBreaking,
  tryAttackMob,
  updateHighlight
};

})();