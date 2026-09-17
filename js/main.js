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

  try {
    setBootStatus("게임 데이터를 불러오는 중...");
    const game = new window.SurvivorRPG.Game(document.getElementById("gameCanvas"));
    window.currentSurvivorRPG = game;
    await game.init();
    if(window.SurvivorRPG.SaveStore.read())game.loadGame();
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
