/* ============================================================
   player.js — коллизии, движение, HP/урон/реген, respawn, полёт.
   ============================================================ */
(function () {
'use strict';

const G = window.GAME;
if (!G) return;

const SFX = G.SFX;

/* --- Heart DOM (создаём один раз) --- */
const healthEl = document.getElementById('health');
const hurtEl = document.getElementById('hurt');
const deathEl = document.getElementById('death');
const respawnBtn = document.getElementById('respawnBtn');

const heartEls = [];
if (healthEl) {
  for (let i = 0; i < G.HEARTS; i++) {
    const h = document.createElement('div');
    h.className = 'heart';
    healthEl.appendChild(h);
    heartEls.push(h);
  }
}

function refreshHearts() {
  for (let i = 0; i < G.HEARTS; i++) {
    const v = G.hp - i * 2;
    const el = heartEls[i];
    if (!el) continue;
    if (v >= 2) el.classList.remove('empty', 'half');
    else if (v === 1) { el.classList.add('half'); el.classList.remove('empty'); }
    else { el.classList.add('empty'); el.classList.remove('half'); }
  }
}
refreshHearts();

let hurtTimer = null;
function flashHurt() {
  if (!hurtEl) return;
  hurtEl.style.opacity = '1';
  clearTimeout(hurtTimer);
  hurtTimer = setTimeout(function () { hurtEl.style.opacity = '0'; }, 130);
}

/* --- Коллизии --- */
function collides(px, py, pz) {
  const SX = G.SX, SZ = G.SZ, PR = G.PR, PH = G.PH;
  if (px - PR < 0)  return true;
  if (px + PR > SX) return true;
  if (pz - PR < 0)  return true;
  if (pz + PR > SZ) return true;
  const e = 1e-4;
  const x0 = Math.floor(px - PR + e), x1 = Math.floor(px + PR - e);
  const y0 = Math.floor(py + e),      y1 = Math.floor(py + PH - e);
  const z0 = Math.floor(pz - PR + e), z1 = Math.floor(pz + PR - e);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++)
        if (G.world[G.IDX(x, y, z)] !== 0) return true;
  return false;
}

function tryMove(dx, dy, dz) {
  const p = G.player;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.2));
  const sx = dx / steps, sy = dy / steps, sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      p.pos.x += sx;
      if (collides(p.pos.x, p.pos.y, p.pos.z)) {
        p.pos.x -= sx; p.vel.x = 0;
      }
    }
    if (sz !== 0) {
      p.pos.z += sz;
      if (collides(p.pos.x, p.pos.y, p.pos.z)) {
        p.pos.z -= sz; p.vel.z = 0;
      }
    }
    if (sy !== 0) {
      p.pos.y += sy;
      if (collides(p.pos.x, p.pos.y, p.pos.z)) {
        p.pos.y -= sy;
        if (sy < 0) p.onGround = true;
        p.vel.y = 0;
      }
    }
  }
}

function respawn() {
  const cx = Math.floor(G.SX / 2), cz = Math.floor(G.SZ / 2);
  G.player.pos.set(cx + 0.5, G.highestAt(cx, cz) + 0.1, cz + 0.5);
  G.player.vel.set(0, 0, 0);
  G.player.crouch = false;
}

/* --- HP --- */
function damagePlayer(amount, silent) {
  if (G.dead || amount <= 0) return;
  if (G.gameMode === 'creative') return;
  G.hp -= amount;
  if (G.hp < 0) G.hp = 0;
  G.lastDamageTime = performance.now();
  G.regenAcc = 0;
  refreshHearts();
  flashHurt();
  if (!silent) {
    if (G.hp > 0) SFX.hurt();
    else          SFX.death();
  }
  if (G.hp === 0) die();
}

function healPlayer(amount) {
  if (G.dead || amount <= 0) return;
  G.hp = Math.min(G.MAX_HP, G.hp + amount);
  refreshHearts();
}

function die() {
  if (G.dead) return;
  if (G.gameMode === 'creative') { G.hp = G.MAX_HP; refreshHearts(); return; }
  G.dead = true;
  G.player.fly = false;
  G.player.crouch = false;
  G.player.vel.set(0, 0, 0);
  if (deathEl) deathEl.style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock();
  console.log('[player.js] игрок умер');
}

function respawnFromDeath() {
  G.dead = false;
  G.hp = G.MAX_HP;
  G.lastDamageTime = -99999;
  G.regenAcc = 0;
  refreshHearts();
  if (deathEl) deathEl.style.display = 'none';
  respawn();
  G.wasOnGround = true;
  G.highestAirY = G.player.pos.y;
  G.player.crouch = false;
  if (G.api.input && G.api.input.lockPointer) G.api.input.lockPointer();
  if (G.api.settings && G.api.settings.applyRenderDistance) G.api.settings.applyRenderDistance();
}

if (respawnBtn) {
  respawnBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    respawnFromDeath();
  });
}

function toggleFly() {
  if (G.dead) return;
  if (G.gameMode !== 'creative') {
    if (G.api.hud) G.api.hud.showHint('Полёт доступен только в Креативе');
    return;
  }
  G.player.fly = !G.player.fly;
  G.player.vel.y = 0;
  G.wasOnGround = false;
  G.highestAirY = G.player.pos.y;
  if (G.player.fly) {
    G.player.crouch = false;
    SFX.flyOn();
    if (G.api.hud) G.api.hud.showHint('Полёт: ВКЛ');
  } else {
    SFX.flyOff();
    if (G.api.hud) G.api.hud.showHint('Полёт: ВЫКЛ');
  }
}

G.api.player = {
  collides,
  tryMove,
  respawn,
  damagePlayer,
  healPlayer,
  die,
  respawnFromDeath,
  refreshHearts,
  flashHurt,
  toggleFly
};

})();