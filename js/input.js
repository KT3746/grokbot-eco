/* ECO — teclado + toque (cardinal-only, precisão de labirinto) */
const EcoInput = (() => {
  const keys = Object.create(null);
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
  const KEY_TO_DIR = {
    w: 'up', arrowup: 'up',
    s: 'down', arrowdown: 'down',
    a: 'left', arrowleft: 'left',
    d: 'right', arrowright: 'right',
  };

  // Uma direção de toque por vez (last press wins)
  let touchDir = null;
  let touchPointerId = null;
  let wasMoving = false; // para micro-snap no release

  let pingQueued = false;
  let pauseQueued = false;
  let blockCanvasPingUntil = 0;
  let tapX = 0, tapY = 0, tapId = null, tapAt = 0;
  let suppressPingDiscard = false;

  function keyFromEvent(e) {
    if (e.code && CODE_TO_KEY[e.code]) return CODE_TO_KEY[e.code];
    const k = (e.key || '').toLowerCase();
    if (k === 'spacebar') return ' ';
    return k;
  }

  function clearPadVisuals() {
    document.querySelectorAll('.pad.is-down').forEach((b) => b.classList.remove('is-down'));
  }

  function setTouchDir(d) {
    if (d && !DIR_VEC[d]) return;
    if (touchDir === d) return;
    touchDir = d || null;
    clearPadVisuals();
    if (touchDir) {
      const btn = document.querySelector('.pad[data-dir="' + touchDir + '"]');
      if (btn) btn.classList.add('is-down');
      blockCanvasPingUntil = performance.now() + 280;
    }
  }

  function dirAtPoint(x, y) {
    const pads = document.querySelectorAll('.pad[data-dir]');
    let best = null;
    let bestDist = Infinity;
    for (const btn of pads) {
      const r = btn.getBoundingClientRect();
      // hit com pequena margem
      const pad = 6;
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) {
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist < bestDist) {
          bestDist = dist;
          best = btn.dataset.dir;
        }
      }
    }
    return best;
  }

  function bindPad(btn) {
    const d = btn.dataset.dir;
    if (!d) return;

    const onDown = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      // last pressed wins — cardinal único
      setTouchDir(d);
      if (ev.pointerId != null) {
        touchPointerId = ev.pointerId;
        try { btn.setPointerCapture(ev.pointerId); } catch (_) {}
      }
    };

    const onUp = (ev) => {
      if (ev && ev.preventDefault) ev.preventDefault();
      // Só libera se for o mesmo ponteiro / direção atual
      if (ev && ev.pointerId != null && touchPointerId != null && ev.pointerId !== touchPointerId) return;
      setTouchDir(null);
      touchPointerId = null;
    };

    const onMove = (ev) => {
      if (touchPointerId == null) return;
      if (ev.pointerId != null && ev.pointerId !== touchPointerId) return;
      ev.preventDefault();
      const next = dirAtPoint(ev.clientX, ev.clientY);
      if (next) setTouchDir(next);
      // se saiu dos pads, mantém última direção (mais previsível em corredor)
    };

    btn.addEventListener('pointerdown', onDown);
    btn.addEventListener('pointerup', onUp);
    btn.addEventListener('pointercancel', onUp);
    btn.addEventListener('pointermove', onMove);
    btn.addEventListener('lostpointercapture', () => {
      // se perdeu capture e ainda estamos nessa dir, libera
      if (touchDir === d) {
        setTouchDir(null);
        touchPointerId = null;
      }
    });

    // touch backup (WebViews sem Pointer Events completos)
    btn.addEventListener('touchstart', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const t = ev.changedTouches[0];
      if (!t) return;
      const hit = dirAtPoint(t.clientX, t.clientY) || d;
      setTouchDir(hit);
      touchPointerId = t.identifier;
    }, { passive: false });

    btn.addEventListener('touchmove', (ev) => {
      if (touchPointerId == null) return;
      ev.preventDefault();
      for (const t of ev.changedTouches) {
        if (t.identifier !== touchPointerId) continue;
        const next = dirAtPoint(t.clientX, t.clientY);
        if (next) setTouchDir(next);
      }
    }, { passive: false });

    btn.addEventListener('touchend', (ev) => {
      ev.preventDefault();
      for (const t of ev.changedTouches) {
        if (touchPointerId != null && t.identifier !== touchPointerId) continue;
        setTouchDir(null);
        touchPointerId = null;
      }
    }, { passive: false });

    btn.addEventListener('touchcancel', () => {
      setTouchDir(null);
      touchPointerId = null;
    });

    btn.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      setTouchDir(d);
    });
    btn.addEventListener('mouseup', (ev) => {
      ev.preventDefault();
      setTouchDir(null);
    });
  }

  // D-pad container: captura slide entre botões mesmo se capture falhar
  function bindDpadSurface() {
    const dpad = document.querySelector('.dpad');
    if (!dpad) return;
    dpad.addEventListener('pointermove', (ev) => {
      if (touchPointerId == null) return;
      if (ev.pointerId != null && ev.pointerId !== touchPointerId) return;
      const next = dirAtPoint(ev.clientX, ev.clientY);
      if (next) setTouchDir(next);
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
    bindDpadSurface();

    const pingBtn = document.getElementById('btn-ping');
    if (pingBtn) {
      let pingDownAt = 0;
      const pingDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        if (now - pingDownAt < 40) return;
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

  function peekPing() { return pingQueued; }

  function consumePause() {
    if (!pauseQueued) return false;
    pauseQueued = false;
    return true;
  }

  function releaseAllDirs() {
    setTouchDir(null);
    touchPointerId = null;
  }

  function markLevelStart() {
    releaseAllDirs();
    wasMoving = false;
    suppressPingDiscard = true;
    setTimeout(() => { suppressPingDiscard = false; }, 200);
  }

  function shouldDiscardPingOutsidePlay() {
    return !suppressPingDiscard;
  }

  function keyboardDir() {
    // Cardinal-only: prioridade última tecla lógica por ordem fixa se múltiplas
    // Preferência: a mais recente via scan — usamos ordem up/down/left/right e
    // se várias, última no array de checagem invertida (right > left > down > up)
    const pressed = [];
    if (keys['w'] || keys['arrowup'] || keys['code:KeyW'] || keys['code:ArrowUp']) pressed.push('up');
    if (keys['s'] || keys['arrowdown'] || keys['code:KeyS'] || keys['code:ArrowDown']) pressed.push('down');
    if (keys['a'] || keys['arrowleft'] || keys['code:KeyA'] || keys['code:ArrowLeft']) pressed.push('left');
    if (keys['d'] || keys['arrowright'] || keys['code:KeyD'] || keys['code:ArrowRight']) pressed.push('right');
    if (!pressed.length) return null;
    // Se opostos, cancela o eixo; se perpendicular, last wins (último do array)
    if (pressed.length === 1) return pressed[0];
    // Remove pares opostos
    const set = new Set(pressed);
    if (set.has('up') && set.has('down')) { set.delete('up'); set.delete('down'); }
    if (set.has('left') && set.has('right')) { set.delete('left'); set.delete('right'); }
    if (set.size === 0) return null;
    if (set.size === 1) return [...set][0];
    // Duas perpendiculares: last pressed wins ≈ última na ordem de pressed
    for (let i = pressed.length - 1; i >= 0; i--) {
      if (set.has(pressed[i])) return pressed[i];
    }
    return null;
  }

  function activeDir() {
    if (touchDir) return touchDir;
    return keyboardDir();
  }

  function movement() {
    const d = activeDir();
    if (!d) {
      const stopped = wasMoving;
      wasMoving = false;
      return { x: 0, y: 0, justReleased: stopped };
    }
    wasMoving = true;
    const v = DIR_VEC[d];
    return { x: v.x, y: v.y, justReleased: false };
  }

  function justReleasedFlag() {
    // movement() already exposes justReleased; kept for API clarity
    return false;
  }

  return {
    bind, consumePing, peekPing, consumePause,
    movement, activeDir, markLevelStart, shouldDiscardPingOutsidePlay,
    releaseAllDirs, justReleasedFlag,
  };
})();
