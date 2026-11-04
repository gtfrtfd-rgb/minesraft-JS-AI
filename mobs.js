/* ============================================================
   mobs.js — Фабрика мобов (текстуры, модели, спавн, сериализация).
   Физика и AI делегированы в mob-ai.js.
   ============================================================ */
window.MOBS = (function () {
'use strict';

if (!window.MC || !window.MOB_AI) {
  console.warn('[mobs.js] world.js или mob-ai.js не загрузился — мобы недоступны');
  const noop = function () {};
  return {
    init: noop, update: noop, spawnInitial: noop, spawnAt: noop,
    clear: noop, serialize: function () { return []; },
    deserialize: noop, count: function () { return 0; },
    raycast: function () { return null; }, hit: function () { return false; },
    rebuildTextures: noop, isBlockOccupied: function () { return false; },
    setMuted: noop
  };
}

const MC = window.MC;
const SX = MC.SX, SZ = MC.SZ, SY = MC.SY;
const CS = MC.CS;
const world = MC.world, IDX = MC.IDX;

let scene = null;
const mobs = [];

let playerPos = null;
let lastMobSoundTime = -99999;
let renderDistBlocks = 6 * CS;
let soundsMuted = false;

const SOUND_MIN_DIST2 = 15 * 15;

function setMuted(v) { soundsMuted = !!v; }

/* ============================================================
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ТЕКСТУР
   ============================================================ */
function newTexCanvas(px) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  return c;
}

function finalizeTex(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* ============================================================
   ТЕКСТУРЫ
   ============================================================ */
// --- КОРОВА ---
function makeCowHideTex() {
  const px = 32;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a2c17'; 
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(4, 4, 10, 12);
  ctx.fillRect(2, 8, 4, 6);
  ctx.fillRect(12, 2, 4, 4);
  ctx.fillRect(18, 18, 12, 12);
  ctx.fillRect(22, 12, 8, 6);
  ctx.fillRect(6, 24, 8, 6);
  return finalizeTex(c);
}
function makeCowHeadTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a2c17';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(4, 0, 8, 3);
  return finalizeTex(c);
}
function makeCowFaceTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a2c17';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(6, 0, 4, 6);
  ctx.fillRect(0, 8, 16, 8);
  ctx.fillStyle = '#e5b3b3';
  ctx.fillRect(2, 10, 12, 4);
  ctx.fillStyle = '#a67a7a';
  ctx.fillRect(4, 11, 2, 2);
  ctx.fillRect(10, 11, 2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(2, 4, 3, 3);
  ctx.fillRect(11, 4, 3, 3);
  ctx.fillStyle = '#000000';
  ctx.fillRect(3, 5, 2, 2);
  ctx.fillRect(12, 5, 2, 2);
  return finalizeTex(c);
}
function makeCowLegTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a2c17';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#dcd2c6';
  ctx.fillRect(0, 12, 16, 4); 
  return finalizeTex(c);
}
const COW_TEX = {
  hide: makeCowHideTex(), head: makeCowHeadTex(), face: makeCowFaceTex(), leg: makeCowLegTex(),
  horn: (function(){ const c = newTexCanvas(16), ctx = c.getContext('2d'); ctx.fillStyle = '#e3e3c8'; ctx.fillRect(0,0,16,16); return finalizeTex(c); })()
};

// --- СВИНЬЯ ---
function makePigBodyTex() {
  const px = 32;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f0a6a6';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#e08e8e';
  ctx.fillRect(4, 4, 8, 8);
  ctx.fillRect(18, 18, 10, 8);
  return finalizeTex(c);
}
function makePigHeadTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f0a6a6';
  ctx.fillRect(0, 0, px, px);
  return finalizeTex(c);
}
function makePigFaceTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f0a6a6';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000000';
  ctx.fillRect(3, 4, 2, 2);
  ctx.fillRect(11, 4, 2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(3, 4, 1, 1);
  ctx.fillRect(11, 4, 1, 1);
  return finalizeTex(c);
}
function makePigSnoutTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d98686';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#a64d4d';
  ctx.fillRect(3, 6, 3, 4);
  ctx.fillRect(10, 6, 3, 4);
  return finalizeTex(c);
}
function makePigLegTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e08e8e';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#c26b6b';
  ctx.fillRect(0, 12, 16, 4);
  return finalizeTex(c);
}
const PIG_TEX = {
  body: makePigBodyTex(), head: makePigHeadTex(), face: makePigFaceTex(), snout: makePigSnoutTex(), leg: makePigLegTex()
};

// --- ОВЦА ---
function makeSheepWoolTex() {
  const px = 32;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e5e5e5';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(2, 2, 8, 8);
  ctx.fillRect(14, 2, 10, 6);
  ctx.fillRect(2, 14, 6, 10);
  ctx.fillRect(14, 14, 10, 12);
  ctx.fillRect(24, 20, 6, 8);
  ctx.fillStyle = '#cfcfcf';
  ctx.fillRect(10, 10, 4, 4);
  ctx.fillRect(24, 10, 4, 4);
  ctx.fillRect(10, 24, 4, 4);
  return finalizeTex(c);
}
function makeSheepFaceTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#dcd2c6';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#e5e5e5';
  ctx.fillRect(0, 0, px, 4);
  ctx.fillRect(0, 0, 2, 8);
  ctx.fillRect(14, 0, 2, 8);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(3, 5, 3, 3);
  ctx.fillRect(10, 5, 3, 3);
  ctx.fillStyle = '#000000';
  ctx.fillRect(4, 5, 2, 2);
  ctx.fillRect(11, 5, 2, 2);
  ctx.fillStyle = '#b0a59a';
  ctx.fillRect(6, 10, 4, 3);
  return finalizeTex(c);
}
function makeSheepLegTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#dcd2c6';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#b0a59a';
  ctx.fillRect(0, 12, 16, 4);
  return finalizeTex(c);
}
const SHEEP_TEX = {
  wool: makeSheepWoolTex(), face: makeSheepFaceTex(), leg: makeSheepLegTex()
};

// --- КУРИЦА ---
function makeChickenBodyTex() {
  const px = 32;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#d4d4d4';
  ctx.fillRect(4, 4, 8, 8);
  ctx.fillRect(16, 16, 8, 8);
  ctx.fillRect(4, 20, 6, 6);
  ctx.fillRect(22, 4, 6, 6);
  return finalizeTex(c);
}
function makeChickenFaceTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000000';
  ctx.fillRect(3, 5, 3, 3);
  ctx.fillRect(10, 5, 3, 3);
  return finalizeTex(c);
}
function makeChickenBeakTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e5a128';
  ctx.fillRect(0, 0, px, px);
  return finalizeTex(c);
}
function makeChickenLegTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e5a128';
  ctx.fillRect(0, 0, px, px);
  return finalizeTex(c);
}
const CHICKEN_TEX = {
  body: makeChickenBodyTex(), face: makeChickenFaceTex(), beak: makeChickenBeakTex(),
  wattle: (function(){ const c = newTexCanvas(16), ctx = c.getContext('2d'); ctx.fillStyle = '#cc2222'; ctx.fillRect(0,0,16,16); return finalizeTex(c); })(),
  leg: makeChickenLegTex()
};

/* ============================================================
   МАТЕРИАЛЫ
   ============================================================ */
const SHADES = [0.92, 0.76, 1.00, 0.55, 0.86, 0.86];
const MAT_CACHE = new Map();

function getMobMaterial(tex, faceIdx) {
  const s = SHADES[faceIdx];
  if (MAT_CACHE.has(tex)) {
    const arr = MAT_CACHE.get(tex);
    if (arr[faceIdx]) return arr[faceIdx];
  } else {
    MAT_CACHE.set(tex, []);
  }
  const m = new THREE.MeshBasicMaterial({ fog: true });
  m.map = tex;
  m.color.setRGB(s, s, s);
  MAT_CACHE.get(tex)[faceIdx] = m;
  return m;
}

function makeBox(w, h, d, tex, faceTex) {
  const mats = new Array(6);
  for (let i = 0; i < 6; i++) {
    const isFace = (i === 5) && faceTex;
    mats[i] = getMobMaterial(isFace ? faceTex : tex, i);
  }
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
}

/* ============================================================
   МОДЕЛИ (ДАННЫЕ)
   ============================================================ */
const MOB_TYPES = {
  pig: {
    h: 0.9, r: 0.42, speed: 1.4, hp: 10, headPivot: [0, 0.75, -0.4],
    parts: [
      { w: 0.625, h: 0.5, d: 1.0, tex: PIG_TEX.body, x: 0, y: 0.625, z: 0, tag: '' },
      { w: 0.5, h: 0.5, d: 0.5, tex: PIG_TEX.head, faceTex: PIG_TEX.face, x: 0, y: 0.75, z: -0.45, tag: 'h' },
      { w: 0.25, h: 0.125, d: 0.0625, tex: PIG_TEX.snout, x: 0, y: 0.65, z: -0.72, tag: 'h' },
      { w: 0.125, h: 0.125, d: 0.0625, tex: PIG_TEX.head, x: -0.15, y: 0.95, z: -0.65, tag: 'h' },
      { w: 0.125, h: 0.125, d: 0.0625, tex: PIG_TEX.head, x: 0.15, y: 0.95, z: -0.65, tag: 'h' },
      { w: 0.25, h: 0.375, d: 0.25, tex: PIG_TEX.leg, x: -0.19, y: 0.1875, z: -0.33, tag: 'l' },
      { w: 0.25, h: 0.375, d: 0.25, tex: PIG_TEX.leg, x: 0.19, y: 0.1875, z: -0.33, tag: 'l' },
      { w: 0.25, h: 0.375, d: 0.25, tex: PIG_TEX.leg, x: -0.19, y: 0.1875, z: 0.33, tag: 'l' },
      { w: 0.25, h: 0.375, d: 0.25, tex: PIG_TEX.leg, x: 0.19, y: 0.1875, z: 0.33, tag: 'l' }
    ]
  },
  sheep: {
    h: 1.25, r: 0.42, speed: 1.2, hp: 8, headPivot: [0, 0.95, -0.6],
    parts: [
      { w: 0.75, h: 0.75, d: 1.25, tex: SHEEP_TEX.wool, x: 0, y: 0.875, z: 0, tag: '' },
      { w: 0.4, h: 0.4, d: 0.4, tex: SHEEP_TEX.wool, faceTex: SHEEP_TEX.face, x: 0, y: 0.95, z: -0.7, tag: 'h' },
      { w: 0.15, h: 0.1, d: 0.1, tex: SHEEP_TEX.wool, x: -0.25, y: 0.95, z: -0.7, tag: 'h' },
      { w: 0.15, h: 0.1, d: 0.1, tex: SHEEP_TEX.wool, x: 0.25, y: 0.95, z: -0.7, tag: 'h' },
      { w: 0.25, h: 0.5, d: 0.25, tex: SHEEP_TEX.leg, x: -0.2, y: 0.25, z: -0.4, tag: 'l' },
      { w: 0.25, h: 0.5, d: 0.25, tex: SHEEP_TEX.leg, x: 0.2, y: 0.25, z: -0.4, tag: 'l' },
      { w: 0.25, h: 0.5, d: 0.25, tex: SHEEP_TEX.leg, x: -0.2, y: 0.25, z: 0.4, tag: 'l' },
      { w: 0.25, h: 0.5, d: 0.25, tex: SHEEP_TEX.leg, x: 0.2, y: 0.25, z: 0.4, tag: 'l' }
    ]
  },
  cow: {
    h: 1.45, r: 0.45, speed: 1.2, hp: 10, headPivot: [0, 1.0625, -0.55],
    parts: [
      { w: 0.75, h: 0.625, d: 1.125, tex: COW_TEX.hide, x: 0, y: 1.0625, z: 0, tag: '' },
      { w: 0.5, h: 0.5, d: 0.5, tex: COW_TEX.head, faceTex: COW_TEX.face, x: 0, y: 1.0625, z: -0.7, tag: 'h' },
      { w: 0.0625, h: 0.1875, d: 0.0625, tex: COW_TEX.horn, x: -0.2, y: 1.32, z: -0.75, tag: 'h' },
      { w: 0.0625, h: 0.1875, d: 0.0625, tex: COW_TEX.horn, x: 0.2, y: 1.32, z: -0.75, tag: 'h' },
      { w: 0.25, h: 0.75, d: 0.25, tex: COW_TEX.leg, x: -0.25, y: 0.375, z: -0.4, tag: 'l' },
      { w: 0.25, h: 0.75, d: 0.25, tex: COW_TEX.leg, x: 0.25, y: 0.375, z: -0.4, tag: 'l' },
      { w: 0.25, h: 0.75, d: 0.25, tex: COW_TEX.leg, x: -0.25, y: 0.375, z: 0.4, tag: 'l' },
      { w: 0.25, h: 0.75, d: 0.25, tex: COW_TEX.leg, x: 0.25, y: 0.375, z: 0.4, tag: 'l' }
    ]
  },
  chicken: {
    h: 0.7, r: 0.22, speed: 2.0, hp: 4, headPivot: [0, 0.75, -0.2],
    parts: [
      { w: 0.375, h: 0.5, d: 0.375, tex: CHICKEN_TEX.body, x: 0, y: 0.5, z: 0, tag: '' },
      { w: 0.25, h: 0.25, d: 0.25, tex: CHICKEN_TEX.body, faceTex: CHICKEN_TEX.face, x: 0, y: 0.75, z: -0.2, tag: 'h' },
      { w: 0.125, h: 0.125, d: 0.125, tex: CHICKEN_TEX.wattle, x: 0, y: 0.9, z: -0.2, tag: 'h' },
      { w: 0.125, h: 0.125, d: 0.0625, tex: CHICKEN_TEX.beak, x: 0, y: 0.75, z: -0.36, tag: 'h' },
      { w: 0.0625, h: 0.0625, d: 0.0625, tex: CHICKEN_TEX.wattle, x: 0, y: 0.68, z: -0.34, tag: 'h' },
      { w: 0.0625, h: 0.25, d: 0.375, tex: CHICKEN_TEX.body, x: -0.21875, y: 0.5, z: 0, tag: '' },
      { w: 0.0625, h: 0.25, d: 0.375, tex: CHICKEN_TEX.body, x: 0.21875, y: 0.5, z: 0, tag: '' },
      { w: 0.25, h: 0.1875, d: 0.0625, tex: CHICKEN_TEX.body, x: 0, y: 0.55, z: 0.21875, tag: '' },
      { w: 0.125, h: 0.25, d: 0.125, tex: CHICKEN_TEX.leg, x: -0.1, y: 0.125, z: 0.05, tag: 'l' },
      { w: 0.125, h: 0.25, d: 0.125, tex: CHICKEN_TEX.leg, x: 0.1, y: 0.125, z: 0.05, tag: 'l' }
    ]
  }
};

function buildMobMesh(type) {
  const def = MOB_TYPES[type];
  const group = new THREE.Group();
  const legs = [];
  let headGroup = null;

  const hp = def.headPivot;
  if (hp) {
    headGroup = new THREE.Group();
    headGroup.position.set(hp[0], hp[1], hp[2]);
    headGroup.rotation.order = 'YXZ';
    group.add(headGroup);
  }

  for (let i = 0; i < def.parts.length; i++) {
    const p = def.parts[i];
    const mesh = makeBox(p.w, p.h, p.d, p.tex, p.faceTex);
    const tag = p.tag || '';

    if (tag === 'l') {
      const pivotY = p.y + p.h / 2;
      const pivot = new THREE.Group();
      pivot.position.set(p.x, pivotY, p.z);
      mesh.position.set(0, -p.h / 2, 0);
      pivot.add(mesh);
      group.add(pivot);
      legs.push({ pivot: pivot, dir: (i % 2 === 0) ? 1 : -1, front: p.z < 0 });
    } else if (tag === 'h' && headGroup) {
      mesh.position.set(p.x - hp[0], p.y - hp[1], p.z - hp[2]);
      headGroup.add(mesh);
    } else {
      mesh.position.set(p.x, p.y, p.z);
      group.add(mesh);
    }
  }

  return { group: group, legs: legs, headGroup: headGroup };
}

/* ============================================================
   ЖИЗНЕННЫЙ ЦИКЛ
   ============================================================ */
function createMob(type, x, y, z, yaw) {
  if (!MOB_TYPES[type]) type = 'pig';
  const def = MOB_TYPES[type];
  const built = buildMobMesh(type);
  const group = built.group;
  const startYaw = (typeof yaw === 'number') ? yaw : Math.random() * Math.PI * 2;
  
  group.position.set(x, y, z);
  group.rotation.y = startYaw;
  scene.add(group);

  const mob = {
    type: type, def: def, group: group, legs: built.legs, headGroup: built.headGroup,
    headYaw: 0, headPitch: 0, headBobPhase: Math.random() * Math.PI * 2,
    headLookAtPlayer: false, headLookTimer: 1 + Math.random() * 4, headGlanceTimer: 0,
    headIdleYaw: 0, headIdlePitch: 0,
    pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(0, 0, 0),
    yaw: startYaw, targetYaw: startYaw,
    wanderTimer: 1 + Math.random() * 3, walking: false, walkPhase: 0,
    onGround: false, lastX: x, lastZ: z, stuckTimer: 0,
    avoidCooldown: 0, jumpCooldown: 0, soundTimer: 2 + Math.random() * 6,
    hp: def.hp, maxHp: def.hp, dead: false, hurtTimer: 0, panicTimer: 0,
    lookAtCooldown: 1 + Math.random() * 3
  };
  mobs.push(mob);
  return mob;
}

function hitMob(mob, damage, fromX, fromZ) {
  if (!mob || mob.dead) return false;
  mob.hp -= damage;
  mob.hurtTimer = 0.3;
  mob.panicTimer = 4.0; // PANIC_DURATION
  mob.walking = true;

  const dx = mob.pos.x - fromX;
  const dz = mob.pos.z - fromZ;
  const len = Math.hypot(dx, dz);
  if (len > 0.001) {
    mob.vel.x += (dx / len) * 5.0;
    mob.vel.z += (dz / len) * 5.0;
  }
  mob.vel.y = 4.5;
  mob.onGround = false;

  if (mob.hp <= 0) {
    mob.hp = 0;
    mob.dead = true;
    if (!soundsMuted && window.SFX && window.SFX.mobDeath) window.SFX.mobDeath(mob.type);
    return true;
  }
  if (!soundsMuted && window.SFX && window.SFX.mobHurt) window.SFX.mobHurt(mob.type);
  return false;
}

function raycastMob(origin, dir, maxDist) {
  let best = null;
  let bestT = maxDist;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead || !m.group.visible) continue;
    const r = m.def.r, h = m.def.h;
    const minX = m.pos.x - r, maxX = m.pos.x + r;
    const minY = m.pos.y,     maxY = m.pos.y + h;
    const minZ = m.pos.z - r, maxZ = m.pos.z + r;

    let tmin = 0, tmax = bestT;
    if (Math.abs(dir.x) < 1e-8) { if (origin.x < minX || origin.x > maxX) continue; }
    else {
      let t1 = (minX - origin.x) / dir.x, t2 = (maxX - origin.x) / dir.x;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (Math.abs(dir.y) < 1e-8) { if (origin.y < minY || origin.y > maxY) continue; }
    else {
      let t1 = (minY - origin.y) / dir.y, t2 = (maxY - origin.y) / dir.y;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (Math.abs(dir.z) < 1e-8) { if (origin.z < minZ || origin.z > maxZ) continue; }
    else {
      let t1 = (minZ - origin.z) / dir.z, t2 = (maxZ - origin.z) / dir.z;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (tmin >= 0 && tmin < bestT) { bestT = tmin; best = m; }
  }
  return best ? { mob: best, t: bestT } : null;
}

function isBlockOccupied(bx, by, bz) {
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead) continue;
    const r = m.def.r, h = m.def.h;
    if (bx + 1 <= m.pos.x - r || bx >= m.pos.x + r) continue;
    if (by + 1 <= m.pos.y     || by >= m.pos.y + h) continue;
    if (bz + 1 <= m.pos.z - r || bz >= m.pos.z + r) continue;
    return true;
  }
  return false;
}

function findGround(x, z) {
  for (let y = SY - 1; y >= 0; y--) {
    if (world[IDX(x, y, z)] !== 0) return y + 1;
  }
  return -1;
}

function spawnAt(type, x, y, z, yaw) {
  if (!scene) return null;
  return createMob(type, x, y, z, yaw);
}

function spawnInitial(count) {
  if (!scene) return 0;
  const types = ['pig', 'sheep', 'cow', 'chicken'];
  let spawned = 0;
  let attempts = 0;

  while (spawned < count && attempts < count * 40) {
    attempts++;
    const x = 2 + Math.floor(Math.random() * (SX - 4));
    const z = 2 + Math.floor(Math.random() * (SZ - 4));
    const y = findGround(x, z);
    if (y < 1 || y >= SY - 1) continue;
    
    const top = world[IDX(x, y - 1, z)];
    if (top !== 1 && top !== 5 && top !== 11) continue;

    let ok = true;
    for (let dx = -1; dx <= 1 && ok; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (world[IDX(x + dx, y, z + dz)] !== 0) { ok = false; break; }
      }
    }
    if (!ok) continue;

    const type = types[Math.floor(Math.random() * types.length)];
    createMob(type, x + 0.5, y, z + 0.5);
    spawned++;
  }
  console.log('[mobs.js] заспавнено мобов:', spawned, 'из', count);
  return spawned;
}

function clear() {
  for (let i = 0; i < mobs.length; i++) {
    scene.remove(mobs[i].group);
    mobs[i].group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
  }
  mobs.length = 0;
}

function serialize() {
  const out = [];
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.dead) continue;
    out.push({ t: m.type, x: m.pos.x, y: m.pos.y, z: m.pos.z, yaw: m.yaw, hp: m.hp });
  }
  return out;
}

function deserialize(arr) {
  clear();
  if (!arr || !arr.length) return;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i];
    if (!MOB_TYPES[d.t]) continue;
    const mob = createMob(d.t, d.x, d.y, d.z, d.yaw);
    if (typeof d.hp === 'number' && d.hp > 0) mob.hp = Math.min(mob.maxHp, d.hp);
  }
}

function rebuildTextures() {
  MAT_CACHE.forEach(function (arr) {
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i];
      if (m && m.map) m.map.needsUpdate = true;
      if (m) m.needsUpdate = true;
    }
  });
}

function init(sc) { scene = sc; }

// ОПТИМИЗАЦИЯ: объект env вынесен за пределы цикла update
const env = {
  playerPos: null,
  renderDistBlocks: 6 * CS,
  playSound: function(mob) {
    if (soundsMuted || !playerPos || !window.SFX) return;
    const dx = mob.pos.x - playerPos.x;
    const dy = mob.pos.y - playerPos.y;
    const dz = mob.pos.z - playerPos.z;
    if (dx*dx + dy*dy + dz*dz > SOUND_MIN_DIST2) return;

    const now = performance.now();
    if (now - lastMobSoundTime < 500) return;
    lastMobSoundTime = now;

    const snd = window.SFX[mob.type];
    if (typeof snd === 'function') snd();
  }
};

function update(dt, pPos, renderDistanceBlocks) {
  if (pPos) playerPos = pPos;
  if (typeof renderDistanceBlocks === 'number' && renderDistanceBlocks > 0) {
    renderDistBlocks = renderDistanceBlocks;
  }
  
  env.playerPos = playerPos;
  env.renderDistBlocks = renderDistBlocks;

  for (let i = 0; i < mobs.length; i++) {
    window.MOB_AI.update(mobs[i], dt, env);
  }

  for (let i = mobs.length - 1; i >= 0; i--) {
    if (mobs[i].dead) {
      scene.remove(mobs[i].group);
      mobs[i].group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      mobs.splice(i, 1);
    }
  }
}

return {
  init: init, update: update, spawnAt: spawnAt, spawnInitial: spawnInitial,
  clear: clear, serialize: serialize, deserialize: deserialize,
  count: function () { return mobs.length; },
  raycast: function (origin, dir, maxDist) { return raycastMob(origin, dir, maxDist); },
  hit: hitMob, rebuildTextures: rebuildTextures, isBlockOccupied: isBlockOccupied, setMuted: setMuted
};

})();