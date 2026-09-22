/* ECO — teclado + toque */
const EcoInput = (() => {
  const keys = Object.create(null);
  const dirs = { up: false, down: false, left: false, right: false };
  let pingQueued = false;
  let pauseQueued = false;
  let canvasTapPing = true;

  function bind(canvas) {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      keys[k] = true;
      if (['arrowup','arrowdown','arrowleft','arrowright',' ','space'].includes(k) || k === ' ') {
        e.preventDefault();
      }
      if (k === ' ' || k === 'spacebar') pingQueued = true;
      if (k === 'escape') pauseQueued = true;
      syncDirs();
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
      syncDirs();
    });

    // D-pad
    document.querySelectorAll('.pad').forEach((btn) => {
      const d = btn.dataset.dir;
      const on = (ev) => { ev.preventDefault(); dirs[d] = true; btn.classList.add('is-down'); };
      const off = (ev) => { ev.preventDefault(); dirs[d] = false; btn.classList.remove('is-down'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointerleave', off);
      btn.addEventListener('pointercancel', off);
    });

    const pingBtn = document.getElementById('btn-ping');
    if (pingBtn) {
      pingBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        pingQueued = true;
        canvasTapPing = false;
        setTimeout(() => { canvasTapPing = true; }, 300);
      });
    }

    // Tap no canvas = ping (quando não for nos controles)
    canvas.addEventListener('pointerdown', (e) => {
      if (!canvasTapPing) return;
      // ignorar se toque veio da UI de baixo
      const touch = document.getElementById('touch');
      if (touch && !touch.classList.contains('hidden')) {
        const r = touch.getBoundingClientRect();
        if (e.clientY >= r.top - 8) return;
      }
      pingQueued = true;
    });
  }

  function syncDirs() {
    dirs.up = !!(keys['w'] || keys['arrowup']);
    dirs.down = !!(keys['s'] || keys['arrowdown']);
    dirs.left = !!(keys['a'] || keys['arrowleft']);
    dirs.right = !!(keys['d'] || keys['arrowright']);
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
    if (dirs.left) x -= 1;
    if (dirs.right) x += 1;
    if (dirs.up) y -= 1;
    if (dirs.down) y += 1;
    if (x && y) { const inv = 1 / Math.sqrt(2); x *= inv; y *= inv; }
    return { x, y };
  }

  return { bind, consumePing, consumePause, movement };
})();
