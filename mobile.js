/* ============================================================
   mobile.js — виртуальные тач-контролы для мобильных устройств.
   Активируется только на устройствах с touch-вводом (pointer: coarse).

   Архитектура:
     • Не модифицирует существующие модули — работает через G.api.*
     • Пишет в G.keys / G.mouseDown / G.yaw / G.pitch / G.player.crouch / G.locked
     • CSS инжектится из JS (единый файл)
     • Скрывается во время паузы / смерти / настроек / меню
   ============================================================ */
(function () {
'use strict';

const G = window.GAME;
if (!G) return;

/* --- Определение тач-устройства --- */
const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
if (!hasTouch || !isCoarse) {
  console.log('[mobile.js] не тач-устройство — тач-контролы отключены');
  return;
}
console.log('[mobile.js] включение тач-контролов');

const renderer      = G.renderer;
const settingsPanel = document.getElementById('settings-panel');
const menuEl        = document.getElementById('menu');
const startBtn      = document.getElementById('startBtn');

/* ============================================================
   CSS (инжектится один раз)
   ============================================================ */
(function injectStyles() {
  const styleEl = document.createElement('style');
  styleEl.id = 'mobile-controls-css';
  styleEl.textContent = `
/* --- Контейнер всех мобильных контролов --- */
#m-controls {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 15;
  opacity: 0;
  transition: opacity 0.15s ease;
}
#m-controls.m-visible { opacity: 1; }
#m-controls.m-visible > * { pointer-events: auto; }

/* --- Виртуальный джойстик (компактный, низкий) --- */
#m-joy {
  position: absolute;
  left: max(16px, env(safe-area-inset-left, 16px));
  bottom: max(80px, calc(env(safe-area-inset-bottom, 0px) + 70px));
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background: rgba(255,255,255,0.06);
  border: 2px solid rgba(255,255,255,0.22);
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
#m-joy-knob {
  position: absolute;
  left: 50%; top: 50%;
  width: 44px; height: 44px;
  margin: -22px 0 0 -22px;
  border-radius: 50%;
  background: rgba(255,255,255,0.32);
  border: 2px solid rgba(255,255,255,0.6);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  pointer-events: none;
  will-change: transform;
}

/* --- Сетка действий 2x2 (компактная, низкая) --- */
#m-actions {
  position: absolute;
  right: max(16px, env(safe-area-inset-right, 16px));
  bottom: max(80px, calc(env(safe-area-inset-bottom, 0px) + 70px));
  display: grid;
  grid-template-columns: 56px 56px;
  grid-template-rows: 56px 56px;
  gap: 8px;
}
.m-btn {
  width: 100%;
  height: 100%;
  border-radius: 14px;
  border: 2px solid rgba(255,255,255,0.28);
  background: rgba(30,40,55,0.55);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.10);
  transition: transform 0.06s ease, background 0.06s ease;
  font-family: inherit;
  padding: 0;
}
.m-btn:active {
  transform: scale(0.92);
  background: rgba(90,140,200,0.65);
}

/* --- Кнопка Fly (видна только в креативе) --- */
#m-btn-fly {
  position: absolute;
  right: max(16px, env(safe-area-inset-right, 16px));
  bottom: max(212px, calc(env(safe-area-inset-bottom, 0px) + 202px));
  width: 48px;
  height: 48px;
  font-size: 18px;
  border-radius: 12px;
}

/* --- Верхний правый угол: настройки + пауза --- */
#m-top-btns {
  position: absolute;
  top: max(14px, env(safe-area-inset-top, 14px));
  right: max(14px, env(safe-area-inset-right, 14px));
  display: flex;
  gap: 8px;
}
.m-btn-small {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  border: 1px solid rgba(255,255,255,0.24);
  background: rgba(20,30,45,0.65);
  color: #fff;
  font-size: 17px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(0,0,0,0.30);
  font-family: inherit;
  padding: 0;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  transition: transform 0.06s ease, background 0.06s ease;
}
.m-btn-small:active {
  transform: scale(0.90);
  background: rgba(90,140,200,0.60);
}

/* --- Фиксы для мобильных --- */
@media (pointer: coarse) {
  #hotbar {
    max-width: calc(100vw - 20px);
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  #hotbar::-webkit-scrollbar { display: none; }
  #hotbar .slot { flex-shrink: 0; }
  #info { font-size: 10px; padding: 5px 8px; line-height: 1.5; }
}
`;
  document.head.appendChild(styleEl);
})();

/* ============================================================
   Root-контейнер (полноэкранный, pointer-events: none)
   ============================================================ */
const root = document.createElement('div');
root.id = 'm-controls';
document.body.appendChild(root);

/* ============================================================
   Виртуальный джойстик
   ============================================================ */
const joy = document.createElement('div');
joy.id = 'm-joy';
const knob = document.createElement('div');
knob.id = 'm-joy-knob';
joy.appendChild(knob);
root.appendChild(joy);

const JOY_RADIUS = 33;          // максимальное смещение кноба от центра (px) = 55 - 22
const JOY_DEADZONE = 0.28;      // доля от радиуса
const JOY_SPRINT_THRESH = 0.88; // порог спринта

let joyTouchId = null;
let joyCX = 0, joyCY = 0;
let joyDX = 0, joyDY = 0;

function joySetKnob(x, y) {
  knob.style.transform = 'translate(' + x + 'px,' + y + 'px)';
}

function joyUpdateKeys() {
  const nx = joyDX / JOY_RADIUS;
  const ny = joyDY / JOY_RADIUS;
  G.keys['KeyW'] = ny < -JOY_DEADZONE;
  G.keys['KeyS'] = ny >  JOY_DEADZONE;
  G.keys['KeyA'] = nx < -JOY_DEADZONE;
  G.keys['KeyD'] = nx >  JOY_DEADZONE;
  G.keys['ControlLeft'] = ny < -JOY_SPRINT_THRESH;
}

function joyReset() {
  joyTouchId = null;
  joyDX = 0; joyDY = 0;
  joySetKnob(0, 0);
  joyUpdateKeys();
}

joy.addEventListener('touchstart', function (e) {
  e.preventDefault();
  if (joyTouchId !== null) return;
  const t = e.changedTouches[0];
  joyTouchId = t.identifier;
  const r = joy.getBoundingClientRect();
  joyCX = r.left + r.width / 2;
  joyCY = r.top + r.height / 2;
  joyDX = 0; joyDY = 0;
  joySetKnob(0, 0);
  joyUpdateKeys();
}, { passive: false });

joy.addEventListener('touchmove', function (e) {
  e.preventDefault();
  if (joyTouchId === null) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier !== joyTouchId) continue;
    let dx = t.clientX - joyCX;
    let dy = t.clientY - joyCY;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) {
      dx = dx / len * JOY_RADIUS;
      dy = dy / len * JOY_RADIUS;
    }
    joyDX = dx; joyDY = dy;
    joySetKnob(dx, dy);
    joyUpdateKeys();
    break;
  }
}, { passive: false });

joy.addEventListener('touchend', function (e) {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === joyTouchId) {
      joyReset();
      break;
    }
  }
}, { passive: false });

joy.addEventListener('touchcancel', function () {
  if (joyTouchId !== null) joyReset();
}, { passive: false });

/* ============================================================
   Кнопки действий
   ============================================================ */
const actions = document.createElement('div');
actions.id = 'm-actions';
root.appendChild(actions);

const btnBreak = document.createElement('button');
btnBreak.className = 'm-btn';
btnBreak.type = 'button';
btnBreak.textContent = '⛏';

const btnPlace = document.createElement('button');
btnPlace.className = 'm-btn';
btnPlace.type = 'button';
btnPlace.textContent = '▣';

const btnJump = document.createElement('button');
btnJump.className = 'm-btn';
btnJump.type = 'button';
btnJump.textContent = '↑';

const btnSneak = document.createElement('button');
btnSneak.className = 'm-btn';
btnSneak.type = 'button';
btnSneak.textContent = '↓';

/* Порядок в сетке: Place / Break / Sneak / Jump */
actions.appendChild(btnPlace);
actions.appendChild(btnBreak);
actions.appendChild(btnSneak);
actions.appendChild(btnJump);

/* ============================================================
   Верхний правый угол: настройки + пауза
   ============================================================ */
const topBtns = document.createElement('div');
topBtns.id = 'm-top-btns';
root.appendChild(topBtns);

const btnSettings = document.createElement('button');
btnSettings.className = 'm-btn-small';
btnSettings.type = 'button';
btnSettings.textContent = '⚙';
btnSettings.title = 'Настройки';
btnSettings.addEventListener('click', function (e) {
  e.stopPropagation();
  if (G.api.settings && G.api.settings.toggleSettings) G.api.settings.toggleSettings();
});
topBtns.appendChild(btnSettings);

const btnPause = document.createElement('button');
btnPause.className = 'm-btn-small';
btnPause.type = 'button';
btnPause.textContent = '☰';
btnPause.title = 'Пауза';
btnPause.addEventListener('click', function (e) {
  e.stopPropagation();
  if (G.api.input && G.api.input.openPause) G.api.input.openPause();
});
topBtns.appendChild(btnPause);

/* ============================================================
   Fly (только в креативе)
   ============================================================ */
const btnFly = document.createElement('button');
btnFly.id = 'm-btn-fly';
btnFly.className = 'm-btn';
btnFly.type = 'button';
btnFly.textContent = '✈';
btnFly.title = 'Полёт';
btnFly.style.display = 'none';
btnFly.addEventListener('touchstart', function (e) {
  e.preventDefault();
  if (G.api.player && G.api.player.toggleFly) G.api.player.toggleFly();
}, { passive: false });
root.appendChild(btnFly);

/* ============================================================
   Обработчики кнопок
   ============================================================ */

/* --- Jump (hold) --- */
btnJump.addEventListener('touchstart', function (e) {
  e.preventDefault();
  if (!G.locked || G.dead || G.paused) return;
  G.keys['Space'] = true;
}, { passive: false });
btnJump.addEventListener('touchend', function (e) {
  e.preventDefault();
  G.keys['Space'] = false;
}, { passive: false });
btnJump.addEventListener('touchcancel', function () {
  G.keys['Space'] = false;
});

/* --- Sneak / Fly-down (hold) --- */
btnSneak.addEventListener('touchstart', function (e) {
  e.preventDefault();
  if (!G.locked || G.dead || G.paused) return;
  G.player.crouch = true;
  G.keys['ShiftLeft'] = true;
}, { passive: false });
btnSneak.addEventListener('touchend', function (e) {
  e.preventDefault();
  G.player.crouch = false;
  G.keys['ShiftLeft'] = false;
}, { passive: false });
btnSneak.addEventListener('touchcancel', function () {
  G.player.crouch = false;
  G.keys['ShiftLeft'] = false;
});

/* --- Break (hold) --- */
btnBreak.addEventListener('touchstart', function (e) {
  e.preventDefault();
  if (!G.locked || G.dead || G.paused) return;
  G.mouseDown[0] = true;
  G.breaking.active = false;
  G.breaking.progress = 0;
  G.breaking.stage = 0;
  G.creativeBrokeThisClick = false;
}, { passive: false });
btnBreak.addEventListener('touchend', function (e) {
  e.preventDefault();
  G.mouseDown[0] = false;
  if (G.api.raycast && G.api.raycast.stopBreaking) G.api.raycast.stopBreaking();
  G.creativeBrokeThisClick = false;
}, { passive: false });
btnBreak.addEventListener('touchcancel', function () {
  G.mouseDown[0] = false;
  if (G.api.raycast && G.api.raycast.stopBreaking) G.api.raycast.stopBreaking();
  G.creativeBrokeThisClick = false;
});

/* --- Place (tap) --- */
btnPlace.addEventListener('touchstart', function (e) {
  e.preventDefault();
  if (!G.locked || G.dead || G.paused) return;
  if (G.api.raycast && G.api.raycast.placeBlock) G.api.raycast.placeBlock();
}, { passive: false });

/* ============================================================
   Обзор (look drag на канвасе)
   ============================================================ */
const LOOK_SENS = 0.0045;
let lookTouchId = null;
let lookLastX = 0, lookLastY = 0;

renderer.domElement.addEventListener('touchstart', function (e) {
  /* Тап по канвасу при открытых настройках — закрыть панель */
  if (settingsPanel && settingsPanel.classList.contains('open')) {
    e.preventDefault();
    if (G.api.settings && G.api.settings.toggleSettings) G.api.settings.toggleSettings(false);
    return;
  }
  /* Блокируем синтез mouse-событий: иначе drag пытался бы ломать блоки */
  e.preventDefault();
  if (!G.locked || G.dead || G.paused) return;
  if (lookTouchId !== null) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    /* Левая треть экрана — зона джойстика, обзор туда не направляем */
    if (t.clientX < window.innerWidth * 0.3) continue;
    lookTouchId = t.identifier;
    lookLastX = t.clientX;
    lookLastY = t.clientY;
    break;
  }
}, { passive: false });

renderer.domElement.addEventListener('touchmove', function (e) {
  e.preventDefault();
  if (lookTouchId === null) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier !== lookTouchId) continue;
    const dx = t.clientX - lookLastX;
    const dy = t.clientY - lookLastY;
    lookLastX = t.clientX;
    lookLastY = t.clientY;
    if (!G.locked || G.dead || G.paused) break;
    G.yaw   -= dx * LOOK_SENS;
    G.pitch -= dy * LOOK_SENS;
    const lim = Math.PI / 2 - 0.001;
    if (G.pitch >  lim) G.pitch =  lim;
    if (G.pitch < -lim) G.pitch = -lim;
    break;
  }
}, { passive: false });

renderer.domElement.addEventListener('touchend', function (e) {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === lookTouchId) {
      lookTouchId = null;
      break;
    }
  }
}, { passive: true });

renderer.domElement.addEventListener('touchcancel', function (e) {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === lookTouchId) {
      lookTouchId = null;
      break;
    }
  }
}, { passive: true });

/* ============================================================
   Кнопка «ИГРАТЬ»: вместо pointer-lock ставим G.locked = true
   (input.js сначала попытается pointer-lock, мы — подстрахуем)
   ============================================================ */
if (startBtn) {
  startBtn.addEventListener('click', function () {
    setTimeout(function () {
      if (!G.locked && !G.dead && !G.paused) {
        G.locked = true;
        if (menuEl) menuEl.style.display = 'none';
      }
    }, 80);

    /* Fullscreen + landscape (в try/catch — iOS/десктоп молча не сработают) */
    try {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen ||
                  el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req) {
        const p = req.call(el, { navigationUI: 'hide' });
        if (p && p.catch) p.catch(function () {});
      }
      if (screen.orientation && screen.orientation.lock) {
        const p2 = screen.orientation.lock('landscape');
        if (p2 && p2.catch) p2.catch(function () {});
      }
    } catch (err) { /* игнор */ }
  });
}

/* ============================================================
   Видимость контролов (только в активной игре)
   ============================================================ */
function updateVisibility() {
  const settingsOpen = settingsPanel && settingsPanel.classList.contains('open');
  const show = !!(G.locked && !G.paused && !G.dead && !settingsOpen);
  root.classList.toggle('m-visible', show);

  /* Fly — только в креативе */
  btnFly.style.display = (G.gameMode === 'creative') ? '' : 'none';

  requestAnimationFrame(updateVisibility);
}
requestAnimationFrame(updateVisibility);

console.log('[mobile.js] готов');

})();