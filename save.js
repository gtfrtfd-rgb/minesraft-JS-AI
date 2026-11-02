/* ============================================================
   save.js — RLE-сжатие + сохранение/загрузка в localStorage.
   ============================================================ */
(function () {
'use strict';

const G = window.GAME;
if (!G) return;

function u8ToB64(u8) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH)
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
function b64ToU8(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
function rleEncode(arr) {
  const out = [];
  const n = arr.length;
  let i = 0;
  while (i < n) {
    const v = arr[i];
    let run = 1;
    while (i + run < n && arr[i + run] === v && run < 65535) run++;
    out.push(v, run & 0xff, (run >> 8) & 0xff);
    i += run;
  }
  return new Uint8Array(out);
}
function rleDecode(u8, targetLen) {
  const out = new Uint8Array(targetLen);
  let o = 0;
  for (let i = 0; i + 2 < u8.length && o < targetLen; i += 3) {
    const v = u8[i];
    const run = u8[i + 1] | (u8[i + 2] << 8);
    const end = Math.min(o + run, targetLen);
    while (o < end) out[o++] = v;
  }
  return out;
}

function markDirty() { G.dirty = true; }

function saveGame() {
  try {
    const W = G.api.worlds;
    if (!W) return;
    const key = W.getCurrentSaveKey();
    if (!key) return;

    const compressed = rleEncode(G.world);
    localStorage.setItem(key, JSON.stringify({
      v: 2, rle: 1,
      seed: G.worldSeed,
      w: u8ToB64(compressed),
      px: G.player.pos.x, py: G.player.pos.y, pz: G.player.pos.z,
      yaw: G.yaw, pitch: G.pitch, fly: G.player.fly,
      hp: G.hp,
      mode: G.gameMode,
      mobs: G.MOBS.serialize()
    }));
    W.touchWorld(W.getActiveWorldId());
    G.dirty = false;
  } catch (e) { console.warn('Не удалось сохранить:', e); }
}

function loadGame() {
  try {
    const W = G.api.worlds;
    if (!W) return false;
    const key = W.getCurrentSaveKey();
    if (!key) return false;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const d = JSON.parse(raw);
    const bytes = b64ToU8(d.w);

    if (d.rle === 1) {
      const unpacked = rleDecode(bytes, G.world.length);
      G.world.set(unpacked);
    } else {
      if (bytes.length !== G.world.length) return false;
      G.world.set(bytes);
    }

    G.worldSeed = d.seed || G.worldSeed;
    G.player.pos.set(d.px, d.py, d.pz);
    G.player.vel.set(0, 0, 0);
    G.yaw = d.yaw || 0; G.pitch = d.pitch || 0;
    if (d.mode === 'creative' || d.mode === 'survival') {
      G.gameMode = d.mode;
      G.settings.gameMode = d.mode;
      G.api.settings.saveSettings(G.settings);
    }
    G.player.fly = !!d.fly && G.gameMode === 'creative';
    if (typeof d.hp === 'number' && d.hp > 0) G.hp = Math.min(G.MAX_HP, d.hp);
    else G.hp = G.MAX_HP;
    if (G.gameMode === 'creative') G.hp = G.MAX_HP;
    if (G.api.player && G.api.player.refreshHearts) G.api.player.refreshHearts();
    if (d.mobs && d.mobs.length) G.MOBS.deserialize(d.mobs);
    return true;
  } catch (e) { console.warn('Не удалось загрузить:', e); return false; }
}

window.addEventListener('beforeunload', function () { if (G.dirty) saveGame(); });

G.api.save = { saveGame, loadGame, markDirty, rleEncode, rleDecode, u8ToB64, b64ToU8 };

})();