/* ECO — motor Canvas 2D */
const EcoGame = (() => {
  const TILE = 40;
  const PLAYER_R = 0.28;
  const SPEED = 3.4; // tiles/s
  const PING_DURATION = 0.9;
  const PING_RADIUS = 7.5; // tiles
  const MEMORY_FADE = 2.8; // segundos após ping local

  let canvas, ctx;
  let W = 0, H = 0;
  let state = 'menu'; // menu | tip | play | pause | death | win
  let levelIndex = 0;
  let level = null;
  let player = { x: 1.5, y: 1.5 };
  let cam = { x: 0, y: 0 };
  let crystalsGot = 0;
  let pings = []; // {x,y,t,maxR,life}
  let memory = []; // 2d alpha 0..1
  let particles = [];
  let shake = 0;
  let flash = 0;
  let lastTs = 0;
  let stepAcc = 0;
  let reduceMotion = false;
  let lowFx = false; // mobile / coarse pointer: cheaper draw
  let onWin = null;
  let onDeath = null;

  function refreshFxFlags() {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const narrow = window.matchMedia('(max-width: 900px)').matches;
    lowFx = reduceMotion || coarse || narrow;
  }

  function init(c, hooks) {
    canvas = c;
    ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    onWin = hooks.onWin;
    onDeath = hooks.onDeath;
    refreshFxFlags();
    try {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', refreshFxFlags);
      window.matchMedia('(pointer: coarse)').addEventListener('change', refreshFxFlags);
    } catch (_) {}
    resize();
    window.addEventListener('resize', resize);
    EcoInput.bind(canvas);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function startLevel(idx) {
    levelIndex = idx;
    level = EcoLevels.parse(idx);
    player.x = level.start.x;
    player.y = level.start.y;
    crystalsGot = 0;
    pings = [];
    particles = [];
    shake = 0;
    flash = 0;
    memory = [];
    for (let y = 0; y < level.h; y++) {
      memory[y] = [];
      for (let x = 0; x < level.w; x++) memory[y][x] = 0;
    }
    cam.x = player.x;
    cam.y = player.y;
    state = 'play';
    EcoUI.hideAllOverlays();
    EcoUI.setPlaying(true);
    EcoUI.updateHud(levelIndex + 1, crystalsGot, level.totalCrystals);
  }

  function setState(s) { state = s; }
  function getState() { return state; }
  function getLevelIndex() { return levelIndex; }

  function doPing() {
    if (state !== 'play') return;
    EcoAudio.ensure();
    EcoAudio.ping();
    pings.push({
      x: player.x,
      y: player.y,
      t: 0,
      life: PING_DURATION,
      maxR: PING_RADIUS,
    });
    if (!reduceMotion) shake = Math.max(shake, 0.12);
  }

  function worldToScreen(wx, wy) {
    const cx = W / 2 + (wx - cam.x) * TILE;
    const cy = H / 2 + (wy - cam.y) * TILE;
    return { x: cx, y: cy };
  }

  function solidAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return true;
    return level.tiles[ty][tx] === 'wall';
  }

  function tileAt(px, py) {
    const tx = Math.floor(px);
    const ty = Math.floor(py);
    if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return 'wall';
    return level.tiles[ty][tx];
  }

  function movePlayer(dt) {
    const m = EcoInput.movement();
    if (!m.x && !m.y) return;
    const nx = player.x + m.x * SPEED * dt;
    const ny = player.y + m.y * SPEED * dt;

    // colisão eixo X
    if (!collides(nx, player.y)) player.x = nx;
    else {
      // slide
      const tryX = player.x + Math.sign(m.x) * SPEED * dt;
      if (!collides(tryX, player.y)) player.x = tryX;
    }
    if (!collides(player.x, ny)) player.y = ny;
    else {
      const tryY = player.y + Math.sign(m.y) * SPEED * dt;
      if (!collides(player.x, tryY)) player.y = tryY;
    }

    stepAcc += Math.hypot(m.x, m.y) * SPEED * dt;
    if (stepAcc > 0.55) {
      stepAcc = 0;
      EcoAudio.footstep();
    }
  }

  function collides(px, py) {
    const r = PLAYER_R;
    const samples = [
      [px - r, py - r], [px + r, py - r],
      [px - r, py + r], [px + r, py + r],
      [px, py - r], [px, py + r], [px - r, py], [px + r, py],
    ];
    for (const [sx, sy] of samples) {
      if (solidAt(Math.floor(sx), Math.floor(sy))) return true;
    }
    return false;
  }

  function updateReveal(dt) {
    // decay memory
    for (let y = 0; y < level.h; y++) {
      for (let x = 0; x < level.w; x++) {
        if (memory[y][x] > 0) {
          memory[y][x] = Math.max(0, memory[y][x] - dt / MEMORY_FADE);
        }
      }
    }

    for (let i = pings.length - 1; i >= 0; i--) {
      const p = pings[i];
      p.t += dt;
      const u = Math.min(1, p.t / p.life);
      const waveR = p.maxR * easeOutCubic(Math.min(1, p.t / (p.life * 0.55)));
      // stamp memory inside wave with falloff
      const rMin = Math.max(0, Math.floor(p.x - waveR - 1));
      const rMax = Math.min(level.w - 1, Math.ceil(p.x + waveR + 1));
      const cMin = Math.max(0, Math.floor(p.y - waveR - 1));
      const cMax = Math.min(level.h - 1, Math.ceil(p.y + waveR + 1));
      for (let ty = cMin; ty <= cMax; ty++) {
        for (let tx = rMin; tx <= rMax; tx++) {
          const d = Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y);
          if (d <= waveR) {
            const fall = 1 - d / p.maxR;
            const boost = fall * fall * (1 - u * 0.15);
            memory[ty][tx] = Math.max(memory[ty][tx], Math.min(1, 0.25 + boost * 0.95));
          }
        }
      }
      if (p.t >= p.life) pings.splice(i, 1);
    }
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function checkPickups() {
    for (const c of level.crystals) {
      if (c.taken) continue;
      if (Math.hypot(c.x - player.x, c.y - player.y) < 0.45) {
        c.taken = true;
        crystalsGot++;
        EcoAudio.collect();
        EcoUI.updateHud(levelIndex + 1, crystalsGot, level.totalCrystals);
        spawnSparkle(c.x, c.y, '#40e0d0');
      }
    }
    // pit
    const t = tileAt(player.x, player.y);
    if (t === 'pit') {
      die();
      return;
    }
    // exit
    if (Math.hypot(level.exit.x - player.x, level.exit.y - player.y) < 0.55) {
      winLevel();
    }
  }

  function die() {
    if (state !== 'play') return;
    state = 'death';
    EcoAudio.death();
    flash = 0.55;
    if (!reduceMotion) shake = 0.55;
    EcoUI.setPlaying(false);
    EcoUI.show('screen-death');
    if (onDeath) onDeath();
  }

  function winLevel() {
    if (state !== 'play') return;
    state = 'win';
    EcoAudio.win();
    spawnSparkle(level.exit.x, level.exit.y, '#f0a060');
    spawnSparkle(player.x, player.y, '#40e0d0');
    const isLast = levelIndex >= EcoLevels.count - 1;
    EcoUI.showWin(levelIndex + 1, crystalsGot, level.totalCrystals, isLast);
    if (onWin) onWin(levelIndex, crystalsGot, level.totalCrystals, isLast);
  }

  function spawnSparkle(x, y, color) {
    if (reduceMotion || lowFx) {
      particles.push({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, color, r: 3 });
      if (lowFx && !reduceMotion) {
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 0.6 + Math.random() * 1.6;
          particles.push({
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0.3 + Math.random() * 0.35, max: 0.7, color, r: 1.5 + Math.random() * 1.5,
          });
        }
      }
      return;
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.8 + Math.random() * 2.2;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.4 + Math.random() * 0.5,
        max: 0.9,
        color,
        r: 1.5 + Math.random() * 2,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function update(dt) {
    if (state === 'play') {
      if (EcoInput.consumePause()) {
        state = 'pause';
        EcoUI.show('screen-pause');
        EcoUI.setPlaying(true);
        return;
      }
      if (EcoInput.consumePing()) doPing();
      movePlayer(dt);
      updateReveal(dt);
      checkPickups();
    } else {
      // still advance reveal visuals a bit on overlays? skip
      EcoInput.consumePing();
      EcoInput.consumePause();
    }

    // camera lerp
    const follow = state === 'play' || state === 'pause' || state === 'death' || state === 'win';
    if (follow && level) {
      const lerp = 1 - Math.pow(0.001, dt);
      cam.x += (player.x - cam.x) * lerp;
      cam.y += (player.y - cam.y) * lerp;
    }

    updateParticles(dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 1.8);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.4);
  }

  function visibility(tx, ty) {
    // always faint near player
    const d = Math.hypot(tx + 0.5 - player.x, ty + 0.5 - player.y);
    let v = memory[ty] ? memory[ty][tx] : 0;
    if (d < 1.1) v = Math.max(v, 0.12 * (1 - d / 1.1));
    // active ping boost ring
    for (const p of pings) {
      const pd = Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y);
      const waveR = p.maxR * easeOutCubic(Math.min(1, p.t / (p.life * 0.55)));
      const band = Math.abs(pd - waveR);
      if (band < 0.35 && pd < p.maxR) v = Math.max(v, 0.9);
      if (pd < waveR) {
        const fall = 1 - pd / p.maxR;
        const u = p.t / p.life;
        v = Math.max(v, fall * (0.7 - u * 0.4));
      }
    }
    return Math.min(1, v);
  }

  function draw() {
    ctx.fillStyle = '#010204';
    ctx.fillRect(0, 0, W, H);

    if (!level) {
      drawAmbient();
      return;
    }

    let ox = 0, oy = 0;
    if (shake > 0 && !reduceMotion && !lowFx) {
      ox = (Math.random() - 0.5) * shake * 14;
      oy = (Math.random() - 0.5) * shake * 14;
    } else if (shake > 0 && lowFx && !reduceMotion) {
      ox = (Math.random() - 0.5) * shake * 6;
      oy = (Math.random() - 0.5) * shake * 6;
    }
    ctx.save();
    ctx.translate(ox, oy);

    // tiles
    const margin = 2;
    const minX = Math.max(0, Math.floor(cam.x - W / TILE / 2) - margin);
    const maxX = Math.min(level.w - 1, Math.ceil(cam.x + W / TILE / 2) + margin);
    const minY = Math.max(0, Math.floor(cam.y - H / TILE / 2) - margin);
    const maxY = Math.min(level.h - 1, Math.ceil(cam.y + H / TILE / 2) + margin);

    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const v = visibility(tx, ty);
        if (v <= 0.02) continue;
        const t = level.tiles[ty][tx];
        const s = worldToScreen(tx, ty);
        const a = v;

        if (t === 'wall') {
          // fill subtle + cyan outline
          ctx.fillStyle = `rgba(12, 28, 36, ${a * 0.55})`;
          ctx.fillRect(s.x, s.y, TILE + 0.5, TILE + 0.5);
          ctx.strokeStyle = `rgba(64, 224, 208, ${a * 0.85})`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(s.x + 1, s.y + 1, TILE - 2, TILE - 2);
        } else if (t === 'pit') {
          ctx.fillStyle = `rgba(40, 8, 12, ${a * 0.85})`;
          ctx.fillRect(s.x + 4, s.y + 4, TILE - 8, TILE - 8);
          ctx.strokeStyle = `rgba(224, 80, 96, ${a * 0.9})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          // spikes hint
          const cx = s.x + TILE / 2, cy = s.y + TILE / 2;
          for (let i = 0; i < 3; i++) {
            const ang = -Math.PI / 2 + i * (Math.PI * 2 / 3);
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(ang) * 10, cy + Math.sin(ang) * 10);
          }
          ctx.stroke();
        } else if (t === 'exit') {
          const g = ctx.createRadialGradient(
            s.x + TILE / 2, s.y + TILE / 2, 2,
            s.x + TILE / 2, s.y + TILE / 2, TILE * 0.7
          );
          g.addColorStop(0, `rgba(255, 200, 120, ${a * 0.95})`);
          g.addColorStop(1, `rgba(240, 160, 96, 0)`);
          ctx.fillStyle = g;
          ctx.fillRect(s.x - 8, s.y - 8, TILE + 16, TILE + 16);
          ctx.strokeStyle = `rgba(240, 160, 96, ${a})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(s.x + 6, s.y + 6, TILE - 12, TILE - 12);
        } else {
          // floor barely visible
          ctx.fillStyle = `rgba(18, 28, 34, ${a * 0.22})`;
          ctx.fillRect(s.x, s.y, TILE, TILE);
        }
      }
    }

    // crystals
    const now = performance.now() / 1000;
    for (const c of level.crystals) {
      if (c.taken) continue;
      const tx = Math.floor(c.x), ty = Math.floor(c.y);
      const v = visibility(tx, ty);
      if (v < 0.05) continue;
      const s = worldToScreen(c.x, c.y);
      const pulse = 0.7 + Math.sin(now * 6 + c.x) * 0.3;
      ctx.save();
      ctx.globalAlpha = Math.min(1, v * 1.1);
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.PI / 4);
      const sz = 7 * pulse;
      ctx.fillStyle = '#40e0d0';
      ctx.shadowColor = '#40e0d0';
      ctx.shadowBlur = (reduceMotion || lowFx) ? 0 : 12;
      ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }

    // ping ripples
    for (const p of pings) {
      const s = worldToScreen(p.x, p.y);
      const u = p.t / p.life;
      const waveR = p.maxR * easeOutCubic(Math.min(1, p.t / (p.life * 0.55))) * TILE;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1, waveR), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(100, 240, 230, ${Math.max(0, 0.75 * (1 - u))})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1, waveR * 0.72), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(64, 224, 208, ${Math.max(0, 0.35 * (1 - u))})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // particles
    for (const p of particles) {
      const s = worldToScreen(p.x, p.y);
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // player silhouette — always faintly visible
    {
      const s = worldToScreen(player.x, player.y);
      const pr = PLAYER_R * TILE;
      ctx.beginPath();
      ctx.arc(s.x, s.y, pr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(180, 210, 210, 0.22)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(200, 255, 245, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // eye glint
      ctx.fillStyle = 'rgba(200, 255, 245, 0.7)';
      ctx.beginPath();
      ctx.arc(s.x - 3, s.y - 3, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // soft vignette darkness (always)
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = vg;
    ctx.fillRect(-ox, -oy, W, H);

    ctx.restore();

    if (flash > 0) {
      ctx.fillStyle = `rgba(180, 40, 50, ${flash * 0.55})`;
      ctx.fillRect(0, 0, W, H);
    }

    drawAmbient();
  }

  function drawAmbient() {
    // subtle scan noise — skipped/cheap on mobile for 60fps
    if (reduceMotion) return;
    if (lowFx) {
      ctx.fillStyle = 'rgba(64, 224, 208, 0.02)';
      const y = (performance.now() * 0.015) % H;
      ctx.fillRect(0, y, W, 1);
      return;
    }
    ctx.fillStyle = 'rgba(64, 224, 208, 0.015)';
    for (let i = 0; i < 18; i++) {
      const y = (performance.now() * 0.02 + i * 37) % H;
      ctx.fillRect(0, y, W, 1);
    }
  }

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function startLoop() {
    lastTs = 0;
    requestAnimationFrame(frame);
  }

  return {
    init, startLevel, setState, getState, getLevelIndex, doPing, startLoop,
    get crystalsGot() { return crystalsGot; },
    get totalCrystals() { return level ? level.totalCrystals : 0; },
  };
})();
