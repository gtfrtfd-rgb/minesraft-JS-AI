/* ============================================================
audio-ui.js — HUD-индикатор звука.
• ТОЛЬКО mute/unmute одним действием (кнопка или клавиша M).
• Громкость здесь НЕ регулируется — единственный ползунок
  громкости находится в панели настроек (#set-volume).
• Виджет лишь ОТОБРАЖАЕТ текущую громкость (read-only),
  синхронизируясь с settings.js.
Состояние mute хранится в localStorage; громкостью владеет
исключительно settings.js (G.settings.volume).
============================================================ */
(function () {
'use strict';

const G = window.GAME;
const SFX = window.SFX;
if (!G || !SFX) return;

const MUTE_KEY = 'mcweb_audio_muted';

/* ---------- Стили (инжект один раз) ---------- */
if (!document.getElementById('audio-ui-css')) {
const styleEl = document.createElement('style');
styleEl.id = 'audio-ui-css';
styleEl.textContent = `
#audio-widget{
position:fixed; top:76px; left:14px; z-index:22;
display:flex; align-items:center; gap:9px;
padding:6px 11px 6px 6px;
background:rgba(10,15,25,.74);
border:1px solid rgba(255,255,255,.10);
border-radius:12px;
color:#e9f1f7;
backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
box-shadow:0 6px 20px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.06);
transition:border-color .18s ease, color .18s ease, box-shadow .18s ease;
font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
}
#audio-widget:hover{
border-color:rgba(126,211,72,.38);
box-shadow:0 8px 24px rgba(0,0,0,.45), 0 0 0 1px rgba(126,211,72,.12), inset 0 1px 0 rgba(255,255,255,.08);
}
#audio-widget.muted{
color:#ff9d9d;
border-color:rgba(224,74,74,.38);
}
.aw-btn{
width:30px;height:30px;flex-shrink:0;
display:flex;align-items:center;justify-content:center;
border:1px solid rgba(255,255,255,.12);
border-radius:9px;
background:rgba(255,255,255,.06);
color:inherit;cursor:pointer;padding:0;
-webkit-appearance:none;appearance:none;
-webkit-tap-highlight-color:transparent;
transition:background .14s ease, transform .08s ease, border-color .14s ease;
}
.aw-btn:hover{background:rgba(126,211,72,.20);border-color:rgba(126,211,72,.45)}
#audio-widget.muted .aw-btn:hover{background:rgba(224,74,74,.22);border-color:rgba(224,74,74,.5)}
.aw-btn:active{transform:scale(.9)}
.aw-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;display:block}
.aw-speaker{fill:currentColor;stroke:currentColor;stroke-width:1.2}
.aw-waves{opacity:1;transition:opacity .14s ease}
.aw-cross{opacity:0;transition:opacity .14s ease}
#audio-widget.muted .aw-waves{opacity:0}
#audio-widget.muted .aw-cross{opacity:1}
/* Индикатор уровня — НЕ интерактивный */
.aw-meter{
position:relative;width:64px;height:4px;border-radius:3px;
background:rgba(255,255,255,.16);overflow:hidden;
pointer-events:none;flex-shrink:0;
}
.aw-meter-fill{
position:absolute;left:0;top:0;bottom:0;width:100%;
border-radius:3px;background:#7ed348;
transition:width .12s linear, background .18s ease;
}
#audio-widget.muted .aw-meter-fill{background:#e04a4a}
.aw-val{
min-width:34px;text-align:right;font-size:11px;font-weight:600;
font-family:'Consolas','Monaco',monospace;
font-variant-numeric:tabular-nums;
color:#7ed348;opacity:.9;pointer-events:none;
}
#audio-widget.muted .aw-val{color:#ff9d9d}
@media (pointer: coarse), (max-width: 720px){
#audio-widget{top:62px;left:10px;gap:7px;padding:5px 9px 5px 5px;border-radius:11px}
.aw-btn{width:32px;height:32px}
.aw-meter{width:46px}
.aw-val{font-size:10px;min-width:30px}
}
@media (max-height: 430px){
#audio-widget{top:58px}
}
`;
document.head.appendChild(styleEl);
}

/* ---------- Разметка (без input[type=range]) ---------- */
const root = document.createElement('div');
root.id = 'audio-widget';
root.innerHTML =
'<button id="aw-mute" class="aw-btn" type="button">' +
'<svg viewBox="0 0 24 24" aria-hidden="true">' +
'<path class="aw-speaker" d="M4 9.5v5h3.6L12.5 18V6L7.6 9.5H4z"/>' +
'<g class="aw-waves"><path d="M15.8 9.4a4.2 4.2 0 0 1 0 5.2"/><path d="M18.4 7.2a7.6 7.6 0 0 1 0 9.6"/></g>' +
'<g class="aw-cross"><path d="M16.2 9.6l4.6 4.8"/><path d="M20.8 9.6l-4.6 4.8"/></g>' +
'</svg>' +
'</button>' +
'<span class="aw-meter" aria-hidden="true"><span class="aw-meter-fill" id="aw-fill"></span></span>' +
'<span id="aw-val" class="aw-val">100%</span>';
document.body.appendChild(root);

const btn   = root.querySelector('#aw-mute');
const fill  = root.querySelector('#aw-fill');
const valEl = root.querySelector('#aw-val');
const panelSlider = document.getElementById('set-volume');

let muted = false;

/* ---------- Отображение громкости (read-only) ---------- */
function paintVolume(v) {
const pct = Math.round(Math.max(0, Math.min(1, v)) * 100);
fill.style.width = pct + '%';
valEl.textContent = pct + '%';
}

/* settings.js — единственный владелец громкости.
   Здесь мы только читаем значение и перерисовываем индикатор. */
function syncFromSettings() {
const v = (G.settings && typeof G.settings.volume === 'number') ? G.settings.volume : 1;
paintVolume(v);
}

/* ---------- Mute ---------- */
function applyMute(m, announce) {
muted = !!m;
if (SFX.setMuted) SFX.setMuted(muted);
root.classList.toggle('muted', muted);
btn.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
btn.title = (muted ? 'Звук выключен' : 'Звук включён') +
' — клавиша M · громкость в настройках (O)';
try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
if (announce && G.api.hud) G.api.hud.showHint(muted ? 'Звук: ВЫКЛ' : 'Звук: ВКЛ');
if (!muted && SFX.resume) SFX.resume();
}

/* ---------- События ---------- */
btn.addEventListener('click', function (e) {
e.preventDefault();
e.stopPropagation();
applyMute(!muted, true);
});

root.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
root.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

/* Ползунок в панели настроек меняет громкость → обновляем индикатор.
   Значение и сохранение делает settings.js, мы ничего не пишем. */
if (panelSlider) {
panelSlider.addEventListener('input', syncFromSettings);
panelSlider.addEventListener('change', syncFromSettings);
}

/* Хоткей M — только mute */
document.addEventListener('keydown', function (e) {
if (e.code !== 'KeyM' || e.repeat) return;
const ae = document.activeElement;
if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
e.preventDefault();
applyMute(!muted, true);
});

/* ---------- Инициализация ---------- */
syncFromSettings();
let stored = false;
try { stored = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
applyMute(stored, false);

/* Публичный API: регулировки громкости намеренно нет */
G.api.audio = {
setMuted: function (m) { applyMute(m, false); },
isMuted: function () { return muted; },
refresh: syncFromSettings
};

console.log('[audio-ui.js] mute-контрол готов (M). Громкость — только в настройках.');
})();