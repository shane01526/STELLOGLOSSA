/* Hand gesture control via MediaPipe Hands (browser-native, no drivers).

   Exhibition-mode input. Default off; toggle with `G` key or URL ?input=hand.
   Emits CustomEvents on window; app.js has an adapter layer that binds these
   to OrbitControls / selectPulsar.

   Emitted events (all on `window`):
     gesture:idle           no hand visible — detail: {}
     gesture:cursor         hand visible, not pinching — detail: { x, y }   (normalized 0..1)
     gesture:tap            pinch onset — detail: { x, y }
     gesture:drag_update    pinch held — detail: { x, y, dx, dy }           (dx/dy delta since last frame)
     gesture:drag_end       pinch released — detail: {}
     gesture:dolly          two-hand stretch/pinch — detail: { delta }      (positive = zoom in)

   Design notes:
   - X is mirrored (1 - x) so "move hand right" moves cursor right from the
     user's POV — cameras see the viewer mirrored.
   - Pinch threshold = 0.05 normalized distance (roughly "thumb touches index").
   - Two-hand gesture is exclusive of one-hand gestures (if 2 hands visible,
     cursor/pinch events stop).
*/

const MP_VERSION = '0.10.22-rc.20250304';
const MP_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const PINCH_ON_THRESHOLD = 0.05;   // normalized distance thumb-tip ↔ index-tip
const PINCH_OFF_THRESHOLD = 0.08;  // hysteresis to avoid flicker
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
let pinchState = false;
let lastPinchPos = null;
let lastTwoHandDist = null;
let oneHandGraceFrames = 0;   // tolerate brief drops from 2 hands → 1 hand

let statusCb = null;

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
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
  pinchState = false;
  lastPinchPos = null;
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
      if (pinchState) { pinchState = false; lastPinchPos = null; emit('drag_end', {}); }
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
  // Reset two-hand state if we were in it
  lastTwoHandDist = null;

  const pinchDist = dist(lm[4], lm[8]);
  // Cursor = index fingertip (landmark 8), mirrored horizontally
  const cursor = { x: 1 - lm[8].x, y: lm[8].y };

  // Hysteresis for pinch
  const nowPinching = pinchState
    ? pinchDist < PINCH_OFF_THRESHOLD
    : pinchDist < PINCH_ON_THRESHOLD;

  if (nowPinching && !pinchState) {
    pinchState = true;
    lastPinchPos = cursor;
    emit('tap', cursor);
  } else if (nowPinching && pinchState) {
    const dx = cursor.x - lastPinchPos.x;
    const dy = cursor.y - lastPinchPos.y;
    lastPinchPos = cursor;
    emit('drag_update', { x: cursor.x, y: cursor.y, dx, dy });
  } else if (!nowPinching && pinchState) {
    pinchState = false;
    lastPinchPos = null;
    emit('drag_end', {});
  } else {
    emit('cursor', cursor);
  }
}

function processTwoHands(lmA, lmB) {
  // Cancel any one-hand state
  if (pinchState) { pinchState = false; lastPinchPos = null; emit('drag_end', {}); }

  // Use middle-finger MCP (landmark 9) as a stable hand centre — less jittery than wrist
  const a = { x: lmA[9].x, y: lmA[9].y };
  const b = { x: lmB[9].x, y: lmB[9].y };
  const d = dist(a, b);

  if (lastTwoHandDist != null) {
    const delta = d - lastTwoHandDist;
    if (Math.abs(delta) > 0.0015) {   // deadband (halved)
      emit('dolly', { delta });
      setStatus(`雙手 d=${d.toFixed(2)} Δ=${delta >= 0 ? '＋' : '－'}${Math.abs(delta).toFixed(3)}`);
    }
  } else {
    setStatus(`雙手就位 d=${d.toFixed(2)}`);
  }
  lastTwoHandDist = d;
}
