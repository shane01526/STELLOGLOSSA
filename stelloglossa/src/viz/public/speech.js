/* Web Audio formant-based IPA synthesiser.
   純前端,依字元即時合成,不依賴任何 TTS 引擎。

   API:
     await speakWord(form, { pitch = 130, tempo = 1 })
       form   — 一個詞的 IPA 形式,如 'sgriml' 或 'strøgj'
     speakPhrase(text, opts)
       text   — 整行詩,如 'sa ta. ki nu.'
       會自動在空白與句點處加停頓
*/

const VOWEL_FORMANTS = {
  // char: [F1, F2, F3]   (Hz, 典型值)
  a: [800, 1200, 2500],
  e: [500, 1800, 2500],
  i: [300, 2200, 3000],
  o: [500, 900, 2400],
  u: [300, 800, 2400],
  ɛ: [600, 1800, 2500],
  ɔ: [600, 900, 2400],
  y: [300, 1800, 2400],  // 前高圓唇
  ø: [450, 1500, 2400],  // 前中圓唇
  ã: [750, 1300, 2500],  // 鼻化 a (會加 250 Hz 鼻腔共振)
};

// 子音分類;每類別的時長、音色特性不同
const CONSONANTS = {
  // 塞音(stop): [burst 中心頻, 是否濁音]
  p: { kind: 'stop', burst: 700,  voiced: false },
  b: { kind: 'stop', burst: 700,  voiced: true  },
  t: { kind: 'stop', burst: 3000, voiced: false },
  d: { kind: 'stop', burst: 3000, voiced: true  },
  k: { kind: 'stop', burst: 2000, voiced: false },
  g: { kind: 'stop', burst: 2000, voiced: true  },

  // 擦音 (fricative): 幾乎無氣聲,只留極微痕跡作為音段標記
  s:  { kind: 'fric', freq: 6000, voiced: false, gain: 0.006 },
  ʃ:  { kind: 'fric', freq: 3500, voiced: false, gain: 0.006 },
  f:  { kind: 'fric', freq: 5000, voiced: false, gain: 0.005 },
  v:  { kind: 'fric', freq: 5000, voiced: true,  gain: 0.005 },
  z:  { kind: 'fric', freq: 6000, voiced: true,  gain: 0.005 },
  h:  { kind: 'fric', freq: 1500, voiced: false, gain: 0.004, wide: true },

  // 鼻音 (nasal): 模擬鼻腔共振 [F1, F2]
  m: { kind: 'nasal', f1: 250, f2: 1200 },
  n: { kind: 'nasal', f1: 300, f2: 1700 },
  ŋ: { kind: 'nasal', f1: 300, f2: 1500 },

  // 流音 — 所有 r 類都改用 liquid 共振(更柔和)
  l: { kind: 'liquid', f1: 400, f2: 1500 },
  r: { kind: 'liquid', f1: 450, f2: 1400 },
  ɾ: { kind: 'liquid', f1: 420, f2: 1550 },

  // 半母音
  j: { kind: 'glide', f1: 300, f2: 2200 },
  w: { kind: 'glide', f1: 300, f2: 800  },
};

// Duration defaults (seconds)
const VOWEL_DUR = 0.18;
const STOP_DUR  = 0.06;
const FRIC_DUR  = 0.10;
const NASAL_DUR = 0.09;
const LIQ_DUR   = 0.08;
const GLIDE_DUR = 0.05;
const FLAP_DUR  = 0.025;

// 音素之間使用「重疊」而非間隙,消除字字分離感:
const GAP           = 0;        // 音素間不留空白
const OVERLAP       = 0.025;    // 相鄰音素重疊 25ms (consonant tails bleed into vowels)
const WORD_BREAK    = 0.14;
const SENTENCE_END  = 0.30;

// ──────── Audio context + reusable noise buffer ────────

let _ctx = null;
let _master = null;
let _noiseBuf = null;
let _routingOverride = null;   // set during scheduleWord so all phonemes share a word envelope
function getCtx() {
  if (_ctx) return _ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  _ctx = new Ctx();
  // Master bus: gentle lowpass + master gain to take the edge off every phoneme
  const lp = _ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5500;
  lp.Q.value = 0.7;
  const gain = _ctx.createGain();
  gain.gain.value = 0.75;
  lp.connect(gain);
  gain.connect(_ctx.destination);
  _master = lp;
  return _ctx;
}
function getMaster() { return _routingOverride || _master; }
function getNoiseBuffer(ctx) {
  if (_noiseBuf) return _noiseBuf;
  const size = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, size, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < size; i++) d[i] = Math.random() * 2 - 1;
  _noiseBuf = buf;
  return buf;
}

// ──────── Phoneme schedulers ────────

function scheduleVowel(ctx, t0, vowel, pitch, duration, isNasal = false, gainMul = 1.0) {
  const formants = VOWEL_FORMANTS[vowel] || VOWEL_FORMANTS.a;
  // Intra-syllabic F0 contour: rise (0-30%) then gently fall (30-100%)
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(pitch * 0.97, t0);
  osc.frequency.linearRampToValueAtTime(pitch * 1.03, t0 + duration * 0.3);
  osc.frequency.linearRampToValueAtTime(pitch * 0.92, t0 + duration);

  // Parallel bandpass filters for each formant
  const merge = ctx.createGain();
  const intensities = [1.0, 0.55, 0.3];
  const qs = [10, 14, 20];
  formants.forEach((fc, i) => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = fc;
    bp.Q.value = qs[i];
    const g = ctx.createGain();
    g.gain.value = intensities[i];
    osc.connect(bp); bp.connect(g); g.connect(merge);
  });

  // Nasal: add a low 250 Hz resonance with reduced intensity
  if (isNasal) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 270;
    bp.Q.value = 8;
    const g = ctx.createGain();
    g.gain.value = 0.4;
    osc.connect(bp); bp.connect(g); g.connect(merge);
  }

  // Phoneme-local envelope: vowels are the loudest element; gainMul applies
  // syllable stress / accent.
  const peak = 0.30 * gainMul;
  const env = ctx.createGain();
  merge.connect(env);
  env.gain.setValueAtTime(peak, t0);
  env.gain.setValueAtTime(peak, t0 + duration - 0.01);
  env.gain.linearRampToValueAtTime(0.0001, t0 + duration + 0.015);
  env.connect(getMaster());

  // Start the oscillator slightly before phoneme start so it ramps in smoothly,
  // and let it ring a hair past the duration to blend with the next phoneme.
  osc.start(t0 - 0.005);
  osc.stop(t0 + duration + 0.02);
}

function scheduleFricative(ctx, t0, freq, duration, voiced, gain = 0.02, wide = false) {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = wide ? 0.5 : 1.2;  // 更寬頻,像氣息而非嘶嘶聲
  // 再串一個 gentle lowpass 去掉最尖的高頻
  const softLp = ctx.createBiquadFilter();
  softLp.type = 'lowpass';
  softLp.frequency.value = Math.max(freq * 1.5, 4000);
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain * 0.2, t0);
  env.gain.linearRampToValueAtTime(gain, t0 + 0.018);          // 更緩 attack
  env.gain.setValueAtTime(gain, t0 + duration - 0.015);
  env.gain.linearRampToValueAtTime(0.0001, t0 + duration + 0.02);
  src.connect(bp); bp.connect(softLp); softLp.connect(env); env.connect(getMaster());
  src.start(t0); src.stop(t0 + duration + 0.02);

  if (voiced) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 110;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.04, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g); g.connect(getMaster());
    osc.start(t0); osc.stop(t0 + duration);
  }
}

function scheduleStop(ctx, t0, burstFreq, duration, voiced) {
  // 很溫和的爆破 — 低 peak、緩 attack、強 lowpass,聽起來像輕拍而非爆破
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = burstFreq;
  bp.Q.value = 0.9;                                      // 更寬
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.max(burstFreq, 2800);        // 更緊的低通
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(0.04, t0 + 0.012);    // 更低,讓塞音最弱
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(bp); bp.connect(lp); lp.connect(env); env.connect(getMaster());
  src.start(t0); src.stop(t0 + duration);

  if (voiced) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 90;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.03, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g); g.connect(getMaster());
    osc.start(t0); osc.stop(t0 + duration);
  }
}

function scheduleNasal(ctx, t0, f1, f2, pitch, duration) {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = pitch;
  const merge = ctx.createGain();
  [[f1, 10, 1.0], [f2, 12, 0.5], [250, 8, 0.5]].forEach(([fc, q, g]) => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = fc; bp.Q.value = q;
    const gg = ctx.createGain();
    gg.gain.value = g;
    osc.connect(bp); bp.connect(gg); gg.connect(merge);
  });
  const env = ctx.createGain();
  merge.connect(env);
  env.gain.setValueAtTime(0.14, t0);
  env.gain.setValueAtTime(0.14, t0 + duration - 0.012);
  env.gain.linearRampToValueAtTime(0.0001, t0 + duration + 0.015);
  env.connect(getMaster());
  osc.start(t0 - 0.005); osc.stop(t0 + duration + 0.02);
}

function scheduleLiquid(ctx, t0, f1, f2, pitch, duration) {
  // Like vowel but shorter + different resonance,主用 l
  scheduleNasal(ctx, t0, f1, f2, pitch, duration);
}

function scheduleFlap(ctx, t0, pitch, gain = 0.04) {
  // 極短 voiced tap — peak 再降半,低通再緊,像溫柔的舌尖一觸
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = pitch;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);     // 更緩 attack
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + FLAP_DUR);
  osc.connect(lp); lp.connect(g); g.connect(getMaster());
  osc.start(t0); osc.stop(t0 + FLAP_DUR);
}

function scheduleTrill(ctx, t0, pitch, reps = 2) {
  // 兩次輕 tap — 整體強度比其他子音弱
  let t = t0;
  for (let i = 0; i < reps; i++) {
    scheduleFlap(ctx, t, pitch, 0.035 * (1 - i * 0.3));
    t += FLAP_DUR + 0.018;
  }
  return t - t0;
}

// ──────── 核心分派 ────────

function scheduleChar(ctx, t0, ch, pitch) {
  if (VOWEL_FORMANTS[ch]) {
    const isNasal = ch === 'ã';
    scheduleVowel(ctx, t0, ch, pitch, VOWEL_DUR, isNasal);
    return VOWEL_DUR;
  }
  const spec = CONSONANTS[ch];
  if (!spec) {
    // 未知字元 —— 當作短空白 skip
    return 0.02;
  }
  switch (spec.kind) {
    case 'stop':
      scheduleStop(ctx, t0, spec.burst, STOP_DUR, spec.voiced);
      return STOP_DUR;
    case 'fric':
      scheduleFricative(ctx, t0, spec.freq, FRIC_DUR, spec.voiced, spec.gain ?? 0.006, spec.wide);
      return FRIC_DUR;
    case 'nasal':
      scheduleNasal(ctx, t0, spec.f1, spec.f2, pitch, NASAL_DUR);
      return NASAL_DUR;
    case 'liquid':
      scheduleLiquid(ctx, t0, spec.f1, spec.f2, pitch, LIQ_DUR);
      return LIQ_DUR;
    case 'trill':
      return scheduleTrill(ctx, t0, pitch, spec.reps);
    case 'flap':
      scheduleFlap(ctx, t0, pitch);
      return FLAP_DUR;
    case 'glide':
      scheduleLiquid(ctx, t0, spec.f1, spec.f2, pitch, GLIDE_DUR);
      return GLIDE_DUR;
  }
  return 0.02;
}

// ──────── Public API ────────

export function speakWord(form, { pitch = 130, tempo = 1 } = {}) {
  if (!form) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  scheduleWord(ctx, ctx.currentTime + 0.03, form, pitch, tempo);
}

/** Word-level envelope + prosody.
 *
 *  Prosody layers applied:
 *    1. Syllable segmentation — detect vowel nuclei to find syllables.
 *    2. Stress               — first vowel is 1.15× louder (primary stress).
 *    3. Pitch declination    — F0 drifts from 110% to 85% across the word.
 *    4. Final lengthening    — last vowel is ~1.5× longer.
 *    5. Intra-syllable F0    — every vowel rises then falls inside itself.
 */
function scheduleWord(ctx, t0, form, basePitch, tempo) {
  const chars = [...form];

  // 1. Locate vowels (syllable nuclei)
  const vowelIdxs = [];
  chars.forEach((ch, i) => { if (VOWEL_FORMANTS[ch]) vowelIdxs.push(i); });
  const nVowels = Math.max(1, vowelIdxs.length);

  // 2 + 3 + 4. Per-vowel pitch / duration / gain according to position
  const vowelProsody = {};  // idx → { pitch, durMul, gainMul }
  vowelIdxs.forEach((idx, i) => {
    const pos = nVowels === 1 ? 0 : i / (nVowels - 1);         // 0..1
    const pitch = basePitch * (1.10 - pos * 0.25);              // 110% → 85%
    const isLast = i === nVowels - 1;
    const isFirst = i === 0;
    const durMul = isLast ? 1.50 : (isFirst ? 1.05 : 0.90);
    const gainMul = isFirst ? 1.15 : (isLast ? 1.00 : 0.90);
    vowelProsody[idx] = { pitch, durMul, gainMul };
  });

  // Effective per-char durations
  const durations = chars.map((ch, i) => {
    if (VOWEL_FORMANTS[ch]) return VOWEL_DUR * vowelProsody[i].durMul;
    return rawDurOf(ch);
  });

  const step = (d) => (d / tempo);
  const totalDur = durations.reduce((acc, d) => acc + step(d) - OVERLAP, OVERLAP) + 0.08;

  // Word-level envelope
  const wordGain = ctx.createGain();
  wordGain.gain.setValueAtTime(0.0001, t0);
  wordGain.gain.linearRampToValueAtTime(1.0, t0 + 0.018);
  wordGain.gain.setValueAtTime(1.0, t0 + totalDur - 0.06);
  wordGain.gain.linearRampToValueAtTime(0.0001, t0 + totalDur);
  wordGain.connect(getMaster());

  _routingOverride = wordGain;
  try {
    let t = t0;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const dur = durations[i];
      if (VOWEL_FORMANTS[ch]) {
        const v = vowelProsody[i];
        scheduleVowel(ctx, t, ch, v.pitch, dur, ch === 'ã', v.gainMul);
      } else {
        // Non-vowels use the base pitch for any voicing component
        scheduleChar(ctx, t, ch, basePitch);
      }
      t += step(dur) - OVERLAP;
    }
  } finally {
    _routingOverride = null;
  }

  setTimeout(() => { try { wordGain.disconnect(); } catch {} },
             (totalDur + 0.5) * 1000);
}

function rawDurOf(ch) {
  if (VOWEL_FORMANTS[ch]) return VOWEL_DUR;
  const spec = CONSONANTS[ch];
  if (!spec) return 0.02;
  switch (spec.kind) {
    case 'stop': return STOP_DUR;
    case 'fric': return FRIC_DUR;
    case 'nasal': return NASAL_DUR;
    case 'liquid': return LIQ_DUR;
    case 'trill': return (FLAP_DUR + 0.015) * (spec.reps || 2);
    case 'flap': return FLAP_DUR;
    case 'glide': return GLIDE_DUR;
  }
  return 0.02;
}

export function speakPhrase(text, opts = {}) {
  if (!text) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  let t = ctx.currentTime + 0.03;
  const pitch = opts.pitch ?? 130;
  const tempo = opts.tempo ?? 1;
  for (const ch of text) {
    if (ch === ' ') { t += WORD_BREAK; continue; }
    if (ch === '.' || ch === ',' || ch === ';') { t += SENTENCE_END; continue; }
    const dur = scheduleChar(ctx, t, ch, pitch);
    t += (dur / tempo) + GAP;
  }
}

// Ensure any user click reactivates the context (browsers suspend it
// until a user gesture).
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => {
    const ctx = getCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }, { once: false });
}
