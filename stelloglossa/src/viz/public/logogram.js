/* 依脈衝星音系參數,確定性繪製 Arrival 風格的環形 logogram。

   設計邏輯:
   - 基底: 一個不完美的圓環 (ink wash,模擬書法墨汁)
   - 突起節點數 = tone_count + 1 (最少 1 個,沿圓周等距)
   - 內部弧線數 = vowel_inventory.length
   - 外部噴濺數 = syllable length (CV 少,CCCVCC 多)
   - 粗細 = complexity_score 取 log
   - 墨跡方向 (筆畫末尾的拖影方向) = tense_richness */

const SEMANTIC_ANCHORS = [
  'celestial', 'time', 'death', 'light', 'return',
  'distance', 'density', 'direction', 'contact', 'myth',
];

function seeded(jname) {
  // Simple deterministic hash → 0..1 stream
  let s = 0;
  for (let i = 0; i < jname.length; i++) s = (s * 31 + jname.charCodeAt(i)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

export function drawLogogram(jname, profile, size = 180) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.classList.add('logogram');

  const cx = size / 2, cy = size / 2;
  const R = size * 0.36;
  const rand = seeded(jname);
  const ink = '#dbe4f0';

  const tones = profile?.tone_count ?? 0;
  const vowels = profile?.vowel_inventory?.length ?? 3;
  const syllLen = profile?.syllable_structure?.length ?? 2;
  const complexity = profile?.complexity_score ?? 6;
  const stroke = 1.2 + Math.log2(complexity + 1) * 0.25;

  // Defs: soft glow filter for the ink
  const defs = el('defs');
  const filter = el('filter', { id: `glow-${jname.replace(/[+-]/g, '_')}`, x: '-20%', y: '-20%', width: '140%', height: '140%' });
  filter.appendChild(el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '1.2' }));
  defs.appendChild(filter);
  svg.appendChild(defs);

  const g = el('g', { filter: `url(#glow-${jname.replace(/[+-]/g, '_')})` });
  svg.appendChild(g);

  // 1. The imperfect ring: bezier around a circle with jitter
  const ringPts = [];
  const N_RING = 48;
  for (let i = 0; i < N_RING; i++) {
    const theta = (i / N_RING) * Math.PI * 2;
    const jitter = 1 + (rand() - 0.5) * 0.04;
    ringPts.push([cx + Math.cos(theta) * R * jitter, cy + Math.sin(theta) * R * jitter]);
  }
  const ringPath = 'M ' + ringPts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ') + ' Z';
  g.appendChild(el('path', {
    d: ringPath, fill: 'none', stroke: ink, 'stroke-width': stroke,
    'stroke-linecap': 'round', opacity: 0.85,
  }));

  // 2. Tonal bulges: circle thickened outwards at N equidistant points
  const bulgeN = tones + 1;
  for (let i = 0; i < bulgeN; i++) {
    const theta = (i / bulgeN) * Math.PI * 2 + rand() * 0.2;
    const bx = cx + Math.cos(theta) * (R + 4);
    const by = cy + Math.sin(theta) * (R + 4);
    g.appendChild(el('circle', {
      cx: bx.toFixed(2), cy: by.toFixed(2),
      r: (1.5 + rand() * 1.5).toFixed(2),
      fill: ink, opacity: 0.6 + rand() * 0.3,
    }));
    // A tiny inward tick
    const ix = cx + Math.cos(theta) * (R - 6 - rand() * 4);
    const iy = cy + Math.sin(theta) * (R - 6 - rand() * 4);
    g.appendChild(el('line', {
      x1: bx.toFixed(2), y1: by.toFixed(2),
      x2: ix.toFixed(2), y2: iy.toFixed(2),
      stroke: ink, 'stroke-width': stroke * 0.5, opacity: 0.4,
    }));
  }

  // 3. Inner vowel arcs: short chords inside the ring
  const arcN = Math.min(vowels, 10);
  for (let i = 0; i < arcN; i++) {
    const theta1 = rand() * Math.PI * 2;
    const len = Math.PI * (0.15 + rand() * 0.25);
    const theta2 = theta1 + len;
    const inner = R * (0.45 + rand() * 0.35);
    const x1 = cx + Math.cos(theta1) * inner;
    const y1 = cy + Math.sin(theta1) * inner;
    const x2 = cx + Math.cos(theta2) * inner;
    const y2 = cy + Math.sin(theta2) * inner;
    const large = len > Math.PI ? 1 : 0;
    g.appendChild(el('path', {
      d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${inner.toFixed(2)} ${inner.toFixed(2)} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      fill: 'none', stroke: ink, 'stroke-width': stroke * 0.8,
      'stroke-linecap': 'round', opacity: 0.65,
    }));
  }

  // 4. Outer splashes — syllable complexity
  const splashN = (syllLen - 1) * 3;
  for (let i = 0; i < splashN; i++) {
    const theta = rand() * Math.PI * 2;
    const r0 = R + 3 + rand() * 4;
    const r1 = R + 10 + rand() * 18;
    const x1 = cx + Math.cos(theta) * r0;
    const y1 = cy + Math.sin(theta) * r0;
    const x2 = cx + Math.cos(theta) * r1;
    const y2 = cy + Math.sin(theta) * r1;
    g.appendChild(el('line', {
      x1: x1.toFixed(2), y1: y1.toFixed(2),
      x2: x2.toFixed(2), y2: y2.toFixed(2),
      stroke: ink, 'stroke-width': stroke * 0.4,
      'stroke-linecap': 'round', opacity: 0.4 + rand() * 0.3,
    }));
  }

  // 5. A single centred glyph indicating the tense (very Arrival-esque)
  const tenseIdx = ['none', 'past-nonpast', 'past-present-future', 'compound']
    .indexOf(profile?.tense_richness || 'none');
  const centreR = 3 + tenseIdx * 1.2;
  g.appendChild(el('circle', {
    cx, cy, r: centreR, fill: 'none', stroke: ink,
    'stroke-width': stroke * 0.6, opacity: 0.7,
  }));
  if (tenseIdx >= 1) {
    g.appendChild(el('circle', {
      cx, cy, r: centreR + 3, fill: 'none', stroke: ink,
      'stroke-width': stroke * 0.3, opacity: 0.4,
      'stroke-dasharray': '1 2',
    }));
  }

  // 6. Drip tails from bulges (ink running) — longer for higher complexity
  for (let i = 0; i < Math.min(3, tones); i++) {
    const theta = rand() * Math.PI * 2;
    const start = R + 2;
    const endR = start + 8 + rand() * 14;
    const pts = [];
    let r = start;
    while (r < endR) {
      const jitter = (rand() - 0.5) * 2;
      pts.push([cx + Math.cos(theta) * r + jitter, cy + Math.sin(theta) * r + jitter]);
      r += 1.8;
    }
    if (pts.length > 1) {
      const d = 'M ' + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ');
      g.appendChild(el('path', {
        d, fill: 'none', stroke: ink,
        'stroke-width': stroke * 0.35, 'stroke-linecap': 'round', opacity: 0.5,
      }));
    }
  }

  return svg;
}
