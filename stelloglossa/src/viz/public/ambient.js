/* 兩種原創氛圍音樂(Web Audio,無版權音檔):

   'interstellar'  宇宙冷感:低頻 organ-drone + 緩慢 pad + bell
   'kamakura'      日式溫情:D 大調 pad + 五聲音階 鋼琴 arpeggio + wind chime

   支援外部音檔覆寫:若 /audio/background-{mode}.mp3 或 /audio/background.mp3
   存在(HEAD 200),則優先播放;否則 fallback 到原創合成。

   API:
     toggleAmbient(mode)      mode='interstellar' | 'kamakura' | null
     duckAmbient(holdMs)      短暫壓低音量,其他音效播放時呼叫
     isAmbientOn()            bool
     currentMode()            'interstellar' | 'kamakura' | null
*/

let ctx = null;
let master = null;
let mode = null;
let synthNodes = [];
let scheduledTimers = [];
let duckTimer = null;
let externalAudio = null;

function getCtx() {
  if (ctx) return ctx;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  ctx = new C();
  return ctx;
}

async function tryExternalFor(mode) {
  const urls = mode ? [`/audio/background-${mode}.mp3`, `/audio/background.mp3`]
                    : [`/audio/background.mp3`];
  for (const url of urls) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.status === 200) return url;
    } catch {}
  }
  return null;
}

function startExternal(url, vol = 0.35) {
  externalAudio = new Audio(url);
  externalAudio.loop = true;
  externalAudio.volume = vol;
  externalAudio.play().catch(err => console.warn('ambient: autoplay blocked', err));
}

function clearTimers() {
  scheduledTimers.forEach(t => clearTimeout(t));
  scheduledTimers = [];
}

/* ════════ Interstellar mode ════════ */

function startInterstellar() {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume();

  master = c.createGain();
  master.gain.value = 0;

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;

  const delay = c.createDelay(1.5);
  delay.delayTime.value = 0.55;
  const fb = c.createGain(); fb.gain.value = 0.35;
  const dry = c.createGain(); dry.gain.value = 0.75;
  const wet = c.createGain(); wet.gain.value = 0.25;

  master.connect(lp);
  lp.connect(dry); lp.connect(delay);
  delay.connect(fb); fb.connect(delay);
  delay.connect(wet);
  dry.connect(c.destination);
  wet.connect(c.destination);

  master.gain.linearRampToValueAtTime(0.4, c.currentTime + 3);

  // C2, G2, C3 drones
  const d1 = makeOsc(c, 'sine', 65.4, 0.35);
  const d2 = makeOsc(c, 'triangle', 98.0 * 1.003, 0.2);
  const d3 = makeOsc(c, 'sine', 130.8, 0.15);
  [d1, d2, d3].forEach(({ osc, gain }) => gain.connect(master));

  // Swell LFO → d2.gain
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 1 / 14;
  const lfoG = c.createGain(); lfoG.gain.value = 0.15;
  lfo.connect(lfoG); lfoG.connect(d2.gain.gain);
  lfo.start();

  [d1.osc, d2.osc, d3.osc].forEach(o => o.start());
  synthNodes = [d1.osc, d2.osc, d3.osc, lfo, master];

  scheduleInterstellarBells(c);
}

function scheduleInterstellarBells(c) {
  const run = () => {
    if (!master) return;
    const pitches = [659.3, 783.99, 987.77, 523.25];
    const p = pitches[Math.floor(Math.random() * pitches.length)];
    const t0 = c.currentTime;
    bellTone(c, t0, p, 0.16, 5);
    bellTone(c, t0, p * 2.01, 0.04, 3.5);
    scheduledTimers.push(setTimeout(run, 8000 + Math.random() * 8000));
  };
  scheduledTimers.push(setTimeout(run, 4000));
}

function bellTone(c, t0, freq, peak, duration) {
  if (!master) return;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + duration + 0.1);
}

/* ════════ Kamakura mode (v2 · cinematic warmth) ════════
   I–vi–IV–V 和聲進行,每個和絃約 10 秒,用三層:
     1. 低音  (bass root,每 2.5 秒重新撥弦)
     2. 弦樂 pad (sawtooth + heavy lowpass,緩慢 attack,像弓拉起來)
     3. 鋼琴旋律 (random-walk over C-major,不規則節奏,像彈的人即興)
*/

const C_MAJOR_SCALE = [
  // 從 C3 到 E5,共 17 音
  130.81, 146.83, 164.81, 174.61, 196.00, 220.00, 246.94,  // C3 ~ B3
  261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88,  // C4 ~ B4
  523.25, 587.33, 659.25,                                   // C5 D5 E5
];

// I-vi-IV-V in C major: C / Am / F / G
// Each entry: { bass, chord_notes_for_pad, scale_root_offset }
const KAMAKURA_PROGRESSION = [
  { bass: 130.81, pad: [130.81, 164.81, 196.00, 261.63] },  // C: C3 E3 G3 C4
  { bass: 110.00, pad: [110.00, 164.81, 220.00, 261.63] },  // Am: A2 E3 A3 C4
  { bass: 87.31,  pad: [87.31, 174.61, 220.00, 261.63] },   // F: F2 F3 A3 C4
  { bass: 98.00,  pad: [98.00, 196.00, 246.94, 293.66] },   // G: G2 G3 B3 D4
];

const CHORD_DURATION_SEC = 10;

function startKamakura() {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume();

  master = c.createGain();
  master.gain.value = 0;

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 4500;

  const delay = c.createDelay(1.2);
  delay.delayTime.value = 0.42;
  const fb = c.createGain(); fb.gain.value = 0.32;
  const dry = c.createGain(); dry.gain.value = 0.7;
  const wet = c.createGain(); wet.gain.value = 0.3;

  master.connect(lp);
  lp.connect(dry); lp.connect(delay);
  delay.connect(fb); fb.connect(delay);
  delay.connect(wet);
  dry.connect(c.destination);
  wet.connect(c.destination);

  master.gain.linearRampToValueAtTime(0.4, c.currentTime + 3);
  synthNodes = [master];

  scheduleProgression(c);
}

let _kamakuraMelodyIdx = 7;  // persistent cursor across chords for continuous melody

function scheduleProgression(c) {
  let chordIdx = 0;
  const cycle = () => {
    if (!master) return;
    const chord = KAMAKURA_PROGRESSION[chordIdx];
    const t0 = c.currentTime;
    playBass(c, t0, chord.bass, CHORD_DURATION_SEC);
    playStringPad(c, t0, chord.pad, CHORD_DURATION_SEC);
    playMelody(c, t0 + 1.2, CHORD_DURATION_SEC - 1.4);
    chordIdx = (chordIdx + 1) % KAMAKURA_PROGRESSION.length;
    scheduledTimers.push(setTimeout(cycle, CHORD_DURATION_SEC * 1000));
  };
  cycle();
}

function playBass(c, t0, rootFreq, duration) {
  // Plucked low note every 2.5s, decaying like a soft bass piano
  const interval = 2.5;
  for (let offset = 0; offset < duration; offset += interval) {
    const t = t0 + offset;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = rootFreq;
    const o2 = c.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = rootFreq * 2.001;
    const g1 = c.createGain();
    const g2 = c.createGain();
    const peakDur = Math.min(2.4, duration - offset);
    g1.gain.setValueAtTime(0.0001, t);
    g1.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + peakDur);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.06, t + 0.015);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + peakDur * 0.55);
    o.connect(g1); g1.connect(master);
    o2.connect(g2); g2.connect(master);
    o.start(t); o.stop(t + peakDur + 0.1);
    o2.start(t); o2.stop(t + peakDur + 0.1);
  }
}

function playStringPad(c, t0, notes, duration) {
  // Sawtooth + slight detune, heavy lowpass → string section.
  // Slow attack (2s) and slow release (2s) for the bowed feel.
  notes.forEach((freq, i) => {
    const o1 = c.createOscillator();
    o1.type = 'sawtooth'; o1.frequency.value = freq;
    const o2 = c.createOscillator();
    o2.type = 'sawtooth'; o2.frequency.value = freq * 1.004;
    const padLp = c.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 900;
    padLp.Q.value = 1.5;
    const g = c.createGain();
    const peak = 0.075 * (i === 0 ? 1.2 : 1);  // root slightly louder
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 2);
    g.gain.setValueAtTime(peak, t0 + Math.max(2.5, duration - 2));
    g.gain.linearRampToValueAtTime(0.0001, t0 + duration);
    o1.connect(padLp); o2.connect(padLp);
    padLp.connect(g); g.connect(master);
    o1.start(t0); o1.stop(t0 + duration + 0.05);
    o2.start(t0); o2.stop(t0 + duration + 0.05);
  });
}

function playMelody(c, t0, duration) {
  // Random-walk over C major with irregular rhythm. Continuous cursor across
  // chords so the line feels like a coherent improvisation, not separate phrases.
  let t = t0;
  const WALK_STEPS = [-2, -1, -1, 0, 1, 1, 2];
  const DURATIONS = [0.45, 0.6, 0.8, 1.0, 1.3];   // irregular, weighted shorter
  while (t < t0 + duration - 0.6) {
    const step = WALK_STEPS[Math.floor(Math.random() * WALK_STEPS.length)];
    _kamakuraMelodyIdx = Math.max(5, Math.min(C_MAJOR_SCALE.length - 2,
                                              _kamakuraMelodyIdx + step));
    const noteDur = DURATIONS[Math.floor(Math.random() * DURATIONS.length)];
    pianoNote(c, t, C_MAJOR_SCALE[_kamakuraMelodyIdx], noteDur * 2.2);
    // 10% chance of a paired note (soft chord)
    if (Math.random() < 0.12) {
      const harmonyIdx = Math.max(0, _kamakuraMelodyIdx - 2);
      pianoNote(c, t, C_MAJOR_SCALE[harmonyIdx], noteDur * 2, 0.7);
    }
    t += noteDur;
  }
}

function pianoNote(c, t0, freq, duration, velocity = 1.0) {
  if (!master) return;
  // Piano-like: 基頻 + 第二、三諧波,快 attack 長 decay
  const o1 = c.createOscillator(); o1.type = 'sine';     o1.frequency.value = freq;
  const o2 = c.createOscillator(); o2.type = 'sine';     o2.frequency.value = freq * 2.001;
  const o3 = c.createOscillator(); o3.type = 'triangle'; o3.frequency.value = freq * 3.002;
  const g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain();
  const v = velocity;
  g1.gain.setValueAtTime(0.0001, t0);
  g1.gain.exponentialRampToValueAtTime(0.16 * v, t0 + 0.006);
  g1.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  g2.gain.setValueAtTime(0.0001, t0);
  g2.gain.exponentialRampToValueAtTime(0.06 * v, t0 + 0.006);
  g2.gain.exponentialRampToValueAtTime(0.0001, t0 + duration * 0.6);
  g3.gain.setValueAtTime(0.0001, t0);
  g3.gain.exponentialRampToValueAtTime(0.025 * v, t0 + 0.008);
  g3.gain.exponentialRampToValueAtTime(0.0001, t0 + duration * 0.4);
  o1.connect(g1); g1.connect(master);
  o2.connect(g2); g2.connect(master);
  o3.connect(g3); g3.connect(master);
  o1.start(t0); o1.stop(t0 + duration + 0.1);
  o2.start(t0); o2.stop(t0 + duration);
  o3.start(t0); o3.stop(t0 + duration);
}

/* ════════ Helpers ════════ */

function makeOsc(c, type, freq, gainVal) {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.value = gainVal;
  osc.connect(gain);
  return { osc, gain };
}

function stopCurrent() {
  if (externalAudio) {
    externalAudio.pause();
    externalAudio.src = '';
    externalAudio = null;
  }
  if (ctx && master) {
    try {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 1.0);
    } catch {}
    const nodesSnap = synthNodes.slice();
    master = null;
    synthNodes = [];
    clearTimers();
    setTimeout(() => {
      nodesSnap.forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch {} });
    }, 1100);
  } else {
    clearTimers();
  }
}

/* ════════ Public API ════════ */

export async function toggleAmbient(nextMode) {
  if (mode === nextMode) return;  // idempotent
  // Stop whatever is playing
  if (mode) stopCurrent();
  mode = nextMode;
  if (!nextMode) return;

  const ext = await tryExternalFor(nextMode);
  if (ext) {
    startExternal(ext, nextMode === 'kamakura' ? 0.30 : 0.35);
    return;
  }
  if (nextMode === 'interstellar') startInterstellar();
  else if (nextMode === 'kamakura') startKamakura();
}

export function duckAmbient(holdMs = 600) {
  if (!mode) return;
  const duckedVol = 0.15;
  const normalVol = mode === 'kamakura' ? 0.30 : 0.35;
  if (externalAudio) {
    externalAudio.volume = duckedVol;
    clearTimeout(duckTimer);
    duckTimer = setTimeout(() => {
      if (externalAudio) externalAudio.volume = normalVol;
    }, holdMs);
    return;
  }
  if (!master || !ctx) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(duckedVol, now + 0.15);
  clearTimeout(duckTimer);
  duckTimer = setTimeout(() => {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(mode === 'kamakura' ? 0.35 : 0.4, t + 0.8);
  }, holdMs);
}

export function isAmbientOn() { return !!mode; }
export function currentMode() { return mode; }
