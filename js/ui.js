import { EcoAudio } from './audio.js?v=202609241415';
/* ECO — telas PT-BR */
export const EcoUI = (() => {
  const $ = (id) => document.getElementById(id);

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
    const hint = $('hint-bar');
    const touch = $('touch');
    if (hud) hud.classList.toggle('hidden', !on);
    if (hint) hint.classList.toggle('hidden', !on);
    if (touch) {
      touch.classList.toggle('hidden', !on);
      touch.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
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

  return {
    show, hideAllOverlays, setPlaying, updateHud, updateMuteButtons, showWin, tipSeen, markTip, $,
  };
})();
