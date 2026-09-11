window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.UIManager = class UIManager {
  constructor() {
    this.hpFill = document.getElementById("hpFill");
    this.expFill = document.getElementById("expFill");
    this.cooldownFill = document.getElementById("cooldownFill");
    this.playerName = document.getElementById("playerName");
    this.playerLevel = document.getElementById("playerLevel");
    this.moveName = document.getElementById("moveName");
    this.moveReady = document.getElementById("moveReady");
    this.ballCount = document.getElementById("ballCount");
    this.debugPanel = document.getElementById("debugPanel");
    this.levelToast = document.getElementById("levelToast");
    this.messageBox = document.getElementById("messageBox");
    this.gameOver = document.getElementById("gameOver");
    this.choiceOverlay = document.getElementById("levelChoiceOverlay");
    this.choiceTitle = document.getElementById("choiceTitle");
    this.choiceCards = document.getElementById("choiceCards");
    this.collectionPanel = document.getElementById("collectionPanel");
    this.switchActionLabel = document.getElementById("switchActionLabel");
    this.ballActionBtn = document.getElementById("ballActionBtn");
  }

  update(game) {
    const player = game.player;
    const move = window.SurvivorRPG.MoveData[player.moveId];
    const upgradeLevel = player.moveUpgradeLevels[player.moveId] || 0;
    const maxCooldown = game.statSystem.calculateMoveCooldown(move, player.speed, upgradeLevel);
    const readyRatio = game.mode === "pokemon" ? 1 - Math.min(1, player.attackCooldown / maxCooldown) : 0;
    this.playerName.textContent = player.name;
    this.playerLevel.textContent = `Lv.${player.level} · ${this.modeLabel(game.mode)}`;
    this.hpFill.style.width = `${Math.max(0, player.hp / player.maxHp) * 100}%`;
    this.expFill.style.width = `${Math.max(0, player.exp / player.expToNext) * 100}%`;
    this.cooldownFill.style.width = `${readyRatio * 100}%`;
    this.ballCount.textContent = `x${game.balls.pokeBall}`;

    if (game.mode === "trainer") {
      this.moveName.textContent = "Trainer Mode";
      this.moveReady.textContent = "Z / 출전";
    } else if (game.mode === "transition") {
      this.moveName.textContent = "전환 중";
      this.moveReady.textContent = "...";
    } else {
      this.moveName.textContent = `${move.name}${upgradeLevel ? ` +${upgradeLevel}` : ""}`;
      this.moveReady.textContent = player.attackCooldown <= 0 ? "READY" : `${player.attackCooldown.toFixed(1)}s`;
    }

    this.switchActionLabel.textContent = game.mode === "pokemon" ? "Z / 회수" : "Z / 출전";
    this.ballActionBtn.disabled = game.mode !== "trainer" || game.balls.pokeBall <= 0;

    this.levelToast.hidden = game.combatSystem.levelToastTime <= 0;
    if (!this.levelToast.hidden) {
      this.levelToast.textContent = `LEVEL UP! ${player.name} Lv.${player.level}`;
    }
    this.messageBox.hidden = game.messageTimer <= 0;
    if (!this.messageBox.hidden) this.messageBox.textContent = game.messageText;
    this.gameOver.hidden = game.mode !== "gameOver";

    this.collectionPanel.textContent = `보유: ${game.ownedPokemon.map((pokemon) => `${pokemon.name} Lv.${pokemon.level}`).join(" / ")}`;

    if (game.debug) {
      this.debugPanel.hidden = false;
      this.debugPanel.textContent = this.debugText(game, player, move, upgradeLevel, maxCooldown);
    } else {
      this.debugPanel.hidden = true;
    }
  }

  modeLabel(mode) {
    return {
      trainer: "Trainer",
      pokemon: "Pokemon",
      transition: "Transition",
      levelChoice: "Level Up",
      gameOver: "Game Over"
    }[mode] || mode;
  }

  debugText(game, player, move, upgradeLevel, maxCooldown) {
    const ball = window.SurvivorRPG.BallData.pokeBall;
    const target = game.captureTarget;
    const captureLines = target ? [
      `Capture Target: ${target.name} Lv.${target.level}`,
      `Target HP: ${target.hp}/${target.maxHp}`,
      `HP Ratio: ${(target.hp / target.maxHp).toFixed(2)}`,
      `Catch Rate: ${target.data.catchRate || 120}`,
      `Ball Modifier: ${ball.catchModifier.toFixed(2)}`,
      `Final Capture Chance: ${(game.captureSystem.calculateCaptureChance(target, ball) * 100).toFixed(1)}%`
    ] : ["Capture Target: -"];
    const lastCapture = game.lastCaptureResult
      ? `Last Capture: ${game.lastCaptureResult.targetName} ${(game.lastCaptureResult.chance * 100).toFixed(1)}% ${game.lastCaptureResult.success ? "success" : "fail"}`
      : "Last Capture: -";

    return [
      `FPS: ${game.fps.toFixed(0)}`,
      `Mode: ${game.mode}`,
      `Trainer X/Y: ${game.trainer.x.toFixed(0)}, ${game.trainer.y.toFixed(0)}`,
      `Pokemon X/Y: ${player.x.toFixed(0)}, ${player.y.toFixed(0)}`,
      `Pokemon Speed Stat: ${player.speed}`,
      `Native Stats: HP ${player.nativeStats.maxHp} / Atk ${player.nativeStats.attack} / Def ${player.nativeStats.defense} / SpA ${player.nativeStats.specialAttack} / SpD ${player.nativeStats.specialDefense} / Spe ${player.nativeStats.speed}`,
      `Growth Bonus: HP ${(player.growthBonuses.maxHpPct * 100).toFixed(0)}% / Atk ${(player.growthBonuses.attackPct * 100).toFixed(0)}% / Def ${(player.growthBonuses.defensePct * 100).toFixed(0)}% / SpA ${(player.growthBonuses.specialAttackPct * 100).toFixed(0)}% / SpD ${(player.growthBonuses.specialDefensePct * 100).toFixed(0)}% / Spe ${(player.growthBonuses.speedPct * 100).toFixed(0)}%`,
      `Move Upgrade: Tackle ${upgradeLevel}/4`,
      `Tackle Cooldown: ${maxCooldown.toFixed(2)}s`,
      `Balls: ${game.balls.pokeBall}`,
      ...captureLines,
      lastCapture,
      `Owned: ${game.ownedPokemon.length}`,
      `Last Rarity Roll: ${game.upgradeSystem.lastRolls.join(", ") || "-"}`,
      `Enemy Count: ${game.enemies.filter((enemy) => !enemy.dead).length}`,
      `Spawn Zone: ${game.spawnSystem.zones.length}`,
      "F3: instant EXP / F4: force rare / F5: target HP 20%"
    ].join("\n");
  }

  showLevelChoices(event, choices, onSelect) {
    this.choiceTitle.textContent = `이상해씨 Lv.${event.toLevel}`;
    this.choiceCards.innerHTML = "";
    choices.forEach((choice, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `choice-card ${choice.rarity}`;
      card.innerHTML = [
        `<strong>${choice.title}</strong>`,
        `<span class="choice-summary">${choice.summary}</span>`,
        `<span class="choice-description">${choice.description}</span>`,
        `<span class="choice-key">${index + 1}</span>`
      ].join("");
      card.addEventListener("click", () => {
        card.classList.add("selected");
        onSelect(index);
      }, { once: true });
      this.choiceCards.appendChild(card);
    });
    this.choiceOverlay.hidden = false;
  }

  hideLevelChoices() {
    this.choiceOverlay.hidden = true;
    this.choiceCards.innerHTML = "";
  }
};
