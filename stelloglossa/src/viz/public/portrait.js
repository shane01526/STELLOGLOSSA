/* portrait.js — Fused cosmological/linguistic pulsar portrait.

   The star's photosphere edge IS the language's written glyph. A single
   jittered ring whose irregularity combines logogram ink-wash hand-drawn
   quality with syllable-structure-driven body deformation. Tonal bulges
   become magnetic pole anchors; jets emerge from bulge[0] and its antipode.
   DM drives the colour palette; distance drives the outer halo alpha;
   period drives the rotation speed; complexity drives stroke weight.

   Split of responsibilities:
     logogram.js   pure flat ink-wash glyph (for §3 educational dissection)
     portrait.js   fused hero portrait (everywhere else)

   Layered composition (back → front):
     1. Radial gradient background (distance_kpc → alpha)
     2. JET BEAMS (period → length, bulge[0] axis) — FIXED in space
     3. SPIN GROUP (rotates with the pulsar when animated):
        3a. Corona splashes (syllable complexity + consonant count)
        3b. Ring fill disc (DM palette, semi-transparent glow)
        3c. Ring stroke (jittered photosphere edge)
        3d. Secondary ink trace (double-ring ink-wash feel)
        3e. Tonal bulges (tones+1 magnetic poles with inward inked ticks)
        3f. Inner vowel arcs (logogram-style)
        3g. Drip tails from bulges
     4. NEUTRON CORE (centre, tense-indexed glow + optional outer dashed ring)
     5. Frame hairline

   Public API:
     drawPortrait(jname, pulsar, profile, { size, animated })  → SVGSVGElement
     downloadPortraitPNG(jname, svg, scale)                    → Promise<void>
*/

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function seeded(jname) {
  let s = 0;
  for (let i = 0; i < jname.length; i++) s = (s * 31 + jname.charCodeAt(i)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

function logRemap(value, lo, hi, outLo, outHi) {
  const v = clamp(value, lo, hi);
  const t = (Math.log10(Math.max(v, 1e-12)) - Math.log10(lo)) /
            (Math.log10(hi) - Math.log10(lo));
  return lerp(outLo, outHi, clamp(t, 0, 1));
}

// Low DM → pale cyan-white; high DM → warm orange (interstellar reddening analog).
function dmPalette(dm) {
  const t = clamp(Math.log10(Math.max(dm, 1)) / 3, 0, 1);
  const hue = lerp(195, 20, t);
  return {
    body: `hsl(${hue.toFixed(0)}, ${lerp(55, 70, t).toFixed(0)}%, ${lerp(78, 58, t).toFixed(0)}%)`,
    edge: `hsl(${hue.toFixed(0)}, 75%, 45%)`,
    glow: `hsl(${hue.toFixed(0)}, 70%, 72%)`,
    core: `hsl(${hue.toFixed(0)}, 55%, 88%)`,
  };
}

function safeId(jname) { return jname.replace(/[^A-Za-z0-9]/g, '_'); }

// Fused ring edge: logogram hand-drawn high-frequency jitter +
// syllable-structure low-frequency body deformation.
function ringPoints(syll, rand, R) {
  const N = 72;
  const amp = { 'CV': 0.03, 'CVC': 0.05, 'CCVC': 0.12, 'CCCVCC': 0.20 }[syll] || 0.05;
  const phase1 = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;
  const stretchX = syll === 'CVC' ? 1.06 : 1;
  const stretchY = syll === 'CVC' ? 0.94 : 1;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const theta = (i / N) * Math.PI * 2;
    // Low-frequency body shape (avatar-style)
    const low = Math.sin(theta * 3 + phase1) * amp * 0.55
              + Math.sin(theta * 5 + phase2) * amp * 0.30;
    // High-frequency ink-wash tremor (logogram-style)
    const tremor = (rand() - 0.5) * 0.04;
    // Occasional deep notches for the most complex syllable
    const notch = (syll === 'CCCVCC' && rand() < 0.10) ? -0.15 : 0;
    const r = R * (1 + low + tremor + notch);
    pts.push([Math.cos(theta) * r * stretchX, Math.sin(theta) * r * stretchY]);
  }
  return pts;
}

function ptsToPath(pts) {
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
  }
  return d + ' Z';
}

export function drawPortrait(jname, pulsar, profile, { size = 240, animated = false } = {}) {
  const svg = el('svg', {
    width: size, height: size,
    viewBox: '-120 -120 240 240',
    class: 'portrait',
  });
  svg.dataset.jname = jname;

  const rand = seeded(jname);
  const tones = profile?.tone_count ?? 0;
  const vowels = profile?.vowel_inventory?.length ?? 3;
  const consonants = profile?.consonant_inventory?.length ?? 8;
  const syll = profile?.syllable_structure || 'CV';
  const complexity = profile?.complexity_score ?? 6;
  const tense = profile?.tense_richness || 'none';
  const period = pulsar?.period_s ?? 1;
  const dm = pulsar?.dm ?? 10;
  const dist = pulsar?.distance_kpc ?? 1;

  const pal = dmPalette(dm);
  const ink = '#dbe4f0';

  const R = logRemap(complexity, 6, 360, 55, 78);
  const stroke = 1.3 + Math.log2(complexity + 1) * 0.28;

  const id = safeId(jname);
  const defs = el('defs');

  // Background radial (distance → alpha)
  const bgId = `pbg-${id}`;
  const bg = el('radialGradient', { id: bgId, cx: '50%', cy: '50%', r: '55%' });
  const bgAlpha = clamp(0.22 - Math.log10(Math.max(dist, 0.1)) * 0.06, 0.04, 0.25);
  bg.appendChild(el('stop', { offset: '0%', 'stop-color': pal.body, 'stop-opacity': bgAlpha.toFixed(3) }));
  bg.appendChild(el('stop', { offset: '100%', 'stop-color': '#05060a', 'stop-opacity': '0' }));
  defs.appendChild(bg);

  // Glow filter
  const glowId = `pgl-${id}`;
  const glow = el('filter', { id: glowId, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  glow.appendChild(el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '2.2' }));
  defs.appendChild(glow);

  svg.appendChild(defs);

  // ═══ Fixed layers ═══

  // 1 · Background field
  svg.appendChild(el('circle', { cx: 0, cy: 0, r: 115, fill: `url(#${bgId})` }));

  // Precompute bulge angles (needed for jet axis before we enter spinG)
  const bulgeN = tones + 1;
  const bulgeBase = rand() * Math.PI * 2;
  const bulgeAngles = [];
  for (let i = 0; i < bulgeN; i++) {
    bulgeAngles.push(bulgeBase + (i / bulgeN) * Math.PI * 2);
  }

  // 2 · Jet beams — FIXED in space (pulsar lighthouse effect: bulges rotate past the beam exit)
  const jetAngle = bulgeAngles[0];
  const jetLen = logRemap(period, 0.001, 5, 112, R + 6);
  for (const sign of [1, -1]) {
    const angle = jetAngle + (sign < 0 ? Math.PI : 0);
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const jetGradId = `pj-${id}-${sign < 0 ? 'n' : 'p'}`;
    const grad = el('linearGradient', {
      id: jetGradId, gradientUnits: 'userSpaceOnUse',
      x1: (dx * R).toFixed(2), y1: (dy * R).toFixed(2),
      x2: (dx * jetLen).toFixed(2), y2: (dy * jetLen).toFixed(2),
    });
    grad.appendChild(el('stop', { offset: '0%', 'stop-color': pal.glow, 'stop-opacity': '0.85' }));
    grad.appendChild(el('stop', { offset: '100%', 'stop-color': pal.glow, 'stop-opacity': '0' }));
    defs.appendChild(grad);
    svg.appendChild(el('line', {
      x1: (dx * (R - 2)).toFixed(2), y1: (dy * (R - 2)).toFixed(2),
      x2: (dx * jetLen).toFixed(2), y2: (dy * jetLen).toFixed(2),
      stroke: `url(#${jetGradId})`, 'stroke-width': '4.5',
      'stroke-linecap': 'round',
    }));
  }

  // ═══ Rotating layers ═══
  const spinG = el('g', { class: 'portrait-spin' });
  svg.appendChild(spinG);

  // 3a · Corona splashes (syllable complexity + consonant count)
  const splashN = (syll.length - 1) * 3 + Math.floor(consonants * 0.3);
  for (let i = 0; i < splashN; i++) {
    const theta = rand() * Math.PI * 2;
    const r0 = R + 3 + rand() * 4;
    const r1 = R + 10 + rand() * 20;
    spinG.appendChild(el('line', {
      x1: (Math.cos(theta) * r0).toFixed(2), y1: (Math.sin(theta) * r0).toFixed(2),
      x2: (Math.cos(theta) * r1).toFixed(2), y2: (Math.sin(theta) * r1).toFixed(2),
      stroke: ink, 'stroke-width': (stroke * 0.35).toFixed(2),
      'stroke-linecap': 'round',
      opacity: (0.35 + rand() * 0.3).toFixed(2),
    }));
  }

  // 3b · Ring fill disc
  const ringPts = ringPoints(syll, rand, R);
  const fillG = el('g', { filter: `url(#${glowId})` });
  fillG.appendChild(el('path', {
    d: ptsToPath(ringPts),
    fill: pal.body, 'fill-opacity': '0.32',
  }));
  spinG.appendChild(fillG);

  // 3c · Ring stroke (primary jittered photosphere edge)
  spinG.appendChild(el('path', {
    d: ptsToPath(ringPts),
    fill: 'none', stroke: pal.edge,
    'stroke-width': stroke.toFixed(2),
    'stroke-linecap': 'round', opacity: '0.95',
  }));

  // 3d · Secondary ink trace (slight offset, ink-wash double-stroke feel)
  const ringPts2 = ringPts.map(([x, y]) => {
    const theta = Math.atan2(y, x);
    const off = (rand() - 0.5) * 1.8;
    const r = Math.hypot(x, y) + off;
    return [Math.cos(theta) * r, Math.sin(theta) * r];
  });
  spinG.appendChild(el('path', {
    d: ptsToPath(ringPts2),
    fill: 'none', stroke: ink,
    'stroke-width': (stroke * 0.35).toFixed(2),
    opacity: '0.3',
  }));

  // 3e · Tonal bulges (magnetic pole anchors)
  for (let i = 0; i < bulgeN; i++) {
    const theta = bulgeAngles[i];
    const bx = Math.cos(theta) * (R + 4);
    const by = Math.sin(theta) * (R + 4);
    spinG.appendChild(el('circle', {
      cx: bx.toFixed(2), cy: by.toFixed(2),
      r: (2 + rand() * 1.2).toFixed(2),
      fill: pal.glow, opacity: '0.85',
    }));
    // inward ink bleed tick
    const ix = Math.cos(theta) * (R - 6 - rand() * 4);
    const iy = Math.sin(theta) * (R - 6 - rand() * 4);
    spinG.appendChild(el('line', {
      x1: bx.toFixed(2), y1: by.toFixed(2),
      x2: ix.toFixed(2), y2: iy.toFixed(2),
      stroke: ink, 'stroke-width': (stroke * 0.4).toFixed(2),
      opacity: '0.4',
    }));
  }

  // 3f · Inner vowel arcs
  const arcN = Math.min(vowels, 10);
  for (let i = 0; i < arcN; i++) {
    const theta1 = rand() * Math.PI * 2;
    const len = Math.PI * (0.12 + rand() * 0.22);
    const theta2 = theta1 + len;
    const inner = R * (0.4 + rand() * 0.35);
    const x1 = Math.cos(theta1) * inner, y1 = Math.sin(theta1) * inner;
    const x2 = Math.cos(theta2) * inner, y2 = Math.sin(theta2) * inner;
    const large = len > Math.PI ? 1 : 0;
    spinG.appendChild(el('path', {
      d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${inner.toFixed(2)} ${inner.toFixed(2)} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      fill: 'none', stroke: ink,
      'stroke-width': (stroke * 0.7).toFixed(2),
      'stroke-linecap': 'round', opacity: '0.7',
    }));
  }

  // 3g · Drip tails from bulges
  const dripN = Math.min(3, Math.max(tones, 1));
  for (let i = 0; i < dripN; i++) {
    const theta = bulgeAngles[i % bulgeN] + (rand() - 0.5) * 0.25;
    const start = R + 2;
    const endR = start + 8 + rand() * 14;
    const pts = [];
    let r = start;
    while (r < endR) {
      const jitter = (rand() - 0.5) * 2;
      pts.push([Math.cos(theta) * r + jitter, Math.sin(theta) * r + jitter]);
      r += 1.8;
    }
    if (pts.length > 1) {
      const d = 'M ' + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ');
      spinG.appendChild(el('path', {
        d, fill: 'none', stroke: ink,
        'stroke-width': (stroke * 0.32).toFixed(2),
        'stroke-linecap': 'round', opacity: '0.45',
      }));
    }
  }

  // ═══ Fixed inner layers (back on top of spin group) ═══

  // 4 · Neutron core (tense-indexed; evolved from logogram centre circle with avatar-style glow)
  const tenseIdx = ['none', 'past-nonpast', 'past-present-future', 'compound'].indexOf(tense);
  const coreR = 3 + Math.max(tenseIdx, 0) * 1.2;
  svg.appendChild(el('circle', {
    cx: 0, cy: 0, r: (coreR * 1.8).toFixed(2),
    fill: pal.core, 'fill-opacity': '0.35',
    filter: `url(#${glowId})`,
  }));
  svg.appendChild(el('circle', {
    cx: 0, cy: 0, r: coreR.toFixed(2),
    fill: pal.core, 'fill-opacity': '0.95',
  }));
  if (tenseIdx >= 1) {
    svg.appendChild(el('circle', {
      cx: 0, cy: 0, r: (coreR + 3).toFixed(2),
      fill: 'none', stroke: ink,
      'stroke-width': (stroke * 0.3).toFixed(2),
      opacity: '0.5', 'stroke-dasharray': '1 2',
    }));
  }

  // 5 · Frame hairline
  svg.appendChild(el('circle', {
    cx: 0, cy: 0, r: 115,
    fill: 'none', stroke: '#22304a', 'stroke-width': '0.5', opacity: '0.5',
  }));

  // Animation: the spin group rotates with the pulsar's period
  if (animated) {
    const rotDur = clamp(period * 10, 4, 60);
    spinG.appendChild(el('animateTransform', {
      attributeName: 'transform', attributeType: 'XML',
      type: 'rotate', from: '0 0 0', to: '360 0 0',
      dur: `${rotDur.toFixed(2)}s`, repeatCount: 'indefinite',
    }));
    // Core gentle pulse
    const corePulse = el('animate', {
      attributeName: 'fill-opacity', values: '0.95; 0.7; 0.95',
      dur: '4s', repeatCount: 'indefinite',
    });
    svg.querySelector('circle[fill-opacity="0.95"]')?.appendChild(corePulse);
  }

  return svg;
}

/* ══════════════════ PNG export ══════════════════ */

export async function portraitToPNGBlob(svg, scale = 3) {
  const w = (parseFloat(svg.getAttribute('width')) || 240) * scale;
  const h = (parseFloat(svg.getAttribute('height')) || 240) * scale;
  const clone = svg.cloneNode(true);
  clone.querySelectorAll('animateTransform, animate').forEach(a => a.remove());
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve; img.onerror = reject; img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPortraitPNG(jname, svg, scale = 3) {
  const blob = await portraitToPNGBlob(svg, scale);
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${jname}-portrait.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
