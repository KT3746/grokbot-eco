/* ECO — teclado + toque (hold confiável + nudge) */
const EcoInput = (() => {
  const keys = Object.create(null);
  const touchDirs = { up: false, down: false, left: false, right: false };
  const DIR_VEC = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const CODE_TO_KEY = {
    KeyW: 'w', ArrowUp: 'arrowup',
    KeyS: 's', ArrowDown: 'arrowdown',
    KeyA: 'a', ArrowLeft: 'arrowleft',
    KeyD: 'd', ArrowRight: 'arrowright',
    Space: ' ',
    Escape: 'escape',
  };

  let pingQueued = false;
  let pauseQueued = false;
  let blockCanvasPingUntil = 0;
  let tapX = 0, tapY = 0, tapId = null, tapAt = 0;
  let nudges = []; // {x,y} tiles — applied once on press
  let suppressPingDiscard = false; // após startLevel

  function keyFromEvent(e) {
    if (e.code && CODE_TO_KEY[e.code]) return CODE_TO_KEY[e.code];
    const k = (e.key || '').toLowerCase();
    if (k === 'spacebar') return ' ';
    return k;
  }

  function pressDir(d, btn) {
    if (!DIR_VEC[d]) return;
    const was = touchDirs[d];
    touchDirs[d] = true;
    if (btn) btn.classList.add('is-down');
    blockCanvasPingUntil = performance.now() + 320;
    // Nudge só na transição solto→preso (evita pointer+touch duplicar)
    if (!was) {
      const v = DIR_VEC[d];
      nudges.push({ x: v.x * 0.42, y: v.y * 0.42 });
    }
  }

  function releaseDir(d, btn) {
    if (!DIR_VEC[d]) return;
    touchDirs[d] = false;
    if (btn) btn.classList.remove('is-down');
  }

  function bindPad(btn) {
    const d = btn.dataset.dir;
    if (!d) return;

    const onPointer = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      pressDir(d, btn);
      try { btn.setPointerCapture(ev.pointerId); } catch (_) {}
    };
    const offPointer = (ev) => {
      if (ev && ev.preventDefault) ev.preventDefault();
      releaseDir(d, btn);
    };

    btn.addEventListener('pointerdown', onPointer);
    btn.addEventListener('pointerup', offPointer);
    btn.addEventListener('pointercancel', offPointer);
    btn.addEventListener('lostpointercapture', () => releaseDir(d, btn));

    // Backups (alguns WebViews perdem pointer rápido)
    btn.addEventListener('touchstart', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      pressDir(d, btn);
    }, { passive: false });
    btn.addEventListener('touchend', (ev) => {
      ev.preventDefault();
      releaseDir(d, btn);
    }, { passive: false });
    btn.addEventListener('touchcancel', () => releaseDir(d, btn));

    btn.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      pressDir(d, btn);
    });
    btn.addEventListener('mouseup', (ev) => {
      ev.preventDefault();
      releaseDir(d, btn);
    });
    btn.addEventListener('mouseleave', () => {
      if (touchDirs[d]) releaseDir(d, btn);
    });
  }

  function bind(canvas) {
    window.addEventListener('keydown', (e) => {
      const k = keyFromEvent(e);
      keys[k] = true;
      if (e.code) keys['code:' + e.code] = true;
      if (k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright' || k === ' ') {
        e.preventDefault();
      }
      if (k === ' ') pingQueued = true;
      if (k === 'escape') pauseQueued = true;
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      const k = keyFromEvent(e);
      keys[k] = false;
      if (e.code) keys['code:' + e.code] = false;
    });

    const blockScroll = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.overlay')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', blockScroll, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

    document.querySelectorAll('.pad[data-dir]').forEach(bindPad);

    const pingBtn = document.getElementById('btn-ping');
    if (pingBtn) {
      let pingDownAt = 0;
      const pingDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        if (now - pingDownAt < 40) return; // dedupe pointer+touch
        pingDownAt = now;
        pingBtn.classList.add('is-down');
        blockCanvasPingUntil = now + 400;
        pingQueued = true;
        try { if (e.pointerId != null) pingBtn.setPointerCapture(e.pointerId); } catch (_) {}
      };
      const pingUp = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        pingBtn.classList.remove('is-down');
      };
      pingBtn.addEventListener('pointerdown', pingDown);
      pingBtn.addEventListener('pointerup', pingUp);
      pingBtn.addEventListener('pointercancel', pingUp);
      pingBtn.addEventListener('touchstart', pingDown, { passive: false });
      pingBtn.addEventListener('touchend', pingUp, { passive: false });
      pingBtn.addEventListener('mousedown', pingDown);
      pingBtn.addEventListener('mouseup', pingUp);
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (performance.now() < blockCanvasPingUntil) return;
      if (e.target !== canvas) return;
      if (inControlZone(e.clientX, e.clientY)) return;
      tapId = e.pointerId;
      tapX = e.clientX;
      tapY = e.clientY;
      tapAt = performance.now();
    });

    canvas.addEventListener('pointerup', (e) => {
      if (tapId !== e.pointerId) return;
      const dt = performance.now() - tapAt;
      const dist = Math.hypot(e.clientX - tapX, e.clientY - tapY);
      tapId = null;
      if (dt < 280 && dist < 18) {
        if (performance.now() < blockCanvasPingUntil) return;
        if (inControlZone(e.clientX, e.clientY)) return;
        pingQueued = true;
      }
    });

    canvas.addEventListener('pointercancel', () => { tapId = null; });
  }

  function inControlZone(x, y) {
    const touch = document.getElementById('touch');
    if (!touch || touch.classList.contains('hidden')) return false;
    const dpad = touch.querySelector('.dpad');
    const ping = document.getElementById('btn-ping');
    const pad = 16;
    for (const el of [dpad, ping]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) {
        return true;
      }
    }
    if (y > window.innerHeight * 0.78) return true;
    return false;
  }

  function consumePing() {
    if (!pingQueued) return false;
    pingQueued = false;
    return true;
  }

  function peekPing() {
    return pingQueued;
  }

  function consumePause() {
    if (!pauseQueued) return false;
    pauseQueued = false;
    return true;
  }

  function consumeNudges() {
    if (!nudges.length) return [];
    const out = nudges;
    nudges = [];
    return out;
  }

  function releaseAllDirs() {
    touchDirs.up = touchDirs.down = touchDirs.left = touchDirs.right = false;
    document.querySelectorAll('.pad.is-down').forEach((b) => b.classList.remove('is-down'));
  }

  function markLevelStart() {
    // Não descartar ping na transição; limpa só movimento preso
    releaseAllDirs();
    suppressPingDiscard = true;
    setTimeout(() => { suppressPingDiscard = false; }, 200);
  }

  function shouldDiscardPingOutsidePlay() {
    return !suppressPingDiscard;
  }

  function isHeld(dir) {
    return !!touchDirs[dir];
  }

  function movement() {
    let x = 0, y = 0;
    const up = touchDirs.up || keys['w'] || keys['arrowup'] || keys['code:KeyW'] || keys['code:ArrowUp'];
    const down = touchDirs.down || keys['s'] || keys['arrowdown'] || keys['code:KeyS'] || keys['code:ArrowDown'];
    const left = touchDirs.left || keys['a'] || keys['arrowleft'] || keys['code:KeyA'] || keys['code:ArrowLeft'];
    const right = touchDirs.right || keys['d'] || keys['arrowright'] || keys['code:KeyD'] || keys['code:ArrowRight'];
    if (left) x -= 1;
    if (right) x += 1;
    if (up) y -= 1;
    if (down) y += 1;
    if (x && y) { const inv = 1 / Math.SQRT2; x *= inv; y *= inv; }
    return { x, y };
  }

  return {
    bind, consumePing, peekPing, consumePause, consumeNudges,
    movement, markLevelStart, shouldDiscardPingOutsidePlay, releaseAllDirs, isHeld,
  };
})();
