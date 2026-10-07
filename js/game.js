/* ECO - motor (tile gameplay + Three.js visuals) */
import { EcoLevels } from './levels.js?v=202610070445';
import { EcoInput } from './input.js?v=202610070445';
import { EcoAudio } from './audio.js?v=202610070445';
import { EcoUI } from './ui.js?v=202610070445';
import { EcoRender3D } from './render3d.js?v=202610070445';

export const EcoGame = (() => {
  const PLAYER_R = 0.24;
  const SPEED = 2.95; // tiles/s - precisão de corredor
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
  let hintDismissed = false;
  let onWin = null;
  let onDeath = null;
  let webglOk = false;
  let nearHazard = false;
  let ambienceAcc = 0;
  /* wave3: tempo/PINGs da fase + bússola pós-PING */
  let levelTime = 0;
  let pingCount = 0;
  let compassT = 0;
  let hudTimeAcc = 0;
  const COMPASS_SHOW = 2.6;
  /* wave4: cooldown PING, rastro, bump, sussurro */
  const PING_COOLDOWN = 0.9;
  let pingCd = 0;
  let trailAcc = 0;
  let lastTrailX = 0, lastTrailY = 0;
  let bumpCd = 0;
  let crystalNear = false;
  let whisperAcc = 0;
  /* wave5: PING carregado, saída perto, combo, chip PING */
  const PING_COOLDOWN_CHARGED = 1.55;
  const PING_RADIUS_CHARGED = 11.2;
  const COMBO_WINDOW = 7.5;
  let exitNear = false;
  let exitHumAcc = 0;
  let comboCount = 0;
  let comboTimer = 0;
  let activePingCdMax = PING_COOLDOWN;

  function buzz(pattern) {
    try {
      if (reduceMotion) return;
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (_) {}
  }

  function compassTarget() {
    if (!level) return null;
    if (crystalsGot >= level.totalCrystals) return { x: level.exit.x, y: level.exit.y, kind: 'exit' };
    let best = null, bd = Infinity;
    for (const c of level.crystals) {
      if (c.taken) continue;
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best ? { x: best.x, y: best.y, kind: 'crystal' } : null;
  }

  function updateCompass(dt) {
    if (compassT > 0) compassT = Math.max(0, compassT - dt);
    const exitMode = level && crystalsGot >= level.totalCrystals;
    const tgt = compassTarget();
    if (!tgt || (compassT <= 0 && !exitMode)) { EcoUI.updateCompass(null); return; }
    const d = Math.hypot(tgt.x - player.x, tgt.y - player.y);
    if (d < 1.1) { EcoUI.updateCompass(null); return; }
    const ps = EcoRender3D.projectToScreen(player.x, player.y);
    const ts = EcoRender3D.projectToScreen(tgt.x, tgt.y);
    if (!ps || !ts) { EcoUI.updateCompass(null); return; }
    const ang = Math.atan2(ts.y - ps.y, ts.x - ps.x);
    const fade = exitMode ? 1 : Math.min(1, compassT / 0.5);
    EcoUI.updateCompass({ x: ps.x, y: ps.y, ang, kind: tgt.kind, dist: Math.round(d), alpha: fade });
  }

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
    nearHazard = false;
    ambienceAcc = 0;
    levelTime = 0;
    pingCount = 0;
    compassT = 0;
    hudTimeAcc = 0;
    pingCd = 0;
    trailAcc = 0;
    bumpCd = 0;
    crystalNear = false;
    whisperAcc = 0;
    exitNear = false;
    exitHumAcc = 0;
    comboCount = 0;
    comboTimer = 0;
    activePingCdMax = PING_COOLDOWN;
    lastTrailX = level.start.x;
    lastTrailY = level.start.y;
    EcoUI.updateTime(0);
    EcoUI.updateCompass(null);
    EcoUI.updatePingCooldown(1);
    EcoUI.setCrystalNear(false);
    EcoUI.setExitNear(false);
    EcoUI.updatePingCount(0);
    EcoUI.setPingCharging(0);
    if (typeof EcoRender3D.clearTrail === 'function') EcoRender3D.clearTrail();
    pings = [];
    memory = [];
    EcoUI.setDangerNear(false);
    for (let y = 0; y < level.h; y++) {
      memory[y] = [];
      for (let x = 0; x < level.w; x++) memory[y][x] = 0;
    }
    EcoRender3D.buildLevel(level);
    EcoRender3D.setExitReady(false);
    EcoRender3D.syncPlayer(player.x, player.y);
    state = 'play';
    if (EcoInput.markLevelStart) EcoInput.markLevelStart();
    EcoUI.hideAllOverlays();
    EcoUI.setPlaying(true);
    EcoUI.updateHud(levelIndex + 1, crystalsGot, level.totalCrystals);
    hintDismissed = false;
    EcoUI.showOnboardingHint();
    EcoUI.showLevelIntro(levelIndex + 1, level.name, level.totalCrystals);
    const bootPing = EcoInput.consumePing();
    if (bootPing) doPing(bootPing);
  }

  function setState(s) { state = s; }
  function getState() { return state; }
  function getLevelIndex() { return levelIndex; }

  function noteFirstAction() {
    if (hintDismissed) return;
    hintDismissed = true;
    EcoUI.dismissHint(false);
  }

  function doPing(kind) {
    if (state !== 'play') return;
    if (pingCd > 0) return;
    const charged = kind === 'charged';
    noteFirstAction();
    EcoAudio.ensure();
    if (charged) EcoAudio.pingCharged();
    else EcoAudio.ping();
    pingCount++;
    EcoUI.updatePingCount(pingCount);
    activePingCdMax = charged ? PING_COOLDOWN_CHARGED : PING_COOLDOWN;
    pingCd = activePingCdMax;
    EcoUI.updatePingCooldown(0);
    EcoUI.setPingCharging(0);
    compassT = charged ? COMPASS_SHOW + 0.7 : COMPASS_SHOW;
    buzz(charged ? [14, 30, 22] : 8);
    const maxR = charged ? PING_RADIUS_CHARGED : PING_RADIUS;
    const life = charged ? PING_DURATION + 0.25 : PING_DURATION;
    pings.push({
      x: player.x,
      y: player.y,
      t: 0,
      life,
      maxR,
    });
    /* Light juice - respeita reduced-motion (shake/flash/DOM). */
    if (!reduceMotion) {
      EcoRender3D.setShake(charged ? 0.22 : 0.14);
      EcoRender3D.setFlash(charged ? 0.38 : 0.22, charged ? 0xf0a060 : 0x40e0d0);
      EcoRender3D.spawnEchoRing(player.x, player.y, charged
        ? { maxR: lowFxRing(10.5), colorHex: 0xf0a060, life: 0.95 }
        : undefined);
    } else if (charged) {
      EcoRender3D.setFlash(0.18, 0xf0a060);
    }
    EcoUI.juicePing(charged);
  }

  function lowFxRing(n) { return n; }

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
    noteFirstAction();
    const ox = player.x, oy = player.y;
    const wantX = m.x * SPEED * dt;
    const wantY = m.y * SPEED * dt;
    const moved = tryMoveDelta(wantX, wantY);
    corridorAssist(dt, m.x, m.y);

    /* wave4 wall bump - tried to move into solid */
    if (!moved && bumpCd <= 0) {
      const blocked =
        (wantX && collides(ox + wantX, oy)) ||
        (wantY && collides(ox, oy + wantY));
      if (blocked) {
        bumpCd = 0.28;
        EcoUI.flashWallBump();
        EcoAudio.wallBump(performance.now());
        buzz(12);
        if (!reduceMotion) EcoRender3D.setShake(0.06);
      }
    }

    /* wave4 footstep trail */
    const dist = Math.hypot(player.x - lastTrailX, player.y - lastTrailY);
    if (dist >= 0.42) {
      lastTrailX = player.x;
      lastTrailY = player.y;
      if (typeof EcoRender3D.spawnTrailDot === 'function') {
        EcoRender3D.spawnTrailDot(player.x, player.y);
      }
    }

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

  function nearestPitDist() {
    if (!level || !level.pits || !level.pits.length) {
      /* Derive from tiles if pits list absent. */
      let best = 99;
      for (let y = 0; y < level.h; y++) {
        for (let x = 0; x < level.w; x++) {
          if (level.tiles[y][x] !== 'pit') continue;
          const d = Math.hypot(x + 0.5 - player.x, y + 0.5 - player.y);
          if (d < best) best = d;
        }
      }
      return best;
    }
    let best = 99;
    for (const p of level.pits) {
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d < best) best = d;
    }
    return best;
  }


  function nearestCrystalDist() {
    if (!level) return 99;
    let best = 99;
    for (const c of level.crystals) {
      if (c.taken) continue;
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      if (d < best) best = d;
    }
    return best;
  }

  function updateCrystalWhisper(dt) {
    const dist = nearestCrystalDist();
    const near = dist < 1.85;
    if (near !== crystalNear) {
      crystalNear = near;
      EcoUI.setCrystalNear(near);
    }
    if (near) {
      whisperAcc += dt;
      if (whisperAcc >= 1.55) {
        whisperAcc = 0;
        EcoAudio.crystalWhisper(performance.now());
        buzz(6);
      }
    } else {
      whisperAcc = 0;
    }
  }

  function updateExitNear(dt) {
    if (!level || crystalsGot < level.totalCrystals) {
      if (exitNear) {
        exitNear = false;
        EcoUI.setExitNear(false);
      }
      exitHumAcc = 0;
      return;
    }
    const dist = Math.hypot(level.exit.x - player.x, level.exit.y - player.y);
    const near = dist < 2.2;
    if (near !== exitNear) {
      exitNear = near;
      EcoUI.setExitNear(near);
      if (near) buzz(10);
    }
    if (near) {
      exitHumAcc += dt;
      if (exitHumAcc >= 1.6) {
        exitHumAcc = 0;
        EcoAudio.exitHum(performance.now());
      }
    } else {
      exitHumAcc = 0;
    }
  }

  function updateHazardAmbience(dt) {
    const dist = nearestPitDist();
    const wasNear = nearHazard;
    nearHazard = dist < 1.45;
    if (nearHazard !== wasNear) {
      EcoUI.setDangerNear(nearHazard);
      if (typeof EcoRender3D.setHazardNear === 'function') {
        EcoRender3D.setHazardNear(nearHazard);
      }
    }
    if (nearHazard) {
      EcoAudio.dangerSting(performance.now());
    }
    ambienceAcc += dt;
    if (ambienceAcc > 4.0) {
      ambienceAcc = 0;
      EcoAudio.ambiencePulse(performance.now());
      if (typeof EcoRender3D.nudgeAmbience === 'function' && !reduceMotion) {
        EcoRender3D.nudgeAmbience();
      }
    }
  }

  function checkPickups() {
    for (let i = 0; i < level.crystals.length; i++) {
      const c = level.crystals[i];
      if (c.taken) continue;
      if (Math.hypot(c.x - player.x, c.y - player.y) < 0.45) {
        c.taken = true;
        crystalsGot++;
        if (comboTimer > 0) comboCount += 1;
        else comboCount = 1;
        comboTimer = COMBO_WINDOW;
        EcoAudio.collect();
        EcoUI.updateHud(levelIndex + 1, crystalsGot, level.totalCrystals);
        EcoRender3D.setCrystalTaken(i);
        EcoRender3D.spawnSparkle(c.x, c.y, '#40e0d0');
        /* Crystal pickup juice - flash/pop; reduced-motion skips shake/anim. */
        if (!reduceMotion) {
          EcoRender3D.setShake(0.12);
          EcoRender3D.setFlash(0.32, 0x7ff5e8);
          EcoRender3D.spawnSparkle(c.x, c.y, '#c8fff5');
        } else {
          EcoRender3D.setFlash(0.12, 0x7ff5e8);
        }
        EcoUI.juiceCrystal();
        buzz(18);
        if (comboCount >= 2) {
          EcoAudio.comboChirp(comboCount, performance.now());
          EcoUI.juiceCombo(comboCount);
          buzz([10, 40, 16]);
          if (!reduceMotion) {
            EcoRender3D.spawnSparkle(c.x, c.y, '#ffe0b8');
            EcoRender3D.setFlash(0.18, 0xf0a060);
          }
        }
        if (crystalsGot >= level.totalCrystals) {
          EcoRender3D.setExitReady(true);
          buzz([20, 50, 30]);
        }
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
    EcoRender3D.setFlash(0.55, 0xb42832);
    if (!reduceMotion) EcoRender3D.setShake(0.55);
    EcoUI.setPlaying(false);
    EcoUI.updateCompass(null);
    EcoUI.setCrystalNear(false);
    EcoUI.setExitNear(false);
    EcoUI.setPingCharging(0);
    EcoUI.updatePingCooldown(1);
    buzz([60, 40, 90]);
    EcoUI.showDeathStats(crystalsGot, level.totalCrystals, levelTime);
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
    EcoUI.updateCompass(null);
    EcoUI.setCrystalNear(false);
    EcoUI.setExitNear(false);
    EcoUI.setPingCharging(0);
    EcoUI.updatePingCooldown(1);
    buzz([25, 40, 25, 40, 60]);
    EcoUI.showWin(levelIndex + 1, crystalsGot, level.totalCrystals, isLast, {
      time: levelTime, pings: pingCount, levelIndex,
    });
    if (onWin) onWin(levelIndex, crystalsGot, level.totalCrystals, isLast);
  }

  function update(dt) {
    if (!webglOk) return;

    if (state === 'play') {
      if (EcoInput.consumePause()) {
        state = 'pause';
        try {
          EcoUI.showPauseStats(crystalsGot, level.totalCrystals, levelTime, pingCount);
        } catch (_) {}
        EcoUI.show('screen-pause');
        EcoUI.setPlaying(true);
      } else {
        levelTime += dt;
        if (comboTimer > 0) {
          comboTimer = Math.max(0, comboTimer - dt);
          if (comboTimer <= 0) comboCount = 0;
        }
        if (pingCd > 0) {
          pingCd = Math.max(0, pingCd - dt);
          EcoUI.updatePingCooldown(1 - pingCd / activePingCdMax);
          EcoUI.setPingCharging(0);
        } else {
          const holdR = EcoInput.pollPingHold();
          if (EcoInput.isPingHolding()) EcoUI.setPingCharging(holdR);
          else EcoUI.setPingCharging(0);
          const pingKind = EcoInput.consumePing();
          if (pingKind) doPing(pingKind);
        }
        if (bumpCd > 0) bumpCd = Math.max(0, bumpCd - dt);
        hudTimeAcc += dt;
        if (hudTimeAcc >= 0.25) { hudTimeAcc = 0; EcoUI.updateTime(levelTime); }
        movePlayer(dt);
        updateReveal(dt);
        updateHazardAmbience(dt);
        updateCrystalWhisper(dt);
        updateExitNear(dt);
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
    if (state === 'play' && level) updateCompass(dt);
  }

  function frame(ts) {
    /* Aba/app oculta: não simula nem renderiza (dt efetivo = 0). */
    if (document.hidden) {
      lastTs = ts;
      requestAnimationFrame(frame);
      return;
    }
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
    get levelTime() { return levelTime; },
    get pingCount() { return pingCount; },
    get webglOk() { return webglOk; },
  };
})();
