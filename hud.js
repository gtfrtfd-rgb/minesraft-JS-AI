/* ============================================================
   hud.js — info/hint (небольшой модуль для текстовых HUD).
   ============================================================ */
(function () {
'use strict';

const G = window.GAME;
if (!G) return;

const hintEl = document.getElementById('hint');
let hintTimer = null;

function showHint(text) {
  if (!hintEl) return;
  hintEl.textContent = text;
  hintEl.style.opacity = '1';
  clearTimeout(hintTimer);
  hintTimer = setTimeout(function () { hintEl.style.opacity = '0'; }, 1200);
}

G.api.hud = { showHint };

})();