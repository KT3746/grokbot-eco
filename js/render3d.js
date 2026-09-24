/* ECO — Three.js cave renderer (mobile-first, few draw calls) */
import * as THREE from 'three';

export const EcoRender3D = (() => {
  const WALL_H = 1.55;
  const FLOOR_Y = 0;
  const CAM_H = 9.5;
  const CAM_ANGLE = 38; // degrees pitch from top
  const TEAL = 0x40e0d0;
  const FOG = 0x010204;

  let canvas, renderer, scene, camera;
  let ok = false;
  let lowFx = false;
  let reduceMotion = false;
  let levelRoot = null;
  let wallMesh = null; // InstancedMesh
  let wallCount = 0;
  let wallTiles = []; // {tx,ty,i}
  let floorMesh = null;
  let pitMeshes = [];
  let crystalMeshes = [];
  let exitGroup = null;
  let exitLight = null;
  let playerRoot = null;
  let playerGlow = null;
  let pingLight = null;
  let ambient, hemi;
  let sparkles = [];
  let flashMesh = null;
  let shake = 0;
  let flash = 0;
  let cam = { x: 0, y: 0 };
  let _color = new THREE.Color();
  let _dummy = new THREE.Object3D();
  let _matColor = new THREE.Color();
  let levelW = 0, levelH = 0;
  let clock = 0;

  function refreshFx() {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const narrow = window.matchMedia('(max-width: 900px)').matches;
    lowFx = reduceMotion || coarse || narrow;
  }

  function init(c) {
    canvas = c;
    refreshFx();
    try {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', refreshFx);
      window.matchMedia('(pointer: coarse)').addEventListener('change', refreshFx);
    } catch (_) {}

    if (!THREE || !THREE.WebGLRenderer) return false;

    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(FOG);
      scene.fog = new THREE.FogExp2(FOG, lowFx ? 0.085 : 0.068);

      camera = new THREE.PerspectiveCamera(42, 1, 0.15, 80);

      const antialias = false;
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias,
        powerPreference: 'high-performance',
        alpha: false,
      });
      const dprCap = lowFx ? (window.matchMedia('(pointer: coarse)').matches ? 1 : 1.5) : 1.5;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      if (renderer.outputColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = false;

      ambient = new THREE.AmbientLight(0x0a1218, 0.12);
      scene.add(ambient);
      hemi = new THREE.HemisphereLight(0x1a3040, 0x020508, 0.22);
      scene.add(hemi);

      // Soft player-local fill (always-on faint)
      playerGlow = new THREE.PointLight(0x60e8d8, 0.55, 2.4, 2);
      scene.add(playerGlow);

      pingLight = new THREE.PointLight(0x70fff0, 0, 0.1, 1.6);
      scene.add(pingLight);

      // Player silhouette
      playerRoot = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xa8d8d4,
        emissive: 0x40e0d0,
        emissiveIntensity: 0.35,
        roughness: 0.55,
        metalness: 0.05,
      });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.28, 4, 8), bodyMat);
      body.position.y = 0.36;
      playerRoot.add(body);
      const glint = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xc8fff5 })
      );
      glint.position.set(-0.06, 0.48, -0.1);
      playerRoot.add(glint);
      scene.add(playerRoot);

      // Fullscreen flash quad (death)
      const flashGeo = new THREE.PlaneGeometry(2, 2);
      const flashMat = new THREE.MeshBasicMaterial({
        color: 0xb42832,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      });
      flashMesh = new THREE.Mesh(flashGeo, flashMat);
      flashMesh.frustumCulled = false;
      flashMesh.renderOrder = 999;
      flashMesh.visible = false;
      // screen-space overlay parented conceptually — we draw in camera space
      camera.add(flashMesh);
      flashMesh.position.set(0, 0, -0.5);
      scene.add(camera);

      ok = true;
      resize();
      window.addEventListener('resize', resize);
      return true;
    } catch (err) {
      console.error('ECO WebGL init failed', err);
      ok = false;
      return false;
    }
  }

  function isOk() { return ok; }

  function resize() {
    if (!renderer || !camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function disposeLevel() {
    if (!levelRoot) return;
    scene.remove(levelRoot);
    levelRoot.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    levelRoot = null;
    wallMesh = null;
    wallCount = 0;
    wallTiles = [];
    floorMesh = null;
    pitMeshes = [];
    crystalMeshes = [];
    exitGroup = null;
    exitLight = null;
    for (const s of sparkles) {
      scene.remove(s.mesh);
      if (s.mesh.geometry) s.mesh.geometry.dispose();
      if (s.mesh.material) s.mesh.material.dispose();
    }
    sparkles = [];
  }

  function buildLevel(level) {
    disposeLevel();
    levelW = level.w;
    levelH = level.h;
    levelRoot = new THREE.Group();
    scene.add(levelRoot);

    const wallPos = [];
    const floorPos = [];
    const pits = [];

    for (let ty = 0; ty < level.h; ty++) {
      for (let tx = 0; tx < level.w; tx++) {
        const t = level.tiles[ty][tx];
        if (t === 'wall') wallPos.push({ tx, ty });
        else if (t === 'pit') {
          floorPos.push({ tx, ty });
          pits.push({ tx, ty });
        } else {
          floorPos.push({ tx, ty });
        }
      }
    }

    // Merged floor (single mesh via merged boxes as thin slabs — use Plane chunks merged manually)
    {
      const geo = new THREE.BoxGeometry(1, 0.08, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x142028,
        roughness: 0.95,
        metalness: 0.0,
        emissive: 0x0a3038,
        emissiveIntensity: 0.05,
      });
      // Instanced floor for few draw calls + per-tile reveal tint
      const floor = new THREE.InstancedMesh(geo, mat, floorPos.length);
      floor.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (floor.instanceColor === null && THREE.InstancedMesh.prototype.setColorAt) {
        // ensure color buffer
      }
      const floorTiles = [];
      for (let i = 0; i < floorPos.length; i++) {
        const { tx, ty } = floorPos[i];
        _dummy.position.set(tx + 0.5, FLOOR_Y - 0.04, ty + 0.5);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        floor.setMatrixAt(i, _dummy.matrix);
        floor.setColorAt(i, _color.setRGB(0.08, 0.1, 0.12));
        floorTiles.push({ tx, ty, i });
      }
      floor.instanceMatrix.needsUpdate = true;
      if (floor.instanceColor) floor.instanceColor.needsUpdate = true;
      floor.userData.tiles = floorTiles;
      levelRoot.add(floor);
      floorMesh = floor;
    }

    // Walls — InstancedMesh
    {
      const geo = new THREE.BoxGeometry(1, WALL_H, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1c3a44,
        roughness: 0.88,
        metalness: 0.08,
        emissive: 0x184850,
        emissiveIntensity: 0.15,
      });
      wallCount = wallPos.length;
      wallMesh = new THREE.InstancedMesh(geo, mat, Math.max(1, wallCount));
      wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      wallTiles = [];
      for (let i = 0; i < wallCount; i++) {
        const { tx, ty } = wallPos[i];
        _dummy.position.set(tx + 0.5, WALL_H * 0.5, ty + 0.5);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        wallMesh.setMatrixAt(i, _dummy.matrix);
        wallMesh.setColorAt(i, _color.setRGB(0.02, 0.03, 0.04));
        wallTiles.push({ tx, ty, i });
      }
      wallMesh.instanceMatrix.needsUpdate = true;
      if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
      levelRoot.add(wallMesh);
    }

    // Pits — recessed red hazard
    {
      const geo = new THREE.BoxGeometry(0.92, 0.35, 0.92);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x3a0a12,
        emissive: 0x801028,
        emissiveIntensity: 0.25,
        roughness: 0.9,
      });
      for (const p of pits) {
        const m = new THREE.Mesh(geo, mat.clone());
        m.position.set(p.tx + 0.5, -0.12, p.ty + 0.5);
        m.userData.tx = p.tx;
        m.userData.ty = p.ty;
        m.userData.baseEmissive = 0.25;
        levelRoot.add(m);
        pitMeshes.push(m);
      }
    }

    // Crystals — low-poly gems
    crystalMeshes = [];
    for (let i = 0; i < level.crystals.length; i++) {
      const c = level.crystals[i];
      const g = new THREE.Group();
      const gemMat = new THREE.MeshStandardMaterial({
        color: 0x40e0d0,
        emissive: 0x40e0d0,
        emissiveIntensity: 0.85,
        roughness: 0.25,
        metalness: 0.35,
        transparent: true,
        opacity: 1,
      });
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), gemMat);
      gem.rotation.y = Math.PI / 4;
      g.add(gem);
      const light = new THREE.PointLight(0x40e0d0, 0.35, 2.2, 2);
      light.position.y = 0.2;
      g.add(light);
      g.position.set(c.x, 0.38, c.y);
      g.userData.crystalIndex = i;
      g.userData.gem = gem;
      g.userData.light = light;
      levelRoot.add(g);
      crystalMeshes.push(g);
    }

    // Exit — warm emissive gate
    {
      exitGroup = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: 0xf0a060,
        emissive: 0xffb060,
        emissiveIntensity: 0.9,
        roughness: 0.4,
        metalness: 0.2,
        transparent: true,
        opacity: 0.95,
      });
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.85), mat);
      pad.position.y = 0.08;
      exitGroup.add(pad);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.38, 0.05, 6, 12),
        mat.clone()
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.35;
      exitGroup.add(ring);
      exitLight = new THREE.PointLight(0xffb070, 1.1, 4.5, 1.8);
      exitLight.position.y = 0.6;
      exitGroup.add(exitLight);
      exitGroup.position.set(level.exit.x, 0, level.exit.y);
      exitGroup.userData.ring = ring;
      levelRoot.add(exitGroup);
    }

    cam.x = level.start.x;
    cam.y = level.start.y;
  }

  function setCrystalTaken(index) {
    const g = crystalMeshes[index];
    if (!g) return;
    g.visible = false;
    if (g.userData.light) g.userData.light.intensity = 0;
  }

  function spawnSparkle(x, y, colorHex) {
    if (reduceMotion) return;
    const n = lowFx ? 5 : 10;
    const col = new THREE.Color(colorHex || TEAL);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4), mat);
      mesh.position.set(x, 0.4, y);
      scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      const sp = 0.8 + Math.random() * 2;
      sparkles.push({
        mesh,
        vx: Math.cos(a) * sp,
        vy: 0.6 + Math.random() * 1.2,
        vz: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.4,
        max: 0.75,
      });
    }
  }

  function setShake(v) { shake = Math.max(shake, v); }
  function setFlash(v) { flash = Math.max(flash, v); }

  function syncPlayer(px, py) {
    if (!playerRoot) return;
    playerRoot.position.set(px, 0, py);
    if (playerGlow) playerGlow.position.set(px, 0.55, py);
  }

  function followCam(px, py, dt, follow) {
    if (follow) {
      const lerp = Math.min(1, 12 * dt);
      cam.x += (px - cam.x) * lerp;
      cam.y += (py - cam.y) * lerp;
    }
    const pitch = (CAM_ANGLE * Math.PI) / 180;
    const dist = CAM_H / Math.tan(pitch);
    // Camera sits "south" of player looking north-ish at slight angle
    let ox = 0, oy = 0;
    if (shake > 0 && !reduceMotion) {
      const amp = lowFx ? 0.08 : 0.18;
      ox = (Math.random() - 0.5) * shake * amp;
      oy = (Math.random() - 0.5) * shake * amp;
    }
    const cx = cam.x + ox;
    const cz = cam.y + dist * 0.42 + oy;
    const cy = CAM_H;
    camera.position.set(cx, cy, cz);
    camera.lookAt(cam.x, 0.2, cam.y);
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function visibilityAt(tx, ty, memory, pings, player) {
    const d = Math.hypot(tx + 0.5 - player.x, ty + 0.5 - player.y);
    let v = memory[ty] ? memory[ty][tx] : 0;
    if (d < 1.85) v = Math.max(v, 0.38 * (1 - d / 1.85));
    if (d < 0.85) v = Math.max(v, 0.55 * (1 - d / 0.85));
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

  function updateVisuals(dt, memory, pings, player, level) {
    clock += dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 1.8);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.4);

    // Ping light — expanding pulse
    if (pingLight) {
      let best = null;
      for (const p of pings) {
        if (!best || p.t < best.t) best = p;
      }
      // Prefer most recent / strongest
      let maxI = 0;
      let px = player.x, py = player.y, range = 0.1;
      for (const p of pings) {
        const u = p.t / p.life;
        const waveR = p.maxR * easeOutCubic(Math.min(1, p.t / (p.life * 0.55)));
        const intensity = (1 - u) * 2.8;
        if (intensity > maxI) {
          maxI = intensity;
          px = p.x;
          py = p.y;
          range = Math.max(1.2, waveR * 1.15);
        }
      }
      pingLight.position.set(px, 1.1, py);
      pingLight.intensity = maxI;
      pingLight.distance = range;
    }

    // Wall instance colors from visibility
    if (wallMesh && wallTiles.length) {
      for (const wt of wallTiles) {
        const v = visibilityAt(wt.tx, wt.ty, memory, pings, player);
        // near-black when dark; teal-lit when revealed
        const r = 0.02 + v * 0.22;
        const g = 0.03 + v * 0.45;
        const b = 0.04 + v * 0.48;
        wallMesh.setColorAt(wt.i, _color.setRGB(r, g, b));
      }
      if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
      // bump emissive globally with average — material shared
      if (wallMesh.material) {
        let peak = 0;
        for (const p of pings) peak = Math.max(peak, 1 - p.t / p.life);
        wallMesh.material.emissiveIntensity = 0.08 + peak * 0.55;
      }
    }

    if (floorMesh && floorMesh.userData.tiles) {
      for (const ft of floorMesh.userData.tiles) {
        const v = visibilityAt(ft.tx, ft.ty, memory, pings, player);
        const r = 0.03 + v * 0.12;
        const g = 0.04 + v * 0.18;
        const b = 0.05 + v * 0.2;
        floorMesh.setColorAt(ft.i, _color.setRGB(r, g, b));
      }
      if (floorMesh.instanceColor) floorMesh.instanceColor.needsUpdate = true;
    }

    for (const m of pitMeshes) {
      const v = visibilityAt(m.userData.tx, m.userData.ty, memory, pings, player);
      m.material.opacity = 1;
      m.material.emissiveIntensity = 0.08 + v * 0.7;
      m.visible = v > 0.04;
      if (v <= 0.04) {
        // keep faintly dangerous near player only handled by visibility
      }
    }

    // Crystals pulse when visible
    if (level) {
      for (let i = 0; i < crystalMeshes.length; i++) {
        const g = crystalMeshes[i];
        const c = level.crystals[i];
        if (!c || c.taken) {
          g.visible = false;
          continue;
        }
        const tx = Math.floor(c.x), ty = Math.floor(c.y);
        const v = visibilityAt(tx, ty, memory, pings, player);
        g.visible = v > 0.05;
        if (!g.visible) continue;
        const pulse = 0.7 + Math.sin(clock * 6 + c.x) * 0.3;
        g.userData.gem.scale.setScalar(pulse);
        g.userData.gem.material.emissiveIntensity = 0.5 + v * 0.7;
        g.userData.gem.material.opacity = Math.min(1, v * 1.15);
        if (g.userData.light) g.userData.light.intensity = 0.15 + v * 0.55 * pulse;
        g.rotation.y += dt * 1.2;
      }
    }

    if (exitGroup && level) {
      const tx = Math.floor(level.exit.x), ty = Math.floor(level.exit.y);
      const v = visibilityAt(tx, ty, memory, pings, player);
      // Exit always a bit warmer (readable goal) but still gated by reveal
      const show = Math.max(v, 0.12);
      exitGroup.visible = true;
      exitGroup.traverse((o) => {
        if (o.material && o.material.emissiveIntensity !== undefined) {
          o.material.emissiveIntensity = 0.25 + show * 0.9;
          if (o.material.opacity !== undefined) o.material.opacity = 0.35 + show * 0.65;
        }
      });
      if (exitLight) exitLight.intensity = 0.35 + show * 1.0;
      if (exitGroup.userData.ring && !reduceMotion) {
        exitGroup.userData.ring.rotation.z += dt * 1.5;
      }
    }

    // Sparkles
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.life -= dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.vy -= 2.5 * dt;
      s.mesh.material.opacity = Math.max(0, s.life / s.max);
      if (s.life <= 0) {
        scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        sparkles.splice(i, 1);
      }
    }

    if (flashMesh) {
      if (flash > 0) {
        flashMesh.visible = true;
        flashMesh.material.opacity = flash * 0.55;
      } else {
        flashMesh.visible = false;
        flashMesh.material.opacity = 0;
      }
    }
  }

  function render() {
    if (!ok || !renderer) return;
    renderer.render(scene, camera);
  }

  function showWebglError() {
    const panel = document.querySelector('#screen-menu .panel');
    if (!panel) return;
    const err = document.createElement('p');
    err.className = 'tagline';
    err.style.color = '#e05060';
    err.style.fontWeight = '700';
    err.textContent = 'Erro: WebGL indisponível. Atualize o navegador ou ative a aceleração gráfica.';
    const tag = panel.querySelector('.tagline');
    if (tag) tag.replaceWith(err); else panel.appendChild(err);
    const play = panel.querySelector('#btn-play');
    if (play) play.disabled = true;
  }

  return {
    init, isOk, resize, buildLevel, disposeLevel,
    syncPlayer, followCam, updateVisuals,
    setCrystalTaken, spawnSparkle, setShake, setFlash,
    render, showWebglError,
    get cam() { return cam; },
  };
})();
