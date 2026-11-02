/* ============================================================
   main.js — точка входа: инициализация мира, главный цикл update/loop.
   Загружается последним.
   ============================================================ */
(function () {
'use strict';

const G = window.GAME;

function fatal(msg) {
  const el = document.getElementById('loading');
  if (el) {
    el.style.display = 'flex';
    el.innerHTML = '<div style="max-width:640px;padding:20px;text-align:center">' +
      '<div style="font-size:22px;margin-bottom:12px">Ошибка запуска</div>' +
      '<div style="font-size:14px;opacity:.8;line-height:1.5">' + msg + '</div>' +
      '<div style="font-size:13px;opacity:.6;margin-top:16px">Откройте F12 → Console для подробностей</div></div>';
  }
  console.error('[main.js] FATAL:', msg);
}

if (!G) {
  if (!window.RENDER) { fatal('render.js не загрузился.'); return; }
  if (window.RENDER.reason === 'no-three') { fatal('Библиотека three.js не загрузилась.'); return; }
  if (window.RENDER.reason === 'no-mc') { fatal('world.js не загрузился или упал.'); return; }
  fatal('core.js не загрузился.');
  return;
}

const SFX = G.SFX;
const MOBS = G.MOBS;

MOBS.init(G.scene);

/* --- Loading --- */
const loadingEl = document.getElementById('loading');
const loadingTextEl = loadingEl ? loadingEl.querySelector('div') : null;
const infoEl = document.getElementById('info');

function setLoadingText(t) { if (loadingTextEl) loadingTextEl.textContent = t; }
function showLoading(on) { if (loadingEl) loadingEl.style.display = on ? 'flex' : 'none'; }

function buildChunksAsync(onProgress, onDone) {
  const total = G.CHX * G.CHZ;
  let cx = 0, cz = 0, built = 0;
  function step() {
    const t0 = performance.now();
    while (cz < G.CHZ && (performance.now() - t0) < 14) {
      G.buildChunk(cx, cz);
      built++;
      cx++;
      if (cx >= G.CHX) { cx = 0; cz++; }
    }
    onProgress(built, total);
    if (cz >= G.CHZ) { onDone(); return; }
    requestAnimationFrame(step);
  }
  step();
}

/* --- Инициализация --- */
(function init() {
  const W = G.api.worlds;
  const S = G.api.settings;

  const activeWorld = W.ensureActiveWorld();
  if (activeWorld && typeof activeWorld.seed === 'number') {
    G.worldSeed = activeWorld.seed;
  }

  showLoading(true);
  setLoadingText('Загрузка сохранения…');

  S.setGameMode(G.gameMode, true);
  if (G.gameMode === 'creative') {
    G.player.fly = true;
    G.wasOnGround = false;
    G.highestAirY = G.player.pos.y;
  }

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      try {
        const loaded = G.api.save.loadGame();
        if (!loaded) {
          setLoadingText('Генерация мира…');
          G.generateWorld(G.worldSeed);
        }
        if (!loaded) G.api.player.respawn();
        if (G.player.pos.y < 0 || G.player.pos.y > G.SY) G.api.player.respawn();

        if (G.gameMode !== 'creative') G.player.fly = false;
        S.updateHealthVisibility();

        if (loaded) {
          const cx = Math.floor(G.player.pos.x), cz = Math.floor(G.player.pos.z);
          if (cx >= 0 && cx < G.SX && cz >= 0 && cz < G.SZ) {
            const top = G.highestAt(cx, cz);
            if (G.player.pos.y < top) G.player.pos.y = top + 0.1;
          }
        }

        setLoadingText('Построение мешей… 0%');

        buildChunksAsync(
          function (built, total) {
            setLoadingText('Построение мешей… ' + Math.round(built / total * 100) + '%');
          },
          function () {
            if (MOBS.count() === 0) {
              setLoadingText('Спавн мобов…');
              MOBS.spawnInitial(40);
            }
            G.wasOnGround = true;
            G.highestAirY = G.player.pos.y;
            S.applyRenderDistance();
            showLoading(false);
            console.log('[main.js] init OK. Мир:', activeWorld ? activeWorld.name : '(нет)',
                        '| Игрок:', G.player.pos.toArray(),
                        '| мобов:', MOBS.count(), '| hp:', G.hp,
                        '| режим:', G.gameMode,
                        '| renderDist:', G.settings.renderDist,
                        '| fpsLimit:', G.fpsLimit || '∞');
          }
        );
      } catch (e) {
        fatal('Ошибка при инициализации: ' + (e && e.message ? e.message : e));
      }
    });
  });
})();

/* --- Видимость чанков --- */
function maybeUpdateChunkVisibility() {
  const cx = Math.floor(G.player.pos.x / G.CS);
  const cz = Math.floor(G.player.pos.z / G.CS);
  if (cx === G.lastVisChunkCx && cz === G.lastVisChunkCz &&
      G.settings.renderDist === G.lastVisRadius) return;
  G.lastVisChunkCx = cx;
  G.lastVisChunkCz = cz;
  G.lastVisRadius  = G.settings.renderDist;
  G.updateChunkVisibility(G.player.pos.x, G.player.pos.z, G.settings.renderDist * G.CS);
}

/* --- Главный update --- */
function update(dt) {
  if (G.attackTimer > 0) G.attackTimer -= dt;
  G.updateClouds(dt, G.player.pos);
  G.updateSun(dt, G.player.pos);

  if (MOBS.setMuted) MOBS.setMuted(!G.locked || G.paused);

  if (!G.dead && !G.paused) {
    const sinYaw = Math.sin(G.yaw);
    const cosYaw = Math.cos(G.yaw);
    const fwd = G._fwd.set(-sinYaw, 0, -cosYaw);
    const rgt = G._rgt.set( cosYaw, 0, -sinYaw);
    const wish = G._wish.set(0, 0, 0);
    const keys = G.keys;

    let moving = false;

    if (G.locked) {
      if (keys['KeyW']) wish.add(fwd);
      if (keys['KeyS']) wish.sub(fwd);
      if (keys['KeyD']) wish.add(rgt);
      if (keys['KeyA']) wish.sub(rgt);
      if (keys['ArrowUp'])    wish.add(fwd);
      if (keys['ArrowDown'])  wish.sub(fwd);
      if (keys['ArrowRight']) wish.add(rgt);
      if (keys['ArrowLeft'])  wish.sub(rgt);
      moving = wish.lengthSq() > 0;
      if (moving) wish.normalize();
    }

    const crouching = G.player.crouch && !G.player.fly;

    const targetBlend = crouching ? 1 : 0;
    G.eyeBlend += (targetBlend - G.eyeBlend) * Math.min(1, 12 * dt);

    const forwardHeld = keys['KeyW'] || keys['ArrowUp'];
    const forwardLock = (keys['KeyW'] && G.doubleLock.KeyW) || (keys['ArrowUp'] && G.doubleLock.ArrowUp);
    const ctrl = !!keys['ControlLeft'];

    let fovTarget = G.BASE_FOV;
    G.sprintActive = false;

    if (G.player.fly) {
      const sp = ctrl ? 26 : 12;
      G.player.vel.x = wish.x * sp;
      G.player.vel.z = wish.z * sp;

      let vy = 0;
      if (keys['Space']) vy += sp;
      if (keys['ShiftLeft'] || keys['ShiftRight']) vy -= sp;
      G.player.vel.y = vy;

      G.player.onGround = false;
      G.stepAcc = 0;
      fovTarget = ctrl ? G.FLY_FOV + 8 : G.FLY_FOV;
    } else {
      G.sprintActive = !crouching && (
        ctrl || (forwardLock && forwardHeld && moving)
      );

      let sp;
      if (crouching)              sp = 1.9;
      else if (G.sprintActive)    sp = 7.4;
      else                        sp = 4.6;

      const tx = wish.x * sp, tz = wish.z * sp;
      const k = G.player.onGround ? 14 : 3.2;
      const a = Math.min(1, k * dt);
      G.player.vel.x += (tx - G.player.vel.x) * a;
      G.player.vel.z += (tz - G.player.vel.z) * a;

      G.player.vel.y -= G.GRAVITY * dt;
      if (G.player.vel.y < -55) G.player.vel.y = -55;

      if (G.locked && keys['Space'] && G.player.onGround) {
        G.player.vel.y = G.JUMP;
        G.player.onGround = false;
        SFX.jump();
      }
      G.player.onGround = false;

      if (G.sprintActive && moving && G.player.onGround) fovTarget = G.SPRINT_FOV;
    }

    G.api.player.tryMove(G.player.vel.x * dt, G.player.vel.y * dt, G.player.vel.z * dt);

    if (!G.player.fly) {
      G.player.onGround = G.api.player.collides(G.player.pos.x, G.player.pos.y - 0.03, G.player.pos.z);
      if (G.player.onGround && G.player.vel.y < 0) G.player.vel.y = 0;
    }

    if (!G.player.fly && G.gameMode !== 'creative') {
      if (!G.player.onGround) {
        if (G.wasOnGround) G.highestAirY = G.player.pos.y;
        if (G.player.pos.y > G.highestAirY) G.highestAirY = G.player.pos.y;
      } else {
        if (!G.wasOnGround) {
          const fallDist = G.highestAirY - G.player.pos.y;
          if (fallDist > G.FALL_SAFE) {
            const dmg = Math.floor(fallDist - G.FALL_SAFE);
            if (dmg > 0) G.api.player.damagePlayer(dmg);
          }
        }
      }
    } else {
      G.highestAirY = G.player.pos.y;
    }
    G.wasOnGround = G.player.onGround;

    if (!G.player.fly && G.player.onGround) {
      const spd = Math.hypot(G.player.vel.x, G.player.vel.z);
      if (spd > 0.4) {
        G.stepAcc += spd * dt;
        const need = G.sprintActive ? G.STEP_DIST_SPRINT : G.STEP_DIST_WALK;
        if (G.stepAcc >= need) {
          const fx = Math.floor(G.player.pos.x);
          const fz = Math.floor(G.player.pos.z);
          const fy = Math.floor(G.player.pos.y - 0.1);
          let underId = 0;
          if (fx >= 0 && fx < G.SX && fz >= 0 && fz < G.SZ && fy >= 0 && fy < G.SY) {
            underId = G.world[G.IDX(fx, fy, fz)];
          }
          SFX.step(underId, G.sprintActive);
          G.stepAcc = 0;
        }
      } else {
        G.stepAcc = 0;
      }
    } else {
      G.stepAcc = 0;
    }

    if (G.gameMode !== 'creative' && G.hp > 0 && G.hp < G.MAX_HP) {
      const sinceDmg = performance.now() - G.lastDamageTime;
      if (sinceDmg > G.REGEN_DELAY_MS) {
        G.regenAcc += dt;
        if (G.regenAcc >= G.REGEN_INTERVAL_S) {
          G.regenAcc = 0;
          G.api.player.healPlayer(1);
        }
      }
    }

    if (G.gameMode !== 'creative' && G.player.pos.y < -30) {
      G.api.player.damagePlayer(G.MAX_HP);
    }

    const newFov = G.camera.fov + (fovTarget - G.camera.fov) * Math.min(1, 8 * dt);
    if (Math.abs(newFov - G.camera.fov) > 0.01) {
      G.camera.fov = newFov;
      G.camera.updateProjectionMatrix();
    }
  } else {
    G.sprintActive = false;
  }

  try {
    MOBS.update(dt, G.player.pos, G.settings.renderDist * G.CS);
  } catch (e) {
    console.error('mobs update error', e);
  }

  const eyeNow = G.EYE_STAND + (G.EYE_CROUCH - G.EYE_STAND) * G.eyeBlend;
  G.camera.position.set(G.player.pos.x, G.player.pos.y + eyeNow, G.player.pos.z);
  G.camera.rotation.y = G.yaw;
  G.camera.rotation.x = G.pitch;

  G.currentTarget = (G.locked && !G.dead && !G.paused) ? G.api.raycast.raycastBlock() : null;
  G.api.raycast.updateHighlight();

  if (G.locked && G.mouseDown[0] && !G.dead && !G.paused) {
    if (G.api.raycast.tryAttackMob()) {
      if (G.breaking.active) G.api.raycast.stopBreaking();
    }
  }

  G.api.raycast.updateBreaking(dt);

  maybeUpdateChunkVisibility();

  G.saveTimer += dt;
  if (G.saveTimer > 12) {
    G.saveTimer = 0;
    if (G.dirty) G.api.save.saveGame();
  }
}

/* --- Главный цикл --- */
function loop(now) {
  requestAnimationFrame(loop);

  const fpsLimit = G.fpsLimit;
  if (fpsLimit > 0) {
    const interval = 1000 / fpsLimit;
    if (now - G.lastT < interval * 0.9) return;
  }

  const dt = Math.min((now - G.lastT) / 1000, 0.05);
  G.lastT = now;

  G.fpsAcc += dt; G.fpsCount++;
  if (G.fpsAcc > 0.5) {
    G.fpsVal = Math.round(G.fpsCount / G.fpsAcc);
    G.fpsAcc = 0; G.fpsCount = 0;
  }

  try {
    update(dt);
  } catch (e) {
    console.error('update error', e);
  }

  if (infoEl) {
    infoEl.textContent =
      'XYZ: ' + G.player.pos.x.toFixed(1) + ' / ' + G.player.pos.y.toFixed(1) + ' / ' + G.player.pos.z.toFixed(1) + '\n' +
      'FPS: ' + G.fpsVal + (fpsLimit > 0 ? '/' + fpsLimit : '') +
      '  ·  R: ' + G.settings.renderDist +
      '  ·  ' + (G.gameMode === 'creative' ? 'Креатив' : 'Выживание');
  }

  try {
    G.renderer.render(G.scene, G.camera);
  } catch (e) {}
}

requestAnimationFrame(loop);

console.log('[main.js] скрипт загружен. | режим:', G.gameMode);

})();