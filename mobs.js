/* ============================================================
   mobs.js — мирные мобы с текстурами, звуками, HP и AI.
   + Текстуры перерисованы вручную (Minecraft style)
   + FIX: правильные пропорции пятен коровы и цвета
   ============================================================ */
window.MOBS = (function () {
'use strict';

if (!window.MC) {
  console.warn('[mobs.js] world.js не загрузился — мобы недоступны');
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
const isSolid = MC.isSolid, highestAt = MC.highestAt;

let scene = null;
const mobs = [];

let playerPos = null;
let lastMobSoundTime = -99999;
let renderDistBlocks = 6 * CS;

let soundsMuted = false;
function setMuted(v) { soundsMuted = !!v; }

const GRAVITY = 28;
const JUMP_VELOCITY = 8.6;
const SOUND_MIN_DIST2 = 15 * 15;
const SOUND_INTERVAL_MIN = 8;
const SOUND_INTERVAL_MAX = 16;
const PANIC_DURATION = 4.0;
const PANIC_SPEED_MULT = 1.6;
const LEG_SWING = 0.55;
const VISIBILITY_MARGIN = 1.0;

const HEAD_LOOK_RANGE_SQ = 12 * 12;
const HEAD_MAX_YAW       = 1.15;
const HEAD_MAX_PITCH     = 0.55;
const HEAD_SMOOTH        = 5.5;
const HEAD_BOB_Y         = 0.02;
const HEAD_SWAY          = 0.045;
const JUMP_LEG_POSE      = 0.32;

/* ============================================================
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
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
   ТЕКСТУРЫ (ПОПИКСЕЛЬНО, БЕЗ ШУМА)
   ============================================================ */

// --- КОРОВА ---
function makeCowHideTex() {
  const px = 32;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  
  // Белая основа (как в оригинале)
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, px, px);

  // Коричневые пятна (крупные и редкие)
  ctx.fillStyle = '#4a2c17'; 
  ctx.fillRect(2, 4, 10, 12);
  ctx.fillRect(6, 2, 6, 4);
  ctx.fillRect(20, 16, 10, 12);
  ctx.fillRect(24, 12, 6, 6);
  ctx.fillRect(4, 22, 8, 8);

  return finalizeTex(c);
}

function makeCowFaceTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');

  // Белая основа
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, px, px);

  // Коричневая шапка (верхняя часть лица)
  ctx.fillStyle = '#4a2c17';
  ctx.fillRect(0, 0, px, 6); 
  ctx.fillRect(2, 6, 12, 2);

  // Морда (розовая)
  ctx.fillStyle = '#e0b0b0';
  ctx.fillRect(2, 9, 12, 7);

  // Ноздри
  ctx.fillStyle = '#996666';
  ctx.fillRect(4, 11, 2, 2);
  ctx.fillRect(10, 11, 2, 2);

  // Глаза
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(1, 6, 3, 3);
  ctx.fillRect(12, 6, 3, 3);
  ctx.fillStyle = '#000000';
  ctx.fillRect(1, 7, 2, 2);
  ctx.fillRect(13, 7, 2, 2);

  return finalizeTex(c);
}

function makeCowLegTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  // Коричневая нога
  ctx.fillStyle = '#4a2c17';
  ctx.fillRect(0, 0, px, px);
  // Светлое копыто
  ctx.fillStyle = '#dcd2c6';
  ctx.fillRect(0, 12, 16, 4); 
  return finalizeTex(c);
}

const COW_TEX = {
  hide: makeCowHideTex(),
  face: makeCowFaceTex(),
  leg: makeCowLegTex(),
  horn: (function(){
    const c = newTexCanvas(16), ctx = c.getContext('2d');
    ctx.fillStyle = '#e3e3c8'; ctx.fillRect(0,0,16,16);
    return finalizeTex(c);
  })()
};

// --- СВИНЬЯ ---
function makePigBodyTex() {
  const px = 32;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f0a6a6';
  ctx.fillRect(0, 0, px, px);
  
  // Легкая текстура кожи
  ctx.fillStyle = '#e08e8e';
  ctx.fillRect(6, 6, 8, 8);
  ctx.fillRect(18, 18, 10, 8);
  ctx.fillRect(4, 22, 8, 6);
  return finalizeTex(c);
}

function makePigFaceTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  
  ctx.fillStyle = '#f0a6a6';
  ctx.fillRect(0, 0, px, px);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(2, 4, 3, 2);
  ctx.fillRect(11, 4, 3, 2);

  ctx.fillStyle = '#000000';
  ctx.fillRect(3, 4, 2, 2);
  ctx.fillRect(11, 4, 2, 2);

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
  ctx.fillRect(0, 12, 16, 4); // Копыто
  return finalizeTex(c);
}

const PIG_TEX = {
  body: makePigBodyTex(),
  face: makePigFaceTex(),
  snout: makePigSnoutTex(),
  leg: makePigLegTex()
};

// --- ОВЦА ---
function makeSheepWoolTex() {
  const px = 32;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, px, px);
  
  // Объемная шерсть
  ctx.fillStyle = '#d0d0d0';
  for(let y=0; y<px; y+=4){
    for(let x=0; x<px; x+=4){
      if((x+y)%8===0) ctx.fillRect(x, y, 4, 4);
    }
  }
  return finalizeTex(c);
}

function makeSheepFaceTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  
  ctx.fillStyle = '#dcd2c6';
  ctx.fillRect(0, 0, px, px);

  // Шерсть на лбу
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, px, 3);
  ctx.fillRect(2, 3, 12, 2);

  // Глаза
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(1, 5, 3, 3);
  ctx.fillRect(12, 5, 3, 3);
  ctx.fillStyle = '#000000';
  ctx.fillRect(2, 6, 2, 2);
  ctx.fillRect(12, 6, 2, 2);

  // Нос
  ctx.fillStyle = '#b0a59a';
  ctx.fillRect(6, 10, 4, 4);

  return finalizeTex(c);
}

function makeSheepLegTex() {
  const px = 16;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#dcd2c6';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#b0a59a';
  ctx.fillRect(0, 12, 16, 4); // Копыто
  return finalizeTex(c);
}

const SHEEP_TEX = {
  wool: makeSheepWoolTex(),
  face: makeSheepFaceTex(),
  leg: makeSheepLegTex()
};

// --- КУРИЦА ---
function makeChickenBodyTex() {
  const px = 32;
  const c = newTexCanvas(px);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, px, px);
  
  // Перья
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

  // Гребешок
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(4, 0, 8, 3);

  // Глаза
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(2, 4, 3, 3);
  ctx.fillRect(11, 4, 3, 3);
  ctx.fillStyle = '#000000';
  ctx.fillRect(3, 5, 2, 2);
  ctx.fillRect(11, 5, 2, 2);

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
  body: makeChickenBodyTex(),
  face: makeChickenFaceTex(),
  beak: makeChickenBeakTex(),
  wattle: (function(){
    const c = newTexCanvas(16), ctx = c.getContext('2d');
    ctx.fillStyle = '#cc2222'; ctx.fillRect(0,0,16,16);
    return finalizeTex(c);
  })(),
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
    // В Three.js BoxGeometry: 4 — это +Z (задняя), 5 — это -Z (передняя).
    // Применяем faceTex к грани 5.
    const isFace = (i === 5) && faceTex;
    mats[i] = getMobMaterial(isFace ? faceTex : tex, i);
  }
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
}

/* ============================================================
   ОПРЕДЕЛЕНИЯ МОБОВ (МОДЕЛИ)
   ============================================================ */
const MOB_TYPES = {
  pig: {
    h: 0.9, r: 0.42, speed: 1.4, hp: 10,
    headPivot: [0, 0.75, -0.4],
    parts: [
      { w: 0.625, h: 0.5, d: 1.0, tex: PIG_TEX.body, x: 0, y: 0.625, z: 0, tag: '' },
      { w: 0.5, h: 0.5, d: 0.5, tex: PIG_TEX.body, faceTex: PIG_TEX.face, x: 0, y: 0.75, z: -0.45, tag: 'h' },
      { w: 0.25, h: 0.2, d: 0.1, tex: PIG_TEX.snout, x: 0, y: 0.75, z: -0.75, tag: 'h' },
      { w: 0.1, h: 0.1, d: 0.05, tex: PIG_TEX.body, x: -0.15, y: 0.95, z: -0.65, tag: 'h' },
      { w: 0.1, h: 0.1, d: 0.05, tex: PIG_TEX.body, x: 0.15, y: 0.95, z: -0.65, tag: 'h' },
      { w: 0.25, h: 0.375, d: 0.25, tex: PIG_TEX.leg, x: -0.19, y: 0.1875, z: -0.33, tag: 'l' },
      { w: 0.25, h: 0.375, d: 0.25, tex: PIG_TEX.leg, x: 0.19, y: 0.1875, z: -0.33, tag: 'l' },
      { w: 0.25, h: 0.375, d: 0.25, tex: PIG_TEX.leg, x: -0.19, y: 0.1875, z: 0.33, tag: 'l' },
      { w: 0.25, h: 0.375, d: 0.25, tex: PIG_TEX.leg, x: 0.19, y: 0.1875, z: 0.33, tag: 'l' }
    ]
  },

  sheep: {
    h: 1.25, r: 0.42, speed: 1.2, hp: 8,
    headPivot: [0, 0.875, -0.55],
    parts: [
      { w: 0.75, h: 0.75, d: 1.0, tex: SHEEP_TEX.wool, x: 0, y: 0.875, z: 0, tag: '' },
      { w: 0.4, h: 0.5, d: 0.4, tex: SHEEP_TEX.leg, faceTex: SHEEP_TEX.face, x: 0, y: 0.875, z: -0.7, tag: 'h' },
      { w: 0.15, h: 0.1, d: 0.05, tex: SHEEP_TEX.leg, x: -0.2, y: 0.9, z: -0.7, tag: 'h' },
      { w: 0.15, h: 0.1, d: 0.05, tex: SHEEP_TEX.leg, x: 0.2, y: 0.9, z: -0.7, tag: 'h' },
      { w: 0.25, h: 0.5, d: 0.25, tex: SHEEP_TEX.leg, x: -0.2, y: 0.25, z: -0.3, tag: 'l' },
      { w: 0.25, h: 0.5, d: 0.25, tex: SHEEP_TEX.leg, x: 0.2, y: 0.25, z: -0.3, tag: 'l' },
      { w: 0.25, h: 0.5, d: 0.25, tex: SHEEP_TEX.leg, x: -0.2, y: 0.25, z: 0.3, tag: 'l' },
      { w: 0.25, h: 0.5, d: 0.25, tex: SHEEP_TEX.leg, x: 0.2, y: 0.25, z: 0.3, tag: 'l' }
    ]
  },

  cow: {
    h: 1.45, r: 0.45, speed: 1.2, hp: 10,
    headPivot: [0, 1.0625, -0.55],
    parts: [
      { w: 0.75, h: 0.625, d: 1.125, tex: COW_TEX.hide, x: 0, y: 1.0625, z: 0, tag: '' },
      { w: 0.5, h: 0.5, d: 0.5, tex: COW_TEX.hide, faceTex: COW_TEX.face, x: 0, y: 1.0625, z: -0.7, tag: 'h' },
      { w: 0.1, h: 0.15, d: 0.1, tex: COW_TEX.horn, x: -0.2, y: 1.32, z: -0.75, tag: 'h' },
      { w: 0.1, h: 0.15, d: 0.1, tex: COW_TEX.horn, x: 0.2, y: 1.32, z: -0.75, tag: 'h' },
      { w: 0.25, h: 0.75, d: 0.25, tex: COW_TEX.leg, x: -0.25, y: 0.375, z: -0.4, tag: 'l' },
      { w: 0.25, h: 0.75, d: 0.25, tex: COW_TEX.leg, x: 0.25, y: 0.375, z: -0.4, tag: 'l' },
      { w: 0.25, h: 0.75, d: 0.25, tex: COW_TEX.leg, x: -0.25, y: 0.375, z: 0.4, tag: 'l' },
      { w: 0.25, h: 0.75, d: 0.25, tex: COW_TEX.leg, x: 0.25, y: 0.375, z: 0.4, tag: 'l' }
    ]
  },

  chicken: {
    h: 0.7, r: 0.22, speed: 2.0, hp: 4,
    headPivot: [0, 0.75, -0.25],
    parts: [
      { w: 0.3, h: 0.4, d: 0.4, tex: CHICKEN_TEX.body, x: 0, y: 0.45, z: 0, tag: '' },
      { w: 0.2, h: 0.25, d: 0.2, tex: CHICKEN_TEX.body, faceTex: CHICKEN_TEX.face, x: 0, y: 0.75, z: -0.25, tag: 'h' },
      { w: 0.15, h: 0.1, d: 0.15, tex: CHICKEN_TEX.beak, x: 0, y: 0.75, z: -0.35, tag: 'h' },
      { w: 0.1, h: 0.08, d: 0.04, tex: CHICKEN_TEX.wattle, x: 0, y: 0.65, z: -0.36, tag: 'h' },
      { w: 0.05, h: 0.3, d: 0.35, tex: CHICKEN_TEX.body, x: -0.175, y: 0.5, z: 0, tag: '' },
      { w: 0.05, h: 0.3, d: 0.35, tex: CHICKEN_TEX.body, x: 0.175, y: 0.5, z: 0, tag: '' },
      { w: 0.2, h: 0.15, d: 0.05, tex: CHICKEN_TEX.body, x: 0, y: 0.55, z: 0.225, tag: '' },
      { w: 0.06, h: 0.25, d: 0.06, tex: CHICKEN_TEX.leg, x: -0.08, y: 0.125, z: 0.05, tag: 'l' },
      { w: 0.06, h: 0.25, d: 0.06, tex: CHICKEN_TEX.leg, x: 0.08, y: 0.125, z: 0.05, tag: 'l' }
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
    const w = p.w, h = p.h, d = p.d;
    const tex = p.tex, faceTex = p.faceTex;
    const x = p.x, y = p.y, z = p.z;
    const tag = p.tag || '';

    const mesh = makeBox(w, h, d, tex, faceTex);

    if (tag === 'l') {
      const pivotY = y + h / 2;
      const pivot = new THREE.Group();
      pivot.position.set(x, pivotY, z);
      mesh.position.set(0, -h / 2, 0);
      pivot.add(mesh);
      group.add(pivot);
      legs.push({
        pivot: pivot,
        dir: (i % 2 === 0) ? 1 : -1,
        front: z < 0
      });
    } else if (tag === 'h' && headGroup) {
      mesh.position.set(x - hp[0], y - hp[1], z - hp[2]);
      headGroup.add(mesh);
    } else {
      mesh.position.set(x, y, z);
      group.add(mesh);
    }
  }

  return { group: group, legs: legs, headGroup: headGroup };
}

/* ============================================================
   ЛОГИКА И AI
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
    type: type,
    def: def,
    group: group,
    legs: built.legs,
    headGroup: built.headGroup,

    headYaw: 0, headPitch: 0,
    headBobPhase: Math.random() * Math.PI * 2,
    headLookAtPlayer: false,
    headLookTimer: 1 + Math.random() * 4,
    headGlanceTimer: 0,
    headIdleYaw: 0, headIdlePitch: 0,

    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(0, 0, 0),
    yaw: startYaw, targetYaw: startYaw,
    wanderTimer: 1 + Math.random() * 3,
    walking: false,
    walkPhase: 0,
    onGround: false,
    lastX: x, lastZ: z,
    stuckTimer: 0,
    avoidCooldown: 0, jumpCooldown: 0,
    soundTimer: 2 + Math.random() * 6,
    hp: def.hp, maxHp: def.hp,
    dead: false, hurtTimer: 0, panicTimer: 0,
    lookAtCooldown: 1 + Math.random() * 3
  };
  mobs.push(mob);
  return mob;
}

function mobCollides(px, py, pz, r, h) {
  if (px - r < 0 || px + r > SX) return true;
  if (pz - r < 0 || pz + r > SZ) return true;
  const e = 1e-4;
  const x0 = Math.floor(px - r + e), x1 = Math.floor(px + r - e);
  const y0 = Math.floor(py + e),     y1 = Math.floor(py + h - e);
  const z0 = Math.floor(pz - r + e), z1 = Math.floor(pz + r - e);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++)
        if (isSolid(x, y, z)) return true;
  return false;
}

function canJumpOver(mob, axisX, axisZ) {
  const r = mob.def.r, h = mob.def.h;
  const nx = mob.pos.x + axisX * 1.0;
  const nz = mob.pos.z + axisZ * 1.0;
  if (!mobCollides(nx, mob.pos.y, nz, r, h)) return false;
  if (mobCollides(nx, mob.pos.y + 1.0, nz, r, h)) return false;
  const ix = Math.floor(nx), iz = Math.floor(nz);
  if (ix < 0 || ix >= SX || iz < 0 || iz >= SZ) return false;
  return isSolid(ix, Math.floor(mob.pos.y + 1.0 - 0.01), iz);
}

function tryJump(mob, axisX, axisZ) {
  if (mob.jumpCooldown > 0) return false;
  if (!mob.onGround) return false;
  if (!canJumpOver(mob, axisX, axisZ)) return false;
  mob.vel.y = JUMP_VELOCITY;
  mob.jumpCooldown = 0.4;
  return true;
}

function mobMove(mob, dx, dy, dz) {
  const r = mob.def.r, h = mob.def.h;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.2));
  const sx = dx / steps, sy = dy / steps, sz = dz / steps;

  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      mob.pos.x += sx;
      if (mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) {
        mob.pos.x -= sx;
        if (tryJump(mob, Math.sign(sx), 0)) return;
        if (mob.onGround && mob.vel.y <= 0.01) reactToWall(mob);
      }
    }
    if (sz !== 0) {
      mob.pos.z += sz;
      if (mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) {
        mob.pos.z -= sz;
        if (tryJump(mob, 0, Math.sign(sz))) return;
        if (mob.onGround && mob.vel.y <= 0.01) reactToWall(mob);
      }
    }
    if (sy !== 0) {
      mob.pos.y += sy;
      if (mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) {
        mob.pos.y -= sy;
        if (sy < 0) mob.onGround = true;
        mob.vel.y = 0;
      }
    }
  }
}

function reactToWall(mob) {
  if (mob.avoidCooldown > 0) return;
  const turn = (Math.random() - 0.5) * Math.PI / 2;
  mob.targetYaw = mob.yaw + Math.PI + turn;
  mob.wanderTimer = Math.max(mob.wanderTimer, 0.8 + Math.random() * 0.6);
  mob.walking = true;
  mob.avoidCooldown = 0.4;
}

function maybePlaySound(mob) {
  if (soundsMuted || !playerPos || !window.SFX || mob.panicTimer > 0) return;
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

function hitMob(mob, damage, fromX, fromZ) {
  if (!mob || mob.dead) return false;
  mob.hp -= damage;
  mob.hurtTimer = 0.3;
  mob.panicTimer = PANIC_DURATION;
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

    if (tmin >= 0 && tmin < bestT) {
      bestT = tmin;
      best = m;
    }
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

function unstickMob(mob) {
  const r = mob.def.r, h = mob.def.h;
  if (!mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) return;
  for (let k = 1; k <= 14; k++) {
    const ny = mob.pos.y + 0.3 * k;
    if (!mobCollides(mob.pos.x, ny, mob.pos.z, r, h)) {
      mob.pos.y = ny;
      mob.vel.y = 0;
      return;
    }
  }
  const ix = Math.floor(mob.pos.x), iz = Math.floor(mob.pos.z);
  if (ix >= 0 && ix < SX && iz >= 0 && iz < SZ) {
    mob.pos.y = highestAt(ix, iz) + 0.5;
    mob.vel.y = 0;
  }
}

function updateMobVisibility(mob) {
  if (!playerPos) return;
  const dx = mob.pos.x - playerPos.x;
  const dz = mob.pos.z - playerPos.z;
  const limit = renderDistBlocks + VISIBILITY_MARGIN;
  const visible = (dx * dx + dz * dz) <= limit * limit;
  if (mob.hurtTimer > 0) {
    if (!visible) mob.group.visible = false;
  } else {
    mob.group.visible = visible;
  }
}

function animateHead(mob, dt) {
  const hg = mob.headGroup;
  if (!hg) return;

  let targetYaw = 0, targetPitch = 0;
  let playerNearby = false;
  let relYawToPlayer = 0, relPitchToPlayer = 0;

  if (playerPos && !mob.dead) {
    const dx = playerPos.x - mob.pos.x;
    const dz = playerPos.z - mob.pos.z;
    const distSq = dx * dx + dz * dz;

    if (distSq < HEAD_LOOK_RANGE_SQ && distSq > 0.25) {
      playerNearby = true;
      const distXZ = Math.sqrt(distSq);
      const playerEyeY = playerPos.y + 1.62;
      const headWorldY = mob.pos.y + mob.def.headPivot[1];
      const dy = playerEyeY - headWorldY;

      const desiredWorldYaw = Math.atan2(-dx, -dz);
      let relYaw = desiredWorldYaw - mob.yaw;
      while (relYaw >  Math.PI) relYaw -= Math.PI * 2;
      while (relYaw < -Math.PI) relYaw += Math.PI * 2;
      relYawToPlayer = Math.max(-HEAD_MAX_YAW, Math.min(HEAD_MAX_YAW, relYaw));

      let relPitch = -Math.atan2(dy, distXZ);
      relPitchToPlayer = Math.max(-HEAD_MAX_PITCH, Math.min(HEAD_MAX_PITCH, relPitch));
    }
  }

  if (mob.panicTimer > 0) {
    mob.headLookAtPlayer = false;
    targetYaw = 0; targetPitch = 0;
  } else if (mob.headLookAtPlayer) {
    mob.headGlanceTimer -= dt;
    if (!playerNearby || mob.headGlanceTimer <= 0) {
      mob.headLookAtPlayer = false;
      mob.headLookTimer = 2 + Math.random() * 5;
      mob.headIdleYaw = (Math.random() - 0.5) * 1.1;
      mob.headIdlePitch = (Math.random() - 0.5) * 0.35;
    } else {
      targetYaw = relYawToPlayer;
      targetPitch = relPitchToPlayer;
    }
  } else {
    mob.headLookTimer -= dt;
    if (mob.headLookTimer <= 0) {
      if (playerNearby && Math.random() < 0.45) {
        mob.headLookAtPlayer = true;
        mob.headGlanceTimer = 1.2 + Math.random() * 2.5;
        targetYaw = relYawToPlayer;
        targetPitch = relPitchToPlayer;
      } else {
        mob.headLookTimer = 2 + Math.random() * 5;
        mob.headIdleYaw = (Math.random() - 0.5) * 1.1;
        mob.headIdlePitch = (Math.random() - 0.5) * 0.35;
        targetYaw = mob.headIdleYaw;
        targetPitch = mob.headIdlePitch;
      }
    } else {
      targetYaw = mob.headIdleYaw;
      targetPitch = mob.headIdlePitch;
    }
  }

  const k = Math.min(1, HEAD_SMOOTH * dt);
  mob.headYaw   += (targetYaw   - mob.headYaw)   * k;
  mob.headPitch += (targetPitch - mob.headPitch) * k;

  let bobY = 0, sway = 0;
  if (mob.walking && mob.onGround && mob.panicTimer <= 0) {
    const ph = mob.walkPhase + mob.headBobPhase;
    bobY = Math.sin(ph * 2) * HEAD_BOB_Y;
    sway = Math.sin(ph) * HEAD_SWAY;
  }

  hg.position.y = mob.def.headPivot[1] + bobY;
  hg.rotation.y = mob.headYaw;
  hg.rotation.x = mob.headPitch;
  hg.rotation.z = sway;
}

function updateMob(mob, dt) {
  const def = mob.def;

  if (mob.dead) {
    mob.group.visible = false;
    return;
  }

  unstickMob(mob);

  if (mob.hurtTimer > 0) {
    mob.hurtTimer -= dt;
    mob.group.visible = (Math.floor(mob.hurtTimer * 30) % 2 === 0);
    if (mob.hurtTimer <= 0) mob.group.visible = true;
  }

  if (mob.avoidCooldown > 0) mob.avoidCooldown -= dt;
  if (mob.jumpCooldown > 0)  mob.jumpCooldown  -= dt;

  mob.soundTimer -= dt;
  if (mob.soundTimer <= 0) {
    mob.soundTimer = SOUND_INTERVAL_MIN + Math.random() * (SOUND_INTERVAL_MAX - SOUND_INTERVAL_MIN);
    maybePlaySound(mob);
  }

  if (mob.panicTimer > 0) {
    mob.panicTimer -= dt;
    if (playerPos) {
      const dx = mob.pos.x - playerPos.x;
      const dz = mob.pos.z - playerPos.z;
      mob.targetYaw = Math.atan2(-dx, -dz);
      mob.walking = true;
    }
  } else {
    mob.wanderTimer -= dt;
    if (mob.wanderTimer <= 0) {
      if (mob.walking && Math.random() < 0.45) {
        mob.walking = false;
        mob.wanderTimer = 1.5 + Math.random() * 3;
      } else {
        mob.walking = true;
        mob.targetYaw = Math.random() * Math.PI * 2;
        mob.wanderTimer = 2 + Math.random() * 3;
      }
    }
  }

  let dyaw = mob.targetYaw - mob.yaw;
  while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  mob.yaw += dyaw * Math.min(1, 5 * dt);

  const speedMult = mob.panicTimer > 0 ? PANIC_SPEED_MULT : 1.0;
  let vx = 0, vz = 0;
  if (mob.walking) {
    vx = -Math.sin(mob.yaw) * def.speed * speedMult;
    vz = -Math.cos(mob.yaw) * def.speed * speedMult;
  }

  mob.vel.y -= GRAVITY * dt;
  if (mob.vel.y < -30) mob.vel.y = -30;

  const friction = Math.max(0, 1 - 4 * dt);
  mob.vel.x *= friction;
  mob.vel.z *= friction;
  const totalVx = vx + mob.vel.x;
  const totalVz = vz + mob.vel.z;

  mobMove(mob, totalVx * dt, mob.vel.y * dt, totalVz * dt);

  mob.onGround = mobCollides(mob.pos.x, mob.pos.y - 0.05, mob.pos.z, def.r, def.h);
  if (mob.onGround && mob.vel.y < 0) mob.vel.y = 0;

  if (mob.walking && mob.onGround && mob.panicTimer <= 0) {
    const mdx = mob.pos.x - mob.lastX;
    const mdz = mob.pos.z - mob.lastZ;
    const movedSq = mdx * mdx + mdz * mdz;
    const expected = def.speed * dt * 0.1;
    if (movedSq < expected * expected) mob.stuckTimer += dt;
    else mob.stuckTimer = 0;

    if (mob.stuckTimer > 0.6) {
      const turn = (Math.random() < 0.5 ? 1 : -1) * (Math.PI * 0.5 + Math.random() * Math.PI * 0.5);
      mob.targetYaw = mob.yaw + turn;
      mob.wanderTimer = Math.max(mob.wanderTimer, 1.0 + Math.random() * 1.0);
      mob.stuckTimer = 0;
      mob.avoidCooldown = 0.3;
    }
  } else {
    mob.stuckTimer = 0;
  }
  mob.lastX = mob.pos.x;
  mob.lastZ = mob.pos.z;

  if (!mob.onGround) {
    const rising = mob.vel.y > 0;
    const frontPose = rising ? -JUMP_LEG_POSE : -JUMP_LEG_POSE * 0.4;
    const backPose  = rising ?  JUMP_LEG_POSE :  JUMP_LEG_POSE * 0.4;
    for (let i = 0; i < mob.legs.length; i++) {
      const leg = mob.legs[i];
      const target = leg.front ? frontPose : backPose;
      leg.pivot.rotation.x += (target - leg.pivot.rotation.x) * Math.min(1, 10 * dt);
    }
  } else if (mob.walking) {
    const swing = Math.sin(mob.walkPhase) * LEG_SWING;
    for (let i = 0; i < mob.legs.length; i++) {
      mob.legs[i].pivot.rotation.x = swing * mob.legs[i].dir;
    }
  } else {
    const k = Math.min(1, 8 * dt);
    for (let i = 0; i < mob.legs.length; i++) {
      mob.legs[i].pivot.rotation.x += (0 - mob.legs[i].pivot.rotation.x) * k;
    }
  }

  if (mob.walking && mob.onGround) mob.walkPhase += dt * 8 * speedMult;
  else mob.walkPhase *= 0.85;

  mob.group.position.copy(mob.pos);
  mob.group.rotation.y = mob.yaw;

  animateHead(mob, dt);
  updateMobVisibility(mob);

  if (mob.pos.y < -10) {
    const ix = Math.floor(mob.pos.x), iz = Math.floor(mob.pos.z);
    if (ix >= 0 && ix < SX && iz >= 0 && iz < SZ) mob.pos.y = highestAt(ix, iz) + 0.5;
    else mob.pos.y = 30;
    mob.vel.set(0, 0, 0);
  }
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
    mobs[i].group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
    });
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

function update(dt, pPos, renderDistanceBlocks) {
  if (pPos) playerPos = pPos;
  if (typeof renderDistanceBlocks === 'number' && renderDistanceBlocks > 0) {
    renderDistBlocks = renderDistanceBlocks;
  }
  for (let i = 0; i < mobs.length; i++) updateMob(mobs[i], dt);

  for (let i = mobs.length - 1; i >= 0; i--) {
    if (mobs[i].dead) {
      scene.remove(mobs[i].group);
      mobs[i].group.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
      });
      mobs.splice(i, 1);
    }
  }
}

return {
  init: init,
  update: update,
  spawnAt: spawnAt,
  spawnInitial: spawnInitial,
  clear: clear,
  serialize: serialize,
  deserialize: deserialize,
  count: function () { return mobs.length; },
  raycast: function (origin, dir, maxDist) { return raycastMob(origin, dir, maxDist); },
  hit: hitMob,
  rebuildTextures: rebuildTextures,
  isBlockOccupied: isBlockOccupied,
  setMuted: setMuted
};

})();