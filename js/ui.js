import { EcoAudio } from './audio.js?v=202610012323';
/* ECO — telas PT-BR + tip + polish juice / escape cue */
export const EcoUI = (() => {
  const $ = (id) => document.getElementById(id);

  let hintActive = false;
  let hintLeaveTimer = null;
  let escapeCueOn = false;
  let floatTimer = null;

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
    if (!on) {
      dismissHint(true);
      hideEscapeCue();
    }
  }

  function updateHud(phase, crystals, total) {
    $('hud-phase').textContent = `Fase ${phase}`;
    $('hud-crystals').textContent = `✦ ${crystals}/${total}`;
    /* Map-progress: fill cue when enough crystals for a clear escape goal. */
    if (total > 0 && crystals >= total) showEscapeCue();
    else hideEscapeCue();
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
    hideEscapeCue();
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

  function showEscapeCue() {
    const el = $('escape-cue');
    if (!el) return;
    el.classList.remove('hidden');
    escapeCueOn = true;
  }

  function hideEscapeCue() {
    const el = $('escape-cue');
    if (el) el.classList.add('hidden');
    escapeCueOn = false;
  }

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

  /** Crystal pickup juice — flash/pop gated by reduced-motion. */
  function juiceCrystal() {
    const hud = $('hud-crystals');
    if (reduceMotionOn()) {
      /* Static feedback only: brief opacity bump, no motion. */
      if (hud) {
        hud.style.opacity = '1';
        hud.style.color = '#e8fffb';
        setTimeout(() => { hud.style.color = ''; }, 320);
      }
      const flash = $('pickup-flash');
      if (flash) {
        flash.style.opacity = '0.35';
        setTimeout(() => { flash.style.opacity = '0'; }, 200);
      }
      return;
    }
    _pulse(hud, 'juice-pop-strong');
    const flash = $('pickup-flash');
    if (flash) {
      flash.classList.remove('is-on');
      void flash.offsetWidth;
      flash.classList.add('is-on');
      const done = () => {
        flash.classList.remove('is-on');
        flash.removeEventListener('animationend', done);
      };
      flash.addEventListener('animationend', done);
    }
    const flo = $('pickup-float');
    if (flo) {
      if (floatTimer) clearTimeout(floatTimer);
      flo.classList.remove('hidden', 'is-pop');
      void flo.offsetWidth;
      flo.classList.add('is-pop');
      floatTimer = setTimeout(() => {
        flo.classList.add('hidden');
        flo.classList.remove('is-pop');
        floatTimer = null;
      }, 720);
    }
  }

  return {
    show, hideAllOverlays, setPlaying, updateHud, updateMuteButtons, showWin,
    tipSeen, markTip, showOnboardingHint, dismissHint, isHintActive,
    juicePing, juiceCrystal, showEscapeCue, hideEscapeCue, $,
  };
})();
