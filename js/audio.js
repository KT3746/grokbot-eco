/* ECO — Web Audio API synths */
export const EcoAudio = (() => {
  let ctx = null;
  let muted = false;
  let master = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('eco-mute', muted ? '1' : '0'); } catch (_) {}
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.02);
  }

  function isMuted() {
    return muted;
  }

  function loadMute() {
    try { muted = localStorage.getItem('eco-mute') === '1'; } catch (_) {}
  }

  function tone(freq, dur, type, gain, slideTo) {
    const c = ensure();
    if (!c || !master) return;
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, gain) {
    const c = ensure();
    if (!c || !master) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    g.gain.value = gain || 0.15;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  function ping() {
    tone(520, 0.55, 'sine', 0.22, 180);
    setTimeout(() => tone(780, 0.35, 'triangle', 0.08, 220), 40);
  }

  function collect() {
    tone(660, 0.12, 'triangle', 0.18);
    setTimeout(() => tone(990, 0.18, 'sine', 0.16), 70);
  }

  function death() {
    tone(220, 0.5, 'sawtooth', 0.18, 60);
    noiseBurst(0.35, 0.12);
  }

  function win() {
    tone(440, 0.15, 'sine', 0.16);
    setTimeout(() => tone(554, 0.15, 'sine', 0.16), 120);
    setTimeout(() => tone(659, 0.28, 'sine', 0.2), 240);
  }

  function footstep() {
    noiseBurst(0.05, 0.045);
  }

  function ui() {
    tone(400, 0.06, 'square', 0.06);
  }

  loadMute();

  return { ensure, setMuted, isMuted, ping, collect, death, win, footstep, ui };
})();
