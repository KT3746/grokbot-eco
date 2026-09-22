/* ECO — teclado + toque (mobile-safe) */
const EcoInput = (() => {
  const keys = Object.create(null);
  const touchDirs = { up: false, down: false, left: false, right: false };
  let pingQueued = false;
  let pauseQueued = false;
  let blockCanvasPingUntil = 0;
  let tapX = 0, tapY = 0, tapId = null, tapAt = 0;

  function bind(canvas) {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      keys[k] = true;
      if (k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright' || k === ' ' || k === 'spacebar') {
        e.preventDefault();
      }
      if (k === ' ' || k === 'spacebar') pingQueued = true;
      if (k === 'escape') pauseQueued = true;
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
    });

    const blockScroll = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.overlay')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', blockScroll, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

    document.querySelectorAll('.pad[data-dir]').forEach((btn) => {
      const d = btn.dataset.dir;
      const on = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        touchDirs[d] = true;
        btn.classList.add('is-down');
        blockCanvasPingUntil = performance.now() + 280;
        try { btn.setPointerCapture(ev.pointerId); } catch (_) {}
      };
      const off = (ev) => {
        if (ev && ev.preventDefault) ev.preventDefault();
        touchDirs[d] = false;
        btn.classList.remove('is-down');
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('lostpointercapture', () => {
        touchDirs[d] = false;
        btn.classList.remove('is-down');
      });
    });

    const pingBtn = document.getElementById('btn-ping');
    if (pingBtn) {
      pingBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        pingBtn.classList.add('is-down');
        blockCanvasPingUntil = performance.now() + 350;
        try { pingBtn.setPointerCapture(e.pointerId); } catch (_) {}
        pingQueued = true;
      });
      const pingEnd = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        pingBtn.classList.remove('is-down');
      };
      pingBtn.addEventListener('pointerup', pingEnd);
      pingBtn.addEventListener('pointercancel', pingEnd);
      pingBtn.addEventListener('pointermove', (e) => {
        if (pingBtn.classList.contains('is-down')) e.preventDefault();
      });
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
    const pad = 14;
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

  function consumePause() {
    if (!pauseQueued) return false;
    pauseQueued = false;
    return true;
  }

  function movement() {
    let x = 0, y = 0;
    const up = touchDirs.up || keys['w'] || keys['arrowup'];
    const down = touchDirs.down || keys['s'] || keys['arrowdown'];
    const left = touchDirs.left || keys['a'] || keys['arrowleft'];
    const right = touchDirs.right || keys['d'] || keys['arrowright'];
    if (left) x -= 1;
    if (right) x += 1;
    if (up) y -= 1;
    if (down) y += 1;
    if (x && y) { const inv = 1 / Math.SQRT2; x *= inv; y *= inv; }
    return { x, y };
  }

  return { bind, consumePing, consumePause, movement };
})();
