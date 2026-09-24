/* ECO — motor (tile gameplay + Three.js visuals) */
import { EcoLevels } from './levels.js?v=202609241415';
import { EcoInput } from './input.js?v=202609241415';
import { EcoAudio } from './audio.js?v=202609241415';
import { EcoUI } from './ui.js?v=202609241415';
import { EcoRender3D } from './render3d.js?v=202609241415';

export const EcoGame = (() => {
  const PLAYER_R = 0.24;
  const SPEED = 2.95; // tiles/s — precisão de corredor
  const PING_DURATION = 1.0;
  const PING_RADIUS = 7.5; // tiles
  const MEMORY_FADE = 4.2; // segundos após ping local

  let state = 'menu'; // menu | tip | play | pause | death | win
  let levelIndex = 0;
  let level = null;
  let player = { x: 1.5, y: 1.5 };
  let crystalsGot = 0;
  let pings = []; // {x,y,t,maxR,life}
  let memory = []; // 2d alpha 0..1
  let lastTs = 0;
  let stepAcc = 0;
  let reduceMotion = false;
  let onWin = null;
  let onDeath = null;
  let webglOk = false;

  function refreshFxFlags() {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function init(c, hooks) {
    onWin = hooks.onWin;
    onDeath = hooks.onDeath;
    refreshFxFlags();
    try {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', refreshFxFlags);
    } catch (_) {}

    webglOk = EcoRender3D.init(c);
    if (!webglOk) {
      EcoRender3D.showWebglError();
      return;
    }
    EcoInput.bind(c);
  }

  function startLevel(idx) {
    if (!webglOk) return;
    levelIndex = idx;
    level = EcoLevels.parse(idx);
    player.x = level.start.x;
    player.y = level.start.y;
    crystalsGot = 0;
    pings = [];
    memory = [];
    for (let y = 0; y < level.h; y++) {
      memory[y] = [];
      for (let x = 0; x < level.w; x++) memory[y][x] = 0;
    }
    EcoRender3D.buildLevel(level);
    EcoRender3D.syncPlayer(player.x, player.y);
    state = 'play';
    if (EcoInput.markLevelStart) EcoInput.markLevelStart();
    EcoUI.hideAllOverlays();
    EcoUI.setPlaying(true);
    EcoUI.updateHud(levelIndex + 1, crystalsGot, level.totalCrystals);
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
    if (!reduceMotion) EcoRender3D.setShake(0.12);
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
    const rate = 5.5 * dt;
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
    for (let i = 0; i < level.crystals.length; i++) {
      const c = level.crystals[i];
      if (c.taken) continue;
      if (Math.hypot(c.x - player.x, c.y - player.y) < 0.45) {
        c.taken = true;
        crystalsGot++;
        EcoAudio.collect();
        EcoUI.updateHud(levelIndex + 1, crystalsGot, level.totalCrystals);
        EcoRender3D.setCrystalTaken(i);
        EcoRender3D.spawnSparkle(c.x, c.y, '#40e0d0');
      }
    }
    const t = tileAt(player.x, player.y);
    if (t === 'pit') {
      die();
      return;
    }
    if (Math.hypot(level.exit.x - player.x, level.exit.y - player.y) < 0.55) {
      winLevel();
    }
  }

  function die() {
    if (state !== 'play') return;
    state = 'death';
    EcoAudio.death();
    EcoRender3D.setFlash(0.55);
    if (!reduceMotion) EcoRender3D.setShake(0.55);
    EcoUI.setPlaying(false);
    EcoUI.show('screen-death');
    if (onDeath) onDeath();
  }

  function winLevel() {
    if (state !== 'play') return;
    state = 'win';
    EcoAudio.win();
    EcoRender3D.spawnSparkle(level.exit.x, level.exit.y, '#f0a060');
    EcoRender3D.spawnSparkle(player.x, player.y, '#40e0d0');
    const isLast = levelIndex >= EcoLevels.count - 1;
    EcoUI.showWin(levelIndex + 1, crystalsGot, level.totalCrystals, isLast);
    if (onWin) onWin(levelIndex, crystalsGot, level.totalCrystals, isLast);
  }

  function update(dt) {
    if (!webglOk) return;

    if (state === 'play') {
      if (EcoInput.consumePause()) {
        state = 'pause';
        EcoUI.show('screen-pause');
        EcoUI.setPlaying(true);
      } else {
        if (EcoInput.consumePing()) doPing();
        movePlayer(dt);
        updateReveal(dt);
        checkPickups();
      }
    } else {
      EcoInput.consumePause();
    }

    const follow = state === 'play' || state === 'pause' || state === 'death' || state === 'win';
    EcoRender3D.syncPlayer(player.x, player.y);
    EcoRender3D.followCam(player.x, player.y, dt, follow && !!level);
    if (level) {
      EcoRender3D.updateVisuals(dt, memory, pings, player, level);
    }
  }

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    if (webglOk) EcoRender3D.render();
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
    get webglOk() { return webglOk; },
  };
})();
