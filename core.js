/* ============================================================
   core.js — общий контекст игры (состояние + ссылки на движок).
   Загружается первым из «игровых» модулей.
   Все остальные модули читают/пишут через window.GAME.
   ============================================================ */
(function () {
'use strict';

const R = window.RENDER;
if (!R || !R.ok) return; // main.js покажет ошибку
const MC = window.MC;
if (!MC || !MC.generateWorld) return;

/* --- Ссылки на движок --- */
const G = {
  /* three.js */
  THREE: window.THREE,
  scene: R.scene,
  renderer: R.renderer,
  camera: R.camera,

  /* world.js */
  MC: MC,
  SX: MC.SX, SZ: MC.SZ, SY: MC.SY,
  CHX: MC.CHX, CHZ: MC.CHZ,
  CS: MC.CS,
  world: MC.world,
  IDX: MC.IDX,
  BLOCKS: MC.BLOCKS,
  ACOLS: MC.ACOLS,
  atlasCanvas: MC.atlasCanvas,
  isSolid: MC.isSolid,
  highestAt: MC.highestAt,
  generateWorld: MC.generateWorld,
  buildChunk: MC.buildChunk,
  rebuildAround: MC.rebuildAround,
  rebuildAll: MC.rebuildAll,
  updateChunkVisibility: MC.updateChunkVisibility,

  /* render.js */
  BASE_FOV:   R.BASE_FOV,
  SPRINT_FOV: R.SPRINT_FOV,
  FLY_FOV:    R.FLY_FOV,
  crackTextures: R.crackTextures,
  crackMat:  R.crackMat,
  crackMesh: R.crackMesh,
  updateClouds: R.updateClouds,
  updateSun: R.updateSun,

  /* Звуки и мобы (с fallback-заглушками) */
  SFX: null,
  MOBS: null,

  /* Версия */
  GAME_VERSION: 'V2.5-V3.TEST MENU',

  /* --- Константы игрока --- */
  PR: 0.3, PH: 1.8,
  GRAVITY: 28, JUMP: 9,
  PLAYER_DAMAGE: 4,
  ATTACK_RANGE: 3.5,
  ATTACK_COOLDOWN: 0.4,
  EYE_STAND: 1.62,
  EYE_CROUCH: 1.28,

  /* --- HP --- */
  MAX_HP: 20,
  HEARTS: 10,
  FALL_SAFE: 3,
  REGEN_DELAY_MS: 8000,
  REGEN_INTERVAL_S: 4.0,

  /* --- Харднесс блоков --- */
  HARDNESS: {
    1: 0.55, 2: 0.45, 3: 1.30, 4: 1.10, 5: 0.45,
    6: 0.85, 7: 0.20, 8: 0.85, 9: 1.20,
    10: 0.28, 11: 0.35, 12: 3.50
  },

  /* --- FPS --- */
  FPS_OPTIONS: [15, 30, 60, 90, 120, 144, 165, 180, 240, 0],
  FPS_LABELS:  ['15', '30', '60', '90', '120', '144', '165', '180', '240', '∞'],

  /* --- Хотбар --- */
  HOTBAR: [1, 2, 3, 4, 8, 9, 6, 7, 10, 5, 11],

  /* --- Состояние игрока --- */
  player: {
    pos: new THREE.Vector3(MC.SX / 2 + 0.5, 40, MC.SZ / 2 + 0.5),
    vel: new THREE.Vector3(),
    onGround: false,
    fly: false,
    crouch: false
  },

  /* --- Углы обзора --- */
  yaw: 0,
  pitch: 0,

  /* --- Ввод --- */
  keys: Object.create(null),
  locked: false,
  paused: false,
  mouseDown: [false, false, false],
  lastTap: { KeyW: 0, ArrowUp: 0 },
  doubleLock: { KeyW: false, ArrowUp: false },
  DOUBLE_TAP_MS: 280,

  /* --- Здоровье --- */
  hp: 20,
  dead: false,
  lastDamageTime: -99999,
  regenAcc: 0,
  wasOnGround: true,
  highestAirY: 0,
  eyeBlend: 0,

  /* --- Режим игры --- */
  gameMode: 'survival',

  /* --- Настройки --- */
  settings: null,
  fpsLimit: 60,

  /* --- Хотбар: выбранный слот --- */
  selected: 0,

  /* --- Атака/ломание --- */
  attackTimer: 0,
  currentTarget: null,
  breaking: { active: false, target: null, progress: 0, stage: 0 },
  creativeBrokeThisClick: false,

  /* --- Шаги/спринт --- */
  stepAcc: 0,
  sprintActive: false,
  STEP_DIST_WALK: 1.6,
  STEP_DIST_SPRINT: 1.25,

  /* --- Сохранение --- */
  dirty: false,
  worldSeed: 1337,
  saveTimer: 0,

  /* --- Панель настроек (drag) --- */
  panelJustDragged: false,
  wasInGameBeforeSettings: false,

  /* --- Кэш видимости чанков --- */
  lastVisChunkCx: -99999,
  lastVisChunkCz: -99999,
  lastVisRadius: -1,

  /* --- Переиспользуемые векторы для цикла --- */
  _fwd: new THREE.Vector3(),
  _rgt: new THREE.Vector3(),
  _wish: new THREE.Vector3(),
  _dir: new THREE.Vector3(),
  _hitDir: new THREE.Vector3(),

  /* --- Время/счётчики FPS --- */
  lastT: performance.now(),
  fpsAcc: 0, fpsCount: 0, fpsVal: 60,

  /* --- Реестр игровых модулей (функции-хуки) ---
     Модули дописывают свои ссылки сюда, чтобы main.js мог их вызвать. */
  api: {}
};

/* SFX-заглушки */
(function () {
  const s = window.SFX;
  if (s) {
    if (!s.flyOn)  s.flyOn  = function () {};
    if (!s.flyOff) s.flyOff = function () {};
    if (!s.hurt)   s.hurt   = function () {};
    if (!s.death)  s.death  = function () {};
    if (!s.setVolume) s.setVolume = function () {};
    if (!s.getVolume) s.getVolume = function () { return 1; };
    G.SFX = s;
    return;
  }
  console.warn('[core.js] sounds.js не загрузился — работаем без звуков');
  const noop = function () {};
  G.SFX = {
    resume: noop, break: noop, place: noop, step: noop, jump: noop,
    select: noop, flyOn: noop, flyOff: noop, hurt: noop, death: noop,
    setVolume: noop, getVolume: function () { return 1; }
  };
})();

/* MOBS-заглушки */
(function () {
  const m = window.MOBS;
  if (m && m.raycast && m.hit) {
    if (!m.rebuildTextures) m.rebuildTextures = function () {};
    if (!m.isBlockOccupied) m.isBlockOccupied = function () { return false; };
    if (!m.setMuted) m.setMuted = function () {};
    G.MOBS = m;
    return;
  }
  console.warn('[core.js] mobs.js не загрузился полностью — мобы отключены');
  const noop = function () {};
  G.MOBS = {
    init: noop, update: noop,
    spawnInitial: function () { return 0; },
    spawnAt: function () { return null; },
    clear: noop,
    serialize: function () { return []; },
    deserialize: noop,
    count: function () { return 0; },
    raycast: function () { return null; },
    hit: function () { return false; },
    rebuildTextures: noop,
    isBlockOccupied: function () { return false; },
    setMuted: noop
  };
})();

window.GAME = G;

})();