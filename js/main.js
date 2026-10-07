/* ECO - bootstrap (ES module) */
import { EcoAudio } from './audio.js?v=202610070445';
import { EcoLevels } from './levels.js?v=202610070445';
import { EcoUI } from './ui.js?v=202610070445';
import { EcoGame } from './game.js?v=202610070445';
import { EcoInput } from './input.js?v=202610070445';

const canvas = document.getElementById('game');

EcoGame.init(canvas, {
  onWin() {},
  onDeath() {},
});
EcoGame.startLoop();
EcoUI.updateMuteButtons();


function fillPauseStats() {
  try {
    EcoUI.showPauseStats(
      EcoGame.crystalsGot,
      EcoGame.totalCrystals,
      EcoGame.levelTime,
      EcoGame.pingCount
    );
  } catch (_) { /* ok */ }
}

function beginPlay() {
  if (!EcoGame.webglOk) return;
  EcoAudio.ensure();
  EcoAudio.ui();
  if (!EcoUI.tipSeen()) {
    EcoUI.show('screen-tip');
    return;
  }
  EcoGame.startLevel(0);
}

EcoUI.$('btn-play').addEventListener('click', beginPlay);

EcoUI.$('btn-tip-ok').addEventListener('click', () => {
  EcoUI.markTip();
  EcoAudio.ui();
  EcoGame.startLevel(0);
});

EcoUI.$('btn-resume').addEventListener('click', () => {
  EcoAudio.ui();
  try { EcoAudio.resume(); } catch (_) { /* ok */ }
  EcoGame.setState('play');
  EcoUI.hideAllOverlays();
  EcoUI.setPlaying(true);
});

EcoUI.$('btn-restart').addEventListener('click', () => {
  EcoAudio.ui();
  EcoGame.startLevel(EcoGame.getLevelIndex());
});

EcoUI.$('btn-retry').addEventListener('click', () => {
  EcoAudio.ui();
  EcoGame.startLevel(EcoGame.getLevelIndex());
});

function goMenu() {
  EcoAudio.ui();
  EcoGame.setState('menu');
  EcoUI.setPlaying(false);
  EcoUI.refreshDailyMeta();
  EcoUI.show('screen-menu');
}

EcoUI.$('btn-menu').addEventListener('click', goMenu);
EcoUI.$('btn-death-menu').addEventListener('click', goMenu);
EcoUI.$('btn-win-menu').addEventListener('click', goMenu);

EcoUI.$('btn-next').addEventListener('click', () => {
  EcoAudio.ui();
  const idx = EcoGame.getLevelIndex();
  const isLast = idx >= EcoLevels.count - 1;
  EcoGame.startLevel(isLast ? 0 : idx + 1);
});

EcoUI.$('btn-pause').addEventListener('click', () => {
  if (EcoGame.getState() !== 'play') return;
  EcoAudio.ui();
  EcoGame.setState('pause');
  fillPauseStats();
  EcoUI.show('screen-pause');
  try { EcoAudio.suspend(); } catch (_) { /* ok */ }
  try { EcoInput.releaseAllDirs(); } catch (_) { /* ok */ }
});

function toggleMute() {
  EcoAudio.ensure();
  EcoAudio.setMuted(!EcoAudio.isMuted());
  EcoUI.updateMuteButtons();
  EcoAudio.ui();
}
EcoUI.$('btn-mute').addEventListener('click', toggleMute);
EcoUI.$('btn-mute-menu').addEventListener('click', toggleMute);

EcoUI.refreshDailyMeta();
EcoUI.show('screen-menu');
EcoUI.setPlaying(false);

/* Aba/app oculta mid-jogo: pausa + suspende áudio (mesmo bar 1945/TETROK/MERCADINHO). */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    /* Continuar na pausa: áudio só volta com resume / Continuar. */
    return;
  }
  try { EcoAudio.suspend(); } catch (_) { /* ok */ }
  if (EcoGame.getState() === 'play') {
    EcoGame.setState('pause');
    fillPauseStats();
    EcoUI.show('screen-pause');
    try { EcoInput.releaseAllDirs(); } catch (_) { /* ok */ }
  }
});
