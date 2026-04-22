import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { renderTree } from './tree_view.js';
import { renderResults } from './results_view.js';
import { playIntro } from './intro.js';
import { drawLogogram } from './logogram.js';
import { drawPortrait } from './portrait.js';
import { renderAbout } from './about_view.js';
import { initDetail, openDetail, getCurrentJname, neighborStep } from './pulsar_detail.js';
import {
  initFeatures, markExplored, playPulseFor, stopAudio,
  setCompareFirst, getCompareFirst, openCompare,
  translateToStarLang, loadNotes, saveNote,
} from './features.js';
import { speakWord } from './speech.js';
import { duckAmbient } from './ambient.js';
import * as hand from './hand_control.js';

// Start the intro immediately, before any async work. This guarantees that
// the keydown/click listeners are always registered even if bundle loading
// or scene setup throws later.
playIntro();

const BUNDLE_URL = './data/bundle.json';

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060a, 0.008);

const camera = new THREE.PerspectiveCamera(
  55, window.innerWidth / window.innerHeight, 0.01, 20000
);
camera.position.set(8, 4, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x05060a);
document.getElementById('app').appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;

const fly = new PointerLockControls(camera, renderer.domElement);
let controls = orbit;   // active controls (for legacy references)
let mode = 'orbit';     // 'orbit' | 'fly'

const flyState = {
  forward: false, back: false, left: false, right: false, up: false, down: false,
  speed: 2.0,   // kpc/s, auto-scaled on fit
  boost: 1,
};
const flyVelocity = new THREE.Vector3();
const flyDirection = new THREE.Vector3();
const clock = new THREE.Clock();

document.addEventListener('keydown', (e) => {
  // Detail view navigation — only when it's visible and no input is focused
  const detailVisible = document.getElementById('detail-view')?.classList.contains('visible');
  if (detailVisible && !e.repeat) {
    if (e.code === 'BracketLeft') { neighborStep(bundle, -1, goToDetail); e.preventDefault(); return; }
    if (e.code === 'BracketRight') { neighborStep(bundle, +1, goToDetail); e.preventDefault(); return; }
    if (e.code === 'Escape') {
      document.querySelector('.view-btn[data-view="map"]').click();
      e.preventDefault(); return;
    }
  }
  if (e.code === 'KeyF' && !e.repeat) toggleMode();
  if (e.code === 'KeyT' && !e.repeat) toggleTimeMode();
  if (e.code === 'KeyG' && !e.repeat) toggleHandMode();
  if (mode !== 'fly') return;
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': flyState.forward = true; break;
    case 'KeyS': case 'ArrowDown': flyState.back = true; break;
    case 'KeyA': case 'ArrowLeft': flyState.left = true; break;
    case 'KeyD': case 'ArrowRight': flyState.right = true; break;
    case 'Space': flyState.up = true; break;
    case 'ShiftLeft': case 'ShiftRight': flyState.boost = 4; break;
  }
});
document.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': flyState.forward = false; break;
    case 'KeyS': case 'ArrowDown': flyState.back = false; break;
    case 'KeyA': case 'ArrowLeft': flyState.left = false; break;
    case 'KeyD': case 'ArrowRight': flyState.right = false; break;
    case 'Space': flyState.up = false; break;
    case 'ControlLeft': case 'ControlRight': flyState.down = false; break;
    case 'ShiftLeft': case 'ShiftRight': flyState.boost = 1; break;
  }
});
document.addEventListener('keydown', (e) => {
  if (mode === 'fly' && (e.code === 'ControlLeft' || e.code === 'ControlRight')) {
    flyState.down = true;
  }
});

function toggleMode() {
  if (mode === 'orbit') enterFly();
  else exitFly();
}

function enterFly() {
  mode = 'fly';
  orbit.enabled = false;
  fly.lock();
  updateHudMode();
}

function exitFly() {
  mode = 'orbit';
  orbit.enabled = true;
  if (fly.isLocked) fly.unlock();
  updateHudMode();
}

fly.addEventListener('unlock', () => {
  if (mode === 'fly') exitFly();
});

function toggleTimeMode() {
  timeMode = !timeMode;
  if (!timeMode) resetHalos();
  updateHudMode();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Distant starfield backdrop
function makeStarfield(count = 3000, radius = 800) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = radius * (0.7 + Math.random() * 0.3);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x6b7f99, size: 0.8, sizeAttenuation: false, transparent: true, opacity: 0.6,
  });
  return new THREE.Points(geom, mat);
}
scene.add(makeStarfield());

const toneColors = [0x8ad9ff, 0xc6b0ff, 0xff9ac8, 0xff6b9d, 0xff4e7c, 0xff2a5f, 0xff0040];
function toneColor(n) {
  const i = Math.min(n, toneColors.length - 1);
  return toneColors[Math.max(i, 0)];
}

const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0.05;
const pointer = new THREE.Vector2();

// Axes helper for orientation (galactic x/y/z in kpc)
const axes = new THREE.AxesHelper(2);
axes.material.transparent = true;
axes.material.opacity = 0.4;
scene.add(axes);

let bundle = null;
let pulsarMeshes = [];
let pulsarHalos = [];   // parallel to pulsarMeshes
let edgeLines = null;
let highlightLines = null;
let selectedJname = null;

// Particle stream state (flows from selected pulsar along contact edges)
let particleStream = null;   // { points, positions, progress[], edges[{a,b,length}] }

// Time dilation mode: every pulsar pulses at its own (log-scaled) period.
// Shortest (ms pulsars) → fast heartbeat, slowest → slow swell.
let timeMode = false;
const pulsarFrequencies = new Map();  // jname → Hz

async function init() {
  try {
    const resp = await fetch(BUNDLE_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    bundle = await resp.json();
  } catch (err) {
    const l = document.getElementById('loading');
    if (l) l.textContent = `資料載入失敗: ${err.message}. 請先跑 python -m src.viz.bundle_data`;
    const intro = document.getElementById('intro');
    if (intro) intro.remove();   // don't leave the black title card on top
    return;
  }
  const l = document.getElementById('loading'); if (l) l.remove();

  renderPulsars();
  renderEdges();
  renderStats();
  animate();
  renderer.domElement.addEventListener('click', onClick);
  renderer.domElement.addEventListener('pointermove', onHover);
  initViewSwitch();
  initCardControls();
  initDetail(bundle, speak, (jname) => goToDetail(jname));
  initHudToggle();

  // Features (search, random, quiz, custom-pulsar, earth-compare, audio, tour, daily-star, etc.)
  initFeatures(bundle, {
    onPickStar: (jname) => {
      // Ensure we're on the 3D map view, then focus + select
      document.querySelector('.view-btn[data-view="map"]').click();
      setTimeout(() => {
        focusCameraOn(jname);
        selectPulsar(jname);
      }, 50);
    },
  });
}

function focusCameraOn(jname) {
  const p = bundle.pulsars.find(x => x.jname === jname);
  if (!p) return;
  const [x, y, z] = p.galactic_xyz_kpc || [0, 0, 0];
  // Smooth fly-in: place camera at a tangent offset and look at the star
  const target = new THREE.Vector3(x, y, z);
  const offset = new THREE.Vector3(1.2, 0.5, 1.2);
  const endPos = target.clone().add(offset);
  const startPos = camera.position.clone();
  const startTarget = orbit.target.clone();
  const dur = 700;
  const t0 = performance.now();
  function step() {
    const t = Math.min(1, (performance.now() - t0) / dur);
    const ease = t * t * (3 - 2 * t);
    camera.position.lerpVectors(startPos, endPos, ease);
    orbit.target.lerpVectors(startTarget, target, ease);
    orbit.update();
    if (t < 1) requestAnimationFrame(step);
  }
  step();
}

function initHudToggle() {
  const hud = document.getElementById('hud');
  const hide = document.getElementById('hud-hide');
  const show = document.getElementById('hud-show');

  function apply(collapsed) {
    hud.classList.toggle('collapsed', collapsed);
    show.classList.toggle('visible', collapsed);
    try { localStorage.setItem('stelloglossa.hud.collapsed', collapsed ? '1' : '0'); } catch {}
  }

  let persisted = false;
  try { persisted = localStorage.getItem('stelloglossa.hud.collapsed') === '1'; } catch {}
  if (persisted) apply(true);

  hide.addEventListener('click', () => apply(true));
  show.addEventListener('click', () => apply(false));

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyH' || e.repeat) return;
    // Ignore when typing into an input / textarea
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    apply(!hud.classList.contains('collapsed'));
  });
}

function resetHalos() {
  for (const halo of pulsarHalos) {
    halo.visible = true;
    halo.scale.setScalar(1);
    halo.material.opacity = 0.22;
  }
}

function initViewSwitch() {
  const buttons = document.querySelectorAll('.view-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      buttons.forEach((b) => b.classList.toggle('active', b === btn));
      switchView(view);
    });
  });
}

function switchView(view) {
  const tree = document.getElementById('tree-view');
  const results = document.getElementById('results-view');
  const about = document.getElementById('about-view');
  const detail = document.getElementById('detail-view');
  const app = document.getElementById('app');
  const selWrap = document.getElementById('detail-select-wrap');

  // Reset
  tree.classList.remove('visible');
  results.classList.remove('visible');
  about.classList.remove('visible');
  detail.classList.remove('visible');
  app.style.display = 'block';
  if (selWrap) selWrap.style.display = (view === 'detail') ? 'block' : 'none';

  const jumpToMap = (jname) => {
    document.querySelector('.view-btn[data-view="map"]').click();
    setTimeout(() => selectPulsar(jname), 50);
  };

  if (view === 'tree') {
    app.style.display = 'none';
    tree.classList.add('visible');
    if (mode === 'fly') exitFly();
    renderTree(bundle, jumpToMap);
  } else if (view === 'results') {
    app.style.display = 'none';
    results.classList.add('visible');
    if (mode === 'fly') exitFly();
    renderResults(bundle, jumpToMap);
  } else if (view === 'about') {
    app.style.display = 'none';
    about.classList.add('visible');
    if (mode === 'fly') exitFly();
    renderAbout();
    about.scrollTop = 0;
  } else if (view === 'detail') {
    app.style.display = 'none';
    detail.classList.add('visible');
    if (mode === 'fly') exitFly();
    // If no star chosen yet, default to the selected pulsar or the first one
    const start = getCurrentJname() || selectedJname || bundle.pulsars[0]?.jname;
    if (start) openDetail(bundle, start, (j) => goToDetail(j));
  }
}

function goToDetail(jname, opts = {}) {
  document.querySelector('.view-btn[data-view="detail"]').click();
  setTimeout(() => {
    openDetail(bundle, jname, goToDetail);
    if (opts.focus === 'notes') {
      setTimeout(() => {
        const el = document.getElementById('notes-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          el.querySelector('textarea')?.focus();
        }
      }, 120);
    }
  }, 30);
}

let hoveredMesh = null;
const tooltip = document.createElement('div');
tooltip.style.cssText = `
  position: fixed; pointer-events: none; z-index: 20;
  background: rgba(5,6,10,0.9); color: #8ad9ff; padding: 3px 8px;
  font-size: 11px; border: 1px solid #22304a; border-radius: 3px;
  font-family: "SFMono-Regular", Consolas, monospace; display: none;
`;
document.body.appendChild(tooltip);

function onHover(event) {
  if (mode === 'fly') return;  // hover handled by crosshair in fly mode
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pulsarMeshes, false);
  if (hoveredMesh && (!hits.length || hits[0].object !== hoveredMesh)) {
    hoveredMesh.scale.setScalar(1);
    hoveredMesh = null;
  }
  if (hits.length) {
    hoveredMesh = hits[0].object;
    hoveredMesh.scale.setScalar(2.5);
    tooltip.textContent = hoveredMesh.userData.jname;
    tooltip.style.left = `${event.clientX + 12}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
    tooltip.style.display = 'block';
    renderer.domElement.style.cursor = 'pointer';
  } else {
    tooltip.style.display = 'none';
    renderer.domElement.style.cursor = 'default';
  }
}

function renderPulsars() {
  const group = new THREE.Group();
  const bbox = new THREE.Box3();
  for (const p of bundle.pulsars) {
    const profile = bundle.profiles[p.jname];
    const score = profile ? profile.complexity_score : 1;
    // Much smaller: base 0.04, max ~0.14 at score=240
    const radius = 0.04 + Math.log2(score + 1) * 0.012;
    const tones = profile ? profile.tone_count : 0;
    const color = toneColor(tones);
    const geom = new THREE.SphereGeometry(radius, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geom, mat);
    const [x, y, z] = p.galactic_xyz_kpc || [0, 0, 0];
    mesh.position.set(x, y, z);
    mesh.userData = { jname: p.jname, pulsar: p, baseRadius: radius, color };
    bbox.expandByPoint(mesh.position);

    const haloGeom = new THREE.SphereGeometry(radius * 1.3, 12, 12);
    const haloMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.22, depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeom, haloMat);
    halo.position.copy(mesh.position);
    halo.userData = { jname: p.jname, baseRadius: radius * 1.3, baseColor: color };
    group.add(halo);
    group.add(mesh);
    pulsarMeshes.push(mesh);
    pulsarHalos.push(halo);

    // Pulse frequency: log-scaled so ms pulsars → 3 Hz, 1s pulsars → 1 Hz, slow → 0.3 Hz.
    const p0 = Math.max(p.period_s || 1, 1e-4);
    const freq = 1 / Math.max(0.3, Math.log10(p0 + 0.01) + 4) * 3;
    pulsarFrequencies.set(p.jname, freq);
  }
  scene.add(group);
  fitCameraTo(bbox);
}

function applyTimeDilation(tSec) {
  // Each pulsar breathes at its own frequency. We tint the mesh emissive
  // via color blending — MeshBasicMaterial doesn't emissive, but we can
  // modulate halo opacity + mesh scale for a clear beat.
  for (let i = 0; i < pulsarMeshes.length; i++) {
    const mesh = pulsarMeshes[i];
    const halo = pulsarHalos[i];
    const freq = pulsarFrequencies.get(mesh.userData.jname) || 1;
    const phase = tSec * freq * 2 * Math.PI;
    // Sharp beat: mostly 0, occasional spike.
    const beat = Math.max(0, Math.sin(phase));
    const sharp = Math.pow(beat, 3);
    mesh.scale.setScalar(1 + sharp * 0.8);
    halo.scale.setScalar(1 + sharp * 2.5);
    halo.material.opacity = 0.18 + sharp * 0.55;
  }
}

function fitCameraTo(bbox) {
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim * 1.6;
  camera.position.set(center.x + distance * 0.7, center.y + distance * 0.4, center.z + distance * 0.7);
  orbit.target.copy(center);
  orbit.update();
  // Scale fly speed to the cluster: cross the whole bbox in ~4 seconds
  flyState.speed = Math.max(maxDim * 0.25, 0.5);
}

function renderEdges() {
  const positions = [];
  const colors = [];
  const jnameIdx = new Map(bundle.pulsars.map((p) => [p.jname, p]));
  for (const link of bundle.graph.links || []) {
    const a = jnameIdx.get(link.source);
    const b = jnameIdx.get(link.target);
    if (!a || !b) continue;
    positions.push(...(a.galactic_xyz_kpc || [0, 0, 0]));
    positions.push(...(b.galactic_xyz_kpc || [0, 0, 0]));
    const w = link.weight ?? 0.3;
    colors.push(0.2, 0.4, 0.6, 0.2, 0.4, 0.6);
    // Note: two vertices per edge; alpha encoded via material opacity globally
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0x2a3a5a, transparent: true, opacity: 0.06,
  });
  edgeLines = new THREE.LineSegments(geom, mat);
  scene.add(edgeLines);
}

function onClick(event) {
  if (mode === 'fly') {
    // In fly mode, centre of screen is the cursor; shoot ray straight ahead.
    pointer.x = 0; pointer.y = 0;
  } else {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pulsarMeshes, false);
  if (hits.length > 0) {
    const jname = hits[0].object.userData.jname;
    selectPulsar(jname);
  }
}

function selectPulsar(jname) {
  selectedJname = jname;
  const pulsar = bundle.pulsars.find((p) => p.jname === jname);
  const profile = bundle.profiles[jname];
  const lexicon = bundle.lexicons[jname];
  renderCard(pulsar, profile, lexicon);
  drawHighlightEdges(jname);
  markExplored(jname);
  if (pulsar) playPulseFor(pulsar.period_s);
}

function drawHighlightEdges(jname) {
  if (highlightLines) {
    scene.remove(highlightLines);
    highlightLines.geometry.dispose();
    highlightLines.material.dispose();
    highlightLines = null;
  }
  if (particleStream) {
    scene.remove(particleStream.points);
    particleStream.points.geometry.dispose();
    particleStream.points.material.dispose();
    particleStream = null;
  }

  const jnameIdx = new Map(bundle.pulsars.map((p) => [p.jname, p]));
  const center = jnameIdx.get(jname);
  if (!center) return;
  const linePos = [];
  const edges = [];
  for (const link of bundle.graph.links || []) {
    if (link.source !== jname && link.target !== jname) continue;
    const other = link.source === jname ? link.target : link.source;
    const o = jnameIdx.get(other);
    if (!o) continue;
    const a = new THREE.Vector3(...(center.galactic_xyz_kpc || [0, 0, 0]));
    const b = new THREE.Vector3(...(o.galactic_xyz_kpc || [0, 0, 0]));
    linePos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    edges.push({ a, b, length: a.distanceTo(b), weight: link.weight ?? 0.3 });
  }
  if (!linePos.length) return;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  highlightLines = new THREE.LineSegments(geom,
    new THREE.LineBasicMaterial({ color: 0x8ad9ff, transparent: true, opacity: 0.5 }));
  scene.add(highlightLines);

  initParticleStream(edges);
}

function initParticleStream(edges) {
  // 3 particles per edge, staggered progress. They travel centre → neighbour,
  // reset on arrival. Closer neighbours get brighter particles (weight).
  const PER_EDGE = 3;
  const n = edges.length * PER_EDGE;
  const positions = new Float32Array(n * 3);
  const alphas = new Float32Array(n);
  const progress = new Float32Array(n);
  const edgeAssign = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    edgeAssign[i] = Math.floor(i / PER_EDGE);
    progress[i] = (i % PER_EDGE) / PER_EDGE;
    alphas[i] = edges[edgeAssign[i]].weight;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x8ad9ff, size: 0.06, transparent: true, opacity: 0.9,
    sizeAttenuation: true, depthWrite: false,
  });
  const points = new THREE.Points(geom, mat);
  scene.add(points);
  particleStream = { points, positions, progress, edgeAssign, edges, alphas };
}

function updateParticleStream(dt) {
  if (!particleStream) return;
  const { positions, progress, edgeAssign, edges, points } = particleStream;
  for (let i = 0; i < progress.length; i++) {
    // Closer edges → faster arrival (fixed time cost ≈ 3s for any length)
    const edge = edges[edgeAssign[i]];
    const speed = 0.35;  // fraction per second
    progress[i] += dt * speed;
    if (progress[i] > 1) progress[i] -= 1;
    const t = progress[i];
    const x = edge.a.x + (edge.b.x - edge.a.x) * t;
    const y = edge.a.y + (edge.b.y - edge.a.y) * t;
    const z = edge.a.z + (edge.b.z - edge.a.z) * t;
    positions[i * 3]     = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  points.geometry.attributes.position.needsUpdate = true;
}

function renderCard(pulsar, profile, lexicon) {
  const card = document.getElementById('card');
  const body = document.getElementById('card-body');
  card.classList.add('visible');
  if (!pulsar) { body.innerHTML = 'no data'; return; }

  const distance = pulsar.distance_kpc?.toFixed(3) ?? '—';
  let html = `
    <div class="heptapod-frame"><div id="portrait-slot"></div></div>
    <h2>${pulsar.jname}</h2>
    <div class="meta">${pulsar.constellation} · ${distance} kpc</div>
  `;

  if (profile) {
    html += `
      <h3>音系側寫</h3>
      <div class="row"><span>音節結構</span><span>${profile.syllable_structure}</span></div>
      <div class="row"><span>聲調</span><span>${profile.tone_count}</span></div>
      <div class="row"><span>時態</span><span>${profile.tense_richness}</span></div>
      <div class="row"><span>母音</span><span>${profile.vowel_inventory.join(' ')}</span></div>
      <div class="row"><span>子音</span><span>${(profile.consonant_inventory || []).length} 個</span></div>
      <div class="row"><span>複雜度</span><span>${profile.complexity_score}</span></div>
    `;
  }

  html += `<div style="margin-top:20px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center">
    <button id="open-detail" class="act-btn">▶ 完整檔案</button>
    <button id="open-compare" class="act-btn">⇔ 比較</button>
    <button id="open-notes" class="act-btn">✎ 留言</button>
  </div>`;

  body.innerHTML = html;
  const slot = body.querySelector('#portrait-slot');
  if (slot && profile) slot.appendChild(
    drawPortrait(pulsar.jname, pulsar, profile, { size: 180, animated: false })
  );

  const detailBtn = body.querySelector('#open-detail');
  if (detailBtn) detailBtn.addEventListener('click', () => goToDetail(pulsar.jname));

  const cmpBtn = body.querySelector('#open-compare');
  if (cmpBtn) cmpBtn.addEventListener('click', () => {
    const first = getCompareFirst();
    if (!first || first === pulsar.jname) {
      setCompareFirst(pulsar.jname);
      cmpBtn.textContent = '⇔ 再選一顆...';
      cmpBtn.classList.add('active');
    } else {
      openCompare(bundle, first, pulsar.jname);
      setCompareFirst(null);
    }
  });

  const noteBtn = body.querySelector('#open-notes');
  if (noteBtn) noteBtn.addEventListener('click', () => goToDetail(pulsar.jname, { focus: 'notes' }));

  body.scrollTop = 0;
}

function closeCard() {
  const card = document.getElementById('card');
  card.classList.remove('visible');
  selectedJname = null;
  stopAudio();
  // Clear highlight lines + particle stream
  if (highlightLines) {
    scene.remove(highlightLines);
    highlightLines.geometry.dispose();
    highlightLines.material.dispose();
    highlightLines = null;
  }
  if (particleStream) {
    scene.remove(particleStream.points);
    particleStream.points.geometry.dispose();
    particleStream.points.material.dispose();
    particleStream = null;
  }
}

function initCardControls() {
  const card = document.getElementById('card');
  const resizer = document.getElementById('card-resizer');
  const closeBtn = document.getElementById('card-close');

  // Restore persisted width
  const stored = parseInt(localStorage.getItem('stelloglossa.card.width') || '', 10);
  if (stored >= 240 && stored <= window.innerWidth * 0.9) {
    card.style.width = stored + 'px';
  }

  closeBtn.addEventListener('click', closeCard);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && card.classList.contains('visible') && mode !== 'fly') {
      closeCard();
    }
  });

  // Drag-to-resize: pointerdown on left edge, adjust width from window.innerWidth - clientX
  let dragging = false;
  resizer.addEventListener('pointerdown', (e) => {
    dragging = true;
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add('dragging');
    card.classList.add('dragging');
    e.preventDefault();
  });
  resizer.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rightOffset = 16;  // matches CSS right:16px
    const newWidth = window.innerWidth - e.clientX - rightOffset;
    const clamped = Math.max(240, Math.min(window.innerWidth * 0.9, newWidth));
    card.style.width = clamped + 'px';
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    card.classList.remove('dragging');
    try { resizer.releasePointerCapture(e.pointerId); } catch {}
    localStorage.setItem('stelloglossa.card.width', parseInt(card.style.width, 10));
  };
  resizer.addEventListener('pointerup', endDrag);
  resizer.addEventListener('pointercancel', endDrag);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

// Lookup table: "jname|field|idx" → manifest entry. Built once per bundle load.
let audioLookup = null;
function buildAudioLookup() {
  if (audioLookup) return audioLookup;
  audioLookup = new Map();
  for (const e of bundle.audio_manifest || []) {
    if (e.rendered) audioLookup.set(`${e.jname}|${e.field}|${e.idx}`, e.path);
  }
  return audioLookup;
}

// Speech: prefer pre-rendered MBROLA .wav; fall back to Web Audio formant synth.
let currentAudio = null;
function speak(form, jname, field, idx) {
  if (!form) return;
  duckAmbient(700);
  const key = (jname && field != null && idx != null) ? `${jname}|${field}|${idx}` : null;
  const path = key ? buildAudioLookup().get(key) : null;
  console.log('[speak]', { form, jname, field, idx, key, path });
  if (path) {
    try {
      if (currentAudio) { currentAudio.pause(); currentAudio = null; }
      currentAudio = new Audio(`/audio/${path}`);
      currentAudio.play()
        .then(() => console.log('[speak] playing', path))
        .catch(err => { console.warn('[speak] play failed, fallback:', err); _speakFallback(form, jname); });
      return;
    } catch (err) { console.warn('[speak] Audio() ctor failed:', err); }
  }
  console.log('[speak] fallback to formant synth');
  _speakFallback(form, jname);
}

function _speakFallback(form, jname) {
  const pulsar = bundle.pulsars.find(p => p.jname === (jname || selectedJname));
  const pitch = pulsar
    ? Math.round(120 + (pulsar.period_s < 0.01 ? 40 : pulsar.period_s > 1 ? -30 : 0))
    : 130;
  speakWord(form, { pitch });
}

function renderStats() {
  const el = document.getElementById('stats');
  const n = bundle.pulsars.length;
  const edges = (bundle.graph.links || []).length;
  const words = Object.values(bundle.lexicons).reduce(
    (s, lex) => s + Object.values(lex.lexicon || {}).reduce((a, arr) => a + arr.length, 0), 0
  );
  el.innerHTML = `${n} 脈衝星 · ${edges} 接觸邊 · ${words} 詞
    <div id="mode-line" style="margin-top:6px;opacity:0.75"></div>`;
  updateHudMode();
}

function updateHudMode() {
  const line = document.getElementById('mode-line');
  if (!line) return;
  const crosshair = document.getElementById('crosshair');
  const timeBadge = timeMode ? ' · <span style="color:#ffd58a">● 時間膨脹</span>' : '';
  const handBadge = handModeOn ? ' · <span style="color:#7aff8a">🖐 手勢</span>' : '';
  if (mode === 'fly') {
    line.innerHTML = `<span style="color:#ff9ac8">● FLY</span> WASD 移動 · Space 上 · Ctrl 下 · Shift 加速 · Esc/F 退出${timeBadge}${handBadge}`;
    if (crosshair) crosshair.style.display = 'block';
  } else {
    line.innerHTML = `<span style="color:#8ad9ff">● ORBIT</span> 拖曳旋轉 · 滾輪縮放 · <b>F</b> 飛行 · <b>T</b> 時間膨脹 · <b>G</b> 手勢 · <b>H</b> 收合${timeBadge}${handBadge}`;
    if (crosshair) crosshair.style.display = 'none';
  }
}

/* ═══════════════════════════ Gesture control ═══════════════════════════
   Toggle with G key or URL query `?input=hand`. Maps MediaPipe gestures
   (cursor / tap / drag / dolly) into OrbitControls operations + star select.
   Only active when in orbit mode (fly mode keeps mouse/keyboard dominance).
*/

let handModeOn = false;
let gestureCursorEl = null;
let gestureProgressEl = null;
let gestureCoreEl = null;
let gestureStatusEl = null;

// Dwell-selection parameters. 1.0s is the sweet spot per user testing.
const DWELL_MS = 1000;
const DWELL_OFF_TOLERANCE_MS = 180;   // forgive brief cursor jitter off-target
const PROGRESS_R = 20;
const PROGRESS_CIRC = 2 * Math.PI * PROGRESS_R;

let dwellTarget = null;        // jname currently being dwelled on, or null
let dwellStartTs = 0;          // performance.now() when dwell began
let dwellLastOnTs = 0;         // last time cursor was on target (for tolerance)
let dwellFiredFor = null;      // jname we already selected this visit — must
                                // leave the star before re-firing

function ensureGestureCursorUI() {
  if (!gestureCursorEl) {
    gestureCursorEl = document.createElement('div');
    gestureCursorEl.id = 'gesture-cursor';
    Object.assign(gestureCursorEl.style, {
      position: 'fixed', width: '56px', height: '56px',
      pointerEvents: 'none', zIndex: '25',
      transform: 'translate(-50%, -50%)',
      transition: 'transform 0.1s',
      display: 'none',
      filter: 'drop-shadow(0 0 10px rgba(138,217,255,0.45))',
    });
    gestureCursorEl.innerHTML = `
      <svg viewBox="-28 -28 56 56" width="56" height="56" style="overflow:visible">
        <circle class="gc-core" cx="0" cy="0" r="14"
                fill="transparent" stroke="#8ad9ff" stroke-width="2"
                opacity="0.85"/>
        <circle class="gc-progress" cx="0" cy="0" r="${PROGRESS_R}"
                fill="none" stroke="#8ad9ff" stroke-width="3"
                stroke-dasharray="${PROGRESS_CIRC.toFixed(2)}"
                stroke-dashoffset="${PROGRESS_CIRC.toFixed(2)}"
                stroke-linecap="round"
                transform="rotate(-90)"
                opacity="0"/>
      </svg>
    `;
    document.body.appendChild(gestureCursorEl);
    gestureProgressEl = gestureCursorEl.querySelector('.gc-progress');
    gestureCoreEl = gestureCursorEl.querySelector('.gc-core');
  }
  if (!gestureStatusEl) {
    gestureStatusEl = document.createElement('div');
    gestureStatusEl.id = 'gesture-status';
    Object.assign(gestureStatusEl.style, {
      position: 'fixed', bottom: '144px', right: '16px',
      width: '160px', textAlign: 'center',
      color: '#8ad9ff', fontSize: '11px',
      letterSpacing: '0.1em', zIndex: '20',
      padding: '2px 4px',
      background: 'rgba(15,18,30,0.8)',
      border: '1px solid #22304a', borderRadius: '3px',
    });
    document.body.appendChild(gestureStatusEl);
  }
}

function setGestureCursor(nx, ny, pinching = false) {
  if (!gestureCursorEl) return;
  gestureCursorEl.style.display = 'block';
  gestureCursorEl.style.left = (nx * window.innerWidth) + 'px';
  gestureCursorEl.style.top = (ny * window.innerHeight) + 'px';
  gestureCursorEl.style.transform = `translate(-50%, -50%) scale(${pinching ? 0.7 : 1})`;
  if (gestureCoreEl) {
    gestureCoreEl.setAttribute('fill', pinching ? 'rgba(138,217,255,0.5)' : 'transparent');
  }
}

function hideGestureCursor() {
  if (gestureCursorEl) gestureCursorEl.style.display = 'none';
  clearDwell();
}

function setDwellProgress(t) {
  if (!gestureProgressEl) return;
  const offset = PROGRESS_CIRC * (1 - Math.max(0, Math.min(1, t)));
  gestureProgressEl.setAttribute('stroke-dashoffset', offset.toFixed(2));
  gestureProgressEl.setAttribute('opacity', t > 0 ? '0.95' : '0');
}

function flashGestureCursor() {
  if (!gestureCursorEl || !gestureCoreEl) return;
  gestureCoreEl.setAttribute('fill', 'rgba(138,217,255,0.8)');
  setTimeout(() => {
    if (gestureCoreEl) gestureCoreEl.setAttribute('fill', 'transparent');
  }, 220);
}

function clearDwell() {
  dwellTarget = null;
  dwellStartTs = 0;
  dwellLastOnTs = 0;
  setDwellProgress(0);
}

// Call on every `gesture:cursor` event with source='point'. Pinch/fist
// events go through their own paths and should call clearDwell() to avoid
// double-firing.
function updateDwell(nx, ny) {
  const hit = raycastToPulsar(nx, ny);
  const nowJname = hit?.jname || null;
  const now = performance.now();

  // Nothing under cursor
  if (!nowJname) {
    // Forgive brief glitches so MediaPipe jitter doesn't reset progress
    if (dwellTarget && now - dwellLastOnTs < DWELL_OFF_TOLERANCE_MS) return;
    dwellTarget = null;
    dwellStartTs = 0;
    dwellFiredFor = null;   // leaving all stars → re-arm
    setDwellProgress(0);
    return;
  }

  // Cursor on a star we already selected this visit: don't re-arm until user
  // moves to a different star (or off all stars).
  if (nowJname === dwellFiredFor) {
    dwellTarget = null;
    dwellStartTs = 0;
    setDwellProgress(0);
    return;
  }

  // Different star than before → restart dwell timer
  if (nowJname !== dwellTarget) {
    dwellTarget = nowJname;
    dwellStartTs = now;
    dwellLastOnTs = now;
    setDwellProgress(0);
    return;
  }

  // Same target → accumulate
  dwellLastOnTs = now;
  const progress = Math.min(1, (now - dwellStartTs) / DWELL_MS);
  setDwellProgress(progress);

  if (progress >= 1) {
    selectPulsar(nowJname);
    flashGestureCursor();
    dwellFiredFor = nowJname;
    dwellTarget = null;
    dwellStartTs = 0;
  }
}

function raycastToPulsar(nx, ny) {
  // Screen (nx, ny) in 0..1 → NDC -1..1
  const ndc = new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pulsarMeshes, false);
  if (!hits.length) return null;
  const jname = hits[0].object.userData?.jname;
  return jname ? bundle.pulsars.find(p => p.jname === jname) : null;
}

function syncHandButton() {
  const btn = document.getElementById('btn-hand');
  if (!btn) return;
  btn.classList.toggle('active', handModeOn);
  btn.textContent = handModeOn ? '🖐 手勢 ●' : '🖐 手勢';
}

async function toggleHandMode() {
  if (handModeOn) {
    hand.stopHandControl();
    handModeOn = false;
    hideGestureCursor();
    if (gestureStatusEl) gestureStatusEl.textContent = '';
    updateHudMode();
    syncHandButton();
    return;
  }
  ensureGestureCursorUI();
  gestureStatusEl.textContent = '啟動中…';
  const btn = document.getElementById('btn-hand');
  if (btn) { btn.disabled = true; btn.textContent = '🖐 載入中…'; }
  const ok = await hand.startHandControl({
    onStatus: (msg) => { if (gestureStatusEl) gestureStatusEl.textContent = msg; },
  });
  if (btn) btn.disabled = false;
  if (!ok) {
    gestureStatusEl.textContent = '啟動失敗';
    setTimeout(() => { if (gestureStatusEl) gestureStatusEl.textContent = ''; }, 3000);
    syncHandButton();
    return;
  }
  handModeOn = true;
  updateHudMode();
  syncHandButton();
}

// Bind the toolbar button. Single entry point with dataset guard so we can't
// double-bind even if this runs before and after DOMContentLoaded.
function bindHandButton() {
  const btn = document.getElementById('btn-hand');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => toggleHandMode());
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindHandButton, { once: true });
} else {
  bindHandButton();
}

function bindGestureEvents() {
  window.addEventListener('gesture:cursor', (e) => {
    if (!handModeOn) return;
    const { x, y, source } = e.detail;
    setGestureCursor(x, y, false);
    if (source === 'grab') {
      // Grabbing (fist): visual only, no dwell arming.
      clearDwell();
    } else {
      // Pointing: dwell-select on hover.
      updateDwell(x, y);
    }
  });
  window.addEventListener('gesture:grab_drag', (e) => {
    if (!handModeOn || mode !== 'orbit') return;
    const { x, y, dx, dy } = e.detail;
    clearDwell();
    // Visual: core tinted pink during rotation
    if (gestureCoreEl) gestureCoreEl.setAttribute('stroke', '#ff9ac8');
    setGestureCursor(x, y, false);
    // Direct spherical-coordinate rotation (independent of OrbitControls internals).
    // dx/dy are normalized (0..1); multiply to get radian rotation.
    const offset = new THREE.Vector3().subVectors(camera.position, orbit.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta -= dx * Math.PI * 1.8;
    sph.phi -= dy * Math.PI * 1.2;
    // Clamp polar angle to avoid flip-over at poles
    sph.phi = Math.max(0.05, Math.min(Math.PI - 0.05, sph.phi));
    offset.setFromSpherical(sph);
    camera.position.copy(orbit.target).add(offset);
    orbit.update();
  });
  window.addEventListener('gesture:grab_end', () => {
    if (!handModeOn) return;
    if (gestureCoreEl) gestureCoreEl.setAttribute('stroke', '#8ad9ff');
  });
  window.addEventListener('gesture:dolly', (e) => {
    if (!handModeOn || mode !== 'orbit') return;
    const { delta } = e.detail;
    // delta > 0 → hands moved apart → user wants to zoom IN (camera gets closer to target).
    // Use target-relative exponential scaling (always works, independent of OrbitControls internals).
    const factor = Math.exp(-delta * 8);   // k=8 → ~0.67× per ~0.05 spread
    const offset = new THREE.Vector3().subVectors(camera.position, orbit.target);
    offset.multiplyScalar(factor);
    // Clamp to OrbitControls distance limits if set
    const newDist = offset.length();
    const minD = orbit.minDistance ?? 0.01;
    const maxD = orbit.maxDistance ?? 10000;
    if (newDist < minD) offset.setLength(minD);
    else if (newDist > maxD) offset.setLength(maxD);
    camera.position.copy(orbit.target).add(offset);
    orbit.update();
  });
  window.addEventListener('gesture:idle', () => {
    hideGestureCursor();
  });
}
bindGestureEvents();

// Auto-activate when ?input=hand in URL (exhibition kiosk mode)
if (new URLSearchParams(location.search).get('input') === 'hand') {
  // Wait for the scene to build; toggle after a short delay.
  setTimeout(() => toggleHandMode(), 1500);
}

function animate() {
  requestAnimationFrame(animate);
  if (timeMode) {
    applyTimeDilation(clock.elapsedTime);
  }
  const dt = Math.min(clock.getDelta(), 0.1);
  updateParticleStream(dt);
  if (mode === 'fly' && fly.isLocked) {
    const s = flyState.speed * flyState.boost * dt;
    // Damping
    flyVelocity.multiplyScalar(1 - 6 * dt);
    flyDirection.set(0, 0, 0);
    if (flyState.forward) flyDirection.z -= 1;
    if (flyState.back) flyDirection.z += 1;
    if (flyState.left) flyDirection.x -= 1;
    if (flyState.right) flyDirection.x += 1;
    if (flyDirection.lengthSq() > 0) flyDirection.normalize();
    flyVelocity.x += flyDirection.x * s * 30;
    flyVelocity.z += flyDirection.z * s * 30;
    fly.moveRight(flyVelocity.x * dt);
    fly.moveForward(-flyVelocity.z * dt);
    // Vertical in world Y
    const vy = (flyState.up ? 1 : 0) - (flyState.down ? 1 : 0);
    camera.position.y += vy * s * 2;
  } else {
    orbit.update();
  }
  renderer.render(scene, camera);
}

init();
