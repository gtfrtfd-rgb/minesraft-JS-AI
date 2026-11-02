/* ============================================================
   worlds-ui.js — панель «Мои миры», рендер списка, модалки.
   ============================================================ */
(function () {
'use strict';

const G = window.GAME;
if (!G) return;

const W = G.api.worlds;

const worldsPanel = document.getElementById('worlds-panel');
const worldsListEl = document.getElementById('worldsList');
const worldsRename = document.getElementById('worlds-rename');
const worldsDelete = document.getElementById('worlds-delete');

let _renameTargetId = null;
let _deleteTargetId = null;

function openWorldsPanel() {
  renderWorldsList();
  if (worldsPanel) worldsPanel.classList.add('open');
}
function closeWorldsPanel() {
  if (worldsPanel) worldsPanel.classList.remove('open');
}

function playWorld(id) {
  W.setActiveWorldId(id);
  location.reload();
}

function renderWorldsList() {
  if (!worldsListEl) return;
  const list = W.loadWorldsList();
  const activeId = W.getActiveWorldId();
  worldsListEl.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'worlds-empty';
    empty.textContent = 'Нет миров. Создайте первый!';
    worldsListEl.appendChild(empty);
    return;
  }

  list.sort(function (a, b) {
    if (a.id === activeId) return -1;
    if (b.id === activeId) return 1;
    return (b.lastPlayed || 0) - (a.lastPlayed || 0);
  });

  list.forEach(function (w) {
    const card = document.createElement('div');
    card.className = 'world-card' + (w.id === activeId ? ' active' : '');

    const date = new Date(w.lastPlayed || w.created || Date.now());
    const dateStr = date.toLocaleDateString('ru-RU') + ' · ' +
                    date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const icon = document.createElement('div');
    icon.className = 'world-icon';
    icon.textContent = w.id === activeId ? '🌟' : '🌍';

    const info = document.createElement('div');
    info.className = 'world-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'world-name';
    nameEl.textContent = w.name;
    const meta = document.createElement('div');
    meta.className = 'world-meta';
    meta.textContent = dateStr;
    info.appendChild(nameEl);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'world-actions';

    const btnPlay = document.createElement('button');
    btnPlay.className = 'world-btn play';
    btnPlay.title = 'Играть';
    btnPlay.textContent = '▶';
    btnPlay.addEventListener('click', function (e) {
      e.stopPropagation();
      playWorld(w.id);
    });

    const btnRename = document.createElement('button');
    btnRename.className = 'world-btn rename';
    btnRename.title = 'Переименовать';
    btnRename.textContent = '✏';
    btnRename.addEventListener('click', function (e) {
      e.stopPropagation();
      openRenameDialog(w.id);
    });

    const btnDelete = document.createElement('button');
    btnDelete.className = 'world-btn delete';
    btnDelete.title = 'Удалить';
    btnDelete.textContent = '🗑';
    btnDelete.addEventListener('click', function (e) {
      e.stopPropagation();
      openDeleteDialog(w.id);
    });

    actions.appendChild(btnPlay);
    actions.appendChild(btnRename);
    actions.appendChild(btnDelete);

    card.appendChild(icon);
    card.appendChild(info);
    card.appendChild(actions);

    card.addEventListener('dblclick', function () { playWorld(w.id); });

    worldsListEl.appendChild(card);
  });
}

function openRenameDialog(id) {
  const list = W.loadWorldsList();
  const w = list.find(function (x) { return x.id === id; });
  if (!w) return;
  _renameTargetId = id;
  const input = document.getElementById('worldsRenameInput');
  input.value = w.name;
  worldsRename.classList.add('open');
  setTimeout(function () { input.focus(); input.select(); }, 60);
}
function closeRenameDialog() {
  _renameTargetId = null;
  if (worldsRename) worldsRename.classList.remove('open');
}

function openDeleteDialog(id) {
  const list = W.loadWorldsList();
  const w = list.find(function (x) { return x.id === id; });
  if (!w) return;
  _deleteTargetId = id;
  document.getElementById('worldsDeleteName').textContent = w.name;
  worldsDelete.classList.add('open');
}
function closeDeleteDialog() {
  _deleteTargetId = null;
  if (worldsDelete) worldsDelete.classList.remove('open');
}

/* --- Кнопки --- */
const worldsBtn = document.getElementById('worldsBtn');
if (worldsBtn) {
  worldsBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    openWorldsPanel();
  });
}
const worldsCloseBtn = document.getElementById('worldsClose');
if (worldsCloseBtn) worldsCloseBtn.addEventListener('click', closeWorldsPanel);

const worldsAddBtn = document.getElementById('worldsAdd');
if (worldsAddBtn) {
  worldsAddBtn.addEventListener('click', function () {
    const list = W.loadWorldsList();
    const name = 'Мир ' + (list.length + 1);
    const w = W.createWorld(name);
    playWorld(w.id);
  });
}

const worldsRenameOk = document.getElementById('worldsRenameOk');
const worldsRenameCancel = document.getElementById('worldsRenameCancel');
const worldsRenameInput = document.getElementById('worldsRenameInput');

if (worldsRenameOk) {
  worldsRenameOk.addEventListener('click', function () {
    if (_renameTargetId) {
      W.renameWorld(_renameTargetId, worldsRenameInput.value);
      closeRenameDialog();
      renderWorldsList();
    }
  });
}
if (worldsRenameCancel) worldsRenameCancel.addEventListener('click', closeRenameDialog);
if (worldsRenameInput) {
  worldsRenameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); worldsRenameOk.click(); }
    if (e.key === 'Escape') { e.preventDefault(); closeRenameDialog(); }
  });
}

const worldsDeleteOk = document.getElementById('worldsDeleteOk');
const worldsDeleteCancel = document.getElementById('worldsDeleteCancel');

if (worldsDeleteOk) {
  worldsDeleteOk.addEventListener('click', function () {
    if (!_deleteTargetId) return;
    const wasActive = _deleteTargetId === W.getActiveWorldId();
    W.deleteWorld(_deleteTargetId);
    closeDeleteDialog();

    if (wasActive) {
      const list = W.loadWorldsList();
      if (list.length > 0) {
        location.reload();
      } else {
        const w = W.createWorld('Мой мир');
        playWorld(w.id);
      }
    } else {
      renderWorldsList();
    }
  });
}
if (worldsDeleteCancel) worldsDeleteCancel.addEventListener('click', closeDeleteDialog);

G.api.worldsUI = { openWorldsPanel, closeWorldsPanel, renderWorldsList };

})();