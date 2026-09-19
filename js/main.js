window.addEventListener("DOMContentLoaded", async () => {
  const bootStatus = document.getElementById("bootStatus");
  const setBootStatus = (message) => {
    if (bootStatus) bootStatus.textContent = message;
  };

  const updateFrameScale = () => {
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const scale = Math.min(viewportWidth / 1280, viewportHeight / 720);
    document.documentElement.style.setProperty("--screen-scale", Math.max(0.1, scale).toString());
  };
  updateFrameScale();
  window.addEventListener("resize", updateFrameScale);
  window.addEventListener("orientationchange", updateFrameScale);
  window.visualViewport?.addEventListener("resize", updateFrameScale);

  if (location.protocol === 'file:' && !window.SurvivorRPG.storyDataReady) {
    setBootStatus('직접 실행하려면 배포본 dist/index.html을 열어 주세요. 개발본은 게임실행.bat으로 실행합니다.');
    return;
  }

  try {
    const modeOverlay = document.getElementById('modeSelectOverlay');
    const resumeOverlay = document.getElementById('resumeSelectOverlay');
    const requestedMode = new URLSearchParams(location.search).get('mode');
    const chooseMode = () => {
      if (requestedMode === 'story' || requestedMode === 'battle') return Promise.resolve(requestedMode);
      setBootStatus('플레이할 모드를 선택하세요.');
      modeOverlay.hidden = false;
      return new Promise(resolve => {
        const select = mode => {
          modeOverlay.hidden = true;
          const url = new URL(location.href);
          url.searchParams.set('mode', mode);
          history.replaceState(null, '', url);
          resolve(mode);
        };
        document.getElementById('storyModeBtn').addEventListener('click', () => select('story'), {once: true});
        document.getElementById('battleModeBtn').addEventListener('click', () => select('battle'), {once: true});
      });
    };

    const chooseResumeAction = mode => {
      const store = window.SurvivorRPG.SaveStore.forMode(mode);
      const saved = store.read();
      if (!saved) return Promise.resolve('new');

      const modeName = mode === 'story' ? '스토리 모드' : '배틀 모드';
      document.getElementById('resumeSelectTitle').textContent = `${modeName} 저장 기록이 있습니다`;
      document.getElementById('resumeSelectMessage').textContent = '이전 진행을 불러오거나 처음부터 다시 시작할 수 있습니다.';
      resumeOverlay.hidden = false;
      setBootStatus('저장 기록을 선택하세요.');

      const loadButton = document.getElementById('resumeLoadBtn');
      const restartButton = document.getElementById('resumeRestartBtn');
      const buttons = [loadButton, restartButton];
      let selected = 0;
      const select = index => {
        selected = index;
        buttons.forEach((button, i) => button.classList.toggle('is-selected', i === selected));
        buttons[selected].focus({preventScroll: true});
      };

      return new Promise(resolve => {
        const finish = action => {
          resumeOverlay.hidden = true;
          document.removeEventListener('keydown', onKeyDown, true);
          buttons.forEach(button => button.classList.remove('is-selected'));
          resolve(action);
        };
        const onKeyDown = event => {
          const key = event.key.toLowerCase();
          if (['arrowup', 'arrowleft'].includes(key)) { event.preventDefault(); select(0); return; }
          if (['arrowdown', 'arrowright'].includes(key)) { event.preventDefault(); select(1); return; }
          if (key === 'z' || key === 'enter') { event.preventDefault(); finish(selected === 0 ? 'load' : 'restart'); return; }
          if (key === 'x' || key === 'escape') { event.preventDefault(); finish('restart'); }
        };
        loadButton.addEventListener('click', () => finish('load'), {once: true});
        restartButton.addEventListener('click', () => finish('restart'), {once: true});
        document.addEventListener('keydown', onKeyDown, true);
        select(0);
      });
    };

    const selectedMode = await chooseMode();
    const resumeAction = await chooseResumeAction(selectedMode);
    if (resumeAction === 'restart') {
      const store = window.SurvivorRPG.SaveStore.forMode(selectedMode);
      localStorage.removeItem(store.key);
      localStorage.removeItem(store.backup);
    }
    setBootStatus("게임 데이터를 불러오는 중...");
    const storyRequested = selectedMode === 'story';
    const GameClass = storyRequested ? window.SurvivorRPG.StoryGame : window.SurvivorRPG.Game;
    const game = new GameClass(document.getElementById("gameCanvas"));
    window.currentSurvivorRPG = game;
    await game.init();
    if(!storyRequested && resumeAction === 'load')game.loadGame();
    const suspend=()=>{
      game.suspended=document.hidden || !document.hasFocus();
      game.input.keys.clear();game.input.joystickVector={x:0,y:0};
      game.input.switchPressed=game.input.ballPressed=game.input.menuPressed=game.input.partyPressed=false;
      game.assets.pause(game.suspended);
      if(game.suspended && ['trainer','pokemon'].includes(game.mode))game.saveGame(true);
    };
    window.addEventListener('blur',suspend);window.addEventListener('focus',suspend);document.addEventListener('visibilitychange',suspend);
    game.canvas.addEventListener('pointerdown',event=>{
      if(game.mode!=='trainer'||game.menuOpen)return;
      const rect=game.canvas.getBoundingClientRect();
      const x=(event.clientX-rect.left)*1280/rect.width/game.worldZoom+game.camera.x;
      const y=(event.clientY-rect.top)*720/rect.height/game.worldZoom+game.camera.y;
      const targets=game.enemies.filter(e=>game.captureSystem.canAttempt(game.trainer,e)&&Math.hypot(e.x-x,e.y-y)<e.radius+16);
      targets.sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));
      if(targets[0])game.captureTarget=game.captureSystem.lockedTarget=targets[0];
    });
    document.getElementById("restartBtn").addEventListener("click", () => game.restartAfterDefeat());
    document.getElementById("fullscreenBtn").addEventListener("click", async () => {
      const frame = document.getElementById("gameRoot");
      try {
        if (!document.fullscreenElement) {
          await frame.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (error) {
        console.warn("Fullscreen request failed.", error);
      }
    });
    document.addEventListener("fullscreenchange", () => {
      document.getElementById("fullscreenBtn").textContent = document.fullscreenElement ? "창모드" : "전체화면";
      updateFrameScale();
    });
    if (bootStatus) bootStatus.hidden = true;
    game.start();
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    window.__bootError = message;
    document.body.dataset.bootError = message;
    console.error(error);
    setBootStatus(`부팅 오류: ${message}`);
  }
});
