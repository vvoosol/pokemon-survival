window.addEventListener("DOMContentLoaded", async () => {
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
  });
  game.start();
});
