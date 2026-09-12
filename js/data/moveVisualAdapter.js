window.SurvivorRPG = window.SurvivorRPG || {};

(function defineMoveVisualAdapter() {
  const genericByType = {
    normal: { effect: "impact", color: "#f2f2d0", sound: "tackle" },
    fire: { effect: "ember", color: "#ff8a3d", sound: "hit" },
    water: { effect: "splash", color: "#5fb8ff", sound: "hit" },
    electric: { effect: "spark", color: "#ffe45c", sound: "hit" },
    grass: { effect: "leaf", color: "#78db68", sound: "hit" },
    poison: { effect: "toxic", color: "#bc6cff", sound: "hit" },
    fighting: { effect: "strike", color: "#e66855", sound: "hit" },
    rock: { effect: "rock", color: "#c8a55a", sound: "hit" },
    ground: { effect: "dust", color: "#d6b36c", sound: "hit" },
    psychic: { effect: "pulse", color: "#ff7db4", sound: "hit" }
  };

  window.SurvivorRPG.MoveVisualAdapter = {
    sourcePaths: {
      animations: "Pokemon Anil V4.13/Graphics/Animations",
      particles: "Pokemon Anil V4.13/Graphics/Battle animations",
      sounds: "Pokemon Anil V4.13/Audio/SE"
    },
    getMoveAnimation(moveId) {
      const move = window.SurvivorRPG.MoveData[moveId];
      if (!move) return { foundOriginal: false, fallback: "unknown", color: "#ffffff", sound: "hit" };
      return {
        moveId,
        foundOriginal: false,
        adapter: "generic-type-fallback",
        ...(genericByType[move.type] || genericByType.normal)
      };
    },
    getProjectileVisual(moveId) {
      return this.getMoveAnimation(moveId);
    },
    getHitAnimation(moveId) {
      return this.getMoveAnimation(moveId);
    },
    getMoveSound(moveId) {
      return this.getMoveAnimation(moveId).sound;
    }
  };
})();
