/* 電影式開場:4 段字卡依序淡入淡出,任意鍵/點擊跳到下一段或直接離場。 */

const STANZA_MS = 3800;

export function playIntro(onDone) {
  const intro = document.getElementById('intro');
  if (!intro) { onDone && onDone(); return; }
  const stanzas = intro.querySelectorAll('.intro-stanza');
  if (!stanzas.length) { intro.remove(); onDone && onDone(); return; }
  const progress = document.getElementById('intro-progress');
  if (progress) {
    stanzas.forEach(() => {
      const dot = document.createElement('div');
      dot.className = 'dot';
      progress.appendChild(dot);
    });
  }
  const dots = progress ? progress.querySelectorAll('.dot') : [];

  // Fail-safe: if the intro somehow gets stuck, force it off after 25s.
  const failsafe = setTimeout(() => finish(), 25000);

  let idx = 0;
  let done = false;
  let timer = null;

  function show(i) {
    stanzas.forEach((s, k) => s.classList.toggle('visible', k === i));
    dots.forEach((d, k) => d.classList.toggle('active', k === i));
  }

  function advance() {
    if (done) return;
    if (idx >= stanzas.length - 1) {
      finish();
      return;
    }
    idx += 1;
    show(idx);
    clearTimeout(timer);
    timer = setTimeout(advance, STANZA_MS);
  }

  function finish() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    clearTimeout(failsafe);
    intro.classList.add('hidden');
    window.removeEventListener('keydown', onKey);
    intro.removeEventListener('click', onKey);
    setTimeout(() => {
      intro.remove();
      onDone && onDone();
    }, 1200);
  }

  function onKey(e) {
    // Any key/click: first press advances, press again at last → enter.
    if (idx >= stanzas.length - 1) finish();
    else advance();
  }

  show(0);
  timer = setTimeout(advance, STANZA_MS);
  window.addEventListener('keydown', onKey);
  intro.addEventListener('click', onKey);
}
