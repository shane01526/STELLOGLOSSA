/* Hand gesture control via MediaPipe Hands (browser-native, no drivers).

   Exhibition-mode input. Default off; toggle with `G` key or URL ?input=hand.
   Emits CustomEvents on window; app.js has an adapter layer that binds these
   to OrbitControls / selectPulsar.

   Emitted events (all on `window`):
     gesture:idle          no hand visible — detail: {}
     gesture:cursor        hand visible — detail: { x, y, source }      normalized 0..1, mirrored
     gesture:grab_drag     single-hand fist moving — detail: { x, y, dx, dy }
     gesture:grab_end      fist released — detail: {}
     gesture:dolly         two fists changing distance — detail: { delta }   positive = zoom in

   Clicking a star is handled entirely by the dwell adapter in app.js —
   point your finger, let the cursor sit on a star for 1 second, done.
   No discrete pinch/tap event exists any more.

   Design notes:
   - X is mirrored (1 - x) so "move hand right" moves cursor right from the
     user's POV — cameras see the viewer mirrored.
   - Two-hand gesture is exclusive of one-hand gestures.
*/

const MP_VERSION = '0.10.22-rc.20250304';
const MP_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const IDLE_TIMEOUT_MS = 350;       // if no hand for this long → idle event

let landmarker = null;
let videoEl = null;
let previewCanvas = null;
let previewCtx = null;
let active = false;
let rafHandle = null;
let lastHandSeen = 0;
let wasIdle = true;

// Per-hand state
let fistState = false;
let lastFistPos = null;
let lastTwoHandDist = null;
let oneHandGraceFrames = 0;   // tolerate brief drops from 2 hands → 1 hand

let statusCb = null;

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Classify a single hand's shape from MediaPipe landmarks.
//   fist   — all 4 non-thumb fingers curled (tips close to palm)
//   open   — all 4 non-thumb fingers extended (tips far from palm)
//   other  — pointing, pinching, partial, ambiguous
// Uses dist(tip, wrist) vs dist(MCP, wrist): an extended finger's tip sits
// meaningfully farther from the wrist than its own MCP knuckle does.
function handShape(lm) {
  const wrist = lm[0];
  const pairs = [[8, 5], [12, 9], [16, 13], [20, 17]];  // (tip, MCP) for each finger
  let extended = 0;
  for (const [tip, mcp] of pairs) {
    if (dist(lm[tip], wrist) > dist(lm[mcp], wrist) * 1.35) extended += 1;
  }
  if (extended === 0) return 'fist';
  if (extended >= 3) return 'open';
  return 'other';
}

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(`gesture:${name}`, { detail }));
}

function setStatus(msg) {
  if (statusCb) statusCb(msg);
}

/* ═══════════════════ lifecycle ═══════════════════ */

async function loadMediaPipe() {
  const mod = await import(MP_BUNDLE);
  const { HandLandmarker, FilesetResolver } = mod;
  const vision = await FilesetResolver.forVisionTasks(MP_WASM);
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MP_MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

async function ensureVideo() {
  if (videoEl) return videoEl;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  videoEl = document.createElement('video');
  videoEl.srcObject = stream;
  videoEl.autoplay = true;
  videoEl.playsInline = true;
  videoEl.muted = true;
  await new Promise((resolve) => {
    videoEl.addEventListener('loadeddata', resolve, { once: true });
  });
  await videoEl.play();
  return videoEl;
}

/* ═══════════════════ public API ═══════════════════ */

export async function startHandControl({ onStatus } = {}) {
  if (active) return true;
  statusCb = onStatus || null;
  setStatus('載入 MediaPipe…');
  try {
    if (!landmarker) landmarker = await loadMediaPipe();
    setStatus('請求攝影機權限…');
    await ensureVideo();
  } catch (err) {
    setStatus(`啟動失敗:${err.message || err}`);
    console.error('[hand] startup failed:', err);
    return false;
  }
  bindPreview();
  active = true;
  wasIdle = true;
  fistState = false;
  lastFistPos = null;
  lastTwoHandDist = null;
  setStatus('手勢啟用中');
  loop();
  return true;
}

export function stopHandControl() {
  active = false;
  if (rafHandle) { cancelAnimationFrame(rafHandle); rafHandle = null; }
  if (videoEl?.srcObject) {
    videoEl.srcObject.getTracks().forEach(t => t.stop());
    videoEl.srcObject = null;
  }
  if (previewCanvas?.parentNode) previewCanvas.parentNode.removeChild(previewCanvas);
  previewCanvas = null;
  previewCtx = null;
  videoEl = null;
  setStatus('手勢已關閉');
  emit('idle', {});
}

export function isActive() { return active; }

/* ═══════════════════ preview overlay ═══════════════════ */

function bindPreview() {
  previewCanvas = document.createElement('canvas');
  previewCanvas.id = 'hand-preview';
  previewCanvas.width = 160;
  previewCanvas.height = 120;
  Object.assign(previewCanvas.style, {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    width: '160px', height: '120px',
    border: '1px solid #22304a',
    borderRadius: '6px',
    background: '#05060a',
    zIndex: '20',
    opacity: '0.85',
  });
  document.body.appendChild(previewCanvas);
  previewCtx = previewCanvas.getContext('2d');
}

function drawPreview(landmarks) {
  if (!previewCtx || !videoEl) return;
  const ctx = previewCtx;
  const W = previewCanvas.width, H = previewCanvas.height;
  ctx.save();
  // Mirror horizontally (natural selfie view)
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, W, H);
  ctx.restore();

  // Overlay landmark skeleton
  if (landmarks && landmarks.length) {
    ctx.strokeStyle = '#8ad9ff';
    ctx.fillStyle = '#8ad9ff';
    ctx.lineWidth = 1;
    for (const lm of landmarks) {
      // draw dots at tips
      for (const i of [4, 8, 12, 16, 20]) {
        const x = (1 - lm[i].x) * W;
        const y = lm[i].y * H;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // thumb↔index line for pinch visualisation
      ctx.beginPath();
      ctx.moveTo((1 - lm[4].x) * W, lm[4].y * H);
      ctx.lineTo((1 - lm[8].x) * W, lm[8].y * H);
      ctx.stroke();
    }
  }
}

/* ═══════════════════ frame loop ═══════════════════ */

function loop() {
  if (!active) return;
  rafHandle = requestAnimationFrame(loop);
  if (!videoEl || videoEl.readyState < 2 || !landmarker) return;
  const now = performance.now();
  let results;
  try {
    results = landmarker.detectForVideo(videoEl, now);
  } catch (err) {
    console.warn('[hand] detect failed:', err);
    return;
  }
  const landmarks = results?.landmarks || [];
  drawPreview(landmarks);

  if (landmarks.length === 0) {
    if (!wasIdle && now - lastHandSeen > IDLE_TIMEOUT_MS) {
      wasIdle = true;
      if (fistState) { fistState = false; lastFistPos = null; emit('grab_end', {}); }
      lastTwoHandDist = null;
      emit('idle', {});
    }
    return;
  }
  lastHandSeen = now;
  wasIdle = false;

  if (landmarks.length >= 2) {
    oneHandGraceFrames = 0;
    processTwoHands(landmarks[0], landmarks[1]);
  } else if (landmarks.length === 1) {
    // Brief drop from 2 hands → 1 hand: keep two-hand state alive for a few
    // frames so MediaPipe flicker doesn't kill a sustained dolly gesture.
    if (lastTwoHandDist !== null && oneHandGraceFrames < 8) {
      oneHandGraceFrames += 1;
      return;
    }
    oneHandGraceFrames = 0;
    processOneHand(landmarks[0]);
  }
}

function processOneHand(lm) {
  // Reset two-hand state
  lastTwoHandDist = null;

  const shape = handShape(lm);
  const cursor = { x: 1 - lm[8].x, y: lm[8].y };   // index fingertip, mirrored
  const palm = { x: 1 - lm[9].x, y: lm[9].y };     // middle-MCP = palm centre

  // Fist → grab & drag (rotate view).
  if (shape === 'fist') {
    if (!fistState) {
      fistState = true;
      lastFistPos = palm;
      setStatus('✊ 抓住');
    } else {
      const dx = palm.x - lastFistPos.x;
      const dy = palm.y - lastFistPos.y;
      lastFistPos = palm;
      emit('grab_drag', { x: palm.x, y: palm.y, dx, dy });
    }
    // Cursor still follows the fist (visual only — source='grab' tells
    // the adapter to skip dwell-selection while grabbing).
    emit('cursor', { ...palm, source: 'grab' });
    return;
  }

  // Not a fist any more — end any grab in progress
  if (fistState) {
    fistState = false;
    lastFistPos = null;
    emit('grab_end', {});
  }

  // Plain cursor. Dwell-based selection happens in app.js on this event.
  emit('cursor', { ...cursor, source: 'point' });
}

function processTwoHands(lmA, lmB) {
  // Cancel any one-hand state
  if (fistState) { fistState = false; lastFistPos = null; emit('grab_end', {}); }

  const shapeA = handShape(lmA);
  const shapeB = handShape(lmB);

  // Two open palms → pause (reset baseline so next fist gesture starts clean)
  if (shapeA === 'open' && shapeB === 'open') {
    lastTwoHandDist = null;
    setStatus('雙掌攤開 · 暫停');
    return;
  }

  // Only dolly when BOTH hands are fists. Mixed or ambiguous → ignore.
  if (shapeA !== 'fist' || shapeB !== 'fist') {
    lastTwoHandDist = null;
    setStatus(`手勢不明 ${shapeA}/${shapeB}`);
    return;
  }

  // Hand centre = middle-finger MCP (landmark 9) — stable reference on the palm.
  const a = { x: lmA[9].x, y: lmA[9].y };
  const b = { x: lmB[9].x, y: lmB[9].y };
  const d = dist(a, b);

  if (lastTwoHandDist != null) {
    const delta = d - lastTwoHandDist;
    if (Math.abs(delta) > 0.0015) {
      emit('dolly', { delta });
      setStatus(`雙拳 d=${d.toFixed(2)} Δ=${delta >= 0 ? '＋' : '－'}${Math.abs(delta).toFixed(3)}`);
    }
  } else {
    setStatus(`雙拳就位 d=${d.toFixed(2)}`);
  }
  lastTwoHandDist = d;
}
