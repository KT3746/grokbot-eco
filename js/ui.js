import { EcoAudio } from './audio.js?v=202609290141';
/* ECO — telas PT-BR + first-minute tip */
export const EcoUI = (() => {
  const $ = (id) => document.getElementById(id);

  let hintActive = false;
  let hintLeaveTimer = null;

  function show(id) {
    ['screen-menu','screen-tip','screen-pause','screen-death','screen-win'].forEach((s) => {
      const el = $(s);
      if (!el) return;
      el.classList.toggle('hidden', s !== id);
    });
  }

  function hideAllOverlays() {
    ['screen-menu','screen-tip','screen-pause','screen-death','screen-win'].forEach((s) => {
      const el = $(s);
      if (el) el.classList.add('hidden');
    });
  }

  function setPlaying(on) {
    const hud = $('hud');
    const touch = $('touch');
    if (hud) hud.classList.toggle('hidden', !on);
    if (touch) {
      touch.classList.toggle('hidden', !on);
      touch.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    if (!on) dismissHint(true);
  }

  function updateHud(phase, crystals, total) {
    $('hud-phase').textContent = `Fase ${phase}`;
    $('hud-crystals').textContent = `✦ ${crystals}/${total}`;
  }

  function updateMuteButtons() {
    const m = EcoAudio.isMuted();
    const label = m ? 'Mudo: on' : 'Mudo: off';
    const icon = m ? '🔇' : '🔊';
    const bm = $('btn-mute');
    const bmm = $('btn-mute-menu');
    if (bm) { bm.textContent = icon; bm.setAttribute('aria-label', m ? 'Ativar som' : 'Mudo'); }
    if (bmm) bmm.textContent = label;
  }

  function showWin(phase, crystals, total, isLast) {
    $('win-title').textContent = isLast ? 'Caverna conquistada!' : `Fase ${phase} concluída!`;
    $('win-score').textContent = `Cristais: ${crystals}/${total}` + (isLast ? ' · Fim de jogo' : '');
    $('btn-next').textContent = isLast ? 'Jogar de novo' : 'Próxima fase';
    show('screen-win');
    setPlaying(false);
  }

  function tipSeen() {
    try { return localStorage.getItem('eco-tip') === '1'; } catch (_) { return false; }
  }
  function markTip() {
    try { localStorage.setItem('eco-tip', '1'); } catch (_) {}
  }

  function wantsTouchHint() {
    try {
      return !!(
        window.matchMedia('(pointer: coarse)').matches ||
        window.matchMedia('(max-width: 720px)').matches
      );
    } catch (_) {
      return true;
    }
  }

  /** First-minute: como o eco funciona. */
  function hintCopy() {
    return wantsTouchHint()
      ? 'PING revela a caverna · ande pela memória'
      : 'Espaço = PING · ande pela memória do eco';
  }

  function showOnboardingHint() {
    const bar = $('hint-bar');
    if (!bar) return;
    if (hintLeaveTimer) {
      clearTimeout(hintLeaveTimer);
      hintLeaveTimer = null;
    }
    bar.textContent = hintCopy();
    bar.classList.remove('is-leaving', 'hidden');
    hintActive = true;
  }

  function dismissHint(immediate) {
    const bar = $('hint-bar');
    if (!hintActive && (!bar || bar.classList.contains('hidden'))) {
      hintActive = false;
      return;
    }
    hintActive = false;
    if (!bar) return;
    if (hintLeaveTimer) {
      clearTimeout(hintLeaveTimer);
      hintLeaveTimer = null;
    }
    if (immediate) {
      bar.classList.add('hidden');
      bar.classList.remove('is-leaving');
      return;
    }
    bar.classList.add('is-leaving');
    hintLeaveTimer = setTimeout(() => {
      bar.classList.add('hidden');
      bar.classList.remove('is-leaving');
      hintLeaveTimer = null;
    }, 280);
  }

  function isHintActive() { return hintActive; }

  function reduceMotionOn() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  function _pulse(el, cls) {
    if (!el || reduceMotionOn()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    const done = () => {
      el.classList.remove(cls);
      el.removeEventListener('animationend', done);
    };
    el.addEventListener('animationend', done);
  }

  /** Light juice: PING button ripple (DOM). */
  function juicePing() {
    _pulse($('btn-ping'), 'juice-pulse');
  }

  /** Light juice: crystal HUD pop. */
  function juiceCrystal() {
    _pulse($('hud-crystals'), 'juice-pop');
  }

  return {
    show, hideAllOverlays, setPlaying, updateHud, updateMuteButtons, showWin,
    tipSeen, markTip, showOnboardingHint, dismissHint, isHintActive,
    juicePing, juiceCrystal, $,
  };
})();
