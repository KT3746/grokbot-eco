/* ECO — bootstrap */
(function () {
  const canvas = document.getElementById('game');

  EcoGame.init(canvas, {
    onWin() {},
    onDeath() {},
  });
  EcoGame.startLoop();
  EcoUI.updateMuteButtons();

  function beginPlay() {
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
    EcoUI.show('screen-pause');
  });

  function toggleMute() {
    EcoAudio.ensure();
    EcoAudio.setMuted(!EcoAudio.isMuted());
    EcoUI.updateMuteButtons();
    EcoAudio.ui();
  }
  EcoUI.$('btn-mute').addEventListener('click', toggleMute);
  EcoUI.$('btn-mute-menu').addEventListener('click', toggleMute);

  // First paint: title screen ambient dark already via canvas
  EcoUI.show('screen-menu');
  EcoUI.setPlaying(false);
})();
