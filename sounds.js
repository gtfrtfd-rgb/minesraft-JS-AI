/* ============================================================
   sounds.js — процедурный аудиодвижок v4.1 (Web Audio API, без файлов)

   ГЛАВНОЕ В 4.1 — ПОЛНОСТЬЮ ПЕРЕРАБОТАННАЯ ХОДЬБА (FootstepEngine):
   • Шаг больше не «один щелчок». Это составное событие:
       пятка (транзиент) → перекат на носок (scuff) → осыпание гранул →
       характерный хвост материала (шелест травы / сдвиг песка / скрип снега).
   • 9 физически разных поверхностей: трава, земля, песок, камень, кирпич,
     дерево (доска «звенит» модами + иногда скрипит), листва, стекло, снег.
   • Вес шага: отдельный низкочастотный удар, который чувствуется, а не гудит.
   • Динамика от реальной скорости игрока: быстрее → ярче, громче, больше крошки.
   • Присед — «осторожная постановка стопы»: без щелчка пятки, темнее, тише,
     контакт с поверхностью длиннее.
   • Левая/правая нога: панорама + разная громкость и питч (доминантная нога).
   • Живая-humanизация: джиттер питча/громкости/задержки переката,
     редкий двойной шорк, дополнительный шорк при смене материала.
   • Приземление использует ту же модель поверхности, но с весом и осыпанием.

   Остальное сохранено из v4.0: мастер-шина (сатурация → glue → лимитер),
  卷积-реверб «поле ↔ пещера», 3D-мобы с воздушным поглощением,
   формантные голоса животных, окружение (ветер/гул/птицы/капли),
   пул голосов с гарантированной очисткой узлов.
============================================================ */
window.SFX = (function () {
'use strict';

/* ============================================================
   0. КОНТЕКСТ, ШИНЫ, УТИЛИТЫ
============================================================ */
const AudioCtor  = window.AudioContext || window.webkitAudioContext;
const COARSE     = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const MAX_VOICES = COARSE ? 18 : 32;
const PAN_MODEL  = COARSE ? 'equalpower' : 'HRTF';
const LEAD       = 0.004;

let ctx = null;
let BUS = null;
let volume = 1;
let muted = false;
let voiceCount = 0;

let LX = 0, LY = 40, LZ = 0;
let lastListenerSync = -1e9;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function rnd(a, b) { return a + Math.random() * (b - a); }
function now() { return ctx.currentTime + LEAD; }

function softCurve(k) {
const n = 1024;
const curve = new Float32Array(n);
const norm = Math.tanh(k);
for (let i = 0; i < n; i++) {
const x = (i / (n - 1)) * 2 - 1;
curve[i] = Math.tanh(x * k) / norm;
}
return curve;
}

function buildGraph() {
const c = ctx;

const master = c.createGain(); master.gain.value = volume;
const mute   = c.createGain(); mute.gain.value = muted ? 0 : 1;

const limiter = c.createDynamicsCompressor();
limiter.threshold.value = -1.5;
limiter.knee.value = 0;
limiter.ratio.value = 20;
limiter.attack.value = 0.002;
limiter.release.value = 0.10;

const glue = c.createDynamicsCompressor();
glue.threshold.value = -20;
glue.knee.value = 14;
glue.ratio.value = 2.4;
glue.attack.value = 0.010;
glue.release.value = 0.25;

const sat = c.createWaveShaper();
sat.curve = softCurve(1.25);
sat.oversample = '2x';

const dry   = c.createGain();
const revIn = c.createGain();
const conv  = c.createConvolver(); conv.normalize = true;
const wet   = c.createGain(); wet.gain.value = 0.14;

revIn.connect(conv); conv.connect(wet); wet.connect(glue);
dry.connect(sat); sat.connect(glue);
glue.connect(limiter); limiter.connect(mute); mute.connect(master);
master.connect(c.destination);

const sfx = c.createGain(); sfx.gain.value = 0.95; sfx.connect(dry);
const mob = c.createGain(); mob.gain.value = 0.95; mob.connect(dry);
const ui  = c.createGain(); ui.gain.value  = 0.75; ui.connect(dry);
const amb = c.createGain(); amb.gain.value = 0.00; amb.connect(dry);
const ambSend = c.createGain(); ambSend.gain.value = 0; ambSend.connect(revIn);

BUS = {
master: master, mute: mute, limiter: limiter, glue: glue,
dry: dry, revIn: revIn, conv: conv, wet: wet,
sfx: sfx, mob: mob, ui: ui, amb: amb, ambSend: ambSend,
irKind: 'field'
};

try { conv.buffer = getIR('field'); } catch (e) {}
}

function createCtx() {
if (!AudioCtor) return null;
try {
try { ctx = new AudioCtor({ latencyHint: 'interactive' }); }
catch (e) { ctx = new AudioCtor(); }
} catch (e) {
console.warn('[sounds.js] Web Audio API недоступен', e);
ctx = null;
return null;
}
buildGraph();
return ctx;
}

function ensure() {
if (!ctx && !createCtx()) return null;
if (ctx.state === 'suspended') {
const p = ctx.resume();
if (p && p.catch) p.catch(function () {});
}
return ctx;
}

/* ============================================================
   1. РЕВЕРБЕРАЦИЯ
============================================================ */
const irCache = Object.create(null);

function getIR(kind) {
if (irCache[kind]) return irCache[kind];
const cave  = kind === 'cave';
const sec   = cave ? 2.6 : 0.85;
const decay = cave ? 2.2 : 3.4;
const dark  = cave ? 0.18 : 0.55;
const sr = ctx.sampleRate;
const len = Math.max(1, Math.floor(sr * sec));
const buf = ctx.createBuffer(2, len, sr);
const taps = cave
? [[0.011, 0.55], [0.023, 0.42], [0.041, 0.33], [0.067, 0.26], [0.097, 0.20]]
: [[0.007, 0.40], [0.017, 0.26], [0.031, 0.16]];

for (let ch = 0; ch < 2; ch++) {
const d = buf.getChannelData(ch);
let lp = 0;
for (let i = 0; i < len; i++) {
const t = i / len;
const w = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
lp += (w - lp) * dark;
d[i] = lp;
}
for (let k = 0; k < taps.length; k++) {
const idx = Math.floor((taps[k][0] + ch * 0.0013) * sr);
if (idx < len) d[idx] += taps[k][1] * (ch ? -0.6 : 0.6);
}
}
irCache[kind] = buf;
return buf;
}

function setIR(kind) {
if (!BUS || BUS.irKind === kind) return;
BUS.irKind = kind;
const target = (kind === 'cave') ? 0.42 : 0.14;
const t = ctx.currentTime;
const g = BUS.wet.gain;
g.cancelScheduledValues(t);
g.setValueAtTime(Math.max(0.0001, g.value), t);
g.linearRampToValueAtTime(0.0001, t + 0.09);
setTimeout(function () {
if (!BUS) return;
try { BUS.conv.buffer = getIR(kind); } catch (e) {}
const t2 = ctx.currentTime;
const g2 = BUS.wet.gain;
g2.cancelScheduledValues(t2);
g2.setValueAtTime(0.0001, t2);
g2.linearRampToValueAtTime(target, t2 + 0.25);
}, 110);
}

/* ============================================================
   2. БУФЕРЫ ШУМА
   white / pink / brown / grain / crackle / shear / crunch
============================================================ */
const NOISE_SECONDS  = 1.25;
const NOISE_VARIANTS = 4;
const noiseCache = new Map();

function makeNoise(kind) {
const sr = ctx.sampleRate;
const len = Math.floor(sr * NOISE_SECONDS);
const buf = ctx.createBuffer(1, len, sr);
const d = buf.getChannelData(0);
let b0 = 0, b1 = 0, b2 = 0, brown = 0, grain = 0;
let burst = 0, burstLen = 1;

for (let i = 0; i < len; i++) {
const w = Math.random() * 2 - 1;
let v = w;

if (kind === 'pink') {
b0 = 0.99765 * b0 + w * 0.0990460;
b1 = 0.96300 * b1 + w * 0.2965164;
b2 = 0.57000 * b2 + w * 1.0526913;
v = (b0 + b1 + b2 + w * 0.1848) * 0.22;
} else if (kind === 'brown') {
brown = (brown + 0.02 * w) / 1.02;
v = brown * 3.2;
} else if (kind === 'grain') {
if (Math.random() < 0.010) grain = 1;
v = w * grain;
grain *= 0.985;
} else if (kind === 'shear') {
if (Math.random() < 0.085) grain = 1;
v = w * grain * 0.8;
grain *= 0.990;
} else if (kind === 'crunch') {
if (burst > 0) {
v = w * (burst / burstLen) * 1.25;
burst--;
} else {
v = w * 0.10;
if (Math.random() < 0.0018) {
burstLen = 30 + ((Math.random() * 140) | 0);
burst = burstLen;
}
}
} else if (kind === 'crackle') {
v = w * 0.32;
if (Math.random() < 0.0045) v += (Math.random() * 2 - 1) * 1.7;
}

d[i] = v < -1 ? -1 : (v > 1 ? 1 : v);
}
return buf;
}

function noiseBuf(kind) {
let pool = noiseCache.get(kind);
if (!pool) {
pool = new Array(NOISE_VARIANTS);
for (let i = 0; i < NOISE_VARIANTS; i++) pool[i] = makeNoise(kind);
noiseCache.set(kind, pool);
}
return pool[(Math.random() * NOISE_VARIANTS) | 0];
}

/* ============================================================
   3. ГОЛОС — жизненный цикл и очистка узлов
============================================================ */
function airCut(x, y, z) {
const dx = x - LX, dy = y - LY, dz = z - LZ;
const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
return clamp(19000 * Math.pow(0.5, d / 11), 1100, 19000);
}

class Voice {
constructor(bus, send, pos, pan) {
this.nodes = [];
this.pending = 0;
this.disposed = false;
this.timer = 0;
this.end = 0;

const out = ctx.createGain();
out.gain.value = 1;
this.out = out;
this.nodes.push(out);

let tail = out;

if (pos) {
const air = ctx.createBiquadFilter();
air.type = 'lowpass';
air.frequency.value = airCut(pos.x, pos.y, pos.z);
air.Q.value = 0.7;

const p = ctx.createPanner();
p.panningModel = PAN_MODEL;
p.distanceModel = 'inverse';
p.refDistance = 4;
p.maxDistance = 40;
p.rolloffFactor = 0.9;
if (p.positionX) {
p.positionX.value = pos.x;
p.positionY.value = pos.y;
p.positionZ.value = pos.z;
} else if (p.setPosition) {
p.setPosition(pos.x, pos.y, pos.z);
}
out.connect(air); air.connect(p);
this.nodes.push(air, p);
tail = p;
} else if (pan && ctx.createStereoPanner) {
const sp = ctx.createStereoPanner();
sp.pan.value = clamp(pan, -1, 1);
out.connect(sp);
this.nodes.push(sp);
tail = sp;
}

tail.connect(bus);

if (send > 0) {
const s = ctx.createGain();
s.gain.value = send;
tail.connect(s);
s.connect(BUS.revIn);
this.nodes.push(s);
}

voiceCount++;
}

add(n) { this.nodes.push(n); return n; }

start(src, t0, t1, offset, dur) {
this.pending++;
const self = this;
src.onended = function () {
src.onended = null;
self.pending--;
if (self.pending <= 0) self.dispose();
};
if (offset !== undefined) src.start(t0, offset, dur);
else { src.start(t0); src.stop(t1); }
if (t1 > this.end) this.end = t1;
}

seal() {
if (this.pending === 0) { this.dispose(); return; }
const ms = Math.max(60, (this.end - ctx.currentTime) * 1000 + 900);
const self = this;
this.timer = setTimeout(function () { self.dispose(); }, ms);
}

dispose() {
if (this.disposed) return;
this.disposed = true;
if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
for (let i = 0; i < this.nodes.length; i++) {
try { this.nodes[i].disconnect(); } catch (e) {}
}
this.nodes.length = 0;
this.out = null;
voiceCount--;
}
}

function newVoice(busName, send, pos, pan) {
if (!ensure() || ctx.state !== 'running') return null;
if (voiceCount >= MAX_VOICES) return null;
if (pos) syncListener(true);
return new Voice(BUS[busName], send || 0, pos || null, pan || 0);
}

/* ============================================================
   4. ПРИМИТИВЫ СИНТЕЗА
============================================================ */
function shape(param, t0, dur, peak, attack, hold) {
const a = Math.min(attack == null ? 0.004 : attack, dur * 0.35);
const pk = Math.max(0.0002, peak);
param.setValueAtTime(0.0001, t0);
param.exponentialRampToValueAtTime(pk, t0 + a);
if (hold > 0) param.setValueAtTime(pk, Math.min(t0 + a + hold, t0 + dur * 0.8));
param.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function nz(v, o) {
const buf = noiseBuf(o.kind || 'white');
const dur = o.dur;
const t0  = o.t0;
const src = ctx.createBufferSource();
src.buffer = buf;

let node = src;
if (o.f0) {
const f = ctx.createBiquadFilter();
f.type = o.type || 'bandpass';
f.Q.value = o.q != null ? o.q : 1;
f.frequency.setValueAtTime(clamp(o.f0, 30, 20000), t0);
if (o.f1) f.frequency.exponentialRampToValueAtTime(clamp(o.f1, 30, 20000), t0 + dur);
node.connect(f);
node = f;
v.add(f);
}

const g = ctx.createGain();
shape(g.gain, t0, dur, o.gain, o.attack, o.hold);
node.connect(g);
g.connect(v.out);
v.add(src); v.add(g);

const play = dur + 0.02;
const off = Math.random() * Math.max(0, buf.duration - play - 0.005);
v.start(src, t0, t0 + play, off, play);
return g;
}

function tone(v, o) {
const t0 = o.t0;
const osc = ctx.createOscillator();
osc.type = o.type || 'sine';
osc.frequency.setValueAtTime(Math.max(20, o.f0), t0);
if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);

let node = osc;
if (o.lp) {
const f = ctx.createBiquadFilter();
f.type = 'lowpass';
f.frequency.value = o.lp;
f.Q.value = 0.7;
node.connect(f); node = f; v.add(f);
}
if (o.hp) {
const f = ctx.createBiquadFilter();
f.type = 'highpass';
f.frequency.value = o.hp;
f.Q.value = 0.7;
node.connect(f); node = f; v.add(f);
}
const g = ctx.createGain();
shape(g.gain, t0, o.dur, o.gain, o.attack, o.hold);
node.connect(g); g.connect(v.out);
v.add(osc); v.add(g);
v.start(osc, t0, t0 + o.dur + 0.03);
return g;
}

function modal(v, t0, freqs, dur, gain, detune, spread) {
const dj = detune || 1;
for (let i = 0; i < freqs.length; i++) {
const st = t0 + (spread ? Math.random() * spread : 0);
const d = Math.max(0.03, dur * (1 - i * 0.16));
const f = freqs[i] * dj * rnd(0.985, 1.015);

const o = ctx.createOscillator();
o.type = 'sine';
o.frequency.setValueAtTime(f, st);
o.frequency.exponentialRampToValueAtTime(Math.max(20, f * 0.94), st + d);

const g = ctx.createGain();
shape(g.gain, st, d, gain / (1 + i * 0.7), 0.002, 0);
o.connect(g); g.connect(v.out);
v.add(o); v.add(g);
v.start(o, st, st + d + 0.03);
}
}

function grains(v, t0, n, dur, gain, f0, kind, spread, q) {
for (let i = 0; i < n; i++) {
nz(v, {
t0: t0 + Math.random() * spread,
kind: kind || 'grain',
type: 'bandpass',
f0: f0 * rnd(0.7, 1.4),
q: q || 1.4,
dur: dur * rnd(0.6, 1.2),
gain: gain * rnd(0.5, 1.1),
attack: 0.002
});
}
}

function animal(v, o) {
const t0 = o.t0;
const dur = o.dur;
const osc = ctx.createOscillator();
osc.type = o.type || 'sawtooth';

const pts = o.pitch;
osc.frequency.setValueAtTime(Math.max(20, o.f0 * pts[0][1]), t0);
for (let i = 1; i < pts.length; i++) {
osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f0 * pts[i][1]), t0 + dur * pts[i][0]);
}

if (o.vibRate) {
const lfo = ctx.createOscillator();
lfo.type = 'sine';
lfo.frequency.value = o.vibRate;
const lg = ctx.createGain();
lg.gain.value = o.vibDepth || 10;
lfo.connect(lg); lg.connect(osc.frequency);
v.add(lfo); v.add(lg);
v.start(lfo, t0, t0 + dur + 0.05);
}

const body = ctx.createBiquadFilter();
body.type = 'lowpass';
body.frequency.value = o.lp || 3200;
body.Q.value = 0.6;
osc.connect(body);
v.add(body);

const amp = ctx.createGain();
shape(amp.gain, t0, dur, o.gain, o.attack == null ? 0.03 : o.attack, o.hold || 0);
amp.connect(v.out);
v.add(amp);

const direct = ctx.createGain();
direct.gain.value = 0.22;
body.connect(direct); direct.connect(amp);
v.add(direct);

for (let i = 0; i < o.formants.length; i++) {
const F = o.formants[i];
const bp = ctx.createBiquadFilter();
bp.type = 'bandpass';
bp.frequency.value = F[0];
bp.Q.value = F[2] || 6;
const fg = ctx.createGain();
fg.gain.value = F[1];
body.connect(bp); bp.connect(fg); fg.connect(amp);
v.add(bp); v.add(fg);
}

v.add(osc);
v.start(osc, t0, t0 + dur + 0.05);

if (o.breath) {
nz(v, {
t0: t0, kind: 'pink', type: 'bandpass',
f0: o.breathF || 1200, q: 0.8,
dur: dur * 0.9, gain: o.breath, attack: 0.04
});
}
}

/* ============================================================
   5. МАТЕРИАЛЫ: профили для ломания / установки
============================================================ */
const PROFILES = {
grass: {
kind: 'pink',
hit:   { f0: 1900, f1: 850, q: 1.1, dur: 0.075, gain: 0.20 },
modes: [148, 232], modeDur: 0.06, modeGain: 0.05,
thump: { f0: 96, f1: 52, dur: 0.07, gain: 0.10 },
brk:   { f0: 2400, f1: 900, q: 1.0, dur: 0.22, gain: 0.32 },
brkTop:{ kind: 'white', type: 'highpass', f0: 3400, dur: 0.13, gain: 0.12 },
grains:{ n: 5, kind: 'grain', f0: 2600, dur: 0.13, gain: 0.11, spread: 0.15 },
place: { f0: 1500, f1: 680, q: 1.1, dur: 0.10, gain: 0.15 }
},
leaves: {
kind: 'white',
hit:   { type: 'highpass', f0: 2500, dur: 0.07, gain: 0.15 },
modes: null, modeDur: 0.05, modeGain: 0,
thump: null,
brk:   { type: 'highpass', f0: 2200, dur: 0.24, gain: 0.24 },
brkTop:{ kind: 'crackle', type: 'bandpass', f0: 3200, q: 0.9, dur: 0.16, gain: 0.10 },
grains:{ n: 8, kind: 'grain', f0: 3400, dur: 0.10, gain: 0.10, spread: 0.22 },
place: { type: 'highpass', f0: 2400, dur: 0.10, gain: 0.11 }
},
dirt: {
kind: 'pink',
hit:   { f0: 720, f1: 320, q: 0.9, dur: 0.07, gain: 0.24 },
modes: [112, 178], modeDur: 0.055, modeGain: 0.075,
thump: { f0: 150, f1: 68, dur: 0.07, gain: 0.18 },
brk:   { f0: 820, f1: 260, q: 0.8, dur: 0.18, gain: 0.40 },
brkTop:{ kind: 'brown', type: 'lowpass', f0: 1500, f1: 380, dur: 0.24, gain: 0.16 },
grains:{ n: 5, kind: 'grain', f0: 950, dur: 0.14, gain: 0.13, spread: 0.17 },
place: { f0: 640, f1: 260, q: 0.9, dur: 0.11, gain: 0.19 }
},
sand: {
kind: 'white',
hit:   { type: 'highpass', f0: 2200, dur: 0.07, gain: 0.15 },
modes: null, modeDur: 0.05, modeGain: 0,
thump: { f0: 128, f1: 62, dur: 0.06, gain: 0.07 },
brk:   { type: 'highpass', f0: 2000, dur: 0.26, gain: 0.24 },
brkTop:{ kind: 'shear', type: 'bandpass', f0: 1100, q: 1.3, dur: 0.22, gain: 0.20 },
grains:{ n: 7, kind: 'shear', f0: 1800, dur: 0.16, gain: 0.14, spread: 0.20 },
place: { type: 'bandpass', f0: 1000, q: 1.2, dur: 0.13, gain: 0.14 }
},
stone: {
kind: 'white',
hit:   { f0: 1700, f1: 900, q: 2.2, dur: 0.05, gain: 0.24 },
modes: [355, 640, 1020], modeDur: 0.075, modeGain: 0.070,
thump: { f0: 132, f1: 58, dur: 0.08, gain: 0.15 },
brk:   { f0: 1600, f1: 520, q: 1.6, dur: 0.20, gain: 0.38 },
brkTop:{ kind: 'grain', type: 'bandpass', f0: 2400, q: 1.2, dur: 0.18, gain: 0.16 },
grains:{ n: 6, kind: 'grain', f0: 2300, dur: 0.14, gain: 0.15, spread: 0.18 },
place: { f0: 1400, f1: 700, q: 1.6, dur: 0.09, gain: 0.17 }
},
brick: {
kind: 'white',
hit:   { f0: 2100, f1: 1100, q: 2.4, dur: 0.045, gain: 0.22 },
modes: [470, 850, 1340], modeDur: 0.06, modeGain: 0.065,
thump: { f0: 140, f1: 62, dur: 0.07, gain: 0.14 },
brk:   { f0: 1900, f1: 620, q: 1.7, dur: 0.19, gain: 0.34 },
brkTop:{ kind: 'grain', type: 'bandpass', f0: 2800, q: 1.3, dur: 0.17, gain: 0.15 },
grains:{ n: 7, kind: 'grain', f0: 2700, dur: 0.12, gain: 0.14, spread: 0.18 },
place: { f0: 1700, f1: 820, q: 1.8, dur: 0.08, gain: 0.16 }
},
wood: {
kind: 'pink',
hit:   { f0: 1150, f1: 620, q: 2.0, dur: 0.055, gain: 0.20 },
modes: [198, 342, 528], modeDur: 0.09, modeGain: 0.095,
thump: { f0: 152, f1: 82, dur: 0.07, gain: 0.11 },
brk:   { f0: 1100, f1: 420, q: 1.8, dur: 0.18, gain: 0.32 },
brkTop:{ kind: 'crackle', type: 'highpass', f0: 2400, dur: 0.10, gain: 0.12 },
grains:{ n: 4, kind: 'grain', f0: 1600, dur: 0.13, gain: 0.11, spread: 0.15 },
place: { f0: 920, f1: 460, q: 1.6, dur: 0.08, gain: 0.13 }
},
glass: {
kind: 'white',
hit:   { type: 'highpass', f0: 3800, dur: 0.035, gain: 0.09 },
modes: [2550, 3850], modeDur: 0.09, modeGain: 0.075,
thump: null,
shards: 11,
brk:   { type: 'highpass', f0: 3200, dur: 0.26, gain: 0.20 },
brkTop:{ kind: 'grain', type: 'highpass', f0: 4200, dur: 0.24, gain: 0.12 },
grains:{ n: 6, kind: 'grain', f0: 4200, dur: 0.10, gain: 0.09, spread: 0.26 },
place: { type: 'highpass', f0: 3400, dur: 0.06, gain: 0.06 }
},
snow: {
kind: 'crunch',
hit:   { f0: 3200, f1: 1800, q: 1.4, dur: 0.07, gain: 0.18 },
modes: [225, 395], modeDur: 0.05, modeGain: 0.035,
thump: { f0: 140, f1: 70, dur: 0.06, gain: 0.07 },
brk:   { f0: 3600, f1: 1600, q: 1.3, dur: 0.24, gain: 0.28 },
brkTop:{ kind: 'brown', type: 'lowpass', f0: 1000, f1: 300, dur: 0.16, gain: 0.16 },
grains:{ n: 5, kind: 'crunch', f0: 3000, dur: 0.12, gain: 0.10, spread: 0.18 },
place: { type: 'lowpass', f0: 1100, f1: 380, dur: 0.13, gain: 0.16 }
}
};

function matKey(id) {
switch (id) {
case 1:  return 'grass';
case 2:  return 'dirt';
case 3: case 4: case 12: return 'stone';
case 5:  return 'sand';
case 6: case 8: return 'wood';
case 7:  return 'leaves';
case 9:  return 'brick';
case 10: return 'glass';
case 11: return 'snow';
default: return 'stone';
}
}
function profile(id) { return PROFILES[matKey(id)]; }

/* ============================================================
   6. FOOTSTEP ENGINE — полностью новая модель шага
   ------------------------------------------------------------
   Шаг = пятка + вес + перекат на носок + гранулы + хвост материала.
   Все параметры поверхности — данные, движок один.
============================================================ */
const FOOT = {
/* Трава: мягкое сминовение стеблей + сухой шелест сверху */
grass: {
kind: 'pink', send: 0.045,
heel:   { type: 'bandpass', f0: 1500, f1: 700,  q: 0.9, dur: 0.028, gain: 0.075 },
weight: { f0: 92,  f1: 50, dur: 0.055, gain: 0.055 },
sole:   { kind: 'pink',  type: 'bandpass', f0: 1000, f1: 380, q: 0.7, dur: 0.090, gain: 0.070, delay: 0.032 },
tail:   { kind: 'white', type: 'highpass', f0: 3400, dur: 0.080, gain: 0.032, delay: 0.014 },
grains: { n: 2, kind: 'grain', f0: 2600, dur: 0.026, gain: 0.026, spread: 0.050, q: 1.2 },
modes: null
},
/* Земля: глухой плотный шлепок, почти без верха, комки осыпаются */
dirt: {
kind: 'pink', send: 0.040,
heel:   { kind: 'pink',  type: 'lowpass',  f0: 900, f1: 380, dur: 0.030, gain: 0.105 },
weight: { f0: 106, f1: 55, dur: 0.060, gain: 0.085 },
sole:   { kind: 'brown', type: 'lowpass',  f0: 700, f1: 240, dur: 0.085, gain: 0.080, delay: 0.030 },
tail: null,
grains: { n: 3, kind: 'grain', f0: 820, dur: 0.034, gain: 0.042, spread: 0.060, q: 1.0 },
modes: null
},
/* Песок: удара почти нет — сдвиг зерна (shear)主导 */
sand: {
kind: 'white', send: 0.035,
heel:   { type: 'highpass', f0: 2600, dur: 0.022, gain: 0.045 },
weight: { f0: 86, f1: 48, dur: 0.045, gain: 0.030 },
sole:   { kind: 'shear', type: 'bandpass', f0: 1500, f1: 900, q: 0.8, dur: 0.130, gain: 0.085, delay: 0.018 },
tail:   { kind: 'white', type: 'highpass', f0: 3800, dur: 0.090, gain: 0.022, delay: 0.030 },
grains: { n: 5, kind: 'shear', f0: 2000, dur: 0.050, gain: 0.032, spread: 0.090, q: 0.9 },
modes: null
},
/* Камень: жёсткий шлепок + крошка + короткий «комнатный» отклик */
stone: {
kind: 'white', send: 0.090,
heel:   { type: 'bandpass', f0: 1900, f1: 1000, q: 1.6, dur: 0.022, gain: 0.105 },
weight: { f0: 118, f1: 58, dur: 0.050, gain: 0.075 },
sole:   { kind: 'white', type: 'bandpass', f0: 1300, f1: 600, q: 1.2, dur: 0.055, gain: 0.052, delay: 0.026 },
tail:   { kind: 'grain', type: 'highpass', f0: 3200, dur: 0.045, gain: 0.024, delay: 0.020 },
grains: { n: 3, kind: 'grain', f0: 3000, dur: 0.022, gain: 0.034, spread: 0.045, q: 1.6 },
modes: [340, 610], modeDur: 0.035, modeGain: 0.022
},
/* Кирпич: суше и выше камня */
brick: {
kind: 'white', send: 0.085,
heel:   { type: 'bandpass', f0: 2300, f1: 1200, q: 1.8, dur: 0.020, gain: 0.100 },
weight: { f0: 124, f1: 60, dur: 0.045, gain: 0.070 },
sole:   { kind: 'white', type: 'bandpass', f0: 1500, f1: 700, q: 1.3, dur: 0.050, gain: 0.048, delay: 0.024 },
tail: null,
grains: { n: 3, kind: 'grain', f0: 3400, dur: 0.020, gain: 0.032, spread: 0.042, q: 1.7 },
modes: [470, 840], modeDur: 0.030, modeGain: 0.020
},
/* Дерево: доска «звенит» модами, иногда поскрипывает */
wood: {
kind: 'pink', send: 0.070,
heel:   { kind: 'pink', type: 'bandpass', f0: 1200, f1: 650, q: 1.7, dur: 0.026, gain: 0.085 },
weight: { f0: 136, f1: 72, dur: 0.055, gain: 0.065 },
sole:   { kind: 'pink', type: 'bandpass', f0: 900, f1: 420, q: 1.3, dur: 0.060, gain: 0.048, delay: 0.028 },
tail: null,
grains: { n: 2, kind: 'grain', f0: 1700, dur: 0.024, gain: 0.024, spread: 0.050, q: 1.3 },
modes: [196, 338, 512], modeDur: 0.070, modeGain: 0.045,
creak: true
},
/* Листва: сухой шелест, веса почти нет */
leaves: {
kind: 'white', send: 0.040,
heel:   { type: 'highpass', f0: 2800, dur: 0.030, gain: 0.058 },
weight: null,
sole:   { kind: 'white', type: 'highpass', f0: 2200, dur: 0.100, gain: 0.058, delay: 0.020 },
tail:   { kind: 'crackle', type: 'highpass', f0: 3000, dur: 0.070, gain: 0.026, delay: 0.040 },
grains: { n: 6, kind: 'grain', f0: 3600, dur: 0.028, gain: 0.032, spread: 0.090, q: 1.1 },
modes: null
},
/* Стекло: тонкий «тиньк» + мелкая крошка */
glass: {
kind: 'white', send: 0.100,
heel:   { type: 'highpass', f0: 4200, dur: 0.016, gain: 0.050 },
weight: { f0: 110, f1: 60, dur: 0.035, gain: 0.030 },
sole:   { kind: 'white', type: 'highpass', f0: 3400, dur: 0.040, gain: 0.028, delay: 0.022 },
tail: null,
grains: { n: 2, kind: 'grain', f0: 4600, dur: 0.018, gain: 0.022, spread: 0.040, q: 2.0 },
modes: [2450, 3700], modeDur: 0.050, modeGain: 0.030
},
/* Снег: сжатие (crunch) → характерный скрип */
snow: {
kind: 'crunch', send: 0.045,
heel:   { kind: 'crunch', type: 'bandpass', f0: 2600, f1: 1500, q: 1.2, dur: 0.035, gain: 0.085 },
weight: { f0: 100, f1: 55, dur: 0.050, gain: 0.045 },
sole:   { kind: 'crunch', type: 'bandpass', f0: 3300, f1: 2000, q: 2.2, dur: 0.085, gain: 0.072, delay: 0.026 },
tail:   { kind: 'brown',  type: 'lowpass',  f0: 800, f1: 260, dur: 0.070, gain: 0.048, delay: 0.010 },
grains: { n: 3, kind: 'crunch', f0: 3000, dur: 0.030, gain: 0.028, spread: 0.060, q: 1.5 },
modes: null,
squeak: true
}
};

let footSide = 0;
let lastFootMat = '';

function readSpeed() {
const Gm = window.GAME;
if (!Gm || !Gm.player || !Gm.player.vel) return 4.6;
const vx = Gm.player.vel.x, vz = Gm.player.vel.z;
return Math.sqrt(vx * vx + vz * vz);
}

/* --- Пятка: короткий транзиент, задающий «твёрдость» поверхности --- */
function footHeel(v, S, t, j, energy, bright, crouch) {
const h = S.heel;
nz(v, {
t0: t,
kind: h.kind || S.kind,
type: h.type || 'bandpass',
f0: h.f0 * j * bright,
f1: h.f1 ? h.f1 * j * bright : 0,
q: h.q != null ? h.q : 1.0,
dur: h.dur * (crouch ? 1.35 : 1),
gain: h.gain * energy * (crouch ? 0.35 : 1),
attack: crouch ? 0.005 : 0.0015
});
}

/* --- Вес: низкий удар тела, ощущается, а не гудит --- */
function footWeight(v, S, t, j, energy, scale) {
if (!S.weight) return;
const w = S.weight;
tone(v, {
t0: t, type: 'sine',
f0: w.f0 * j, f1: w.f1,
dur: w.dur, gain: w.gain * energy * (scale || 1),
attack: 0.002, hp: 42
});
}

/* --- Перекат на носок: то, что превращает «щелчок» в шаг --- */
function footSole(v, S, t, j, energy, bright, delay, crouch) {
const s = S.sole;
nz(v, {
t0: t + delay,
kind: s.kind || S.kind,
type: s.type || 'bandpass',
f0: s.f0 * j * bright,
f1: s.f1 ? s.f1 * j * bright : 0,
q: s.q != null ? s.q : 0.9,
dur: s.dur * (crouch ? 1.5 : 1),
gain: s.gain * energy * (crouch ? 1.15 : 1),
attack: crouch ? 0.012 : 0.006
});
}

function footTail(v, S, t, j, energy, bright) {
if (!S.tail) return;
const q = S.tail;
nz(v, {
t0: t + q.delay,
kind: q.kind || 'white',
type: q.type || 'highpass',
f0: q.f0 * j * bright,
f1: q.f1 ? q.f1 * j * bright : 0,
q: q.q != null ? q.q : 0.8,
dur: q.dur,
gain: q.gain * energy,
attack: 0.006
});
}

function footstep(id, sprinting, crouching, speed) {
if (!id) return;
const key = matKey(id);
const S = FOOT[key];
if (!S) return;

footSide ^= 1;
const dominant = footSide === 1;
const pan = (dominant ? 1 : -1) * 0.16;

const v = newVoice('sfx', S.send, null, pan);
if (!v) return;

const spd = (typeof speed === 'number' && speed > 0) ? speed : readSpeed();
const sp  = clamp(spd / 7.4, 0, 1);

const crouch = !!crouching;
const energy = (crouch ? 0.42 : (0.72 + sp * 0.55)) * (dominant ? 1 : 0.93);
const bright = crouch ? 0.62 : (0.90 + sp * 0.35);
const j = rnd(0.94, 1.07) * (dominant ? 1 : 0.965);

const t = now();
const rollDelay = S.sole.delay *
(crouch ? 1.70 : (sprinting ? 0.82 : 1.0)) * rnd(0.85, 1.15);

footHeel(v, S, t, j, energy, bright, crouch);
footWeight(v, S, t, j, energy, sprinting ? 1.25 : 1);
footSole(v, S, t, j, energy, bright, rollDelay, crouch);
footTail(v, S, t, j, energy, bright);

/* Гранулы / крошка — количество зависит от скорости */
const G = S.grains;
let n = Math.round(G.n * (0.55 + sp * 0.85) * (crouch ? 0.5 : 1));
if (COARSE) n = Math.max(1, Math.round(n * 0.7));
if (n > 0) {
grains(v, t + 0.008, n, G.dur, G.gain * energy, G.f0 * j * bright,
G.kind, G.spread, G.q);
}

/* Резонанс материала (доска, камень, стекло) */
if (S.modes) {
modal(v, t + 0.002, S.modes, S.modeDur, S.modeGain * energy, j, 0.004);
}

/* Скрип половицы — редко, чтобы не превращался в паттерн */
if (S.creak && !crouch && Math.random() < 0.22) {
tone(v, {
t0: t + rollDelay * 0.7, type: 'triangle',
f0: rnd(300, 380) * j, f1: rnd(240, 290) * j,
dur: 0.090, gain: 0.013 * energy, attack: 0.012, lp: 1400
});
}

/* Скрип уплотнённого снега */
if (S.squeak && Math.random() < (crouch ? 0.65 : 0.40)) {
nz(v, {
t0: t + rollDelay + 0.020, kind: 'crunch', type: 'bandpass',
f0: 2100 * j, f1: 2650 * j, q: 9,
dur: 0.060, gain: 0.030 * energy, attack: 0.010
});
}

/* Шорох одежды на беге */
if (sprinting && !crouch) {
nz(v, {
t0: t + 0.010, kind: 'pink', type: 'highpass',
f0: 1900, dur: 0.085, gain: 0.017, attack: 0.014
});
}

/* Смена покрытия — короткий дополнительный шорк */
if (lastFootMat && lastFootMat !== key) {
nz(v, {
t0: t + rollDelay + 0.030, kind: 'shear', type: 'bandpass',
f0: 1400 * j, q: 0.9, dur: 0.065, gain: 0.028 * energy, attack: 0.006
});
}
lastFootMat = key;

/* Редкий двойной шорк — убирает «пулемётную» регулярность */
if (!crouch && Math.random() < 0.08) {
grains(v, t + rollDelay + 0.055, 2, 0.022, 0.020 * energy,
G.f0 * j * 1.15, 'grain', 0.035, 1.4);
}

v.seal();
}

/* --- Приземление: та же поверхность, но с весом и осыпанием --- */
function sndLand(power, id) {
const key = matKey(id || 1);
const S = FOOT[key];
const P = PROFILES[key];
const k = clamp(power == null ? 0.4 : power, 0.08, 1);

const v = newVoice('sfx', 0.10 + k * 0.14, null, rnd(-0.06, 0.06));
if (!v) return;

const t = now();
const j = rnd(0.94, 1.06);
const energy = 0.55 + k * 1.15;

/* Двойной вес — приземление на две ноги */
tone(v, {
t0: t, type: 'sine', f0: 118 * j, f1: 40,
dur: 0.10 + k * 0.12, gain: 0.10 + k * 0.30, attack: 0.002, hp: 38
});
footWeight(v, S, t + 0.004, j, energy, 1.4);

/* Полный шлепок стопы */
nz(v, {
t0: t, kind: S.kind, type: 'bandpass',
f0: S.sole.f0 * j, f1: S.sole.f0 * 0.45 * j, q: 1.0,
dur: 0.085 + k * 0.10, gain: (0.09 + k * 0.22), attack: 0.002
});
footSole(v, S, t, j, energy * 0.8, 1.0, 0.030 + k * 0.02, false);
footTail(v, S, t, j, energy * 0.9, 1.0);

/* Осыпание / крошка от удара */
if (k > 0.30) {
grains(v, t + 0.014, 3 + ((k * 5) | 0), P.grains.dur * 0.8,
0.05 + k * 0.09, P.grains.f0 * j, P.grains.kind, 0.11, 1.3);
}
if (S.modes) modal(v, t, S.modes, S.modeDur * 1.6, S.modeGain * (0.6 + k), j, 0.006);

/* Одежда / сгибание коленей */
nz(v, {
t0: t + 0.020, kind: 'pink', type: 'highpass',
f0: 1700, dur: 0.10, gain: 0.014 + k * 0.022, attack: 0.014
});

v.seal();
}

/* ============================================================
   7. СОБЫТИЯ ИГРОКА (ломание / установка / UI)
============================================================ */
function sndHit(id) {
const p = profile(id);
const v = newVoice('sfx', 0.05, null, rnd(-0.15, 0.15));
if (!v) return;
const t = now(), j = rnd(0.90, 1.12), h = p.hit;
nz(v, {
t0: t, kind: p.kind, type: h.type || 'bandpass',
f0: h.f0 * j, f1: h.f1 ? h.f1 * j : 0, q: h.q,
dur: h.dur, gain: h.gain, attack: 0.002
});
if (p.modes) modal(v, t, p.modes, p.modeDur * 0.8, p.modeGain * 0.85, j, 0);
if (p.thump) tone(v, {
t0: t, type: 'sine', f0: p.thump.f0 * j, f1: p.thump.f1,
dur: p.thump.dur, gain: p.thump.gain * 0.6, attack: 0.002
});
v.seal();
}

function sndBreak(id) {
const p = profile(id);
const v = newVoice('sfx', 0.16, null, rnd(-0.20, 0.20));
if (!v) return;
const t = now(), j = rnd(0.92, 1.10), b = p.brk;

if (p.thump) tone(v, {
t0: t, type: 'sine', f0: p.thump.f0 * j, f1: p.thump.f1,
dur: p.thump.dur * 1.5, gain: p.thump.gain * 1.5, attack: 0.003
});
nz(v, {
t0: t, kind: p.kind, type: b.type || 'bandpass',
f0: b.f0 * j, f1: b.f1 ? b.f1 * j : 0, q: b.q || 1.2,
dur: b.dur, gain: b.gain, attack: 0.003
});
if (p.brkTop) nz(v, {
t0: t + 0.008, kind: p.brkTop.kind || 'white',
type: p.brkTop.type || 'highpass',
f0: p.brkTop.f0 * j, f1: p.brkTop.f1 ? p.brkTop.f1 * j : 0,
q: p.brkTop.q || 0.8, dur: p.brkTop.dur, gain: p.brkTop.gain, attack: 0.003
});
if (p.modes) modal(v, t, p.modes, p.modeDur * 1.7, p.modeGain * 1.25, j, 0);
if (p.shards) {
for (let i = 0; i < p.shards; i++) {
modal(v, t + i * 0.012 + Math.random() * 0.03, [rnd(2100, 5200)], rnd(0.06, 0.16), 0.075, 1, 0);
}
}
if (p.grains) {
grains(v, t + 0.02, p.grains.n, p.grains.dur, p.grains.gain,
p.grains.f0 * j, p.grains.kind, p.grains.spread, 1.4);
}
v.seal();
}

function sndPlace(id) {
const p = profile(id);
const v = newVoice('sfx', 0.08, null, rnd(-0.12, 0.12));
if (!v) return;
const t = now(), j = rnd(0.94, 1.08), pl = p.place;
nz(v, {
t0: t, kind: p.kind, type: pl.type || 'bandpass',
f0: pl.f0 * j, f1: pl.f1 ? pl.f1 * j : 0, q: pl.q || 1.1,
dur: pl.dur, gain: pl.gain, attack: 0.003
});
if (p.thump) tone(v, {
t0: t, type: 'sine', f0: p.thump.f0 * 1.1 * j, f1: p.thump.f1,
dur: p.thump.dur, gain: p.thump.gain * 0.8, attack: 0.002
});
if (p.modes) modal(v, t, p.modes, p.modeDur * 0.9, p.modeGain * 0.6, j, 0);
v.seal();
}

function sndJump() {
const v = newVoice('sfx', 0.05, null, 0);
if (!v) return;
const t = now();
nz(v, { t0: t, kind: 'pink', type: 'bandpass', f0: 600, f1: 1500, q: 0.9, dur: 0.13, gain: 0.075, attack: 0.010 });
tone(v, { t0: t, type: 'sine', f0: 150, f1: 235, dur: 0.09, gain: 0.045, attack: 0.006 });
nz(v, { t0: t, kind: 'pink', type: 'highpass', f0: 2000, dur: 0.07, gain: 0.016, attack: 0.012 });
v.seal();
}

function sndSelect() {
const v = newVoice('ui', 0.03, null, 0);
if (!v) return;
const t = now();
nz(v, { t0: t, kind: 'white', type: 'bandpass', f0: 2200, q: 3, dur: 0.035, gain: 0.07, attack: 0.001 });
tone(v, { t0: t, type: 'triangle', f0: 900, f1: 1300, dur: 0.04, gain: 0.035, attack: 0.002 });
v.seal();
}

function sndFlyOn() {
const v = newVoice('sfx', 0.22, null, 0);
if (!v) return;
const t = now();
nz(v, { t0: t, kind: 'pink', type: 'bandpass', f0: 260, f1: 1700, q: 1.2, dur: 0.42, gain: 0.13, attack: 0.06 });
nz(v, { t0: t + 0.05, kind: 'white', type: 'highpass', f0: 2600, dur: 0.30, gain: 0.045, attack: 0.08 });
tone(v, { t0: t, type: 'sine', f0: 180, f1: 620, dur: 0.36, gain: 0.05, attack: 0.04 });
modal(v, t + 0.10, [660, 990, 1320], 0.30, 0.030, 1, 0.05);
v.seal();
}

function sndFlyOff() {
const v = newVoice('sfx', 0.22, null, 0);
if (!v) return;
const t = now();
nz(v, { t0: t, kind: 'pink', type: 'bandpass', f0: 1500, f1: 300, q: 1.2, dur: 0.36, gain: 0.12, attack: 0.02 });
tone(v, { t0: t, type: 'sine', f0: 600, f1: 190, dur: 0.30, gain: 0.055, attack: 0.01 });
tone(v, { t0: t + 0.22, type: 'sine', f0: 120, f1: 58, dur: 0.12, gain: 0.09, attack: 0.003 });
nz(v, { t0: t + 0.22, kind: 'brown', type: 'lowpass', f0: 900, f1: 380, dur: 0.14, gain: 0.09, attack: 0.004 });
v.seal();
}

function sndHurt() {
const v = newVoice('sfx', 0.16, null, 0);
if (!v) return;
const t = now();
tone(v, { t0: t, type: 'sawtooth', f0: 230, f1: 120, dur: 0.20, gain: 0.13, attack: 0.004, lp: 1100 });
tone(v, { t0: t + 0.004, type: 'triangle', f0: 180, f1: 95, dur: 0.22, gain: 0.09, attack: 0.004 });
tone(v, { t0: t, type: 'sine', f0: 90, f1: 45, dur: 0.16, gain: 0.10, attack: 0.003 });
nz(v, { t0: t, kind: 'pink', type: 'bandpass', f0: 900, f1: 320, q: 1.1, dur: 0.16, gain: 0.16, attack: 0.003 });
nz(v, { t0: t, kind: 'white', type: 'highpass', f0: 2600, dur: 0.05, gain: 0.05, attack: 0.002 });
v.seal();
}

function sndDeath() {
const v = newVoice('sfx', 0.50, null, 0);
if (!v) return;
const t = now();
tone(v, { t0: t, type: 'sawtooth', f0: 200, f1: 48, dur: 1.00, gain: 0.11, attack: 0.02, lp: 900 });
tone(v, { t0: t + 0.03, type: 'triangle', f0: 160, f1: 40, dur: 1.10, gain: 0.08, attack: 0.03 });
tone(v, { t0: t, type: 'sine', f0: 95, f1: 32, dur: 1.20, gain: 0.09, attack: 0.05 });
nz(v, { t0: t, kind: 'brown', type: 'lowpass', f0: 1200, f1: 200, dur: 1.15, gain: 0.14, attack: 0.03 });
nz(v, { t0: t, kind: 'white', type: 'highpass', f0: 3000, dur: 0.12, gain: 0.06, attack: 0.002 });
modal(v, t + 0.15, [220, 165, 110], 0.90, 0.05, 1, 0.12);
v.seal();
}

/* ============================================================
   8. МОБЫ
============================================================ */
const MOB_VOICE = {
pig: {
f0: 190, dur: [0.28, 0.42], type: 'sawtooth', lp: 2200, gain: 0.20,
pitch: [[0, 1.05], [0.25, 0.82], [0.55, 1.00], [1, 0.70]],
formants: [[620, 0.90, 7], [1250, 0.55, 9], [2400, 0.22, 10]],
breath: 0.05, breathF: 900, vibRate: 22, vibDepth: 8, hold: 0
},
sheep: {
f0: 330, dur: [0.55, 0.80], type: 'sawtooth', lp: 3400, gain: 0.17,
pitch: [[0, 1.00], [0.20, 1.12], [0.70, 0.95], [1, 0.82]],
formants: [[900, 0.85, 8], [1750, 0.60, 10], [2800, 0.30, 12]],
breath: 0.035, breathF: 1600, vibRate: 17, vibDepth: 26, hold: 0.25
},
cow: {
f0: 130, dur: [0.85, 1.25], type: 'sawtooth', lp: 1800, gain: 0.20,
pitch: [[0, 1.15], [0.25, 1.00], [0.75, 0.86], [1, 0.72]],
formants: [[420, 0.95, 6], [880, 0.50, 8], [1550, 0.20, 10]],
breath: 0.03, breathF: 600, vibRate: 6.5, vibDepth: 7, hold: 0.40
},
chicken: {
f0: 780, dur: [0.16, 0.26], type: 'square', lp: 4200, gain: 0.13,
pitch: [[0, 1.25], [0.30, 0.85], [0.60, 1.05], [1, 0.60]],
formants: [[1500, 0.80, 7], [2600, 0.50, 9], [3600, 0.20, 11]],
breath: 0.02, breathF: 2600, vibRate: 30, vibDepth: 40, hold: 0
}
};

function mobAmbient(type, pos) {
const d = MOB_VOICE[type];
if (!d) return;
const v = newVoice('mob', 0.18, pos, pos ? 0 : rnd(-0.20, 0.20));
if (!v) return;
const t = now(), j = rnd(0.90, 1.12);

if (type === 'pig') {
for (let i = 0; i < 2; i++) {
animal(v, Object.assign({}, d, {
t0: t + i * rnd(0.16, 0.22),
f0: d.f0 * j * rnd(0.94, 1.06),
dur: rnd(0.14, 0.20), gain: d.gain * 0.9, hold: 0
}));
}
} else if (type === 'chicken') {
const n = 2 + ((Math.random() * 2) | 0);
for (let i = 0; i < n; i++) {
animal(v, Object.assign({}, d, {
t0: t + i * rnd(0.09, 0.14),
f0: d.f0 * j * rnd(0.90, 1.12),
dur: rnd(0.07, 0.11), gain: d.gain * 0.85, hold: 0
}));
}
if (Math.random() < 0.4) {
animal(v, Object.assign({}, d, {
t0: t + n * 0.12, f0: d.f0 * 0.75 * j, dur: 0.22, gain: d.gain * 0.8, hold: 0.06
}));
}
} else {
animal(v, Object.assign({}, d, { t0: t, f0: d.f0 * j, dur: rnd(d.dur[0], d.dur[1]) }));
}
v.seal();
}

function mobHurt(type, pos) {
const d = MOB_VOICE[type];
if (!d) return;
const v = newVoice('mob', 0.20, pos, pos ? 0 : rnd(-0.15, 0.15));
if (!v) return;
const t = now();
const dur = type === 'cow' ? 0.34 : (type === 'sheep' ? 0.28 : 0.18);
animal(v, Object.assign({}, d, {
t0: t, f0: d.f0 * rnd(1.12, 1.30), dur: dur, gain: d.gain * 1.15,
hold: 0, vibDepth: (d.vibDepth || 10) * 1.6
}));
nz(v, { t0: t, kind: 'pink', type: 'bandpass', f0: 1400, q: 1.0, dur: 0.10, gain: 0.05, attack: 0.002 });
v.seal();
}

function mobDeath(type, pos) {
const d = MOB_VOICE[type];
if (!d) return;
const v = newVoice('mob', 0.35, pos, pos ? 0 : rnd(-0.15, 0.15));
if (!v) return;
const t = now();
const dur = type === 'chicken' ? 0.42 : (type === 'cow' ? 1.00 : 0.70);
animal(v, Object.assign({}, d, {
t0: t, f0: d.f0 * 1.10, dur: dur, hold: 0, gain: d.gain * 1.10,
pitch: [[0, 1.0], [0.3, 0.85], [1, 0.35]],
vibRate: (d.vibRate || 10) * 0.7,
vibDepth: (d.vibDepth || 10) * 1.3
}));
nz(v, { t0: t + 0.05, kind: 'brown', type: 'lowpass', f0: 900, f1: 220, dur: dur * 0.9, gain: 0.06, attack: 0.03 });
v.seal();
}

/* ============================================================
   9. ОКРУЖЕНИЕ
============================================================ */
const A = {
on: false,
windFilt: null, windGain: null, droneG: null,
cave: 0, caveTarget: 0, outdoor: 1, alt: 0, speed: 0, level: 0,
birdT: 9, dripT: 5, envAcc: 0, ambAcc: 0
};

function startAmbience() {
if (A.on || !ctx || !BUS) return;
A.on = true;
const c = ctx;

const src = c.createBufferSource();
src.buffer = noiseBuf('brown');
src.loop = true;

const hp = c.createBiquadFilter();
hp.type = 'highpass'; hp.frequency.value = 180; hp.Q.value = 0.5;
const bp = c.createBiquadFilter();
bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.65;
const gust = c.createGain(); gust.gain.value = 1;
const wg = c.createGain(); wg.gain.value = 0;

src.connect(hp); hp.connect(bp); bp.connect(gust); gust.connect(wg); wg.connect(BUS.amb);

const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06;
const lg = c.createGain(); lg.gain.value = 260;
lfo.connect(lg); lg.connect(bp.frequency);

const lfo2 = c.createOscillator(); lfo2.type = 'sine'; lfo2.frequency.value = 0.11;
const lg2 = c.createGain(); lg2.gain.value = 0.45;
lfo2.connect(lg2); lg2.connect(gust.gain);

src.start(0); lfo.start(0); lfo2.start(0);
A.windFilt = bp; A.windGain = wg;

const d1 = c.createOscillator(); d1.type = 'sine';     d1.frequency.value = 52;
const d2 = c.createOscillator(); d2.type = 'triangle'; d2.frequency.value = 78.5;
const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 200; dlp.Q.value = 0.7;
const dg = c.createGain(); dg.gain.value = 0;
d1.connect(dlp); d2.connect(dlp); dlp.connect(dg);
dg.connect(BUS.amb); dg.connect(BUS.ambSend);

const dlfo = c.createOscillator(); dlfo.type = 'sine'; dlfo.frequency.value = 0.08;
const dlg = c.createGain(); dlg.gain.value = 3.5;
dlfo.connect(dlg); dlg.connect(d1.frequency);

d1.start(0); d2.start(0); dlfo.start(0);
A.droneG = dg;
}

function bird(px, py, pz) {
const ang = Math.random() * Math.PI * 2, r = rnd(9, 22);
const v = newVoice('amb', 0.30, { x: px + Math.cos(ang) * r, y: py + rnd(2, 9), z: pz + Math.sin(ang) * r }, 0);
if (!v) return;
let t = now();
const base = rnd(2200, 3400);
const n = 2 + ((Math.random() * 3) | 0);
for (let i = 0; i < n; i++) {
const d = rnd(0.045, 0.085);
tone(v, { t0: t, type: 'sine', f0: base * rnd(0.90, 1.10), f1: base * rnd(1.15, 1.40), dur: d, gain: 0.055, attack: 0.006 });
tone(v, { t0: t + d * 0.5, type: 'sine', f0: base * 1.5, f1: base * 1.1, dur: d * 0.6, gain: 0.020, attack: 0.005 });
t += d + rnd(0.03, 0.09);
}
v.seal();
}

function drip(px, py, pz) {
const ang = Math.random() * Math.PI * 2, r = rnd(3, 12);
const v = newVoice('amb', 0.75, { x: px + Math.cos(ang) * r, y: py + rnd(-2, 5), z: pz + Math.sin(ang) * r }, 0);
if (!v) return;
const t = now();
const f = rnd(700, 1900);
const o = ctx.createOscillator();
o.type = 'sine';
o.frequency.setValueAtTime(f * 0.55, t);
o.frequency.exponentialRampToValueAtTime(f, t + 0.012);
o.frequency.exponentialRampToValueAtTime(f * 0.80, t + 0.22);
const g = ctx.createGain();
shape(g.gain, t, 0.26, 0.10, 0.002, 0);
o.connect(g); g.connect(v.out);
v.add(o); v.add(g);
v.start(o, t, t + 0.30);
nz(v, { t0: t, kind: 'white', type: 'highpass', f0: 4000, dur: 0.02, gain: 0.03, attack: 0.001 });
v.seal();
}

function sampleEnv(Gm, cam) {
const x = Math.floor(cam.x), z = Math.floor(cam.z);
if (x < 0 || x >= Gm.SX || z < 0 || z >= Gm.SZ) {
A.caveTarget = 0; A.outdoor = 1; A.alt = 0.5;
return;
}
let top = 0;
for (let y = Gm.SY - 1; y >= 0; y--) {
const b = Gm.world[Gm.IDX(x, y, z)];
if (b !== 0 && b !== 6 && b !== 7) { top = y + 1; break; }
}
let ceil = false;
const y0 = Math.floor(cam.y) + 1;
const yMax = Math.min(Gm.SY, y0 + 14);
for (let y = y0; y < yMax; y++) {
const b = Gm.world[Gm.IDX(x, y, z)];
if (b !== 0 && b !== 6 && b !== 7) { ceil = true; break; }
}
A.caveTarget = ceil ? clamp((top - cam.y - 1.5) / 7, 0, 1) : 0;
A.outdoor = 1 - A.caveTarget;
A.alt = clamp((cam.y - 8) / 34, 0, 1);
}

/* ============================================================
   10. СЛУШАТЕЛЬ + ТИК
============================================================ */
function setListener(x, y, z, yaw, pitch) {
const L = ctx.listener;
const cp = Math.cos(pitch), sp = Math.sin(pitch);
const sy = Math.sin(yaw),  cy = Math.cos(yaw);
const fx = -sy * cp, fy = sp, fz = -cy * cp;
const ux = sy * sp,  uy = cp, uz = cy * sp;
const t = ctx.currentTime;
if (L.positionX) {
L.positionX.setTargetAtTime(x, t, 0.02);
L.positionY.setTargetAtTime(y, t, 0.02);
L.positionZ.setTargetAtTime(z, t, 0.02);
L.forwardX.setTargetAtTime(fx, t, 0.02);
L.forwardY.setTargetAtTime(fy, t, 0.02);
L.forwardZ.setTargetAtTime(fz, t, 0.02);
L.upX.setTargetAtTime(ux, t, 0.02);
L.upY.setTargetAtTime(uy, t, 0.02);
L.upZ.setTargetAtTime(uz, t, 0.02);
} else {
if (L.setPosition) L.setPosition(x, y, z);
if (L.setOrientation) L.setOrientation(fx, fy, fz, ux, uy, uz);
}
lastListenerSync = t;
}

/* Самовосстановление: если хост не вызывает update(), listener всё равно верный */
function syncListener(force) {
if (!ctx) return;
if (!force && ctx.currentTime - lastListenerSync < 0.4) return;
const Gm = window.GAME;
if (!Gm || !Gm.camera) return;
const c = Gm.camera.position;
LX = c.x; LY = c.y; LZ = c.z;
setListener(c.x, c.y, c.z, Gm.yaw, Gm.pitch);
}

function tick(dt) {
if (!ctx || ctx.state !== 'running' || !BUS) return;
const Gm = window.GAME;
if (!Gm || !Gm.camera || !Gm.player) return;

if (!A.on) startAmbience();
if (!A.windGain) return;

const cam = Gm.camera.position;
LX = cam.x; LY = cam.y; LZ = cam.z;
setListener(cam.x, cam.y, cam.z, Gm.yaw, Gm.pitch);

A.speed = Math.sqrt(Gm.player.vel.x * Gm.player.vel.x + Gm.player.vel.z * Gm.player.vel.z);

A.envAcc += dt;
if (A.envAcc >= 0.25) { A.envAcc = 0; sampleEnv(Gm, cam); }

A.cave += (A.caveTarget - A.cave) * Math.min(1, dt * 1.2);
if (A.cave > 0.55 && BUS.irKind !== 'cave') setIR('cave');
else if (A.cave < 0.30 && BUS.irKind !== 'field') setIR('field');

let target;
if (Gm.dead)        target = 0.25;
else if (Gm.paused) target = 0.18;
else if (Gm.locked) target = 1.00;
else                target = 0.35;
A.level += (target - A.level) * Math.min(1, dt * 2.5);

A.ambAcc += dt;
if (A.ambAcc >= 0.1) {
A.ambAcc = 0;
const t = ctx.currentTime;
BUS.amb.gain.setTargetAtTime(A.level, t, 0.15);
const wind = A.outdoor * (0.030 + A.alt * 0.055 + Math.min(A.speed, 8) / 8 * 0.020);
A.windGain.gain.setTargetAtTime(wind, t, 0.40);
A.windFilt.frequency.setTargetAtTime(430 + A.alt * 320, t, 0.60);
A.droneG.gain.setTargetAtTime(A.cave * 0.075, t, 0.60);
BUS.ambSend.gain.setTargetAtTime(A.cave * 0.5 * A.level, t, 0.50);
}

if (A.cave < 0.25 && A.level > 0.5) {
A.birdT -= dt;
if (A.birdT <= 0) { A.birdT = rnd(7, 19); bird(cam.x, cam.y, cam.z); }
} else if (A.birdT < 3) A.birdT = 3;

if (A.cave > 0.5 && A.level > 0.5) {
A.dripT -= dt;
if (A.dripT <= 0) { A.dripT = rnd(3.5, 11); drip(cam.x, cam.y, cam.z); }
} else if (A.dripT < 2) A.dripT = 2;
}

/* Фолбэк-таймер: работает, только если хост НЕ вызывает update() */
let hostDriven = false;
let fallbackTimer = 0;

function stopFallback() {
if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = 0; }
}
function ensureFallback() {
if (fallbackTimer || hostDriven) return;
fallbackTimer = setInterval(function () {
if (hostDriven) { stopFallback(); return; }
tick(0.1);
}, 100);
}

function update(dt) {
hostDriven = true;
stopFallback();
tick(dt);
}

/* ============================================================
   11. ГРОМКОСТЬ / MUTE / RESUME
============================================================ */
function setVolume(v) {
volume = clamp(typeof v === 'number' ? v : 1, 0, 1);
if (BUS && ctx) BUS.master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
}
function getVolume() { return volume; }

function setMuted(m) {
muted = !!m;
if (BUS && ctx) BUS.mute.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.03);
return muted;
}
function isMuted() { return muted; }
function toggleMute() { return setMuted(!muted); }

function resume() {
const c = ensure();
if (!c) return;
const finish = function () {
try {
const b = c.createBuffer(1, 1, c.sampleRate);
const s = c.createBufferSource();
s.buffer = b;
s.connect(c.destination);
s.start(0);
} catch (e) {}
startAmbience();
ensureFallback();
};
if (c.state === 'suspended') {
const p = c.resume();
if (p && p.then) p.then(finish, function () {});
else finish();
} else finish();
}

/* ============================================================
   API
============================================================ */
return {
resume: resume,
update: update,

break:  sndBreak,
hit:    sndHit,
place:  sndPlace,
step:   footstep,
jump:   sndJump,
land:   sndLand,
select: sndSelect,
flyOn:  sndFlyOn,
flyOff: sndFlyOff,
hurt:   sndHurt,
death:  sndDeath,

mobAmbient: mobAmbient,
mobHurt: mobHurt,
mobDeath: mobDeath,
pig:     function (pos) { mobAmbient('pig', pos); },
sheep:   function (pos) { mobAmbient('sheep', pos); },
cow:     function (pos) { mobAmbient('cow', pos); },
chicken: function (pos) { mobAmbient('chicken', pos); },

setVolume: setVolume,
getVolume: getVolume,
setMuted:  setMuted,
isMuted:   isMuted,
toggleMute: toggleMute
};
})();