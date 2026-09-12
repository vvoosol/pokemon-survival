window.addEventListener("DOMContentLoaded", async () => {
  const bootStatus = document.getElementById("bootStatus");
  const setBootStatus = (message) => {
    if (bootStatus) bootStatus.textContent = message;
  };

  const updateFrameScale = () => {
    const padding = document.fullscreenElement ? 0 : 8;
    const scale = Math.min((window.innerWidth - padding * 2) / 1280, (window.innerHeight - padding * 2) / 720);
    document.documentElement.style.setProperty("--screen-scale", Math.max(0.1, scale).toString());
  };
  updateFrameScale();
  window.addEventListener("resize", updateFrameScale);
  window.addEventListener("orientationchange", updateFrameScale);

  try {
    setBootStatus("게임 데이터를 불러오는 중...");
    const game = new window.SurvivorRPG.Game(document.getElementById("gameCanvas"));
    window.currentSurvivorRPG = game;
    await game.init();
    document.getElementById("restartBtn").addEventListener("click", () => game.reset());
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
