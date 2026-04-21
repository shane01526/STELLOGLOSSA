/* 11 個互動功能集中在這個模組裡。
   app.js 的 init() 會以 bundle + 若干 callback 初始化每一塊。 */

/* ──────── 共用 ──────── */

const SEMANTIC_FIELDS_TC = {
  celestial: '天體', time: '時間', death: '死亡', light: '光', return: '回歸',
  distance: '距離', density: '密度', direction: '方向', contact: '接觸', myth: '神話',
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function overlay(id, open = true) {
  document.querySelectorAll('.overlay').forEach(o => o.classList.remove('visible'));
  if (open) document.getElementById(id).classList.add('visible');
}

function bindOverlayClose(id) {
  const el = document.getElementById(id);
  el.querySelector('.overlay-close').addEventListener('click', () => overlay(id, false));
  el.addEventListener('click', (e) => { if (e.target === el) overlay(id, false); });
}

/* ──────── A4 · Progress tracker ──────── */

const EXPLORED_KEY = 'stelloglossa.explored';

export function readExplored() {
  try { return new Set(JSON.parse(localStorage.getItem(EXPLORED_KEY) || '[]')); }
  catch { return new Set(); }
}

export function markExplored(jname) {
  const set = readExplored();
  set.add(jname);
  try { localStorage.setItem(EXPLORED_KEY, JSON.stringify([...set])); } catch {}
  updateProgressLabel();
  return set;
}

function updateProgressLabel() {
  const bundle = window.__bundle;
  if (!bundle) return;
  const set = readExplored();
  const total = bundle.pulsars.length;
  const el = document.getElementById('stats-progress');
  if (el) el.textContent = `已探索 ${set.size}/${total}`;
}

/* ──────── A1 · Search ──────── */

export function initSearch(bundle, onPick) {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  let focused = 0;

  function score(p, q) {
    const prof = bundle.profiles[p.jname];
    const hay = `${p.jname} ${p.constellation} ${prof?.syllable_structure || ''} ${prof?.tone_count || ''}聲調`.toLowerCase();
    if (hay.includes(q)) return hay.indexOf(q) === 0 ? 2 : 1;
    return 0;
  }

  function render(q) {
    if (!q) { results.classList.remove('visible'); results.innerHTML = ''; return; }
    const ql = q.toLowerCase();
    const explored = readExplored();
    const matches = bundle.pulsars
      .map(p => ({ p, s: score(p, ql) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12);
    if (!matches.length) {
      results.innerHTML = '<div class="sr-row"><span class="sr-meta">無結果</span></div>';
      results.classList.add('visible');
      return;
    }
    results.innerHTML = matches.map(({ p }, i) => {
      const prof = bundle.profiles[p.jname];
      const dot = explored.has(p.jname) ? '<span class="explored-dot">●</span>' : '';
      return `<div class="sr-row${i === focused ? ' focused' : ''}" data-jname="${escapeHtml(p.jname)}">
        <span class="sr-j">${dot}${escapeHtml(p.jname)}</span>
        <span class="sr-meta">${escapeHtml(p.constellation)} · ${prof?.syllable_structure || '?'}/${prof?.tone_count ?? '?'}調</span>
      </div>`;
    }).join('');
    results.classList.add('visible');
    results.querySelectorAll('.sr-row').forEach(row => {
      row.addEventListener('click', () => {
        const j = row.dataset.jname;
        if (j) { onPick(j); input.value = ''; results.classList.remove('visible'); }
      });
    });
  }

  input.addEventListener('input', () => { focused = 0; render(input.value.trim()); });
  input.addEventListener('focus', () => render(input.value.trim()));
  input.addEventListener('blur', () => setTimeout(() => results.classList.remove('visible'), 200));
  input.addEventListener('keydown', (e) => {
    const rows = results.querySelectorAll('.sr-row[data-jname]');
    if (!rows.length) return;
    if (e.code === 'ArrowDown') { focused = Math.min(focused + 1, rows.length - 1); render(input.value.trim()); e.preventDefault(); }
    else if (e.code === 'ArrowUp') { focused = Math.max(focused - 1, 0); render(input.value.trim()); e.preventDefault(); }
    else if (e.code === 'Enter') {
      const j = rows[focused]?.dataset.jname;
      if (j) { onPick(j); input.value = ''; results.classList.remove('visible'); }
    } else if (e.code === 'Escape') {
      input.blur();
      results.classList.remove('visible');
    }
  });
}

/* ──────── A2 · Random ──────── */

export function pickRandom(bundle, onPick) {
  const ps = bundle.pulsars;
  onPick(ps[Math.floor(Math.random() * ps.length)].jname);
}

/* ──────── A3 · Help overlay ──────── */

export function initHelp() {
  bindOverlayClose('help-overlay');
  document.getElementById('btn-help').addEventListener('click', () => overlay('help-overlay'));
}

/* ──────── C10 · Daily star ──────── */

export function initDailyStar(bundle, onPick) {
  const el = document.getElementById('daily-star');
  if (!el) return;
  const today = new Date().toISOString().slice(0, 10);
  const hash = today.split('').reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 0);
  const p = bundle.pulsars[hash % bundle.pulsars.length];
  const letter = bundle.letters?.[p.jname];
  const subtitle = letter?.subtitle || `${p.constellation} · ${p.distance_kpc.toFixed(2)} kpc`;
  el.innerHTML = `
    <div class="ds-label">今日之星 · ${today}</div>
    <div><span class="ds-name">${escapeHtml(p.jname)}</span> · ${escapeHtml(p.constellation)}</div>
    <div style="color:var(--dim);font-size:12px;margin-top:4px;font-style:italic">${escapeHtml(subtitle)}</div>
  `;
  el.classList.add('visible');
  el.addEventListener('click', () => onPick(p.jname));
}

/* ──────── C9 · Quiz ──────── */

export function initQuiz(bundle) {
  bindOverlayClose('quiz-overlay');
  document.getElementById('btn-quiz').addEventListener('click', () => { startQuiz(bundle); overlay('quiz-overlay'); });

  let score = 0, total = 0;
  function startQuiz(bundle) {
    const body = document.getElementById('quiz-body');
    const entries = [];
    for (const [jname, pay] of Object.entries(bundle.lexicons)) {
      for (const [field, items] of Object.entries(pay.lexicon || {})) {
        for (const e of items) {
          if (e.form) entries.push({ jname, field, form: e.form, gloss: e.gloss });
        }
      }
    }
    if (!entries.length) { body.innerHTML = '<p>無詞彙資料</p>'; return; }
    const answer = entries[Math.floor(Math.random() * entries.length)];
    const fields = Object.keys(SEMANTIC_FIELDS_TC);
    // 5 choices: answer + 4 random distractors
    const choices = new Set([answer.field]);
    while (choices.size < 5) choices.add(fields[Math.floor(Math.random() * fields.length)]);
    const opts = [...choices].sort(() => Math.random() - 0.5);
    body.innerHTML = `
      <div class="quiz-meta">這個詞來自哪個語義場?</div>
      <div class="quiz-word">${escapeHtml(answer.form)}</div>
      <div class="quiz-meta">(來自 ${escapeHtml(answer.jname)})</div>
      <div class="quiz-choices">${opts.map(f => `
        <button data-field="${f}">${SEMANTIC_FIELDS_TC[f] || f}</button>
      `).join('')}</div>
      <div class="quiz-score">答對 ${score}/${total}</div>
      <div style="text-align:center;margin-top:14px">
        <button class="overlay-close" style="position:static;color:var(--accent)" id="quiz-next">下一題 →</button>
      </div>
    `;
    body.querySelectorAll('.quiz-choices button').forEach(btn => {
      btn.addEventListener('click', () => {
        total += 1;
        if (btn.dataset.field === answer.field) { btn.classList.add('right'); score += 1; }
        else {
          btn.classList.add('wrong');
          body.querySelector(`[data-field="${answer.field}"]`)?.classList.add('right');
        }
        body.querySelectorAll('.quiz-choices button').forEach(b => b.disabled = true);
        body.querySelector('.quiz-score').textContent = `答對 ${score}/${total} · 這個詞是「${answer.gloss}」`;
      });
    });
    body.querySelector('#quiz-next').addEventListener('click', () => startQuiz(bundle));
  }
}

/* ──────── B7 · Custom pulsar generator ──────── */

const SYLL_BY_PERIOD = [
  { max: 0.01, s: 'CV' }, { max: 0.1, s: 'CVC' }, { max: 1, s: 'CCVC' }, { max: Infinity, s: 'CCCVCC' },
];
const TONES_BY_DM = [{ max: 10, t: 0 }, { max: 50, t: 2 }, { max: 200, t: 4 }, { max: Infinity, t: 6 }];
const TENSE_BY_PDOT = [
  { max: 1e-19, t: 'none' }, { max: 1e-17, t: 'past-nonpast' },
  { max: 1e-15, t: 'past-present-future' }, { max: Infinity, t: 'compound' },
];
const VOWELS_BY_W50 = [
  { max: 1, v: ['a', 'i', 'u'] },
  { max: 5, v: ['a', 'e', 'i', 'o', 'u'] },
  { max: 20, v: ['a', 'e', 'i', 'o', 'u', 'ɛ', 'ɔ'] },
  { max: Infinity, v: ['a', 'e', 'i', 'o', 'u', 'ɛ', 'ɔ', 'y', 'ø', 'ã'] },
];
const CONSONANT_BY_SYLL = { CV: 6, CVC: 9, CCVC: 12, CCCVCC: 15 };
const CONSONANT_POOLS = {
  0: ['s', 't', 'm', 'n', 'k', 'ʃ', 'h', 'l', 'f', 'p', 'r', 'v', 'z', 'j', 'w'],
  2: ['t', 'k', 'm', 'n', 's', 'p', 'l', 'r', 'b', 'ʃ', 'h', 'd', 'g', 'j', 'w'],
  4: ['t', 'k', 'p', 'm', 'n', 'l', 'b', 'd', 'g', 's', 'ŋ', 'r', 'h', 'j', 'w'],
  6: ['t', 'k', 'p', 'b', 'd', 'g', 'm', 'n', 'ŋ', 'l', 'ɾ', 'r', 's', 'j', 'w'],
};

function pickByThresholds(v, table, key) {
  for (const row of table) if (v < row.max) return row[key];
  return table[table.length - 1][key];
}

function derivePhonology(period, dm, pdot, w50) {
  const syll = pickByThresholds(period, SYLL_BY_PERIOD, 's');
  const tones = pickByThresholds(dm, TONES_BY_DM, 't');
  const tense = pickByThresholds(pdot, TENSE_BY_PDOT, 't');
  const vowels = pickByThresholds(w50, VOWELS_BY_W50, 'v');
  const size = CONSONANT_BY_SYLL[syll] || 8;
  const pool = CONSONANT_POOLS[Math.min(tones, 6)] || CONSONANT_POOLS[0];
  const consonants = pool.slice(0, size);
  return { syll, tones, tense, vowels, consonants };
}

function sampleWord(cons, vowels, syll, idx) {
  const c = (i) => cons[i % cons.length];
  const v = (i) => vowels[i % vowels.length];
  const templates = {
    CV: () => c(idx) + v(idx * 2),
    CVC: () => c(idx) + v(idx * 2) + c(idx + 2),
    CCVC: () => c(idx) + (cons.includes('r') ? 'r' : c(idx + 1)) + v(idx * 2) + c(idx + 2),
    CCCVCC: () => (cons.includes('s') ? 's' : c(0)) + c(idx) + (cons.includes('r') ? 'r' : c(idx + 1)) + v(idx * 2) + c(idx + 2) + c(idx * 3 + 1),
  };
  return (templates[syll] || templates.CV)();
}

export function initCustomPulsar() {
  bindOverlayClose('custom-overlay');
  document.getElementById('btn-custom').addEventListener('click', () => { renderCustom(); overlay('custom-overlay'); });

  function renderCustom() {
    const body = document.getElementById('custom-body');
    body.innerHTML = `
      <div class="cp-controls">
        <div class="cp-control">
          <label>自轉週期 P <b><span id="cp-p-v">0.1</span> s</b></label>
          <input type="range" id="cp-p" min="-3" max="0.7" step="0.05" value="-1" />
        </div>
        <div class="cp-control">
          <label>色散量 DM <b><span id="cp-dm-v">50</span> pc/cm³</b></label>
          <input type="range" id="cp-dm" min="0" max="3" step="0.05" value="1.7" />
        </div>
        <div class="cp-control">
          <label>自轉減慢率 Ṗ <b><span id="cp-pdot-v">1e-18</span></b></label>
          <input type="range" id="cp-pdot" min="-21" max="-13" step="0.1" value="-18" />
        </div>
        <div class="cp-control">
          <label>脈衝寬度 W₅₀ <b><span id="cp-w-v">5</span> ms</b></label>
          <input type="range" id="cp-w" min="-1" max="2.5" step="0.05" value="0.7" />
        </div>
      </div>
      <div class="cp-preview" id="cp-preview"></div>
      <div class="cp-sample" id="cp-sample"></div>
    `;
    const els = {
      p: body.querySelector('#cp-p'), dm: body.querySelector('#cp-dm'),
      pdot: body.querySelector('#cp-pdot'), w: body.querySelector('#cp-w'),
      pv: body.querySelector('#cp-p-v'), dmv: body.querySelector('#cp-dm-v'),
      pdotv: body.querySelector('#cp-pdot-v'), wv: body.querySelector('#cp-w-v'),
      preview: body.querySelector('#cp-preview'), sample: body.querySelector('#cp-sample'),
    };
    function update() {
      const period = Math.pow(10, +els.p.value);
      const dm = Math.pow(10, +els.dm.value);
      const pdot = Math.pow(10, +els.pdot.value);
      const w50 = Math.pow(10, +els.w.value);
      els.pv.textContent = period >= 1 ? period.toFixed(2) : (period * 1000).toFixed(1) + ' ms'.replace(' ms', '').concat(' ms');
      els.pv.textContent = period >= 1 ? period.toFixed(2) + ' s' : (period * 1000).toFixed(1) + ' ms';
      els.dmv.textContent = dm.toFixed(0);
      els.pdotv.textContent = pdot.toExponential(1);
      els.wv.textContent = w50.toFixed(2);
      const { syll, tones, tense, vowels, consonants } = derivePhonology(period, dm, pdot, w50);
      els.preview.innerHTML = `
        <div class="row"><span>音節結構</span><span>${syll}</span></div>
        <div class="row"><span>聲調數</span><span>${tones}</span></div>
        <div class="row"><span>時態</span><span>${tense}</span></div>
        <div class="row"><span>母音 (${vowels.length})</span><span>${vowels.join(' ')}</span></div>
        <div class="row"><span>子音 (${consonants.length})</span><span>${consonants.join(' ')}</span></div>
      `;
      const samples = ['星', '光', '死亡', '回歸', '時間'].map((g, i) => ({
        g, w: sampleWord(consonants, vowels, syll, i),
      }));
      els.sample.innerHTML = '<div style="color:var(--dim);font-size:12px;margin-bottom:6px">這門語言可能的五個核心詞:</div>' +
        samples.map(s => `<div class="row-word"><span class="w">${escapeHtml(s.w)}</span><span class="g">${s.g}</span></div>`).join('');
    }
    [els.p, els.dm, els.pdot, els.w].forEach(i => i.addEventListener('input', update));
    update();
  }
}

/* ──────── B6 · Earth language compare ──────── */

const EARTH_LANGS = [
  { name: '普通話', syll: 'CCVC', tones: 4, tense: 'none', vowelCount: 7 },
  { name: '日語', syll: 'CV', tones: 0, tense: 'past-nonpast', vowelCount: 5 },
  { name: '英語', syll: 'CCCVCC', tones: 0, tense: 'compound', vowelCount: 10 },
  { name: '越南語', syll: 'CCVC', tones: 6, tense: 'none', vowelCount: 10 },
  { name: '芬蘭語', syll: 'CVC', tones: 0, tense: 'past-nonpast', vowelCount: 7 },
  { name: '夏威夷語', syll: 'CV', tones: 0, tense: 'none', vowelCount: 5 },
];

function phonologyDistance(a, b) {
  const syllMap = { CV: 2, CVC: 3, CCVC: 4, CCCVCC: 6 };
  const tenseMap = { none: 0, 'past-nonpast': 1, 'past-present-future': 2, compound: 3 };
  return (
    Math.abs((syllMap[a.syll] || a.syll.length) - (syllMap[b.syll] || b.syll.length)) ** 2 +
    Math.abs(a.tones - b.tones) ** 2 +
    Math.abs((tenseMap[a.tense] || 0) - (tenseMap[b.tense] || 0)) ** 2 * 0.5 +
    Math.abs(a.vowelCount - b.vowelCount) ** 2 * 0.3
  );
}

export function initEarthCompare(bundle, onPick) {
  bindOverlayClose('earth-overlay');
  document.getElementById('btn-earth').addEventListener('click', () => { renderEarth(); overlay('earth-overlay'); });

  function renderEarth() {
    const body = document.getElementById('earth-body');
    const cards = EARTH_LANGS.map(lang => {
      let best = null, bestD = Infinity;
      for (const [jname, prof] of Object.entries(bundle.profiles)) {
        const d = phonologyDistance(lang, {
          syll: prof.syllable_structure, tones: prof.tone_count,
          tense: prof.tense_richness, vowelCount: prof.vowel_inventory.length,
        });
        if (d < bestD) { bestD = d; best = { jname, prof }; }
      }
      const const_ = bundle.pulsars.find(p => p.jname === best.jname)?.constellation || '?';
      return { lang, best, bestD, constellation: const_ };
    });
    body.innerHTML = `
      <p class="sub">地球上幾門語言在我們的音系 5 維空間裡,離哪一顆脈衝星最近?</p>
      <div class="earth-grid">
        ${cards.map(c => `
          <div class="earth-card" data-jname="${escapeHtml(c.best.jname)}">
            <div class="ec-lang">${c.lang.name}  <span style="color:var(--dim);font-size:12px;margin-left:6px">
              ${c.lang.syll}/${c.lang.tones}調/${c.lang.vowelCount}母音</span></div>
            <div class="ec-match">最接近:<span class="ec-j">${c.best.jname}</span> · ${c.constellation}</div>
            <div class="ec-why">
              ${c.best.prof.syllable_structure}/${c.best.prof.tone_count}調/${c.best.prof.vowel_inventory.length}母音 ·
              Euclidean dist = ${c.bestD.toFixed(2)}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    body.querySelectorAll('.earth-card').forEach(el => {
      el.addEventListener('click', () => { overlay('earth-overlay', false); onPick(el.dataset.jname); });
    });
  }
}

/* ──────── B5 · Compare two pulsars ──────── */

let _compareA = null;
export function setCompareFirst(jname) { _compareA = jname; }
export function getCompareFirst() { return _compareA; }

export function initCompare(bundle, onPick) {
  bindOverlayClose('compare-overlay');
}

export function openCompare(bundle, jnameA, jnameB) {
  const body = document.getElementById('compare-body');
  const a = bundle.profiles[jnameA], b = bundle.profiles[jnameB];
  const pa = bundle.pulsars.find(p => p.jname === jnameA);
  const pb = bundle.pulsars.find(p => p.jname === jnameB);
  const lexA = bundle.lexicons[jnameA]?.lexicon || {};
  const lexB = bundle.lexicons[jnameB]?.lexicon || {};
  const link = (bundle.graph.links || []).find(l =>
    (l.source === jnameA && l.target === jnameB) || (l.source === jnameB && l.target === jnameA));
  const dist = link?.distance_kpc;

  const rows = [
    ['距離 (kpc)', pa.distance_kpc.toFixed(2), pb.distance_kpc.toFixed(2)],
    ['週期 (s)', pa.period_s.toFixed(4), pb.period_s.toFixed(4)],
    ['DM', pa.dm.toFixed(1), pb.dm.toFixed(1)],
    ['音節結構', a.syllable_structure, b.syllable_structure],
    ['聲調數', a.tone_count, b.tone_count],
    ['時態', a.tense_richness, b.tense_richness],
    ['母音數', a.vowel_inventory.length, b.vowel_inventory.length],
    ['子音數', (a.consonant_inventory || []).length, (b.consonant_inventory || []).length],
    ['複雜度', a.complexity_score, b.complexity_score],
  ];

  const wordRows = ['celestial', 'light', 'death', 'return', 'time']
    .map(f => [SEMANTIC_FIELDS_TC[f], lexA[f]?.[0]?.form || '—', lexB[f]?.[0]?.form || '—']);

  body.innerHTML = `
    <div class="cmp-head">
      <div><h3>${escapeHtml(jnameA)}</h3><div class="sub">${escapeHtml(pa.constellation)}</div></div>
      <div><h3>${escapeHtml(jnameB)}</h3><div class="sub">${escapeHtml(pb.constellation)}</div></div>
    </div>
    ${dist ? `<p class="sub" style="text-align:center">彼此相距 <b style="color:var(--accent)">${dist.toFixed(2)} kpc</b> · ${link.regime}</p>` : `<p class="sub" style="text-align:center">語言孤島:彼此沒有直接接觸。</p>`}
    <h3>音系比較</h3>
    <div class="cmp-grid">
      ${rows.map(([label, va, vb]) => {
        const diff = String(va) !== String(vb);
        return `<div class="cmp-row">
          <div class="left ${diff ? 'diff' : ''}">${escapeHtml(va)}</div>
          <div class="label">${label}</div>
          <div class="right ${diff ? 'diff' : ''}">${escapeHtml(vb)}</div>
        </div>`;
      }).join('')}
    </div>
    <h3>核心詞彙對照</h3>
    <div class="cmp-grid">
      ${wordRows.map(([label, va, vb]) => `
        <div class="cmp-row">
          <div class="left" style="color:var(--accent);font-family:monospace">${escapeHtml(va)}</div>
          <div class="label">${label}</div>
          <div class="right" style="color:var(--accent);font-family:monospace">${escapeHtml(vb)}</div>
        </div>
      `).join('')}
    </div>
  `;
  overlay('compare-overlay');
}

/* ──────── C8 · Pulse audio ──────── */

import { toggleAmbient, duckAmbient, isAmbientOn, currentMode } from './ambient.js';

const AMBIENT_CYCLE = [null, 'interstellar', 'kamakura'];
const AMBIENT_LABEL = {
  null: '🎵 氛圍',
  interstellar: '🌌 宇宙',
  kamakura: '🌸 鎌倉',
};

let audioCtx = null;
let audioTimer = null;
let audioEnabled = false;

export function initAudio() {
  const btn = document.getElementById('btn-audio');
  btn.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    btn.classList.toggle('active', audioEnabled);
    if (!audioEnabled) stopAudio();
  });
}

export function initAmbient() {
  const btn = document.getElementById('btn-ambient');
  if (!btn) return;
  let idx = 0;
  try {
    const saved = localStorage.getItem('stelloglossa.ambient.mode');
    const savedIdx = AMBIENT_CYCLE.indexOf(saved === 'null' ? null : saved);
    if (savedIdx >= 0) idx = savedIdx;
  } catch {}
  // Reflect saved state on load (label only — autoplay is blocked till user click)
  btn.textContent = AMBIENT_LABEL[String(AMBIENT_CYCLE[idx])] || AMBIENT_LABEL.null;
  btn.classList.toggle('active', AMBIENT_CYCLE[idx] != null);
  btn.title = '背景氛圍音樂(連點切換:關 → 宇宙 → 鎌倉 → 關)';

  btn.addEventListener('click', async () => {
    idx = (idx + 1) % AMBIENT_CYCLE.length;
    const mode = AMBIENT_CYCLE[idx];
    btn.textContent = AMBIENT_LABEL[String(mode)];
    btn.classList.toggle('active', mode != null);
    try { localStorage.setItem('stelloglossa.ambient.mode', String(mode)); } catch {}
    await toggleAmbient(mode);
  });
}

export function playPulseFor(period_s) {
  if (!audioEnabled) return;
  stopAudio();
  // Duck the background whenever pulse beat starts
  if (isAmbientOn()) duckAmbient(Math.max(period_s * 1000 * 1.5, 800));
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  // Cap extreme rates (ms pulsars would be > human hearing beat)
  const intervalMs = Math.max(60, Math.min(period_s * 1000, 4000));
  const freq = period_s < 0.1 ? 880 : period_s < 1 ? 440 : 220;

  const tick = () => {
    if (!audioEnabled || !audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  };
  tick();
  audioTimer = setInterval(tick, intervalMs);
}

export function stopAudio() {
  if (audioTimer) { clearInterval(audioTimer); audioTimer = null; }
}

/* ──────── D13 · Auto tour ──────── */

const TOUR_STOPS = [
  { hint: 'minDist', desc: '最靠近我們的脈衝星。它的語言是 {syll},聲調 {tones}。' },
  { hint: 'minPeriod', desc: '最快的歌者 —— 每 {p} 秒就轉一圈。' },
  { hint: 'maxDM', desc: '穿越最厚星際介質的訊號 —— 色散量 DM = {dm}。' },
  { hint: 'maxComplex', desc: '最複雜的語言樣本 —— 音節 {syll},{vc} 個母音。' },
  { hint: 'hub', desc: '接觸網絡裡的中心樞紐,它借出與被借入最多。' },
];

function pickTourStars(bundle) {
  const ps = bundle.pulsars;
  const byMinDist = [...ps].sort((a, b) => a.distance_kpc - b.distance_kpc)[0];
  const byMinPeriod = [...ps].sort((a, b) => a.period_s - b.period_s)[0];
  const byMaxDM = [...ps].sort((a, b) => b.dm - a.dm)[0];
  const byMaxComplex = Object.entries(bundle.profiles)
    .sort((a, b) => b[1].complexity_score - a[1].complexity_score)[0];
  const maxComplexStar = ps.find(p => p.jname === byMaxComplex[0]);
  const deg = new Map();
  for (const l of bundle.graph.links || []) {
    deg.set(l.source, (deg.get(l.source) || 0) + 1);
    deg.set(l.target, (deg.get(l.target) || 0) + 1);
  }
  const hubJ = [...deg.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const hubStar = ps.find(p => p.jname === hubJ);
  return [byMinDist, byMinPeriod, byMaxDM, maxComplexStar, hubStar].filter(Boolean);
}

export function initTour(bundle, onPick) {
  const banner = document.getElementById('tour-banner');
  const caption = document.getElementById('tour-caption');
  const btnNext = document.getElementById('tour-next');
  const btnStop = document.getElementById('tour-stop');
  let stops = [], idx = 0;

  function show(i) {
    const p = stops[i];
    const prof = bundle.profiles[p.jname];
    const tmpl = TOUR_STOPS[i].desc
      .replace('{syll}', prof?.syllable_structure || '?')
      .replace('{tones}', prof?.tone_count ?? '?')
      .replace('{p}', p.period_s.toFixed(5))
      .replace('{dm}', p.dm.toFixed(0))
      .replace('{vc}', prof?.vowel_inventory?.length ?? '?');
    caption.innerHTML = `<b style="color:var(--accent);font-family:monospace">${escapeHtml(p.jname)}</b> · ${escapeHtml(p.constellation)}<br/><em>${escapeHtml(tmpl)}</em>`;
    onPick(p.jname);
  }
  function start() {
    stops = pickTourStars(bundle);
    idx = 0;
    banner.classList.add('visible');
    show(0);
  }
  function stop() { banner.classList.remove('visible'); }

  document.getElementById('btn-tour').addEventListener('click', start);
  btnNext.addEventListener('click', () => { idx = (idx + 1) % stops.length; show(idx); });
  btnStop.addEventListener('click', stop);
}

/* ──────── D11 · Letter to star (calls /translate API) ──────── */

export async function translateToStarLang(bundle, jname, chineseText) {
  try {
    const url = `/translate?jname=${encodeURIComponent(jname)}&text=${encodeURIComponent(chineseText)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    return { source: chineseText, tokens: [], output: '', grammar: {}, error: String(err) };
  }
}

/* ──────── D12 · Notes (per star) ──────── */

const NOTES_KEY = 'stelloglossa.notes';
export function loadNotes() {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); }
  catch { return {}; }
}
export function saveNote(jname, text) {
  const all = loadNotes();
  if (text) all[jname] = text; else delete all[jname];
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(all)); } catch {}
}

/* ──────── Entry point: wire everything ──────── */

export function initFeatures(bundle, handlers) {
  window.__bundle = bundle;
  initHelp();
  initSearch(bundle, handlers.onPickStar);
  initQuiz(bundle);
  initCustomPulsar();
  initEarthCompare(bundle, handlers.onPickStar);
  initCompare(bundle, handlers.onPickStar);
  initAudio();
  initAmbient();
  initTour(bundle, handlers.onPickStar);
  initDailyStar(bundle, handlers.onPickStar);

  document.getElementById('btn-random').addEventListener('click', () => pickRandom(bundle, handlers.onPickStar));

  // Add progress badge into #stats
  const stats = document.getElementById('stats');
  if (stats && !document.getElementById('stats-progress')) {
    const div = document.createElement('div');
    div.id = 'stats-progress';
    div.style.cssText = 'color:#7aff8a;font-size:12px;margin-top:4px';
    stats.appendChild(div);
  }
  updateProgressLabel();

  // Global keyboard shortcuts that don't belong to any single module
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const inInput = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (inInput) return;
    if (e.repeat) return;
    if (e.code === 'Slash' && !e.shiftKey) {
      document.getElementById('search-input')?.focus();
      e.preventDefault();
    } else if (e.shiftKey && e.code === 'Slash') {      // ?
      overlay('help-overlay');
      e.preventDefault();
    } else if (e.code === 'KeyR') {
      pickRandom(bundle, handlers.onPickStar); e.preventDefault();
    } else if (e.code === 'KeyQ') {
      document.getElementById('btn-quiz')?.click(); e.preventDefault();
    } else if (e.code === 'KeyM') {
      document.getElementById('btn-custom')?.click(); e.preventDefault();
    } else if (e.code === 'Escape') {
      document.querySelectorAll('.overlay.visible').forEach(o => o.classList.remove('visible'));
    }
  });
}
