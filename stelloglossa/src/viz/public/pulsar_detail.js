/* 脈衝星語言詳細頁 (§1–§9) — 仿 about_view.js 風格,但全部是特定星的資料。
   入口:側邊欄按鈕 + 第 5 個 top tab 下拉選星。
   一顆星渲染一次結果,切換只更新內容。
*/

import { drawLogogram } from './logogram.js';
import { drawPortrait, downloadPortraitPNG } from './portrait.js';
import { loadNotes, saveNote } from './features.js';

const CONSTELLATIONS_TC = {
  Andromeda: '仙女', Antlia: '唧筒', Apus: '天燕', Aquarius: '寶瓶', Aquila: '天鷹',
  Ara: '天壇', Aries: '白羊', Auriga: '御夫', 'Boötes': '牧夫', Caelum: '雕具',
  Camelopardalis: '鹿豹', Cancer: '巨蟹', 'Canes Venatici': '獵犬', 'Canis Major': '大犬',
  'Canis Minor': '小犬', Capricornus: '摩羯', Carina: '船底', Cassiopeia: '仙后',
  Centaurus: '半人馬', Cepheus: '仙王', Cetus: '鯨魚', Chamaeleon: '蝘蜓', Circinus: '圓規',
  Columba: '天鴿', 'Coma Berenices': '后髮', 'Corona Australis': '南冕', 'Corona Borealis': '北冕',
  Corvus: '烏鴉', Crater: '巨爵', Crux: '南十字', Cygnus: '天鵝', Delphinus: '海豚',
  Dorado: '劍魚', Draco: '天龍', Equuleus: '小馬', Eridanus: '波江', Fornax: '天爐',
  Gemini: '雙子', Grus: '天鶴', Hercules: '武仙', Horologium: '時鐘', Hydra: '長蛇',
  Hydrus: '水蛇', Indus: '印第安', Lacerta: '蝎虎', Leo: '獅子', 'Leo Minor': '小獅',
  Lepus: '天兔', Libra: '天秤', Lupus: '豺狼', Lynx: '天貓', Lyra: '天琴',
  Mensa: '山案', Microscopium: '顯微鏡', Monoceros: '麒麟', Musca: '蒼蠅', Norma: '矩尺',
  Octans: '南極', Ophiuchus: '蛇夫', Ophiucus: '蛇夫', Orion: '獵戶', Pavo: '孔雀',
  Pegasus: '飛馬', Perseus: '英仙', Phoenix: '鳳凰', Pictor: '繪架', Pisces: '雙魚',
  'Piscis Austrinus': '南魚', Puppis: '船尾', Pyxis: '羅盤', Reticulum: '網罟',
  Sagitta: '天箭', Sagittarius: '人馬', Scorpius: '天蠍', Sculptor: '玉夫', Scutum: '盾牌',
  Serpens: '巨蛇', Sextans: '六分儀', Taurus: '金牛', Telescopium: '望遠鏡',
  'Triangulum Australe': '南三角', Triangulum: '三角', Tucana: '杜鵑', 'Ursa Major': '大熊',
  'Ursa Minor': '小熊', Vela: '船帆', Virgo: '室女', Volans: '飛魚', Vulpecula: '狐狸',
};

const FIELD_TC = {
  celestial: '天體', time: '時間', death: '死亡', light: '光', return: '回歸',
  distance: '距離', density: '密度', direction: '方向', contact: '接觸', myth: '神話',
};

const TONE_COLORS = ['#8ad9ff', '#c6b0ff', '#ff9ac8', '#ff6b9d', '#ff4e7c', '#ff2a5f', '#ff0040'];

let currentJname = null;
let speakFn = null;

export function initDetail(bundle, onSpeak, onJump) {
  speakFn = onSpeak;
  // Populate the dropdown in the tab bar (only once — guard by empty options)
  const sel = document.getElementById('detail-select');
  if (sel && sel.options.length === 0) {
    sel.innerHTML = '<option value="">— 選擇脈衝星 —</option>';
    const entries = bundle.pulsars.slice().sort((a, b) => a.jname.localeCompare(b.jname));
    for (const p of entries) {
      const opt = document.createElement('option');
      opt.value = p.jname;
      const cn = CONSTELLATIONS_TC[p.constellation] || p.constellation || '';
      opt.textContent = `${p.jname} · ${cn}`;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      if (sel.value) openDetail(bundle, sel.value, onJump);
    });
  }
}

export function openDetail(bundle, jname, onJump) {
  currentJname = jname;
  const container = document.getElementById('detail-view');
  container.innerHTML = '';
  container.appendChild(buildPage(bundle, jname, onJump));
  container.scrollTop = 0;
  // Sync dropdown + tabs
  const sel = document.getElementById('detail-select');
  if (sel) sel.value = jname;
  // Make the detail view visible (callers also handle tab styling)
  container.classList.add('visible');
}

export function getCurrentJname() { return currentJname; }

export function neighborStep(bundle, delta, onJump) {
  if (!currentJname) return;
  const list = bundle.pulsars.slice().sort((a, b) => a.jname.localeCompare(b.jname));
  const i = list.findIndex(p => p.jname === currentJname);
  if (i < 0) return;
  const next = list[(i + delta + list.length) % list.length].jname;
  openDetail(bundle, next, onJump);
}

/* ========== page builder ========== */

function buildPage(bundle, jname, onJump) {
  const pulsar = bundle.pulsars.find(p => p.jname === jname);
  const profile = bundle.profiles[jname];
  const lexicon = bundle.lexicons[jname];
  const poem = bundle.poems?.[jname];
  const letter = bundle.letters?.[jname];
  const drift = bundle.drift;

  const article = element('article', { className: 'detail' });
  article.appendChild(sectionIdentity(bundle, pulsar, profile, letter));
  article.appendChild(sectionParams(bundle, pulsar));
  article.appendChild(sectionDerivation(pulsar, profile, letter));
  article.appendChild(sectionLogogram(jname, profile));
  article.appendChild(sectionLanguage(lexicon, profile));
  article.appendChild(sectionKinship(bundle, jname));
  article.appendChild(sectionNeighbours(bundle, jname, profile, onJump));
  article.appendChild(sectionHypotheses(bundle, pulsar, profile, lexicon));
  article.appendChild(sectionPoemLetter(poem, letter));
  article.appendChild(sectionNotes(jname));
  article.appendChild(sectionFooter(bundle, onJump));
  return article;
}

/* ---------- §9 Your notes ---------- */

function sectionNotes(jname) {
  const sec = element('section', { className: 'detail-section' });
  sec.id = 'notes-section';
  const existing = loadNotes()[jname] || '';
  sec.innerHTML = `
    <h2>§9 · 你給這顆星的留言</h2>
    <p class="lede">寫下你對這顆星、它的語言、或它說過的話的印象。只保存在這台電腦,不上傳。</p>
    <textarea class="note-area" rows="6" placeholder="在這裡寫下你的想法…">${escapeHtml(existing)}</textarea>
    <div class="note-controls">
      <span class="note-status"></span>
      <button class="note-save det-btn primary">💾 儲存</button>
    </div>
  `;
  const ta = sec.querySelector('.note-area');
  const btn = sec.querySelector('.note-save');
  const status = sec.querySelector('.note-status');
  btn.addEventListener('click', () => {
    saveNote(jname, ta.value);
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    status.textContent = `已儲存於 ${hh}:${mm}`;
    status.style.color = '#7aff8a';
    setTimeout(() => { status.textContent = ''; }, 2500);
  });
  // Also save silently on blur so the user doesn't lose work
  ta.addEventListener('blur', () => saveNote(jname, ta.value));
  return sec;
}

/* ---------- §1 Identity ---------- */

function sectionIdentity(bundle, pulsar, profile, letter) {
  const sec = element('section', { className: 'detail-hero' });
  const cn = CONSTELLATIONS_TC[pulsar.constellation] || pulsar.constellation || '';
  const sub = letter?.subtitle
    ? `<em>${escapeHtml(letter.subtitle)}</em>`
    : '<em>這顆星的聲音 —— 還沒有人翻譯過。</em>';
  const fileNo = String(bundle.pulsars.findIndex(p => p.jname === pulsar.jname) + 1).padStart(2, '0');
  sec.innerHTML = `
    <div class="hero-grid">
      <div class="hero-avatar">
        <div class="avatar-slot"></div>
        <button class="avatar-save det-btn" title="下載 PNG">💾 PNG</button>
      </div>
      <div class="hero-text">
        <p class="kicker">脈衝星語言檔案 · FILE ${fileNo}</p>
        <h1>${escapeHtml(pulsar.jname)}<br/><span class="constellation">${escapeHtml(cn)} · ${escapeHtml(pulsar.constellation || '')}</span></h1>
        <p class="poetic">${sub}</p>
        <div class="identity-grid">
          <div><span>赤道座標</span><b>${escapeHtml(pulsar.ra)} / ${escapeHtml(pulsar.dec)}</b></div>
          <div><span>距離</span><b>${pulsar.distance_kpc.toFixed(3)} kpc</b></div>
          <div><span>銀河座標</span><b>${pulsar.galactic_xyz_kpc.map(v => v.toFixed(2)).join(', ')}</b></div>
        </div>
      </div>
    </div>
  `;
  const slot = sec.querySelector('.avatar-slot');
  const svg = drawPortrait(pulsar.jname, pulsar, profile, { size: 320, animated: true });
  slot.appendChild(svg);
  const btn = sec.querySelector('.avatar-save');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = '⧗ 輸出中…';
    try { await downloadPortraitPNG(pulsar.jname, svg, 3); }
    finally {
      btn.disabled = false;
      btn.textContent = '💾 PNG';
    }
  });
  return sec;
}

/* ---------- §2 Four numbers ---------- */

function sectionParams(bundle, pulsar) {
  const allP = bundle.pulsars.map(p => p.period_s);
  const allDM = bundle.pulsars.map(p => p.dm);
  const allPdot = bundle.pulsars.map(p => p.period_dot);
  const allW = bundle.pulsars.map(p => p.w50_ms);

  const sec = element('section', { className: 'detail-section' });
  sec.innerHTML = `<h2>§1 · 它的四個數字</h2><p>在全 50 顆樣本中,這顆星的物理參數落在何處?</p>`;
  const grid = element('div', { className: 'param-cards' });
  grid.appendChild(paramCard('P · 自轉週期', `${pulsar.period_s.toFixed(5)} s`, pulsar.period_s, allP, '越小越年輕'));
  grid.appendChild(paramCard('DM · 色散量', `${pulsar.dm.toFixed(2)}`, pulsar.dm, allDM, '越大訊號穿越越厚的介質'));
  grid.appendChild(paramCard('Ṗ · 減慢率', `${pulsar.period_dot.toExponential(2)}`, pulsar.period_dot, allPdot, '越大越快老去'));
  grid.appendChild(paramCard('W₅₀ · 脈衝寬度', `${pulsar.w50_ms.toFixed(2)} ms`, pulsar.w50_ms, allW, '越寬振盪越豐富'));
  sec.appendChild(grid);
  return sec;
}

function paramCard(title, valueText, value, all, hint) {
  const sorted = [...all].sort((a, b) => a - b);
  const rank = sorted.indexOf(value);
  const pct = Math.round(((rank + 1) / sorted.length) * 100);
  const min = sorted[0], max = sorted[sorted.length - 1];
  const ratio = (Math.log10(value + 1e-30) - Math.log10(min + 1e-30)) /
                (Math.log10(max + 1e-30) - Math.log10(min + 1e-30) || 1);
  const leftPct = Math.max(0, Math.min(100, ratio * 100));
  const el = element('div', { className: 'param-card' });
  el.innerHTML = `
    <div class="pc-title">${escapeHtml(title)}</div>
    <div class="pc-value">${escapeHtml(valueText)}</div>
    <div class="pc-percentile">位於全樣本 <b>${pct}</b> 百分位 · ${escapeHtml(hint)}</div>
    <div class="pc-bar"><div class="pc-mark" style="left:${leftPct.toFixed(1)}%"></div></div>
    <div class="pc-range"><span>${formatSmall(min)}</span><span>${formatSmall(max)}</span></div>
  `;
  return el;
}

function formatSmall(v) {
  if (v === 0) return '0';
  if (Math.abs(v) < 1e-4 || Math.abs(v) >= 1e5) return v.toExponential(1);
  if (Math.abs(v) < 1) return v.toFixed(3);
  return v.toFixed(2);
}

/* ---------- §3 Derivation ---------- */

function sectionDerivation(pulsar, profile, letter) {
  if (!profile) return element('section');
  const d = letter?.derivations || {};
  const row = (phys, ling, why) => `
    <div class="dv-row">
      <div class="dv-phys">${escapeHtml(phys)}</div>
      <div class="dv-ling">${ling}</div>
      <div class="dv-why">${escapeHtml(why)}</div>
    </div>`;
  const sec = element('section', { className: 'detail-section' });
  sec.innerHTML = `
    <h2>§2 · 為什麼它說這種話</h2>
    <p class="lede">這四個物理量並非純粹的隨機數,在這裡成為它語言的四條骨架。</p>
    <div class="deriv">
      ${row(`P = ${pulsar.period_s.toFixed(4)} s`,
            `音節結構 = <b>${escapeHtml(profile.syllable_structure)}</b>`,
            d.period || '沒有個別推導。')}
      ${row(`DM = ${pulsar.dm.toFixed(1)}`,
            `聲調數 = <b>${profile.tone_count}</b>`,
            d.dm || '沒有個別推導。')}
      ${row(`Ṗ = ${pulsar.period_dot.toExponential(1)}`,
            `時態 = <b>${escapeHtml(profile.tense_richness)}</b>`,
            d.pdot || '沒有個別推導。')}
      ${row(`W₅₀ = ${pulsar.w50_ms.toFixed(2)} ms`,
            `母音 = <b>${profile.vowel_inventory.length} 個</b>`,
            d.w50 || '沒有個別推導。')}
      ${row(`${profile.syllable_structure} × ${profile.tone_count} 聲調`,
            `子音 = <b>${(profile.consonant_inventory || []).length} 個</b>`,
            consonantExplanation(profile))}
    </div>
  `;
  return sec;
}

function consonantExplanation(profile) {
  const n = (profile.consonant_inventory || []).length;
  const tones = profile.tone_count;
  const flavour = tones === 0
    ? '擦音豐富(無聲調的語言必須靠音段本身辨義)'
    : tones >= 6
    ? '以塞音為主,加上彈舌音(聲調已承擔多數辨義負擔,音段可以單純)'
    : tones >= 4
    ? '塞音為主(高聲調語言的典型樣貌)'
    : '介於塞音與擦音之間';
  return `音節結構越複雜,C 位置越多,必須備足對比才能避免詞與詞撞音。這顆星的 ${profile.syllable_structure} 骨架要求 ${n} 個子音。風格是「${flavour}」。`;
}

/* ---------- §4 Logogram dissection ---------- */

function sectionLogogram(jname, profile) {
  const sec = element('section', { className: 'detail-section' });
  sec.innerHTML = `<h2>§3 · 圓環符號解剖</h2>
    <p>這顆星被賦予一個獨一無二的符號,它的每一部分都來自該語言的某個參數。</p>`;
  const row = element('div', { className: 'logo-row' });
  const logoBox = element('div', { className: 'logo-big' });
  if (profile) logoBox.appendChild(drawLogogram(jname, profile, 320));
  row.appendChild(logoBox);
  const legend = element('div', { className: 'logo-legend' });
  legend.innerHTML = `
    <div><span class="swatch out"></span>外圈突起 · 聲調數(${profile?.tone_count ?? '?'} + 1)</div>
    <div><span class="swatch arc"></span>內部弧線 · 母音(${profile?.vowel_inventory?.length ?? '?'})</div>
    <div><span class="swatch splash"></span>噴濺 · 音節複雜度(${profile?.syllable_structure ?? '?'})</div>
    <div><span class="swatch core"></span>中心虛線 · 時態(${profile?.tense_richness ?? '?'})</div>
    <div><span class="swatch drip"></span>墨跡拖影 · 聲調延伸</div>
  `;
  row.appendChild(legend);
  sec.appendChild(row);
  return sec;
}

/* ---------- §5 Full lexicon ---------- */

function sectionLanguage(lexicon, profile) {
  const sec = element('section', { className: 'detail-section' });
  if (!lexicon?.lexicon) {
    sec.innerHTML = `<h2>§4 · 語言全貌</h2><p>此顆星目前沒有詞彙資料。</p>`;
    return sec;
  }
  const entries = Object.values(lexicon.lexicon).flat();
  const avgLen = entries.length
    ? (entries.reduce((s, e) => s + (e.form?.length || 0), 0) / entries.length).toFixed(2)
    : '0';
  const cons = profile?.consonant_inventory || [];
  const vows = profile?.vowel_inventory || [];
  const invHTML = (cons.length || vows.length) ? `
    <div class="phone-inv">
      <div class="phone-block">
        <div class="phone-label">子音 (${cons.length})</div>
        <div class="phone-row">${cons.map(c => `<span>${escapeHtml(c)}</span>`).join('')}</div>
      </div>
      <div class="phone-block">
        <div class="phone-label">母音 (${vows.length})</div>
        <div class="phone-row">${vows.map(v => `<span>${escapeHtml(v)}</span>`).join('')}</div>
      </div>
    </div>` : '';
  const fieldKeys = Object.keys(lexicon.lexicon).filter(f => (lexicon.lexicon[f] || []).length);
  sec.innerHTML = `
    <h2>§4 · 語言全貌</h2>
    <p class="lede">${entries.length} 個詞,分散在 ${fieldKeys.length} 個語義場中。點按鈕檢視該場詞表。</p>
    ${invHTML}
    <div class="lex-stats">
      <div><span>詞彙總數</span><b>${entries.length}</b></div>
      <div><span>平均詞長</span><b>${avgLen}</b></div>
      <div><span>語義場數</span><b>${fieldKeys.length}</b></div>
    </div>
    <div class="lex-field-buttons">
      ${fieldKeys.map(f => `<button class="lex-field-btn" data-field="${escapeHtml(f)}">
        ${escapeHtml(FIELD_TC[f] || f)}
        <span class="lex-field-count">${lexicon.lexicon[f].length}</span>
      </button>`).join('')}
    </div>
    <div class="lex-field-panels"></div>
  `;

  const panelsWrap = sec.querySelector('.lex-field-panels');
  for (const field of fieldKeys) {
    const items = lexicon.lexicon[field];
    const block = element('div', { className: 'lex-field' });
    block.setAttribute('data-field-panel', field);
    block.style.display = 'none';  // closed by default
    block.innerHTML = `<h3>${escapeHtml(FIELD_TC[field] || field)} <span class="field-en">${escapeHtml(field)}</span></h3>`;
    const ul = element('ul', { className: 'lex-list' });
    items.forEach((entry, idx) => {
      const li = element('li');
      const extra = entry.explanation || entry.etymology || '';
      li.innerHTML = `
        <span class="w-form">${escapeHtml(entry.form || '')}</span>
        <span class="w-gloss">${escapeHtml(entry.gloss || '')}</span>
        ${extra ? `<span class="w-ety">${escapeHtml(extra)}</span>` : ''}
        <button class="w-play" title="播音">▶</button>
      `;
      li.querySelector('.w-play').addEventListener('click',
        () => speakFn && speakFn(entry.form, currentJname, field, idx));
      ul.appendChild(li);
    });
    block.appendChild(ul);
    panelsWrap.appendChild(block);
  }

  // Exclusive toggle: clicking a button opens *that* panel and closes others.
  // Clicking the already-open button closes it.
  const allBtns = sec.querySelectorAll('.lex-field-btn');
  const allPanels = panelsWrap.querySelectorAll('[data-field-panel]');
  allBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      const targetPanel = panelsWrap.querySelector(`[data-field-panel="${field}"]`);
      const wasOpen = btn.classList.contains('active');
      allBtns.forEach(b => b.classList.remove('active'));
      allPanels.forEach(p => { p.style.display = 'none'; });
      if (!wasOpen && targetPanel) {
        btn.classList.add('active');
        targetPanel.style.display = 'block';
      }
    });
  });
  return sec;
}

/* ---------- §6 Kinship (mini tree) ---------- */

function sectionKinship(bundle, jname) {
  const sec = element('section', { className: 'detail-section' });
  sec.innerHTML = `<h2>§5 · 它的親緣</h2>`;
  if (!bundle.tree) {
    sec.innerHTML += '<p>無家譜樹資料。</p>';
    return sec;
  }
  const path = findPathToLeaf(bundle.tree, jname);
  if (!path) {
    sec.innerHTML += '<p>此星不在家譜樹中。</p>';
    return sec;
  }
  // Get the subtree 3 levels above the leaf (or root if shallower)
  const anchorIdx = Math.max(0, path.length - 4);
  const subroot = path[anchorIdx];
  const sisters = leavesOf(subroot).filter(n => n !== jname).slice(0, 4);
  const txt = element('div');
  txt.innerHTML = `
    <p>在 50 門語言的家譜樹中,這顆星最親近的幾位姊妹:</p>
    <ul class="sisters">
      ${sisters.map(s => {
        const prof = bundle.profiles[s];
        const detail = prof ? `${prof.syllable_structure} · ${prof.tone_count} 聲調` : '';
        return `<li><b>${escapeHtml(s)}</b>  <span>${escapeHtml(detail)}</span></li>`;
      }).join('')}
    </ul>
    <p class="aside">她們與這顆星在 5 維音系空間裡距離最近。共同的分歧點代表類型學上的最近共祖。</p>
  `;
  sec.appendChild(txt);
  return sec;
}

function findPathToLeaf(node, target, path = []) {
  const next = [...path, node];
  if (node.leaf && node.name === target) return next;
  if (!node.children) return null;
  for (const c of node.children) {
    const r = findPathToLeaf(c, target, next);
    if (r) return r;
  }
  return null;
}

function leavesOf(node) {
  if (node.leaf) return [node.name];
  return (node.children || []).flatMap(leavesOf);
}

/* ---------- §7 Neighbours ---------- */

function sectionNeighbours(bundle, jname, profile, onJump) {
  const sec = element('section', { className: 'detail-section' });
  sec.innerHTML = `<h2>§6 · 它的鄰居</h2>`;
  const links = (bundle.graph.links || []).filter(l => l.source === jname || l.target === jname);
  const degree = links.length;
  const allDegrees = new Map();
  for (const link of bundle.graph.links || []) {
    allDegrees.set(link.source, (allDegrees.get(link.source) || 0) + 1);
    allDegrees.set(link.target, (allDegrees.get(link.target) || 0) + 1);
  }
  const sortedDeg = [...allDegrees.values()].sort((a, b) => b - a);
  const rank = sortedDeg.indexOf(degree) + 1;
  sec.innerHTML += `
    <p>接觸網絡中,它連接了 <b>${degree}</b> 顆脈衝星,在全網絡排行 <b>第 ${rank}</b>
    ${degree === 0 ? ' —— 它是座孤島' : degree > sortedDeg[Math.floor(sortedDeg.length / 4)] ? ' —— 是樞紐語言' : ''}。</p>
  `;

  if (degree > 0) {
    const sorted = links.map(l => ({
      other: l.source === jname ? l.target : l.source,
      d: l.distance_kpc,
      regime: l.regime,
    })).sort((a, b) => a.d - b.d).slice(0, 12);
    const table = element('table', { className: 'neigh-table' });
    table.innerHTML = `<thead><tr><th>鄰星</th><th>距離 (kpc)</th><th>接觸機制</th><th>音節結構</th></tr></thead>`;
    const tbody = element('tbody');
    for (const n of sorted) {
      const prof = bundle.profiles[n.other];
      const tr = element('tr');
      tr.innerHTML = `
        <td class="j">${escapeHtml(n.other)}</td>
        <td>${n.d.toFixed(2)}</td>
        <td>${escapeHtml(regimeTC(n.regime))}</td>
        <td>${escapeHtml(prof?.syllable_structure || '—')}</td>
      `;
      tr.addEventListener('click', () => onJump && onJump(n.other));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    sec.appendChild(table);
  }

  return sec;
}

function regimeTC(r) {
  return ({ borrowing: '借用', extension: '語義擴展', narrowing: '縮減', isolation: '孤立' })[r] || r || '—';
}

/* ---------- §8 Hypotheses ---------- */

function sectionHypotheses(bundle, pulsar, profile, lexicon) {
  const sec = element('section', { className: 'detail-section' });
  sec.innerHTML = `<h2>§7 · 在三個假說裡的位置</h2>`;
  if (!profile) return sec;

  // H1: DM vs tone_count trend
  const allDM = bundle.pulsars.map(p => p.dm).sort((a, b) => a - b);
  const dmMedian = allDM[Math.floor(allDM.length / 2)];
  const h1 = pulsar.dm > dmMedian
    ? `DM = ${pulsar.dm.toFixed(1)} 在中位數以上,它${profile.tone_count >= 2 ? '符合' : '違反'}「高 DM → 多聲調」趨勢。`
    : `DM = ${pulsar.dm.toFixed(1)} 在中位數以下,它${profile.tone_count < 2 ? '符合' : '違反'}「低 DM → 少聲調」趨勢。`;

  // H2: vowel preference in light vs death
  const HI_FRONT = new Set(['i', 'y', 'ɪ', 'e', 'ɛ']);
  const LOW_BACK = new Set(['a', 'ɑ', 'u', 'o', 'ɔ', 'ã']);
  let lightFront = 0, lightTotal = 0, deathBack = 0, deathTotal = 0;
  for (const f of ['light', 'return']) {
    for (const e of (lexicon?.lexicon?.[f] || [])) {
      for (const ch of (e.form || '')) {
        if (HI_FRONT.has(ch)) { lightFront++; lightTotal++; }
        else if (LOW_BACK.has(ch)) lightTotal++;
      }
    }
  }
  for (const f of ['death', 'density']) {
    for (const e of (lexicon?.lexicon?.[f] || [])) {
      for (const ch of (e.form || '')) {
        if (LOW_BACK.has(ch)) { deathBack++; deathTotal++; }
        else if (HI_FRONT.has(ch)) deathTotal++;
      }
    }
  }
  const lightPct = lightTotal ? (lightFront / lightTotal * 100).toFixed(0) : '—';
  const deathPct = deathTotal ? (deathBack / deathTotal * 100).toFixed(0) : '—';
  const h2 = `它的「光/回歸」詞中前高母音占 ${lightPct}%;「死亡/密度」詞中後低母音占 ${deathPct}%。`;

  // H3: complexity rank
  const profiles = Object.values(bundle.profiles);
  const scores = profiles.map(p => p.complexity_score).sort((a, b) => b - a);
  const rank = scores.indexOf(profile.complexity_score) + 1;
  const h3 = rank <= profiles.length / 3
    ? `音系複雜度排名 ${rank}/${profiles.length} — 它很可能扮演「被借方」,鄰居向它取字。`
    : rank >= profiles.length * 2 / 3
    ? `音系複雜度排名 ${rank}/${profiles.length} — 它很可能是「借入方」,向更複雜的鄰居取字。`
    : `音系複雜度排名 ${rank}/${profiles.length} — 它位於借用網絡的中游。`;

  sec.innerHTML += `
    <div class="hypo-block"><div class="hh">H1 · 銀河核心複雜度</div><p>${escapeHtml(h1)}</p></div>
    <div class="hypo-block"><div class="hh">H2 · 聲象徵</div><p>${escapeHtml(h2)}</p></div>
    <div class="hypo-block"><div class="hh">H3 · 借用不對稱</div><p>${escapeHtml(h3)}</p></div>
  `;
  return sec;
}

/* ---------- §9 Poem + Letter ---------- */

function sectionPoemLetter(poem, letter) {
  const sec = element('section', { className: 'detail-section detail-lit' });
  sec.innerHTML = `<h2>§8 · 它的詩 · 它的信</h2>`;
  if (poem?.lines?.length) {
    const p = element('div', { className: 'big-poem' });
    const themeLine = poem.theme ? `<div class="bp-theme">主題:${escapeHtml(poem.theme)}</div>` : '';
    p.innerHTML = `<h3>${escapeHtml(poem.title || '—')}</h3>
      ${themeLine}
      <div class="bp-header">
        <span class="bp-h1">原文</span>
        <span class="bp-h2">直翻</span>
        <span class="bp-h3">潤飾</span>
      </div>`;
    const body = element('div', { className: 'big-poem-body' });
    for (let i = 0; i < poem.lines.length; i++) {
      const literal = poem.literal?.[i] ?? poem.translation?.[i] ?? '';
      const polished = poem.polished?.[i] ?? poem.translation?.[i] ?? '';
      body.innerHTML += `
        <div class="bp-line">
          <span class="bp-form">${escapeHtml(poem.lines[i])}</span>
          <span class="bp-lit">${escapeHtml(literal)}</span>
          <span class="bp-pol">${escapeHtml(polished)}</span>
        </div>
      `;
    }
    p.appendChild(body);
    sec.appendChild(p);
  }
  if (letter) {
    const l = element('div', { className: 'big-letter' });
    const body = Array.isArray(letter.body) ? letter.body : [];
    l.innerHTML = `
      <div class="bl-greeting">${escapeHtml(letter.greeting || '')}</div>
      ${body.map(p => `<p>${escapeHtml(p)}</p>`).join('')}
      <div class="bl-signoff">${escapeHtml(letter.signoff || '')}</div>
    `;
    sec.appendChild(l);
  }
  return sec;
}

/* ---------- Footer ---------- */

function sectionFooter(bundle, onJump) {
  const sec = element('footer', { className: 'detail-footer' });
  sec.innerHTML = `
    <button id="detail-prev" class="det-btn">← 上一顆</button>
    <button id="detail-print" class="det-btn primary">🖨 列印 / 存 PDF</button>
    <button id="detail-next" class="det-btn">下一顆 →</button>
  `;
  sec.querySelector('#detail-prev').addEventListener('click', () => neighborStep(bundle, -1, onJump));
  sec.querySelector('#detail-next').addEventListener('click', () => neighborStep(bundle, +1, onJump));
  sec.querySelector('#detail-print').addEventListener('click', () => window.print());
  return sec;
}

/* ---------- helpers ---------- */

function element(tag, opts = {}) {
  const e = document.createElement(tag);
  if (opts.className) e.className = opts.className;
  return e;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
