import { EcoAudio } from './audio.js?v=202610020205';
/* ECO — telas PT-BR + tip + polish + meta diária + HUD cristais */
export const EcoUI = (() => {
  const $ = (id) => document.getElementById(id);
  const META_KEY = 'eco-daily-meta-v1';

  let hintActive = false;
  let hintLeaveTimer = null;
  let escapeCueOn = false;
  let floatTimer = null;

  function brtDayKey() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch (_) {
      const d = new Date(Date.now() - 3 * 3600 * 1000);
      return d.toISOString().slice(0, 10);
    }
  }

  function loadDailyMeta() {
    const day = brtDayKey();
    try {
      const raw = localStorage.getItem(META_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.day === day) {
          return {
            day,
            bestCrystals: Math.max(0, o.bestCrystals | 0),
            escapes: Math.max(0, o.escapes | 0),
          };
        }
      }
    } catch (_) { /* ok */ }
    return { day, bestCrystals: 0, escapes: 0 };
  }

  function saveDailyMeta(meta) {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (_) { /* ok */ }
  }

  /** Soft daily best — cristais (melhor saída) + contagem de escapes. */
  function recordEscape(crystals) {
    const meta = loadDailyMeta();
    meta.escapes += 1;
    meta.bestCrystals = Math.max(meta.bestCrystals, crystals | 0);
    saveDailyMeta(meta);
    refreshDailyMeta();
    return meta;
  }

  function formatDailyMeta(meta) {
    if (!meta.escapes && !meta.bestCrystals) {
      return 'Hoje · ainda sem recordes';
    }
    return `Hoje · melhor ✦ ${meta.bestCrystals} · saídas ${meta.escapes}`;
  }

  function refreshDailyMeta() {
    const meta = loadDailyMeta();
    const text = formatDailyMeta(meta);
    const menu = $('daily-meta');
    const win = $('daily-meta-win');
    if (menu) menu.textContent = text;
    if (win) win.textContent = text;
  }

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
      setDangerNear(false);
    }
  }

  function updateHud(phase, crystals, total) {
    const phaseEl = $('hud-phase');
    if (phaseEl) phaseEl.textContent = `Fase ${phase}`;
    const label = $('hud-crystals');
    if (label) label.textContent = `✦ ${crystals}/${total}`;
    const fill = $('hud-crystal-fill');
    if (fill) {
      const pct = total > 0 ? Math.min(100, Math.round((crystals / total) * 100)) : 0;
      fill.style.width = pct + '%';
      fill.setAttribute('aria-valuenow', String(pct));
    }
    const chip = $('hud-crystal-chip');
    if (chip) {
      chip.classList.toggle('is-complete', total > 0 && crystals >= total);
    }
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
    recordEscape(crystals);
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

  function setDangerNear(on) {
    const edge = $('danger-edge');
    if (!edge) return;
    if (on) {
      edge.classList.add('is-on');
      edge.classList.toggle('is-static', reduceMotionOn());
    } else {
      edge.classList.remove('is-on', 'is-static');
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

  function juicePing() {
    _pulse($('btn-ping'), 'juice-pulse');
  }

  function juiceCrystal() {
    const hud = $('hud-crystals');
    const chip = $('hud-crystal-chip');
    if (reduceMotionOn()) {
      if (hud) {
        hud.style.opacity = '1';
        hud.style.color = '#e8fffb';
        setTimeout(() => { hud.style.color = ''; }, 320);
      }
      if (chip) chip.classList.add('is-flash');
      setTimeout(() => { if (chip) chip.classList.remove('is-flash'); }, 280);
      const flash = $('pickup-flash');
      if (flash) {
        flash.style.opacity = '0.35';
        setTimeout(() => { flash.style.opacity = '0'; }, 200);
      }
      return;
    }
    _pulse(hud, 'juice-pop-strong');
    if (chip) {
      chip.classList.remove('is-pop');
      void chip.offsetWidth;
      chip.classList.add('is-pop');
      const done = () => {
        chip.classList.remove('is-pop');
        chip.removeEventListener('animationend', done);
      };
      chip.addEventListener('animationend', done);
    }
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

  refreshDailyMeta();

  return {
    show, hideAllOverlays, setPlaying, updateHud, updateMuteButtons, showWin,
    tipSeen, markTip, showOnboardingHint, dismissHint, isHintActive,
    juicePing, juiceCrystal, showEscapeCue, hideEscapeCue,
    refreshDailyMeta, recordEscape, setDangerNear, $,
  };
})();
