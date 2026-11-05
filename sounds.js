/* ============================================================
   sounds.js — процедурные звуки на Web Audio API (без файлов)
   Версия 3.2: Увеличенная громкость звуков ломания, особенно земли.
   ============================================================ */
window.SFX = (function () {
'use strict';

let ctx = null;
let masterGain = null;
let masterVolume = 1;

function createCtx() {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor({ latencyHint: 'interactive' }); }
    catch (e) { ctx = new Ctor(); }
  } catch (e) {
    console.warn('[sounds.js] Web Audio API не поддерживается', e);
    ctx = null;
  }
  return ctx;
}

function getCtx() {
  if (!ctx) createCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function resume() {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') {
    const p = c.resume();
    if (p && p.then) p.then(function () {});
  }
  try {
    const b = c.createBuffer(1, 1, c.sampleRate);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  } catch (e) {}
}

function getMaster() {
  const c = getCtx(); if (!c) return null;
  if (!masterGain) {
    masterGain = c.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(c.destination);
  }
  return masterGain;
}

function setVolume(v) {
  masterVolume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = masterVolume;
}
function getVolume() { return masterVolume; }

/* ============================================================
   ГЕНЕРАЦИЯ ШУМА (КЭШИРОВАНИЕ)
   ============================================================ */
const NOISE_POOL = new Map();
const POOL_SIZE = 8;

function makeNoiseBuffer(seconds, decay, crackle, crackleRate) {
  const c = getCtx(); if (!c) return null;
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  
  for (let i = 0; i < len; i++) {
    const t = i / len;
    let v = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    if (crackle && Math.random() < crackleRate) {
      v += (Math.random() * 2 - 1) * 1.8;
    }
    if (v > 1) v = 1; else if (v < -1) v = -1;
    d[i] = v;
  }
  return buf;
}

function makeGranularBuffer(seconds, density) {
  const c = getCtx(); if (!c) return null;
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  
  for (let i = 0; i < len; i++) {
    const t = i / len;
    let v = 0;
    if (Math.random() < density) {
      v = (Math.random() * 2 - 1) * 0.8;
    }
    d[i] = v * Math.pow(1 - t, 2.0);
  }
  return buf;
}

function getCachedNoise(seconds, decay, crackle, crackleRate) {
  const key = crackle
    ? 'c:' + seconds + ':' + decay + ':' + crackleRate
    : 'n:' + seconds + ':' + decay;

  let pool = NOISE_POOL.get(key);
  if (!pool) {
    pool = new Array(POOL_SIZE);
    for (let i = 0; i < POOL_SIZE; i++) {
      pool[i] = makeNoiseBuffer(seconds, decay, crackle, crackleRate);
    }
    NOISE_POOL.set(key, pool);
  }
  return pool[(Math.random() * POOL_SIZE) | 0];
}

const GRANULAR_POOL = new Map();
function getGranularNoise(seconds, density) {
  const key = 'g:' + seconds + ':' + density;
  let pool = GRANULAR_POOL.get(key);
  if (!pool) {
    pool = new Array(POOL_SIZE);
    for (let i = 0; i < POOL_SIZE; i++) {
      pool[i] = makeGranularBuffer(seconds, density);
    }
    GRANULAR_POOL.set(key, pool);
  }
  return pool[(Math.random() * POOL_SIZE) | 0];
}

/* ============================================================
   БАЗОВЫЕ ПЛЕЙЕРЫ
   ============================================================ */
const SCHEDULE_LEAD = 0.003;

function playNoise(o) {
  const c = getCtx(); if (!c) return;
  const master = getMaster(); if (!master) return;
  
  const duration = o.duration != null ? o.duration : 0.15;
  const gain     = o.gain     != null ? o.gain     : 0.2;
  const attack   = o.attack   != null ? o.attack   : 0.003;
  const when     = o.when     != null ? o.when     : 0;

  let buf;
  if (o.granular) {
    buf = getGranularNoise(duration, o.density || 0.15);
  } else {
    buf = getCachedNoise(duration, o.decay || 2.5, !!o.crackle, o.crackleRate || 0.08);
  }
  if (!buf) return;

  const src = c.createBufferSource();
  src.buffer = buf;

  const filt = c.createBiquadFilter();
  filt.type = o.filterType || 'lowpass';
  filt.Q.value = o.Q != null ? o.Q : 1;
  
  const t0 = c.currentTime + when + SCHEDULE_LEAD;
  const f0 = o.freq != null ? o.freq : 1000;
  filt.frequency.setValueAtTime(f0, t0);
  
  if (o.freqEnd != null) {
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.freqEnd), t0 + duration);
  }

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(filt).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + duration + 0.05);
}

function playTone(o) {
  const c = getCtx(); if (!c) return;
  const master = getMaster(); if (!master) return;
  
  const duration = o.duration != null ? o.duration : 0.1;
  const gain     = o.gain     != null ? o.gain     : 0.15;
  const attack   = o.attack   != null ? o.attack   : 0.005;
  const when     = o.when     != null ? o.when     : 0;

  const osc = c.createOscillator();
  osc.type = o.type || 'sine';
  
  const t0 = c.currentTime + when + SCHEDULE_LEAD;
  const f0 = o.f0 != null ? o.f0 : 440;
  osc.frequency.setValueAtTime(f0, t0);
  
  if (o.f1 != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + duration);
  }

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/* ============================================================
   ОПРЕДЕЛЕНИЕ МАТЕРИАЛОВ
   ============================================================ */
function matName(id) {
  switch (id) {
    case 1: case 7:  return 'grass';
    case 2:          return 'dirt';
    case 5:          return 'sand';
    case 3: case 4: case 9: case 12: return 'stone';
    case 6: case 8:  return 'wood';
    case 10:         return 'glass';
    case 11:         return 'snow';
    default:         return 'stone';
  }
}

/* ============================================================
   ЗВУК УДАРА ПРИ ДОБЫЧЕ (ГРОМКИЙ)
   ============================================================ */
function sndHit(id) {
  const m = matName(id);
  const p = 0.85 + Math.random() * 0.3;

  if (m === 'grass') {
    playNoise({ duration: 0.08, decay: 3.0, filterType: 'bandpass', freq: 2400 * p, Q: 1.5, gain: 0.20 });
    return;
  }
  if (m === 'dirt') {
    // Очень тяжелый и громкий удар для земли
    playNoise({ duration: 0.08, decay: 3.0, granular: true, density: 0.2, filterType: 'lowpass', freq: 1000 * p, gain: 0.30 });
    playTone({ type: 'sine', f0: 100 * p, f1: 50, duration: 0.04, gain: 0.12 });
    return;
  }
  if (m === 'sand') {
    playNoise({ duration: 0.08, decay: 2.5, filterType: 'highpass', freq: 2000 * p, gain: 0.18 });
    return;
  }
  if (m === 'stone') {
    playTone({ type: 'square', f0: 150 * p, f1: 80, duration: 0.04, gain: 0.12 });
    playNoise({ duration: 0.06, decay: 4.0, filterType: 'bandpass', freq: 1600 * p, Q: 2.0, gain: 0.30 });
    return;
  }
  if (m === 'wood') {
    playTone({ type: 'triangle', f0: 260 * p, f1: 140, duration: 0.05, gain: 0.25 });
    playNoise({ duration: 0.06, decay: 3.0, filterType: 'bandpass', freq: 1200 * p, Q: 2.0, gain: 0.25 });
    return;
  }
  if (m === 'glass') {
    playTone({ type: 'triangle', f0: 2000 * p, f1: 1500, duration: 0.04, gain: 0.12 });
    return;
  }
  if (m === 'snow') {
    playNoise({ duration: 0.08, decay: 3.0, crackle: true, crackleRate: 0.1, filterType: 'bandpass', freq: 3500 * p, Q: 1.5, gain: 0.25 });
    return;
  }
  playNoise({ duration: 0.08, decay: 3.0, filterType: 'bandpass', freq: 1000 * p, Q: 1.5, gain: 0.25 });
}

/* ============================================================
   ЗВУКИ ЛОМАНИЯ (ГРОМКИЕ И МОЩНЫЕ)
   ============================================================ */
function sndBreak(id) {
  const m = matName(id);
  const p = 0.85 + Math.random() * 0.3;

  if (m === 'grass') {
    playNoise({ duration: 0.20, decay: 2.5, filterType: 'bandpass', freq: 2800 * p, freqEnd: 1200, Q: 1.5, gain: 0.35 });
    playNoise({ duration: 0.10, decay: 3.0, crackle: true, crackleRate: 0.15, filterType: 'highpass', freq: 3500 * p, gain: 0.20 });
    playTone({ type: 'triangle', f0: 150 * p, f1: 80, duration: 0.05, gain: 0.10 });
    return;
  }
  if (m === 'dirt') {
    // Мощный низкочастотный удар + очень громкое осыпание
    playTone({ type: 'sine', f0: 120 * p, f1: 50, duration: 0.10, gain: 0.40 });
    playNoise({ duration: 0.20, decay: 2.5, granular: true, density: 0.2, filterType: 'lowpass', freq: 1200 * p, freqEnd: 300, gain: 0.60 });
    playNoise({ duration: 0.15, decay: 3.0, filterType: 'bandpass', freq: 600 * p, Q: 1.2, gain: 0.25, when: 0.01 });
    return;
  }
  if (m === 'sand') {
    playNoise({ duration: 0.25, decay: 1.8, filterType: 'highpass', freq: 2200 * p, gain: 0.30 });
    playNoise({ duration: 0.15, decay: 2.5, granular: true, density: 0.1, filterType: 'bandpass', freq: 1000 * p, Q: 1.5, gain: 0.25 });
    playTone({ type: 'sine', f0: 200 * p, f1: 100, duration: 0.06, gain: 0.15 });
    return;
  }
  if (m === 'stone') {
    playTone({ type: 'sine', f0: 140 * p, f1: 60, duration: 0.12, gain: 0.40 });
    playNoise({ duration: 0.15, decay: 3.0, granular: true, density: 0.3, filterType: 'bandpass', freq: 1600 * p, freqEnd: 600, Q: 2.0, gain: 0.50 });
    
    const numChips = 5;
    for (let i = 0; i < numChips; i++) {
      playTone({
        type: 'square',
        f0: (1800 + Math.random() * 1200) * p,
        f1: (800 + Math.random() * 400) * p,
        duration: 0.03 + Math.random() * 0.04,
        gain: 0.10,
        when: 0.02 + Math.random() * 0.05
      });
    }
    return;
  }
  if (m === 'wood') {
    playTone({ type: 'triangle', f0: 280 * p, f1: 120, duration: 0.12, gain: 0.45 });
    playNoise({ duration: 0.15, decay: 2.5, filterType: 'bandpass', freq: 1200 * p, Q: 2.5, gain: 0.40 });
    playNoise({ duration: 0.08, decay: 4.0, crackle: true, crackleRate: 0.2, filterType: 'highpass', freq: 2500 * p, gain: 0.20, when: 0.01 });
    return;
  }
  if (m === 'glass') {
    const numShards = 8;
    for (let i = 0; i < numShards; i++) {
      playTone({
        type: 'triangle',
        f0: (2200 + Math.random() * 2400) * p,
        f1: (1600 + Math.random() * 800) * p,
        duration: 0.04 + Math.random() * 0.06,
        gain: 0.15,
        when: i * 0.015 + Math.random() * 0.02
      });
    }
    playNoise({ duration: 0.25, decay: 1.8, filterType: 'highpass', freq: 3000 * p, gain: 0.25 });
    return;
  }
  if (m === 'snow') {
    playNoise({ duration: 0.25, decay: 3.0, crackle: true, crackleRate: 0.08,
                filterType: 'bandpass', freq: 3800 * p, freqEnd: 1800, Q: 1.5, gain: 0.35 });
    playNoise({ duration: 0.15, decay: 4.0, crackle: true, crackleRate: 0.12,
                filterType: 'highpass', freq: 4800 * p, gain: 0.18, when: 0.01 });
    playNoise({ duration: 0.12, decay: 4.5, filterType: 'lowpass', freq: 1100 * p, freqEnd: 300, gain: 0.25 });
    playTone({ type: 'sine', f0: 180 * p, f1: 90, duration: 0.07, gain: 0.12 });
    return;
  }
}

function sndPlace(id) {
  const m = matName(id);
  const p = 0.92 + Math.random() * 0.16;

  if (m === 'glass') {
    playTone({ type: 'triangle', f0: 1800 * p, f1: 1650, duration: 0.05, gain: 0.12 });
    playNoise({ duration: 0.08, decay: 3, filterType: 'highpass', freq: 3200 * p, gain: 0.08 });
    return;
  }
  if (m === 'grass') {
    playNoise({ duration: 0.12, decay: 2.5, filterType: 'bandpass', freq: 1800 * p, Q: 1.2, gain: 0.18 });
    playTone({ type: 'sine', f0: 120 * p, f1: 60, duration: 0.05, gain: 0.05 });
    return;
  }
  if (m === 'sand') {
    playNoise({ duration: 0.15, decay: 2.0, filterType: 'bandpass', freq: 1100 * p, Q: 1.3, gain: 0.16 });
    playTone({ type: 'sine', f0: 160 * p, f1: 70, duration: 0.06, gain: 0.06 });
    return;
  }
  if (m === 'wood') {
    playTone({ type: 'triangle', f0: 320 * p, f1: 160, duration: 0.10, gain: 0.18 });
    playNoise({ duration: 0.08, decay: 3.5, filterType: 'bandpass', freq: 1000 * p, Q: 2, gain: 0.12 });
    return;
  }
  if (m === 'snow') {
    playNoise({ duration: 0.16, decay: 3.0, filterType: 'lowpass', freq: 1200 * p, freqEnd: 400, gain: 0.20 });
    playNoise({ duration: 0.08, decay: 4.5, filterType: 'bandpass', freq: 2800 * p, Q: 1.2, gain: 0.06, when: 0.005 });
    playTone({ type: 'sine', f0: 140 * p, f1: 70, duration: 0.08, gain: 0.07 });
    return;
  }
  playTone({ type: 'square', f0: 200 * p, f1: 90, duration: 0.06, gain: 0.12 });
  playNoise({ duration: 0.08, decay: 3.5, filterType: 'bandpass', freq: 1500 * p, Q: 2, gain: 0.18 });
  playTone({ type: 'sine', f0: 130 * p, f1: 50, duration: 0.08, gain: 0.08 });
}

function sndStep(id, sprinting) {
  const m = matName(id);
  const mult = sprinting ? 1.35 : 1.0;
  const jit  = 0.8 + Math.random() * 0.4;
  const sign = Math.random() < 0.5 ? -1 : 1;

  if (m === 'grass') {
    playNoise({ duration: 0.10, decay: 3.0, filterType: 'bandpass', freq: (800 + sign * 100) * jit, Q: 1.1, gain: 0.14 * mult });
    playNoise({ duration: 0.06, decay: 4.0, filterType: 'highpass', freq: 2400 * jit, gain: 0.05 * mult, when: 0.005 });
    return;
  }
  if (m === 'dirt') {
    playNoise({ duration: 0.10, decay: 3.2, filterType: 'lowpass', freq: (750 + sign * 70) * jit, freqEnd: 280, gain: 0.16 * mult });
    playTone({ type: 'sine', f0: 130 * jit, f1: 70, duration: 0.06, gain: 0.04 * mult });
    return;
  }
  if (m === 'sand') {
    playNoise({ duration: 0.12, decay: 2.4, filterType: 'highpass', freq: (2200 + sign * 200) * jit, gain: 0.13 * mult });
    playNoise({ duration: 0.08, decay: 3.0, filterType: 'bandpass', freq: 1000 * jit, Q: 1.4, gain: 0.07 * mult });
    return;
  }
  if (m === 'stone') {
    playNoise({ duration: 0.07, decay: 4.0, filterType: 'bandpass', freq: (1400 + sign * 150) * jit, Q: 2.0, gain: 0.16 * mult });
    playTone({ type: 'square', f0: 140 * jit, f1: 70, duration: 0.05, gain: 0.08 * mult });
    playTone({ type: 'sine', f0: 100 * jit, f1: 50, duration: 0.06, gain: 0.06 * mult });
    playNoise({ duration: 0.03, decay: 5, filterType: 'highpass', freq: 3000 * jit, gain: 0.04 * mult, when: 0.003 });
    return;
  }
  if (m === 'wood') {
    playTone({ type: 'triangle', f0: 200 * jit, f1: 110, duration: 0.08, gain: 0.12 * mult });
    playNoise({ duration: 0.07, decay: 3.5, filterType: 'bandpass', freq: (1000 + sign * 100) * jit, Q: 2, gain: 0.12 * mult });
    return;
  }
  if (m === 'snow') {
    const base = (2000 + sign * 200) * jit;
    playNoise({ duration: 0.07, decay: 2.8, filterType: 'bandpass', freq: base, Q: 6.0, gain: 0.08 * mult });
    playNoise({ duration: 0.10, decay: 3.2, crackle: true, crackleRate: 0.12,
                filterType: 'bandpass', freq: (3500 + sign * 300) * jit, Q: 1.8, gain: 0.12 * mult, when: 0.005 });
    playNoise({ duration: 0.09, decay: 3.8, filterType: 'lowpass', freq: 900 * jit, freqEnd: 300, gain: 0.11 * mult });
    return;
  }
  playNoise({ duration: 0.09, decay: 3.2, filterType: 'bandpass', freq: (680 + sign * 80) * jit, Q: 1.2, gain: 0.14 * mult });
  playTone({ type: 'sine', f0: 100 * jit, f1: 40, duration: 0.05, gain: 0.04 * mult });
}

function sndJump() {
  playTone({ type: 'sine', f0: 280, f1: 520, duration: 0.10, gain: 0.09 });
  playNoise({ duration: 0.05, decay: 4, filterType: 'lowpass', freq: 900, gain: 0.045 });
}

function sndSelect() {
  playTone({ type: 'square', f0: 1000, f1: 1400, duration: 0.04, gain: 0.05 });
}

function sndFlyOn() {
  playNoise({ duration: 0.35, decay: 1.8, filterType: 'bandpass', freq: 300, freqEnd: 1400, Q: 1.4, gain: 0.13 });
  playTone({ type: 'sine', f0: 220, f1: 660, duration: 0.30, gain: 0.06, when: 0.01 });
  playTone({ type: 'triangle', f0: 440, f1: 880, duration: 0.22, gain: 0.035, when: 0.05 });
}

function sndFlyOff() {
  playNoise({ duration: 0.30, decay: 2.2, filterType: 'bandpass', freq: 1400, freqEnd: 320, Q: 1.4, gain: 0.12 });
  playTone({ type: 'sine', f0: 620, f1: 200, duration: 0.26, gain: 0.06 });
  playTone({ type: 'square', f0: 110, f1: 60, duration: 0.09, gain: 0.05, when: 0.20 });
  playNoise({ duration: 0.10, decay: 3, filterType: 'lowpass', freq: 900, freqEnd: 400, gain: 0.07, when: 0.20 });
}

function sndHurt() {
  playTone({ type: 'square',   f0: 260, f1: 110, duration: 0.14, gain: 0.16 });
  playTone({ type: 'triangle', f0: 200, f1: 90,  duration: 0.16, gain: 0.10, when: 0.005 });
  playNoise({ duration: 0.09, decay: 4.5, filterType: 'bandpass', freq: 800, freqEnd: 300, Q: 1.5, gain: 0.18 });
  playNoise({ duration: 0.04, decay: 6.0, filterType: 'highpass', freq: 2400, gain: 0.05, when: 0.004 });
}

function sndDeath() {
  playTone({ type: 'square',   f0: 220, f1: 55,  duration: 0.75, gain: 0.14 });
  playTone({ type: 'triangle', f0: 180, f1: 45,  duration: 0.85, gain: 0.10, when: 0.02 });
  playTone({ type: 'sine',     f0: 110, f1: 40,  duration: 1.0,  gain: 0.07, when: 0.05 });
  playNoise({ duration: 0.9, decay: 1.6, filterType: 'lowpass', freq: 1200, freqEnd: 200, gain: 0.16, when: 0.02 });
  playNoise({ duration: 0.10, decay: 5, filterType: 'highpass', freq: 3200, gain: 0.08 });
}

function sndPig() {
  const p = 0.9 + Math.random() * 0.2;
  playTone({ type: 'sawtooth', f0: 220 * p, f1: 150 * p, duration: 0.12, gain: 0.10 });
  playTone({ type: 'sawtooth', f0: 240 * p, f1: 160 * p, duration: 0.10, gain: 0.08, when: 0.14 });
  playNoise({ duration: 0.18, decay: 3, filterType: 'bandpass', freq: 550, Q: 1.4, gain: 0.06 });
}

function sndSheep() {
  const c = getCtx(); if (!c) return;
  const master = getMaster(); if (!master) return;
  const p = 0.9 + Math.random() * 0.15;
  const t0 = c.currentTime + SCHEDULE_LEAD;
  const dur = 0.55;

  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(380 * p, t0);
  osc.frequency.linearRampToValueAtTime(320 * p, t0 + dur);

  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 16 + Math.random() * 4;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 22;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const filt = c.createBiquadFilter();
  filt.type = 'bandpass';
  filt.Q.value = 1.2;
  filt.frequency.value = 1800;

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.10, t0 + 0.03);
  g.gain.setValueAtTime(0.10, t0 + dur - 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(filt).connect(g).connect(master);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + dur + 0.05);
  lfo.stop(t0 + dur + 0.05);
}

function sndCow() {
  const c = getCtx(); if (!c) return;
  const master = getMaster(); if (!master) return;
  const p = 0.9 + Math.random() * 0.15;
  const t0 = c.currentTime + SCHEDULE_LEAD;
  const dur = 0.75;

  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(160 * p, t0);
  osc.frequency.linearRampToValueAtTime(115 * p, t0 + dur);

  const lfo = c.createOscillator();
  lfo.frequency.value = 6;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 10;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 900;

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.05);
  g.gain.setValueAtTime(0.11, t0 + dur - 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(filt).connect(g).connect(master);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + dur + 0.05);
  lfo.stop(t0 + dur + 0.05);
}

function sndChicken() {
  const p = 0.95 + Math.random() * 0.15;
  playTone({ type: 'square', f0: 1000 * p, f1: 600 * p, duration: 0.05, gain: 0.07 });
  playTone({ type: 'square', f0: 1200 * p, f1: 700 * p, duration: 0.06, gain: 0.06, when: 0.13 });
  playNoise({ duration: 0.03, decay: 6, filterType: 'highpass', freq: 3000, gain: 0.03 });
}

function sndMobHurt(type) {
  const p = 0.9 + Math.random() * 0.2;
  if (type === 'pig') {
    playTone({ type: 'sawtooth', f0: 200 * p, f1: 110 * p, duration: 0.14, gain: 0.13 });
    playNoise({ duration: 0.10, decay: 4, filterType: 'bandpass', freq: 700, Q: 1.4, gain: 0.06 });
    return;
  }
  if (type === 'sheep') {
    playTone({ type: 'sawtooth', f0: 380 * p, f1: 500 * p, duration: 0.16, gain: 0.11 });
    playNoise({ duration: 0.06, decay: 5, filterType: 'highpass', freq: 1800, gain: 0.04 });
    return;
  }
  if (type === 'cow') {
    playTone({ type: 'sawtooth', f0: 150 * p, f1: 95 * p, duration: 0.22, gain: 0.13 });
    playNoise({ duration: 0.08, decay: 4, filterType: 'lowpass', freq: 900, gain: 0.05 });
    return;
  }
  if (type === 'chicken') {
    playTone({ type: 'square', f0: 1400 * p, f1: 850 * p, duration: 0.09, gain: 0.09 });
    playTone({ type: 'square', f0: 1200 * p, f1: 780 * p, duration: 0.07, gain: 0.06, when: 0.08 });
    playNoise({ duration: 0.04, decay: 5, filterType: 'highpass', freq: 2800, gain: 0.035 });
    return;
  }
}

function sndMobDeath(type) {
  const p = 0.9 + Math.random() * 0.15;
  if (type === 'pig') {
    playTone({ type: 'sawtooth', f0: 200 * p, f1: 65, duration: 0.55, gain: 0.14 });
    playNoise({ duration: 0.5, decay: 2.0, filterType: 'bandpass', freq: 500, freqEnd: 180, Q: 1.2, gain: 0.08 });
    return;
  }
  if (type === 'sheep') {
    playTone({ type: 'sawtooth', f0: 400 * p, f1: 140, duration: 0.65, gain: 0.13 });
    playNoise({ duration: 0.6, decay: 1.8, filterType: 'bandpass', freq: 1400, freqEnd: 350, Q: 1.2, gain: 0.07 });
    return;
  }
  if (type === 'cow') {
    playTone({ type: 'sawtooth', f0: 150 * p, f1: 55, duration: 0.85, gain: 0.14 });
    playNoise({ duration: 0.8, decay: 1.5, filterType: 'lowpass', freq: 800, freqEnd: 200, gain: 0.10 });
    return;
  }
  if (type === 'chicken') {
    playTone({ type: 'square', f0: 1300 * p, f1: 350, duration: 0.35, gain: 0.10 });
    playNoise({ duration: 0.3, decay: 2.2, filterType: 'highpass', freq: 2400, gain: 0.05 });
    return;
  }
}

/* --- Инициализация --- */
createCtx();

return {
  resume: resume,
  break:  sndBreak,
  hit:    sndHit,
  place:  sndPlace,
  step:   sndStep,
  jump:   sndJump,
  select: sndSelect,
  flyOn:  sndFlyOn,
  flyOff: sndFlyOff,
  hurt:   sndHurt,
  death:  sndDeath,
  pig:    sndPig,
  sheep:  sndSheep,
  cow:    sndCow,
  chicken: sndChicken,
  mobHurt: sndMobHurt,
  mobDeath: sndMobDeath,
  setVolume: setVolume,
  getVolume: getVolume
};

})();