/* ECO — motor Canvas 2D */
const EcoGame = (() => {
  const TILE = 40;
  const PLAYER_R = 0.24;
  const SPEED = 2.95; // tiles/s — precisão de corredor
  const PING_DURATION = 1.0;
  const PING_RADIUS = 7.5; // tiles
  const MEMORY_FADE = 4.2; // segundos após ping local

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
    if (EcoInput.markLevelStart) EcoInput.markLevelStart();
    EcoUI.hideAllOverlays();
    EcoUI.setPlaying(true);
    EcoUI.updateHud(levelIndex + 1, crystalsGot, level.totalCrystals);
    // Processa ping pendente imediatamente (não descartar no frame do restart)
    if (EcoInput.consumePing()) doPing();
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

  function tryMoveDelta(dx, dy) {
    if (!dx && !dy) return false;
    let moved = false;
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (!collides(nx, player.y)) { player.x = nx; moved = true; }
    else if (dx) {
      const tryX = player.x + Math.sign(dx) * Math.abs(dx);
      if (!collides(tryX, player.y)) { player.x = tryX; moved = true; }
    }
    if (!collides(player.x, ny)) { player.y = ny; moved = true; }
    else if (dy) {
      const tryY = player.y + Math.sign(dy) * Math.abs(dy);
      if (!collides(player.x, tryY)) { player.y = tryY; moved = true; }
    }
    return moved;
  }

  function corridorAssist(dt, moveX, moveY) {
    // Puxa o eixo perpendicular para o centro do tile (menos raspagem de parede)
    const rate = 5.5 * dt; // suave
    if (Math.abs(moveX) > Math.abs(moveY) && Math.abs(moveX) > 0.01) {
      const targetY = Math.floor(player.y) + 0.5;
      const dy = targetY - player.y;
      if (Math.abs(dy) > 0.01) {
        const step = Math.sign(dy) * Math.min(Math.abs(dy), rate);
        if (!collides(player.x, player.y + step)) player.y += step;
      }
    } else if (Math.abs(moveY) > 0.01) {
      const targetX = Math.floor(player.x) + 0.5;
      const dx = targetX - player.x;
      if (Math.abs(dx) > 0.01) {
        const step = Math.sign(dx) * Math.min(Math.abs(dx), rate);
        if (!collides(player.x + step, player.y)) player.x += step;
      }
    }
  }

  function microSnapToCenters() {
    // Para limpo no meio da célula se estiver perto e livre
    const cx = Math.floor(player.x) + 0.5;
    const cy = Math.floor(player.y) + 0.5;
    let nx = player.x;
    let ny = player.y;
    if (Math.abs(player.x - cx) < 0.12) nx = cx;
    if (Math.abs(player.y - cy) < 0.12) ny = cy;
    if ((nx !== player.x || ny !== player.y) && !collides(nx, ny)) {
      player.x = nx;
      player.y = ny;
    }
  }

  function movePlayer(dt) {
    const m = EcoInput.movement();
    if (!m.x && !m.y) {
      if (m.justReleased) microSnapToCenters();
      return;
    }
    tryMoveDelta(m.x * SPEED * dt, m.y * SPEED * dt);
    corridorAssist(dt, m.x, m.y);

    stepAcc += Math.hypot(m.x, m.y) * SPEED * dt;
    if (stepAcc > 0.6) {
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
            memory[ty][tx] = Math.max(memory[ty][tx], Math.min(1, 0.5 + boost * 1.05));
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
      // NÃO descartar ping no mesmo instante do restart — só limpa pause
      EcoInput.consumePause();
      if (EcoInput.shouldDiscardPingOutsidePlay && EcoInput.shouldDiscardPingOutsidePlay()) {
        // Descartar pings acidentais em overlays (exceto janela pós-startLevel)
        // Mantém fila se markLevelStart acabou de rodar
      } else {
        // janela pós-start: se ainda houver ping e já estamos prestes a play, ok
      }
      // Fora de play: não consumir ping (evita “primeiro ping sem reveal” após Reiniciar)
    }

    // camera lag — jogador “deriva” alguns px ao andar (movimento óbvio)
    const follow = state === 'play' || state === 'pause' || state === 'death' || state === 'win';
    if (follow && level) {
      const lerp = Math.min(1, 12 * dt); // follow apertado — mira previsível
      cam.x += (player.x - cam.x) * lerp;
      cam.y += (player.y - cam.y) * lerp;
    }

    updateParticles(dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 1.8);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.4);
  }

  function visibility(tx, ty) {
    // ambient próximo ao jogador (mais forte — movimento legível no escuro)
    const d = Math.hypot(tx + 0.5 - player.x, ty + 0.5 - player.y);
    let v = memory[ty] ? memory[ty][tx] : 0;
    if (d < 1.85) v = Math.max(v, 0.38 * (1 - d / 1.85));
    if (d < 0.85) v = Math.max(v, 0.55 * (1 - d / 0.85));
    // active ping boost ring
    for (const p of pings) {
      const pd = Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y);
      const waveR = p.maxR * easeOutCubic(Math.min(1, p.t / (p.life * 0.55)));
      const band = Math.abs(pd - waveR);
      if (band < 0.4 && pd < p.maxR) v = Math.max(v, 1.0);
      if (pd < waveR) {
        const fall = 1 - pd / p.maxR;
        const u = p.t / p.life;
        v = Math.max(v, fall * (0.95 - u * 0.35));
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
          // fill + cyan outline (alto contraste vs preto)
          ctx.fillStyle = `rgba(28, 58, 68, ${Math.min(1, a * 0.88)})`;
          ctx.fillRect(s.x, s.y, TILE + 0.5, TILE + 0.5);
          ctx.strokeStyle = `rgba(120, 245, 235, ${Math.min(1, a * 1.0)})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(s.x + 1, s.y + 1, TILE - 2, TILE - 2);
        } else if (t === 'pit') {
          ctx.fillStyle = `rgba(70, 12, 20, ${Math.min(1, a * 0.95)})`;
          ctx.fillRect(s.x + 3, s.y + 3, TILE - 6, TILE - 6);
          ctx.strokeStyle = `rgba(255, 90, 110, ${Math.min(1, a)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          const cx = s.x + TILE / 2, cy = s.y + TILE / 2;
          for (let i = 0; i < 3; i++) {
            const ang = -Math.PI / 2 + i * (Math.PI * 2 / 3);
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(ang) * 11, cy + Math.sin(ang) * 11);
          }
          ctx.stroke();
        } else if (t === 'exit') {
          const g = ctx.createRadialGradient(
            s.x + TILE / 2, s.y + TILE / 2, 2,
            s.x + TILE / 2, s.y + TILE / 2, TILE * 0.85
          );
          g.addColorStop(0, `rgba(255, 220, 140, ${Math.min(1, a)})`);
          g.addColorStop(0.55, `rgba(240, 160, 96, ${a * 0.55})`);
          g.addColorStop(1, `rgba(240, 160, 96, 0)`);
          ctx.fillStyle = g;
          ctx.fillRect(s.x - 10, s.y - 10, TILE + 20, TILE + 20);
          ctx.strokeStyle = `rgba(255, 200, 120, ${Math.min(1, a)})`;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(s.x + 5, s.y + 5, TILE - 10, TILE - 10);
        } else {
          // floor mais legível
          ctx.fillStyle = `rgba(36, 52, 62, ${a * 0.42})`;
          ctx.fillRect(s.x, s.y, TILE, TILE);
          ctx.strokeStyle = `rgba(64, 120, 130, ${a * 0.25})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(s.x + 0.5, s.y + 0.5, TILE - 1, TILE - 1);
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
      ctx.fillStyle = 'rgba(200, 230, 230, 0.38)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(210, 255, 250, 0.85)';
      ctx.lineWidth = 2;
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
