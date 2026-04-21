/* 假說結果儀表板:H1/H2/H3 結果 + 三個圖表 + 最複雜/簡單/hub 表。
   用純 DOM + inline SVG,無外部依賴。 */

const toneColors = ['#8ad9ff', '#c6b0ff', '#ff9ac8', '#ff6b9d', '#ff4e7c', '#ff2a5f', '#ff0040'];

let rendered = false;

export function renderResults(bundle, onJnameClick) {
  const container = document.getElementById('results-view');
  if (rendered) return;
  rendered = true;

  if (!bundle.hypotheses || !bundle.hypotheses.results) {
    container.innerHTML =
      '<div class="empty">無假說結果 — 請先跑 python pipeline.py --stage analyze</div>';
    return;
  }

  const { results, summary } = bundle.hypotheses;
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'results-header';
  header.innerHTML = `
    <h2>實驗結果</h2>
    <div class="meta">${summary.n_pulsars} 脈衝星 · ${summary.n_lexicons} 語言 · ${summary.graph_edges} 接觸邊</div>
  `;
  container.appendChild(header);

  const hypoGrid = document.createElement('div');
  hypoGrid.className = 'hypo-grid';
  for (const r of results) {
    hypoGrid.appendChild(hypoCard(r));
  }
  container.appendChild(hypoGrid);

  const chartGrid = document.createElement('div');
  chartGrid.className = 'chart-grid';
  chartGrid.appendChild(chartPanel('H1: DM vs 聲調數', dmToneScatter(bundle)));
  chartGrid.appendChild(chartPanel('H2: 母音分布 (光/死亡語義場)', vowelHeatmap(bundle)));
  chartGrid.appendChild(chartPanel('H3: 漂移量分布 (最後一步)', driftHistogram(bundle)));
  chartGrid.appendChild(chartPanel('音節結構分布', syllableBar(bundle)));
  container.appendChild(chartGrid);

  const tables = document.createElement('div');
  tables.className = 'tables';
  tables.appendChild(extremesTable('最複雜的語言', complexityTop(bundle, true), onJnameClick));
  tables.appendChild(extremesTable('最簡單的語言', complexityTop(bundle, false), onJnameClick));
  tables.appendChild(hubTable(bundle, onJnameClick));
  container.appendChild(tables);
}

function hypoCard(r) {
  const el = document.createElement('div');
  el.className = 'hypo-card ' + (r.passed ? 'pass' : 'fail');
  const effect = r.effect_size !== null && r.effect_size !== undefined
    ? r.effect_size.toFixed(3) : '—';
  el.innerHTML = `
    <div class="status">${r.passed ? '✅ 通過' : '❌ 未通過'}</div>
    <div class="name">${escapeHtml(r.name)}</div>
    <div class="stats">
      <div><span>統計量</span><b>${Number(r.statistic).toFixed(3)}</b></div>
      <div><span>p-value</span><b>${Number(r.p_value).toFixed(4)}</b></div>
      <div><span>效應量</span><b>${effect}</b></div>
    </div>
    <div class="notes">${escapeHtml(r.notes)}</div>
  `;
  return el;
}

function chartPanel(title, svg) {
  const el = document.createElement('div');
  el.className = 'chart-panel';
  el.innerHTML = `<h3>${title}</h3>`;
  el.appendChild(svg);
  return el;
}

/* ===== Charts (inline SVG, no external deps) ===== */

function dmToneScatter(bundle) {
  const W = 360, H = 220, PAD = 40;
  const svg = newSvg(W, H);
  const points = [];
  for (const p of bundle.pulsars) {
    const prof = bundle.profiles[p.jname];
    if (!prof) continue;
    points.push({ dm: Math.log10(Math.max(p.dm, 0.1)), tone: prof.tone_count, jname: p.jname });
  }
  const xExt = extent(points.map(p => p.dm));
  const yExt = [0, Math.max(...points.map(p => p.tone)) + 1];
  const xs = (v) => PAD + (v - xExt[0]) / (xExt[1] - xExt[0]) * (W - 2 * PAD);
  const ys = (v) => H - PAD - v / yExt[1] * (H - 2 * PAD);

  drawAxes(svg, W, H, PAD, 'log₁₀ DM', '聲調數', xExt, yExt);

  for (const pt of points) {
    const color = toneColors[Math.min(pt.tone, toneColors.length - 1)];
    const c = el('circle', { cx: xs(pt.dm), cy: ys(pt.tone), r: 3.5, fill: color, 'fill-opacity': 0.75 });
    const t = el('title'); t.textContent = `${pt.jname}  DM=${Math.pow(10, pt.dm).toFixed(1)}  tones=${pt.tone}`;
    c.appendChild(t);
    svg.appendChild(c);
  }
  return svg;
}

function vowelHeatmap(bundle) {
  const W = 360, H = 220, PAD_L = 70, PAD_B = 50, PAD_T = 10, PAD_R = 20;
  const svg = newSvg(W, H);
  const HIGH_FRONT = new Set(['i', 'y', 'ɪ', 'e', 'ɛ']);
  const LOW_BACK = new Set(['a', 'ɑ', 'u', 'o', 'ɔ', 'ã']);
  const lightFields = ['light', 'return'];
  const deathFields = ['death', 'density'];
  const counts = [[0, 0], [0, 0]];  // [light/death][fh/bl]
  for (const [jname, pay] of Object.entries(bundle.lexicons)) {
    const lex = pay.lexicon || {};
    for (const f of lightFields) for (const e of (lex[f] || [])) addVowels(e.form, counts[0], HIGH_FRONT, LOW_BACK);
    for (const f of deathFields) for (const e of (lex[f] || [])) addVowels(e.form, counts[1], HIGH_FRONT, LOW_BACK);
  }
  const total = counts.flat().reduce((a, b) => a + b, 0) || 1;
  const cellW = (W - PAD_L - PAD_R) / 2;
  const cellH = (H - PAD_T - PAD_B) / 2;
  const rowLabels = ['光/回歸', '死亡/密度'];
  const colLabels = ['高前母音', '低後母音'];

  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const v = counts[r][c] / total;
      const x = PAD_L + c * cellW;
      const y = PAD_T + r * cellH;
      svg.appendChild(el('rect', {
        x, y, width: cellW, height: cellH,
        fill: heatColor(v), stroke: '#22304a',
      }));
      const txt = el('text', {
        x: x + cellW / 2, y: y + cellH / 2,
        fill: v > 0.25 ? '#05060a' : '#dbe4f0',
        'font-size': 14, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      });
      txt.textContent = `${counts[r][c]} (${(v * 100).toFixed(1)}%)`;
      svg.appendChild(txt);
    }
    svg.appendChild(textAt(PAD_L - 8, PAD_T + r * cellH + cellH / 2, rowLabels[r],
      { 'text-anchor': 'end', 'dominant-baseline': 'middle', fill: '#dbe4f0', 'font-size': 13 }));
  }
  for (let c = 0; c < 2; c++) {
    svg.appendChild(textAt(PAD_L + c * cellW + cellW / 2, H - PAD_B + 16, colLabels[c],
      { 'text-anchor': 'middle', fill: '#dbe4f0', 'font-size': 13 }));
  }
  return svg;
}

function addVowels(form, row, HF, LB) {
  if (!form) return;
  for (const ch of form) {
    if (HF.has(ch)) row[0]++;
    else if (LB.has(ch)) row[1]++;
  }
}

function driftHistogram(bundle) {
  const W = 360, H = 220, PAD = 40;
  const svg = newSvg(W, H);
  if (!bundle.drift) {
    svg.appendChild(textAt(W / 2, H / 2, '無漂移資料',
      { 'text-anchor': 'middle', fill: '#6b7f99', 'font-size': 13 }));
    return svg;
  }
  const lastStep = bundle.drift.steps - 1;
  const vals = [];
  for (const jname in bundle.drift.drift) {
    for (const field in bundle.drift.drift[jname]) {
      vals.push(bundle.drift.drift[jname][field][lastStep] || 0);
    }
  }
  const max = Math.max(...vals, 0.01);
  const binN = 20;
  const binW = max / binN;
  const bins = new Array(binN).fill(0);
  for (const v of vals) bins[Math.min(Math.floor(v / binW), binN - 1)]++;
  const barMax = Math.max(...bins, 1);
  const bwPx = (W - 2 * PAD) / binN;
  drawAxes(svg, W, H, PAD, `漂移量 (step ${lastStep})`, '詞條數', [0, max], [0, barMax]);
  for (let i = 0; i < binN; i++) {
    const h = (bins[i] / barMax) * (H - 2 * PAD);
    svg.appendChild(el('rect', {
      x: PAD + i * bwPx, y: H - PAD - h, width: bwPx - 1, height: h,
      fill: '#8ad9ff', 'fill-opacity': 0.65,
    }));
  }
  return svg;
}

function syllableBar(bundle) {
  const W = 360, H = 220, PAD_L = 50, PAD_B = 40, PAD_T = 10, PAD_R = 20;
  const svg = newSvg(W, H);
  const counts = {};
  for (const prof of Object.values(bundle.profiles)) {
    counts[prof.syllable_structure] = (counts[prof.syllable_structure] || 0) + 1;
  }
  const keys = Object.keys(counts).sort((a, b) => a.length - b.length);
  const max = Math.max(...Object.values(counts));
  const bw = (W - PAD_L - PAD_R) / keys.length * 0.7;
  const step = (W - PAD_L - PAD_R) / keys.length;
  drawAxes(svg, W, H, PAD_L, '音節結構', '語言數', null, [0, max], true);
  keys.forEach((k, i) => {
    const x = PAD_L + i * step + (step - bw) / 2;
    const h = counts[k] / max * (H - PAD_T - PAD_B);
    svg.appendChild(el('rect', {
      x, y: H - PAD_B - h, width: bw, height: h,
      fill: toneColors[i % toneColors.length], 'fill-opacity': 0.7,
    }));
    svg.appendChild(textAt(x + bw / 2, H - PAD_B + 14, k,
      { 'text-anchor': 'middle', fill: '#dbe4f0', 'font-size': 13 }));
    svg.appendChild(textAt(x + bw / 2, H - PAD_B - h - 4, String(counts[k]),
      { 'text-anchor': 'middle', fill: '#8ad9ff', 'font-size': 13 }));
  });
  return svg;
}

/* ===== Tables ===== */

function complexityTop(bundle, descending) {
  const list = Object.entries(bundle.profiles).map(([jname, prof]) => ({
    jname, ...prof,
  }));
  list.sort((a, b) => descending ? b.complexity_score - a.complexity_score
                                 : a.complexity_score - b.complexity_score);
  return list.slice(0, 5);
}

function extremesTable(title, rows, onClick) {
  const wrap = document.createElement('div');
  wrap.className = 'table-panel';
  wrap.innerHTML = `<h3>${title}</h3>`;
  const t = document.createElement('table');
  t.innerHTML = `
    <thead><tr><th>脈衝星</th><th>星座</th><th>音節</th><th>聲調</th><th>母音</th><th>分數</th></tr></thead>
  `;
  const tb = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="j">${r.jname}</td><td>${r.constellation}</td>
                    <td>${r.syllable_structure}</td><td>${r.tone_count}</td>
                    <td>${r.vowel_inventory.length}</td><td>${r.complexity_score}</td>`;
    tr.addEventListener('click', () => onClick && onClick(r.jname));
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  wrap.appendChild(t);
  return wrap;
}

function hubTable(bundle, onClick) {
  const wrap = document.createElement('div');
  wrap.className = 'table-panel';
  wrap.innerHTML = `<h3>接觸網絡樞紐 (degree)</h3>`;
  const degrees = new Map();
  for (const link of bundle.graph.links || []) {
    degrees.set(link.source, (degrees.get(link.source) || 0) + 1);
    degrees.set(link.target, (degrees.get(link.target) || 0) + 1);
  }
  const top = [...degrees.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const t = document.createElement('table');
  t.innerHTML = `<thead><tr><th>脈衝星</th><th>星座</th><th>度數</th></tr></thead>`;
  const tb = document.createElement('tbody');
  for (const [j, d] of top) {
    const prof = bundle.profiles[j];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="j">${j}</td><td>${prof?.constellation || '—'}</td><td>${d}</td>`;
    tr.addEventListener('click', () => onClick && onClick(j));
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  wrap.appendChild(t);
  return wrap;
}

/* ===== Helpers ===== */

const SVG_NS = 'http://www.w3.org/2000/svg';
function newSvg(w, h) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('width', w); s.setAttribute('height', h);
  s.setAttribute('viewBox', `0 0 ${w} ${h}`);
  return s;
}
function el(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
function textAt(x, y, text, attrs = {}) {
  const t = el('text', { x, y, ...attrs });
  t.textContent = text;
  return t;
}
function extent(arr) {
  let mn = Infinity, mx = -Infinity;
  for (const v of arr) { if (v < mn) mn = v; if (v > mx) mx = v; }
  return [mn, mx];
}
function drawAxes(svg, W, H, PAD, xLabel, yLabel, xExt, yExt, categorical) {
  svg.appendChild(el('line', { x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD, stroke: '#3a4a6a' }));
  svg.appendChild(el('line', { x1: PAD, y1: PAD, x2: PAD, y2: H - PAD, stroke: '#3a4a6a' }));
  svg.appendChild(textAt(W / 2, H - 6, xLabel,
    { 'text-anchor': 'middle', fill: '#6b7f99', 'font-size': 12 }));
  const ylabel = textAt(12, H / 2, yLabel,
    { 'text-anchor': 'middle', fill: '#6b7f99', 'font-size': 12 });
  ylabel.setAttribute('transform', `rotate(-90, 12, ${H / 2})`);
  svg.appendChild(ylabel);
  if (!categorical && xExt) {
    svg.appendChild(textAt(PAD, H - PAD + 14, xExt[0].toFixed(1),
      { 'text-anchor': 'middle', fill: '#6b7f99', 'font-size': 11 }));
    svg.appendChild(textAt(W - PAD, H - PAD + 14, xExt[1].toFixed(1),
      { 'text-anchor': 'middle', fill: '#6b7f99', 'font-size': 11 }));
  }
  if (yExt) {
    svg.appendChild(textAt(PAD - 6, H - PAD, yExt[0].toString(),
      { 'text-anchor': 'end', fill: '#6b7f99', 'font-size': 11 }));
    svg.appendChild(textAt(PAD - 6, PAD + 4, Math.round(yExt[1]).toString(),
      { 'text-anchor': 'end', fill: '#6b7f99', 'font-size': 11 }));
  }
}
function heatColor(t) {
  // blue (cold) → pink (hot), t ∈ [0,1]
  const steps = ['#0f1a2e', '#1a3350', '#2a4a7a', '#5a6ab8', '#9a7aa0', '#cc7a88', '#ff6b9d'];
  const i = Math.min(Math.floor(t * (steps.length - 1) * 4), steps.length - 1);
  return steps[i];
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
