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
    const newGameConfirmOverlay = document.getElementById('newGameConfirmOverlay');
    const buildConfig = window.SurvivorRPG.BuildConfig || {};
    const titleVersion = document.getElementById('titleVersion');
    if (titleVersion) titleVersion.textContent = buildConfig.VERSION || 'dev';
    const requestedMode = new URLSearchParams(location.search).get('mode');
    const formatPlayTime = seconds => {
      const total=Math.max(0,Math.floor(Number(seconds)||0)),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),secs=total%60;
      return hours?`${hours}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`:`${minutes}:${String(secs).padStart(2,'0')}`;
    };
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
      const leaderId=saved.data.partyIds?.[0],leader=saved.data.ownedPokemon?.find(p=>p.uniqueId===leaderId);
      const leaderName=window.SurvivorRPG.PokemonData?.[leader?.speciesId]?.name || '없음';
      const place=mode==='story'?`스토리 맵 ${saved.data.story?.mapId || '?'}`:(window.SurvivorRPG.Maps?.[saved.data.currentMapId]?.name || saved.data.currentMapId || '허브');
      document.getElementById('resumeSelectMeta').textContent = `플레이 ${formatPlayTime(saved.data.playTime)} · 위치 ${place} · 선두 ${leaderName}${saved.recovered?' · 백업 복구':''}`;
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
          loadButton.onclick=null;restartButton.onclick=null;
          resolve(action);
        };
        const onKeyDown = event => {
          const key = event.key.toLowerCase();
          if (['arrowup', 'arrowleft'].includes(key)) { event.preventDefault(); select(0); return; }
          if (['arrowdown', 'arrowright'].includes(key)) { event.preventDefault(); select(1); return; }
          if (key === 'z' || key === 'enter') { event.preventDefault(); finish(selected === 0 ? 'load' : 'restart'); return; }
          if (key === 'x' || key === 'escape') { event.preventDefault(); finish('restart'); }
        };
        loadButton.onclick=()=>finish('load');
        restartButton.onclick=()=>finish('restart');
        document.addEventListener('keydown', onKeyDown, true);
        select(0);
      });
    };

    const confirmNewGame = mode => {
      const modeName=mode==='story'?'스토리 모드':'배틀 모드';
      document.getElementById('newGameConfirmMessage').textContent=`${modeName}의 현재 진행 저장본을 삭제합니다. 이 작업은 되돌릴 수 없습니다.`;
      newGameConfirmOverlay.hidden=false;
      const cancelButton=document.getElementById('newGameCancelBtn'),confirmButton=document.getElementById('newGameConfirmBtn');
      const buttons=[cancelButton,confirmButton];let selected=0;
      const select=index=>{selected=index;buttons.forEach((button,i)=>button.classList.toggle('is-selected',i===selected));buttons[selected].focus({preventScroll:true});};
      return new Promise(resolve=>{
        const finish=confirmed=>{newGameConfirmOverlay.hidden=true;document.removeEventListener('keydown',onKeyDown,true);buttons.forEach(button=>button.classList.remove('is-selected'));cancelButton.onclick=null;confirmButton.onclick=null;resolve(confirmed);};
        const onKeyDown=event=>{const key=event.key.toLowerCase();
          if(['arrowup','arrowleft'].includes(key)){event.preventDefault();select(0);return;}
          if(['arrowdown','arrowright'].includes(key)){event.preventDefault();select(1);return;}
          if(key==='z'||key==='enter'){event.preventDefault();finish(selected===1);return;}
          if(key==='x'||key==='escape'){event.preventDefault();finish(false);}
        };
        cancelButton.onclick=()=>finish(false);confirmButton.onclick=()=>finish(true);document.addEventListener('keydown',onKeyDown,true);select(0);
      });
    };

    const selectedMode = await chooseMode();
    let resumeAction = await chooseResumeAction(selectedMode);
    while(resumeAction==='restart' && !await confirmNewGame(selectedMode))resumeAction=await chooseResumeAction(selectedMode);
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
    if(buildConfig.DEBUG) {
      window.startTrainerBattleDebug = (count = 6, profile = 'normal') => game.startTrainerBattleDebug?.(count, profile) || false;
      window.startTrainerBattle1v1 = (profile = 'normal') => game.startTrainerBattleDebug?.(1, profile) || false;
      window.startTrainerBattle2v2 = (profile = 'normal') => game.startTrainerBattleDebug?.(2, profile) || false;
      window.startTrainerBattle3v3 = (profile = 'normal') => game.startTrainerBattleDebug?.(3, profile) || false;
      window.startTrainerBattle6v6 = (profile = 'normal') => game.startTrainerBattleDebug?.(6, profile) || false;
      window.startGymTrainerBattleDebug = (order = 1, profile = 'normal') => game.startGymTrainerBattleDebug?.(order, profile) || false;
      window.startGym1BattleDebug = (profile = 'normal') => game.startGymTrainerBattleDebug?.(1, profile) || false;
      window.startGym2BattleDebug = (profile = 'normal') => game.startGymTrainerBattleDebug?.(2, profile) || false;
      window.startGym3BattleDebug = (profile = 'normal') => game.startGymTrainerBattleDebug?.(3, profile) || false;
    }
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
