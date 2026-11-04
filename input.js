/* ============================================================
   input.js — клавиатура, мышь, pointer-lock, пауза, меню,
   хотбар (выбор слота).
   ============================================================ */
(function () {
'use strict';

const G = window.GAME;
if (!G) return;

const SFX = G.SFX;
const renderer = G.renderer;

const menu = document.getElementById('menu');
const startBtn = document.getElementById('startBtn');
const pauseEl = document.getElementById('pause');
const pauseWorldInfo = document.getElementById('pauseWorldInfo');
const pauseResumeBtn = document.getElementById('pauseResume');
const pauseExitBtn = document.getElementById('pauseExit');
const settingsPanel = document.getElementById('settings-panel');

/* --- Хотбар --- */
const hotbarEl = document.getElementById('hotbar');
const slotEls = [];

// Вспомогательная функция: вырезает нужный тайл из атласа
function getTileDataURL(tileIndex) {
  const TILE = 16;
  // Берем актуальное значение ACOLS (8), иначе иконки съедут
  const ACOLS = G.MC.ACOLS || 8; 
  
  const col = tileIndex % ACOLS;
  const row = Math.floor(tileIndex / ACOLS);
  
  const c = document.createElement('canvas');
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(G.atlasCanvas, col * TILE, row * TILE, TILE, TILE, 0, 0, TILE, TILE);
  return c.toDataURL();
}

G.HOTBAR.forEach(function (id, i) {
  const el = document.createElement('div');
  el.className = 'slot';
  const t = G.BLOCKS[id].side; // используем боковую текстуру
  
  el.style.backgroundImage = 'url(' + getTileDataURL(t) + ')';
  
  const label = (i === 9) ? '0' : (i === 10) ? '−' : (i + 1);
  el.innerHTML = '<span class="num">' + label + '</span>';
  el.title = G.BLOCKS[id].name;
  el.addEventListener('click', function () { selectSlot(i); });
  if (hotbarEl) hotbarEl.appendChild(el);
  slotEls.push(el);
});

function selectSlot(i) {
  if (i === G.selected && slotEls[i] && slotEls[i].classList.contains('active')) return;
  G.selected = i;
  slotEls.forEach(function (el, k) { el.classList.toggle('active', k === i); });
  SFX.select();
}
selectSlot(0);

/* --- Ввод с клавиатуры --- */
function isInputFocused() {
  const ae = document.activeElement;
  if (!ae) return false;
  const tag = ae.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || ae.isContentEditable;
}

function lockPointer() {
  SFX.resume();
  try {
    const p = renderer.domElement.requestPointerLock();
    // Перехватываем ошибку, если браузер блокирует захват (например, после Escape)
    if (p && p.catch) p.catch(function () {});
  } catch (e) {}
}

function resetInputState() {
  for (const k in G.keys) G.keys[k] = false;
  G.player.crouch = false;
  G.mouseDown[0] = false;
  G.mouseDown[1] = false;
  G.mouseDown[2] = false;
  G.doubleLock.KeyW = false;
  G.doubleLock.ArrowUp = false;
  if (G.api.raycast) G.api.raycast.stopBreaking();
}

/* --- Пауза --- */
function openPause() {
  if (G.dead || G.paused) return;
  G.paused = true;
  if (pauseEl) pauseEl.style.display = 'flex';
  if (menu) menu.style.display = 'none';
  if (pauseWorldInfo) {
    const W = G.api.worlds;
    const w = W ? W.getActiveWorld() : null;
    const modeStr = (G.gameMode === 'creative') ? 'Креатив' : 'Выживание';
    pauseWorldInfo.textContent = (w ? w.name : 'Мир') + '  ·  ' + modeStr;
  }
  if (document.pointerLockElement) {
    try { document.exitPointerLock(); } catch (e) {}
  }
}

function closePause() {
  if (!G.paused) return;
  G.paused = false;
  if (pauseEl) pauseEl.style.display = 'none';
}

function exitToMainMenu() {
  if (G.dirty && G.api.save) G.api.save.saveGame();
  closePause();
  G.locked = false;
  resetInputState();
  if (menu) menu.style.display = 'flex';
  if (document.pointerLockElement) {
    try { document.exitPointerLock(); } catch (e) {}
  }
}

if (pauseResumeBtn) {
  pauseResumeBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    closePause();
    lockPointer();
  });
}
if (pauseExitBtn) {
  pauseExitBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    exitToMainMenu();
  });
}

if (startBtn) startBtn.addEventListener('click', lockPointer);
renderer.domElement.addEventListener('click', function () {
  if (!G.locked && !G.dead && !G.paused &&
      settingsPanel && !settingsPanel.classList.contains('open')) {
    lockPointer();
  }
});

document.addEventListener('pointerlockchange', function () {
  const nowLocked = document.pointerLockElement === renderer.domElement;
  const wasLocked = G.locked;

  if (wasLocked && !nowLocked) {
    resetInputState();
  }

  if (wasLocked && !nowLocked && settingsPanel && settingsPanel.classList.contains('open')) {
    G.locked = false;
    return;
  }

  G.locked = nowLocked;

  if (wasLocked && !nowLocked && !G.dead && !G.paused) {
    openPause();
    return;
  }

  if (G.paused) {
    if (menu) menu.style.display = 'none';
    return;
  }

  if (menu) menu.style.display = (G.locked || G.dead) ? 'none' : 'flex';
});

document.addEventListener('mousemove', function (e) {
  if (!G.locked || G.dead) return;
  G.yaw   -= e.movementX * 0.0022;
  G.pitch -= e.movementY * 0.0022;
  const lim = Math.PI / 2 - 0.001;
  if (G.pitch >  lim) G.pitch =  lim;
  if (G.pitch < -lim) G.pitch = -lim;
});

document.addEventListener('keydown', function (e) {
  if (isInputFocused()) return;

  if (G.paused) {
    if (e.code === 'Escape' && !e.repeat) {
      e.preventDefault();
      closePause();
      lockPointer();
    }
    return;
  }

  if (G.dead) return;
  if (e.code === 'KeyO' && !e.repeat) {
    e.preventDefault();
    if (G.api.settings) G.api.settings.toggleSettings();
    return;
  }
  if (e.code === 'KeyF' && !e.repeat) {
    if (G.api.player) G.api.player.toggleFly();
  }

  if (e.code === 'KeyG' && !e.repeat) {
    if (G.api.settings) G.api.settings.setGameMode(G.gameMode === 'creative' ? 'survival' : 'creative', false);
  }

  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) {
    G.player.crouch = true;
  }

  if ((e.code === 'KeyW' || e.code === 'ArrowUp') && !e.repeat) {
    const now = performance.now();
    if (now - G.lastTap[e.code] < G.DOUBLE_TAP_MS) {
      G.doubleLock[e.code] = true;
      if (G.api.hud) G.api.hud.showHint('Бег: ВКЛ');
    }
    G.lastTap[e.code] = now;
  }
  G.keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code.indexOf('Arrow') === 0) e.preventDefault();
  if (e.code.indexOf('Digit') === 0) {
    let n = parseInt(e.code.slice(5), 10);
    if (n === 0) n = 10;
    if (n >= 1 && n <= G.HOTBAR.length) selectSlot(n - 1);
  } else if (e.code === 'Minus') {
    if (G.HOTBAR.length >= 11) selectSlot(10);
  }
});

document.addEventListener('keyup', function (e) {
  G.keys[e.code] = false;
  if (e.code === 'KeyW')    G.doubleLock.KeyW = false;
  if (e.code === 'ArrowUp') G.doubleLock.ArrowUp = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') G.player.crouch = false;
});

document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

renderer.domElement.addEventListener('mousedown', function (e) {
  if (!G.locked || G.dead || G.paused) return;
  G.mouseDown[e.button] = true;
  if (e.button === 0) {
    G.breaking.active = false;
    G.breaking.progress = 0;
    G.breaking.stage = 0;
    G.creativeBrokeThisClick = false;
  }
  if (e.button === 2 && G.api.raycast) G.api.raycast.placeBlock();
});
renderer.domElement.addEventListener('mouseup', function (e) {
  G.mouseDown[e.button] = false;
  if (e.button === 0) {
    if (G.api.raycast) G.api.raycast.stopBreaking();
    G.creativeBrokeThisClick = false;
  }
});

document.addEventListener('wheel', function (e) {
  if (!G.locked || G.dead || G.paused) return;
  const d = e.deltaY > 0 ? 1 : -1;
  selectSlot((G.selected + d + G.HOTBAR.length) % G.HOTBAR.length);
}, { passive: true });

G.api.input = {
  lockPointer,
  openPause,
  closePause
};

})();