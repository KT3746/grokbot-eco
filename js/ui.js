import { EcoAudio } from './audio.js?v=202610052100';
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
      updateCompass(null);
      hideLevelIntro();
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

  /* ---- wave3: tempo, intro da fase, bússola, estrelas ---- */
  const BEST_KEY = 'eco-best-v1';
  let introTimer = null;

  function fmtTime(t) {
    const s = Math.max(0, Math.floor(t || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function updateTime(t) {
    const el = $('hud-time');
    if (el) el.textContent = fmtTime(t);
  }

  function hideLevelIntro() {
    const el = $('level-intro');
    if (introTimer) { clearTimeout(introTimer); introTimer = null; }
    if (el) el.classList.add('hidden');
  }

  function showLevelIntro(phase, name, total) {
    const el = $('level-intro');
    if (!el) return;
    $('intro-phase').textContent = `Fase ${phase}`;
    $('intro-name').textContent = name || '';
    $('intro-goal').textContent = total === 1
      ? 'Colete 1 ✦ e ache a saída'
      : `Colete ${total} ✦ e ache a saída`;
    el.classList.remove('hidden', 'is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    if (introTimer) clearTimeout(introTimer);
    introTimer = setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('is-on');
      introTimer = null;
    }, 2300);
  }

  function updateCompass(c) {
    const el = $('eco-compass');
    if (!el) return;
    if (!c) {
      if (!el.classList.contains('hidden')) el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const R = Math.min(96, Math.max(64, Math.min(window.innerWidth, window.innerHeight) * 0.16));
    const x = c.x + Math.cos(c.ang) * R;
    const y = c.y + Math.sin(c.ang) * R;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    el.style.opacity = String(c.alpha == null ? 1 : c.alpha);
    const arrow = el.firstElementChild;
    if (arrow) arrow.style.transform = `rotate(${c.ang.toFixed(3)}rad)`;
    el.classList.toggle('is-exit', c.kind === 'exit');
    const label = $('compass-label');
    if (label) label.textContent = c.kind === 'exit' ? `saída ${c.dist}m` : `✦ ${c.dist}m`;
  }

  function showDeathStats(crystals, total, time) {
    const el = $('death-stats');
    if (el) el.textContent = `✦ ${crystals}/${total} · ⏱ ${fmtTime(time)}`;
  }

  function loadBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch (_) { return {}; }
  }

  function starsFor(crystals, total, time, pings) {
    let s = 1;
    if (total > 0 && crystals >= total) s++;
    /* 3ª estrela: até ~6 PINGs por cristal+1 OU fase rápida */
    if (s === 2 && (pings <= total * 3 + 3 || time <= 45 + total * 10)) s++;
    return s;
  }

  function showWinStats(crystals, total, stats) {
    const stars = starsFor(crystals, total, stats.time, stats.pings);
    const wrap = $('win-stars');
    if (wrap) {
      wrap.setAttribute('aria-label', `${stars} de 3 estrelas`);
      [...wrap.children].forEach((st, i) => {
        st.classList.remove('is-on');
        st.style.animationDelay = (0.12 + i * 0.18) + 's';
        if (i < stars) {
          void st.offsetWidth;
          st.classList.add('is-on');
        }
      });
    }
    const line = $('win-stats');
    if (line) line.textContent = `⏱ ${fmtTime(stats.time)} · PING ${stats.pings}`;
    const best = loadBest();
    const k = 'L' + stats.levelIndex;
    const prev = best[k];
    const isRecord = !prev || stars > prev.stars || (stars === prev.stars && stats.time < prev.time);
    if (isRecord) {
      best[k] = { stars, time: Math.round(stats.time * 10) / 10 };
      try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (_) {}
    }
    const rec = $('win-record');
    if (rec) {
      rec.classList.remove('is-muted');
      if (!prev) {
        rec.classList.add('hidden');
      } else if (isRecord) {
        rec.textContent = 'Novo recorde da fase!';
        rec.classList.remove('hidden');
      } else {
        rec.textContent = `Recorde: ${'★'.repeat(prev.stars)} · ${fmtTime(prev.time)}`;
        rec.classList.add('is-muted');
        rec.classList.remove('hidden');
      }
    }
  }

  function showWin(phase, crystals, total, isLast, stats) {
    $('win-title').textContent = isLast ? 'Caverna conquistada!' : `Fase ${phase} concluída!`;
    $('win-score').textContent = `Cristais: ${crystals}/${total}` + (isLast ? ' · Fim de jogo' : '');
    if (stats) showWinStats(crystals, total, stats);
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
    updateTime, showLevelIntro, hideLevelIntro, updateCompass, showDeathStats,
  };
})();
