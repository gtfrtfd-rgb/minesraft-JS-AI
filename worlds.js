/* ============================================================
   worlds.js — менеджер миров (localStorage).
   Без UI, только данные.
   ============================================================ */
(function () {
'use strict';

const G = window.GAME;
if (!G) return;

const WORLDS_LIST_KEY = 'mcweb_worlds_v1';
const ACTIVE_WORLD_KEY = 'mcweb_active_world';
const WORLD_DATA_PREFIX = 'mcweb_world_';
const LEGACY_SAVE_KEY = G.MC.SAVE_KEY;

function loadWorldsList() {
  try {
    const raw = localStorage.getItem(WORLDS_LIST_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function saveWorldsList(list) {
  try { localStorage.setItem(WORLDS_LIST_KEY, JSON.stringify(list)); } catch (e) {}
}
function getActiveWorldId() {
  try { return localStorage.getItem(ACTIVE_WORLD_KEY) || ''; } catch (e) { return ''; }
}
function setActiveWorldId(id) {
  try { localStorage.setItem(ACTIVE_WORLD_KEY, id || ''); } catch (e) {}
}
function getWorldSaveKey(id) {
  return WORLD_DATA_PREFIX + id;
}
function generateWorldId() {
  return 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}
function getActiveWorld() {
  const id = getActiveWorldId();
  const list = loadWorldsList();
  return list.find(function (w) { return w.id === id; }) || null;
}
function ensureActiveWorld() {
  let list = loadWorldsList();
  const activeId = getActiveWorldId();

  if (list.length === 0) {
    const id = generateWorldId();
    const newWorld = {
      id: id,
      name: 'Мой мир',
      seed: (Math.random() * 1e9) | 0,
      created: Date.now(),
      lastPlayed: Date.now()
    };
    let legacy = null;
    try { legacy = localStorage.getItem(LEGACY_SAVE_KEY); } catch (e) {}
    if (legacy) {
      try {
        localStorage.setItem(getWorldSaveKey(id), legacy);
        localStorage.removeItem(LEGACY_SAVE_KEY);
        try {
          const parsed = JSON.parse(legacy);
          if (parsed && typeof parsed.seed === 'number') newWorld.seed = parsed.seed;
        } catch (e) {}
      } catch (e) {}
    }
    list = [newWorld];
    saveWorldsList(list);
    setActiveWorldId(id);
    return newWorld;
  }

  let active = list.find(function (w) { return w.id === activeId; });
  if (!active) {
    active = list[0];
    setActiveWorldId(active.id);
  }
  return active;
}
function createWorld(name) {
  const list = loadWorldsList();
  const id = generateWorldId();
  const seed = (Math.random() * 1e9) | 0;
  const w = {
    id: id,
    name: (name || ('Мир ' + (list.length + 1))).trim().slice(0, 32) || 'Без имени',
    seed: seed,
    created: Date.now(),
    lastPlayed: Date.now()
  };
  list.push(w);
  saveWorldsList(list);
  setActiveWorldId(id);
  return w;
}
function deleteWorld(id) {
  const list = loadWorldsList();
  const idx = list.findIndex(function (w) { return w.id === id; });
  if (idx < 0) return false;
  list.splice(idx, 1);
  saveWorldsList(list);
  try { localStorage.removeItem(getWorldSaveKey(id)); } catch (e) {}
  if (getActiveWorldId() === id) {
    setActiveWorldId(list.length > 0 ? list[0].id : '');
  }
  return true;
}
function renameWorld(id, newName) {
  const list = loadWorldsList();
  const w = list.find(function (x) { return x.id === id; });
  if (!w) return false;
  w.name = String(newName || '').trim().slice(0, 32) || 'Без имени';
  saveWorldsList(list);
  return true;
}
function touchWorld(id) {
  const list = loadWorldsList();
  const w = list.find(function (x) { return x.id === id; });
  if (!w) return;
  w.lastPlayed = Date.now();
  saveWorldsList(list);
}
function getCurrentSaveKey() {
  const id = getActiveWorldId();
  return id ? getWorldSaveKey(id) : '';
}

G.api.worlds = {
  loadWorldsList,
  saveWorldsList,
  getActiveWorldId,
  setActiveWorldId,
  getWorldSaveKey,
  getActiveWorld,
  ensureActiveWorld,
  createWorld,
  deleteWorld,
  renameWorld,
  touchWorld,
  getCurrentSaveKey
};

})();