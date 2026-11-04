/* ============================================================
   settings.js — настройки (volume/renderDist/fpsLimit/gameMode),
   панель настроек (drag, toggle), fullscreen.
   ============================================================ */
(function () {
'use strict';

const G = window.GAME;
if (!G) return;

const SFX = G.SFX;

const SETTINGS_KEY = 'mcweb_settings_v2';
const DEFAULT_SETTINGS = { volume: 1, renderDist: 6, fpsLimitIdx: 2, gameMode: 'survival', fancyLeaves: true };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
    const d = JSON.parse(raw);
    return {
      volume: typeof d.volume === 'number' ? d.volume : 1,
      renderDist: typeof d.renderDist === 'number' ? d.renderDist : 6,
      fpsLimitIdx: typeof d.fpsLimitIdx === 'number' ? d.fpsLimitIdx : 2,
      gameMode: d.gameMode === 'creative' ? 'creative' : 'survival',
      fancyLeaves: d.fancyLeaves !== false
    };
  } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
}

const settings = loadSettings();
if (settings.renderDist < 2) settings.renderDist = 2;
if (settings.renderDist > 12) settings.renderDist = 12;
if (settings.fpsLimitIdx < 0) settings.fpsLimitIdx = 0;
if (settings.fpsLimitIdx >= G.FPS_OPTIONS.length) settings.fpsLimitIdx = G.FPS_OPTIONS.length - 1;

G.settings = settings;
G.fpsLimit = G.FPS_OPTIONS[settings.fpsLimitIdx];
G.gameMode = settings.gameMode;

const settingsPanel = document.getElementById('settings-panel');
const volSlider     = document.getElementById('set-volume');
const volValueEl    = document.getElementById('set-volume-val');
const renderSlider  = document.getElementById('set-render');
const renderValueEl = document.getElementById('set-render-val');
const fpsSlider     = document.getElementById('set-fps');
const fpsValueEl    = document.getElementById('set-fps-val');
const fsCheckbox    = document.getElementById('set-fullscreen');

/* --- Громкость --- */
SFX.setVolume(settings.volume);
volSlider.value = Math.round(settings.volume * 100);
volValueEl.textContent = Math.round(settings.volume * 100) + '%';

volSlider.addEventListener('input', function () {
  const v = parseFloat(volSlider.value) / 100;
  SFX.setVolume(v);
  volValueEl.textContent = Math.round(v * 100) + '%';
  settings.volume = v;
  saveSettings(settings);
});

/* --- Прорисовка --- */
renderSlider.value = settings.renderDist;
renderValueEl.textContent = settings.renderDist;

function applyRenderDistance() {
  const rdBlocks = settings.renderDist * G.CS;
  G.scene.fog.near = Math.max(20, rdBlocks * 0.75);
  G.scene.fog.far  = rdBlocks * 1.25;
  G.updateChunkVisibility(G.player.pos.x, G.player.pos.z, rdBlocks);
}

renderSlider.addEventListener('input', function () {
  const v = parseInt(renderSlider.value, 10);
  settings.renderDist = v;
  renderValueEl.textContent = v;
  saveSettings(settings);
  applyRenderDistance();
});

/* --- Лимит FPS --- */
fpsSlider.value = settings.fpsLimitIdx;
fpsValueEl.textContent = G.FPS_LABELS[settings.fpsLimitIdx];

fpsSlider.addEventListener('input', function () {
  const v = parseInt(fpsSlider.value, 10);
  settings.fpsLimitIdx = v;
  G.fpsLimit = G.FPS_OPTIONS[v];
  fpsValueEl.textContent = G.FPS_LABELS[v];
  saveSettings(settings);
});

/* ------------------------------------------------------------
   ПРОЗРАЧНОСТЬ ЛИСТВЫ
   ------------------------------------------------------------ */
const leavesRow = document.createElement('label');
leavesRow.className = 'setting-row';
leavesRow.innerHTML = 
  '<span class="setting-label">Прозрачная листва</span>' +
  '<span class="setting-toggle">' +
    '<input type="checkbox" id="set-leaves">' +
    '<span class="toggle-track"><span class="toggle-knob"></span></span>' +
  '</span>';

const leavesCheckbox = leavesRow.querySelector('#set-leaves');
leavesCheckbox.checked = settings.fancyLeaves;

const firstHint = settingsPanel.querySelector('.settings-hint');
if (firstHint) settingsPanel.insertBefore(leavesRow, firstHint);
else settingsPanel.appendChild(leavesRow);

leavesCheckbox.addEventListener('change', function () {
  settings.fancyLeaves = leavesCheckbox.checked;
  saveSettings(settings);
  if (G.setLeavesTransparency) {
    G.setLeavesTransparency(settings.fancyLeaves);
  }
});

// Применяем при старте
if (G.setLeavesTransparency) {
  G.setLeavesTransparency(settings.fancyLeaves);
}

/* ------------------------------------------------------------
   РЕЖИМ ИГРЫ
   ------------------------------------------------------------ */
const modeBtn = document.createElement('button');
modeBtn.type = 'button';
modeBtn.id = 'set-mode';
modeBtn.style.cssText =
  'background:linear-gradient(#6fbf3f,#4e9128);border:none;color:#fff;' +
  'padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:600;' +
  'font-size:12px;letter-spacing:.3px;box-shadow:0 2px 0 #2f5a17;' +
  'font-family:inherit;flex-shrink:0;transition:filter .1s,transform .08s;';
modeBtn.textContent = (G.gameMode === 'creative') ? 'Креатив' : 'Выживание';

modeBtn.addEventListener('mouseenter', function () { modeBtn.style.filter = 'brightness(1.1)'; });
modeBtn.addEventListener('mouseleave', function () { modeBtn.style.filter = ''; });
modeBtn.addEventListener('mousedown', function () { modeBtn.style.transform = 'translateY(2px)'; });
modeBtn.addEventListener('mouseup',   function () { modeBtn.style.transform = ''; });

const modeRow = document.createElement('div');
modeRow.className = 'setting-row';
const modeLabel = document.createElement('span');
modeLabel.className = 'setting-label';
modeLabel.textContent = 'Режим игры';
modeRow.appendChild(modeLabel);
modeRow.appendChild(modeBtn);

if (firstHint) settingsPanel.insertBefore(modeRow, firstHint);
else settingsPanel.appendChild(modeRow);

function updateHealthVisibility() {
  const h = document.getElementById('health');
  if (!h) return;
  h.style.display = (G.gameMode === 'creative') ? 'none' : 'flex';
}

function setGameMode(mode, silent) {
  if (mode !== 'creative') mode = 'survival';
  const prev = G.gameMode;
  G.gameMode = mode;
  settings.gameMode = mode;
  saveSettings(settings);

  if (G.gameMode === 'creative') {
    G.hp = G.MAX_HP;
    if (G.api.player && G.api.player.refreshHearts) G.api.player.refreshHearts();
    if (!silent) {
      G.player.fly = true;
      G.player.vel.y = 0;
      G.wasOnGround = false;
      G.highestAirY = G.player.pos.y;
      if (G.api.hud) G.api.hud.showHint('Режим: Креатив');
    }
    modeBtn.textContent = 'Креатив';
    modeBtn.style.background = 'linear-gradient(#5aa5ff,#2f7fd8)';
    modeBtn.style.boxShadow = '0 2px 0 #1c4f80';
  } else {
    if (!silent && G.api.hud) G.api.hud.showHint('Режим: Выживание');
    if (prev === 'creative' || G.player.fly) {
      G.player.fly = false;
      G.player.vel.y = 0;
      G.wasOnGround = false;
      G.highestAirY = G.player.pos.y;
    }
    modeBtn.textContent = 'Выживание';
    modeBtn.style.background = 'linear-gradient(#6fbf3f,#4e9128)';
    modeBtn.style.boxShadow = '0 2px 0 #2f5a17';
  }

  G.creativeBrokeThisClick = false;
  updateHealthVisibility();

  if (G.api.raycast && G.api.raycast.stopBreaking && G.breaking.active) {
    G.api.raycast.stopBreaking();
  }
}

modeBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  setGameMode(G.gameMode === 'creative' ? 'survival' : 'creative', false);
});

/* --- Fullscreen --- */
function isFullscreen() {
  return !!(document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement);
}
fsCheckbox.checked = isFullscreen();

function enterFullscreen() {
  const el = document.documentElement;
  const p = el.requestFullscreen ||
            el.webkitRequestFullscreen ||
            el.mozRequestFullScreen ||
            el.msRequestFullscreen;
  if (!p) return;
  try {
    const res = p.call(el, { navigationUI: 'hide' });
    if (res && res.catch) res.catch(function () {});
  } catch (e) {}
}
function exitFullscreen() {
  const p = document.exitFullscreen || document.webkitExitFullscreen ||
            document.mozCancelFullScreen || document.msExitFullscreen;
  if (p) { try { p.call(document); } catch (e) {} }
}

fsCheckbox.addEventListener('change', function () {
  if (fsCheckbox.checked) enterFullscreen();
  else exitFullscreen();
});
document.addEventListener('fullscreenchange', function () {
  fsCheckbox.checked = isFullscreen();
  setTimeout(function () {
    G.renderer.setSize(window.innerWidth, window.innerHeight);
    try { G.renderer.render(G.scene, G.camera); } catch (e) {}
  }, 100);
});
document.addEventListener('webkitfullscreenchange', function () {
  fsCheckbox.checked = isFullscreen();
});

/* --- Открытие/закрытие панели --- */
function clampSettingsPosition() {
  if (!settingsPanel.style.left) return;
  const r = settingsPanel.getBoundingClientRect();
  let x = parseFloat(settingsPanel.style.left);
  let y = parseFloat(settingsPanel.style.top);
  if (isNaN(x)) x = r.left;
  if (isNaN(y)) y = r.top;

  const maxX = window.innerWidth  - settingsPanel.offsetWidth;
  const maxY = window.innerHeight - settingsPanel.offsetHeight;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > maxX) x = maxX;
  if (y > maxY) y = maxY;

  settingsPanel.style.left = x + 'px';
  settingsPanel.style.top  = y + 'px';
}

function toggleSettings(force, opts) {
  opts = opts || {};
  const open = settingsPanel.classList.contains('open');
  const shouldOpen = (force === undefined) ? !open : force;
  if (shouldOpen === open) return;

  if (shouldOpen) {
    G.wasInGameBeforeSettings = !!document.pointerLockElement;
    if (!G.locked || G.paused) settingsPanel.classList.add('menu-overlay');
    settingsPanel.classList.add('open');
    if (document.pointerLockElement) document.exitPointerLock();
    clampSettingsPosition();
  } else {
    settingsPanel.classList.remove('open');
    settingsPanel.classList.remove('menu-overlay');

    if (!opts.fromEscape &&
        G.wasInGameBeforeSettings && !G.dead && !G.paused &&
        G.api.input && G.api.input.lockPointer) {
      G.api.input.lockPointer();
    }
    G.wasInGameBeforeSettings = false;
  }
}

const menuSettingsBtn = document.getElementById('menuSettingsBtn');
if (menuSettingsBtn) {
  menuSettingsBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (settingsPanel.classList.contains('open')) {
      toggleSettings(false);
    } else {
      settingsPanel.classList.add('menu-overlay');
      settingsPanel.classList.add('open');
      clampSettingsPosition();
    }
  });
}

document.addEventListener('click', function (e) {
  if (G.panelJustDragged) { G.panelJustDragged = false; return; }
  if (!settingsPanel.classList.contains('open')) return;
  if (e.target.closest && e.target.closest('#settings-panel, #menuSettingsBtn')) return;
  toggleSettings(false);
});

document.addEventListener('keydown', function (e) {
  if (e.code === 'Escape' && settingsPanel.classList.contains('open')) {
    toggleSettings(false, { fromEscape: true });
  }
});

const settingsDragHandle = document.getElementById('settings-drag');

window.addEventListener('resize', clampSettingsPosition);

if (settingsDragHandle) {
  let dragging = false;
  let dragOffX = 0, dragOffY = 0;

  function switchToLeftTop() {
    if (settingsPanel.style.left) return;
    const r = settingsPanel.getBoundingClientRect();
    settingsPanel.style.left  = r.left + 'px';
    settingsPanel.style.top   = r.top  + 'px';
    settingsPanel.style.right = 'auto';
  }

  settingsDragHandle.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    switchToLeftTop();
    const r = settingsPanel.getBoundingClientRect();
    dragOffX = e.clientX - r.left;
    dragOffY = e.clientY - r.top;
    dragging = true;
    G.panelJustDragged = false;
    document.body.classList.add('settings-dragging');
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    let x = e.clientX - dragOffX;
    let y = e.clientY - dragOffY;
    const maxX = window.innerWidth  - settingsPanel.offsetWidth;
    const maxY = window.innerHeight - settingsPanel.offsetHeight;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x > maxX) x = maxX;
    if (y > maxY) y = maxY;
    settingsPanel.style.left = x + 'px';
    settingsPanel.style.top  = y + 'px';
    G.panelJustDragged = true;
  });

  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('settings-dragging');
    setTimeout(function () { G.panelJustDragged = false; }, 0);
  });
}

G.api.settings = {
  loadSettings,
  saveSettings,
  applyRenderDistance,
  setGameMode,
  updateHealthVisibility,
  toggleSettings,
  isFullscreen
};

})();