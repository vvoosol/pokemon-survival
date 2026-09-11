window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.UIManager = class UIManager {
  constructor() {
    this.hpFill = document.getElementById("hpFill");
    this.expFill = document.getElementById("expFill");
    this.moveCooldownList = document.getElementById("moveCooldownList");
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
    this.partyPanel = document.getElementById("partyPanel");
    this.switchActionLabel = document.getElementById("switchActionLabel");
    this.ballActionBtn = document.getElementById("ballActionBtn");
    this.partyActionBtn = document.getElementById("partyActionBtn");
    this.menuOverlay = document.getElementById("mainMenuOverlay");
    this.menuRoot = document.getElementById("menuRoot");
  }

  update(game) {
    const player = game.player;
    const primarySlot = player.equippedMoves[0] || { moveId: player.moveId, upgradeLevel: 0, cooldownRemaining: 0 };
    const move = window.SurvivorRPG.MoveData[primarySlot.moveId] || window.SurvivorRPG.MoveData.tackle;
    const upgradeLevel = primarySlot.upgradeLevel || 0;
    const maxCooldown = game.statSystem.calculateMoveCooldown(move, player.speed, upgradeLevel);
    const nextReadyRatio = this.nextReadyRatio(game, player);
    this.playerName.textContent = player.name;
    this.playerLevel.textContent = `Lv.${player.level} · ${this.modeLabel(game.mode)}`;
    this.hpFill.style.width = `${Math.max(0, player.hp / player.maxHp) * 100}%`;
    this.expFill.style.width = `${Math.max(0, player.exp / player.expToNext) * 100}%`;
    this.renderMoveCooldowns(game, player);
    this.ballCount.textContent = `x${game.balls.pokeBall}`;

    if (game.mode === "trainer") {
      this.moveName.textContent = "Trainer Mode";
      this.moveReady.textContent = "Z / 출전";
    } else if (game.mode === "transition") {
      this.moveName.textContent = "전환 중";
      this.moveReady.textContent = "...";
    } else {
      this.moveName.textContent = "기술 쿨타임";
      this.moveReady.textContent = player.equippedMoves.some((slot) => slot.cooldownRemaining <= 0) ? "READY" : `${Math.min(...player.equippedMoves.map((slot) => slot.cooldownRemaining)).toFixed(1)}s`;
    }

    this.switchActionLabel.textContent = game.mode === "pokemon" ? "Z / 회수" : "Z / 출전";
    this.ballActionBtn.disabled = game.mode !== "trainer" || game.balls.pokeBall <= 0;
    this.partyActionBtn.disabled = game.partyPokemon.filter((pokemon) => pokemon && !pokemon.dead).length < 2;

    this.levelToast.hidden = game.combatSystem.levelToastTime <= 0;
    if (!this.levelToast.hidden) {
      this.levelToast.textContent = `LEVEL UP! ${player.name} Lv.${player.level}`;
    }
    this.messageBox.hidden = game.messageTimer <= 0;
    if (!this.messageBox.hidden) this.messageBox.textContent = game.messageText;
    this.gameOver.hidden = game.mode !== "gameOver";

    this.collectionPanel.textContent = `보유 ${game.ownedPokemon.length} / 예비 ${game.reservePokemon.length}`;
    this.renderParty(game);

    if (game.debug) {
      this.debugPanel.hidden = false;
      this.debugPanel.textContent = this.debugText(game, player, move, upgradeLevel, maxCooldown);
    } else {
      this.debugPanel.hidden = true;
    }
  }

  renderParty(game) {
    this.partyPanel.innerHTML = "";
    for (let index = 0; index < 6; index += 1) {
      const pokemon = game.partyPokemon[index];
      const slot = document.createElement("div");
      slot.className = "party-slot";
      if (!pokemon) {
        slot.classList.add("empty");
        this.partyPanel.appendChild(slot);
        continue;
      }
      if (pokemon.uniqueId === game.selectedPokemon?.uniqueId) slot.classList.add("selected");
      if (pokemon.uniqueId === game.activePokemon?.uniqueId) slot.classList.add("active");
      if (pokemon.dead || pokemon.hp <= 0) slot.classList.add("fainted");
      slot.title = `${pokemon.name} Lv.${pokemon.level} HP ${pokemon.hp}/${pokemon.maxHp}`;
      const img = document.createElement("img");
      img.src = pokemon.data.sprite;
      img.alt = pokemon.name;
      const hp = document.createElement("div");
      hp.className = "party-hp";
      const fill = document.createElement("span");
      fill.style.width = `${Math.max(0, pokemon.hp / pokemon.maxHp) * 100}%`;
      hp.appendChild(fill);
      slot.appendChild(img);
      slot.appendChild(hp);
      this.partyPanel.appendChild(slot);
    }
  }

  renderMoveCooldowns(game, player) {
    this.moveCooldownList.innerHTML = "";
    const slots = [...player.equippedMoves];
    while (slots.length < 4) slots.push(null);

    slots.forEach((slot, index) => {
      const row = document.createElement("div");
      row.className = "move-cooldown-row";
      if (!slot) {
        row.classList.add("empty");
        row.innerHTML = `
          <span class="move-index">${index + 1}</span>
          <span class="move-label">-</span>
          <div class="meter cooldown-meter"><div style="width:0%"></div></div>
          <span class="move-time">--</span>
        `;
        this.moveCooldownList.appendChild(row);
        return;
      }

      const move = window.SurvivorRPG.MoveData[slot.moveId];
      const cooldown = move ? game.statSystem.calculateMoveCooldown(move, player.speed, slot.upgradeLevel || 0) : 1;
      const remaining = slot.cooldownRemaining || 0;
      const ratio = game.mode === "pokemon" ? 1 - Math.min(1, remaining / cooldown) : 0;
      const ready = game.mode === "pokemon" && remaining <= 0;
      if (ready) row.classList.add("ready");
      row.innerHTML = `
        <span class="move-index">${index + 1}</span>
        <span class="move-label">${move ? move.name : slot.moveId}${slot.upgradeLevel ? ` +${slot.upgradeLevel}` : ""}</span>
        <div class="meter cooldown-meter"><div style="width:${ratio * 100}%"></div></div>
        <span class="move-time">${ready ? "OK" : `${remaining.toFixed(1)}s`}</span>
      `;
      this.moveCooldownList.appendChild(row);
    });
  }

  nextReadyRatio(game, player) {
    if (game.mode !== "pokemon" || !player.equippedMoves.length) return 0;
    const ratios = player.equippedMoves.map((slot) => {
      const move = window.SurvivorRPG.MoveData[slot.moveId];
      if (!move) return 0;
      const cooldown = game.statSystem.calculateMoveCooldown(move, player.speed, slot.upgradeLevel || 0);
      return 1 - Math.min(1, (slot.cooldownRemaining || 0) / cooldown);
    });
    return Math.max(...ratios);
  }

  moveListText(player) {
    return player.equippedMoves
      .map((slot) => {
        const move = window.SurvivorRPG.MoveData[slot.moveId];
        return move ? `${move.name}${slot.upgradeLevel ? ` +${slot.upgradeLevel}` : ""}` : slot.moveId;
      })
      .join(" / ");
  }

  modeLabel(mode) {
    return {
      trainer: "Trainer",
      pokemon: "Pokemon",
      transition: "Transition",
      levelChoice: "Level Up",
      moveLearn: "Move Learn",
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
      `Species: ${player.speciesId}`,
      `Base Stats: ${this.baseStatsText(player.data?.baseStats)}`,
      `Move Upgrade: ${move.name} ${upgradeLevel}/4`,
      `Moves: ${this.debugMoves(game, player)}`,
      `Last Damage: ${this.damageBreakdownText(player.lastDamageBreakdown)}`,
      `Evolution: ${this.evolutionText(player.data)}`,
      `Next Move: ${this.nextLearnsetText(player)}`,
      `Hidden Ability: ${(window.SurvivorRPG.DataAdapter.getHiddenAbilities(player.speciesId) || []).join(", ") || "-"}`,
      `TM Ready: ${(window.SurvivorRPG.DataAdapter.getTMLearnset(player.speciesId) || []).join(", ") || "-"}`,
      `Data Warnings: ${(window.SurvivorRPG.DataWarnings || []).length}`,
      `Balls: ${game.balls.pokeBall}`,
      ...captureLines,
      lastCapture,
      `Owned: ${game.ownedPokemon.length}`,
      `Party: ${game.partyPokemon.map((pokemon, index) => pokemon ? `${index + 1}:${pokemon.name}#${pokemon.uniqueId.slice(-4)}${pokemon.dead ? "(fainted)" : ""}` : `${index + 1}:-`).join(" | ")}`,
      `Selected: ${game.selectedPokemon ? `${game.selectedPokemon.name}#${game.selectedPokemon.uniqueId.slice(-4)}` : "-"}`,
      `Active: ${game.activePokemon ? `${game.activePokemon.name}#${game.activePokemon.uniqueId.slice(-4)}` : "-"}`,
      `Reserve: ${game.reservePokemon.length}`,
      `Last Rarity Roll: ${game.upgradeSystem.lastRolls.join(", ") || "-"}`,
      `Enemy Count: ${game.enemies.filter((enemy) => !enemy.dead).length}`,
      `Spawn Zone: ${game.spawnSystem.zones.length}`,
      "F3: instant EXP / F4: force rare / F5: target HP 20%"
    ].join("\n");
  }

  baseStatsText(baseStats) {
    if (!baseStats) return "-";
    return `HP ${baseStats.hp} / Atk ${baseStats.attack} / Def ${baseStats.defense} / SpA ${baseStats.specialAttack} / SpD ${baseStats.specialDefense} / Spe ${baseStats.speed}`;
  }

  debugMoves(game, player) {
    return player.equippedMoves.map((slot) => {
      const move = window.SurvivorRPG.MoveData[slot.moveId];
      if (!move) return slot.moveId;
      const cooldown = game.statSystem.calculateMoveCooldown(move, player.speed, slot.upgradeLevel || 0);
      return `${move.name}+${slot.upgradeLevel || 0} ${move.type}/${move.category} P${move.power} CD ${cooldown.toFixed(2)}`;
    }).join(" | ");
  }

  evolutionText(species) {
    const evolution = species?.evolutions?.[0];
    if (!evolution) return "-";
    if (evolution.method === "level") return `${evolution.target} at Lv.${evolution.level}`;
    return `${evolution.target} by ${evolution.method}`;
  }

  damageBreakdownText(breakdown) {
    if (!breakdown) return "-";
    return `${breakdown.move} base ${breakdown.baseDamage.toFixed(1)} STAB x${breakdown.stab} Type x${breakdown.type} Ability x${breakdown.ability} Final ${breakdown.finalDamage}`;
  }

  nextLearnsetText(player) {
    const species = player.data;
    if (!species?.learnset) return "-";
    const next = species.learnset.find((entry) => {
      const move = window.SurvivorRPG.MoveData[entry.moveId];
      return entry.level > player.level && move && move.power > 0 && !player.knowsMove?.(entry.moveId);
    });
    if (!next) return "-";
    const move = window.SurvivorRPG.MoveData[next.moveId];
    return `Lv.${next.level} ${move.name}`;
  }

  showLevelChoices(event, choices, onSelect) {
    const pokemonName = event.pokemon?.name || "포켓몬";
    this.choiceTitle.textContent = `${pokemonName} Lv.${event.toLevel}`;
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

  showMoveLearning(learn, onSelect) {
    const pokemon = learn.pokemon;
    const newMove = window.SurvivorRPG.MoveData[learn.moveId];
    this.choiceTitle.textContent = `${pokemon.name}은(는) ${newMove.name}을 배우려 한다`;
    this.choiceCards.innerHTML = "";
    pokemon.equippedMoves.forEach((slot, index) => {
      const move = window.SurvivorRPG.MoveData[slot.moveId];
      const card = document.createElement("button");
      card.type = "button";
      card.className = "choice-card move-card";
      if (learn.confirmForgetIndex === index) card.classList.add("danger");
      card.innerHTML = this.moveCardHtml(
        move,
        slot.upgradeLevel || 0,
        learn.confirmForgetIndex === index
          ? "한 번 더 누르면 이 기술과 강화가 사라집니다."
          : "이 기술을 잊고 새 기술을 배웁니다.",
        index + 1
      );
      card.addEventListener("click", () => onSelect(index));
      this.choiceCards.appendChild(card);
    });

    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "choice-card move-card skip";
    skip.innerHTML = this.moveCardHtml(newMove, 0, "새 기술을 배우지 않습니다.", 5, "새 기술");
    skip.addEventListener("click", () => onSelect(4));
    this.choiceCards.appendChild(skip);
    this.choiceOverlay.hidden = false;
  }

  moveCardHtml(move, upgradeLevel, description, key, label = "잊을 기술") {
    const stars = "★".repeat(upgradeLevel) + "☆".repeat(Math.max(0, 4 - upgradeLevel));
    return [
      `<strong>${label}: ${move.name}</strong>`,
      `<span class="choice-summary">${move.type.toUpperCase()} · ${move.category} · Power ${move.power}</span>`,
      `<span class="choice-description">CD ${move.baseCooldown.toFixed(1)}s · ${stars}<br>${description}</span>`,
      `<span class="choice-key">${key}</span>`
    ].join("");
  }

  hideMoveLearning() {
    this.choiceOverlay.hidden = true;
    this.choiceCards.innerHTML = "";
  }

  showGameMenu(game) {
    this.menuOverlay.hidden = false;
    if (game.menuView === "pokemon") this.renderPokemonMenu(game);
    else if (game.menuView === "summary") this.renderSummaryMenu(game, game.menuSelectedPokemonIndex);
    else if (game.menuView === "pokedex") this.renderPokedexMenu(game);
    else if (game.menuView === "report") this.renderReportMenu(game);
    else this.renderMainMenu(game);
  }

  hideGameMenu() {
    this.menuOverlay.hidden = true;
    this.menuRoot.innerHTML = "";
  }

  renderMainMenu(game) {
    this.menuRoot.innerHTML = `
      <div class="menu-title">MENU</div>
      <div class="menu-grid">
        <button data-view="pokedex"><img src="assets/ui/menuPokedex.png" alt="">Pokédex</button>
        <button data-view="pokemon"><img src="assets/ui/menuPokemon.png" alt="">Pokémon</button>
        <button data-view="report"><img src="assets/ui/menuSave.png" alt="">Report / Save</button>
        <button data-action="close"><img src="assets/ui/menuQuit.png" alt="">닫기</button>
      </div>
    `;
    this.bindMenuButton("[data-view]", (button) => game.openMenuView(button.dataset.view));
    this.bindMenuButton("[data-action='close']", () => game.toggleMenu());
  }

  renderPokemonMenu(game) {
    this.menuRoot.innerHTML = `
      <div class="menu-title">POKéMON</div>
      <div class="party-menu-list"></div>
      <div class="menu-footer">
        <button data-action="back">뒤로</button>
        <button data-action="close">닫기</button>
      </div>
    `;
    const list = this.menuRoot.querySelector(".party-menu-list");
    game.partyPokemon.forEach((pokemon, index) => {
      const row = document.createElement("div");
      row.className = "party-menu-row";
      row.innerHTML = `
        <img src="${pokemon.data.icon || pokemon.data.sprite}" alt="">
        <strong>${index + 1}. ${pokemon.name}</strong>
        <span>Lv.${pokemon.level}</span>
        <span>HP ${pokemon.hp}/${pokemon.maxHp}</span>
        <button data-summary="${index}">상태</button>
        <button data-up="${index}" ${index === 0 ? "disabled" : ""}>▲</button>
        <button data-down="${index}" ${index === game.partyPokemon.length - 1 ? "disabled" : ""}>▼</button>
      `;
      list.appendChild(row);
    });
    this.bindMenuButton("[data-summary]", (button) => game.openMenuView("summary", Number(button.dataset.summary)));
    this.bindMenuButton("[data-up]", (button) => game.swapPartySlots(Number(button.dataset.up), Number(button.dataset.up) - 1));
    this.bindMenuButton("[data-down]", (button) => game.swapPartySlots(Number(button.dataset.down), Number(button.dataset.down) + 1));
    this.bindMenuButton("[data-action='back']", () => game.openMenuView("main"));
    this.bindMenuButton("[data-action='close']", () => game.toggleMenu());
  }

  renderSummaryMenu(game, index) {
    const pokemon = game.partyPokemon[index] || game.partyPokemon[0];
    const ability = window.SurvivorRPG.DataAdapter.getAbilityData(pokemon.abilityId);
    this.menuRoot.innerHTML = `
      <div class="menu-title">SUMMARY</div>
      <div class="summary-layout">
        <div class="summary-main">
          <img src="${pokemon.data.sprite}" alt="">
          <h2>${pokemon.name}</h2>
          <p>No.${pokemon.data.dexNo || "-"} ${pokemon.data.name} · Lv.${pokemon.level}</p>
          <p>${pokemon.types.map((type) => type.toUpperCase()).join(" / ")}</p>
          <p>특성: <strong>${ability.name}</strong></p>
          <p>${ability.description}</p>
        </div>
        <div class="summary-stats">
          <p>HP ${pokemon.hp}/${pokemon.maxHp}</p>
          <p>Attack ${pokemon.attack}</p>
          <p>Defense ${pokemon.defense}</p>
          <p>Sp. Attack ${pokemon.specialAttack}</p>
          <p>Sp. Defense ${pokemon.specialDefense}</p>
          <p>Speed ${pokemon.speed}</p>
        </div>
        <div class="summary-moves"></div>
      </div>
      <div class="menu-footer">
        <button data-action="back">뒤로</button>
        <button data-action="close">닫기</button>
      </div>
    `;
    const moves = this.menuRoot.querySelector(".summary-moves");
    pokemon.equippedMoves.forEach((slot) => {
      const move = window.SurvivorRPG.DataAdapter.getMoveData(slot.moveId);
      const cooldown = game.statSystem.calculateMoveCooldown(move, pokemon.speed, slot.upgradeLevel || 0);
      const item = document.createElement("p");
      item.textContent = `${move.name} · ${move.type.toUpperCase()} · ${move.category} · P${move.power} · CD ${cooldown.toFixed(1)}s · +${slot.upgradeLevel || 0}`;
      moves.appendChild(item);
    });
    this.bindMenuButton("[data-action='back']", () => game.openMenuView("pokemon"));
    this.bindMenuButton("[data-action='close']", () => game.toggleMenu());
  }

  renderPokedexMenu(game) {
    const species = Object.values(window.SurvivorRPG.PokemonData).sort((a, b) => (a.dexNo || 999) - (b.dexNo || 999));
    this.menuRoot.innerHTML = `
      <div class="menu-title">POKéDEX</div>
      <div class="pokedex-list"></div>
      <div class="menu-footer">
        <button data-action="back">뒤로</button>
        <button data-action="close">닫기</button>
      </div>
    `;
    const list = this.menuRoot.querySelector(".pokedex-list");
    species.forEach((item) => {
      const state = game.pokedex[item.id] || { seen: false, caught: false };
      const row = document.createElement("div");
      row.className = "pokedex-row";
      row.innerHTML = `
        <img src="${item.icon || item.sprite}" alt="">
        <strong>No.${String(item.dexNo || 0).padStart(3, "0")} ${state.seen ? item.name : "???"}</strong>
        <span>${state.caught ? "포획" : state.seen ? "발견" : "미발견"}</span>
        <p>${state.seen ? item.pokedex || "" : ""}</p>
      `;
      list.appendChild(row);
    });
    this.bindMenuButton("[data-action='back']", () => game.openMenuView("main"));
    this.bindMenuButton("[data-action='close']", () => game.toggleMenu());
  }

  renderReportMenu(game) {
    const caught = Object.values(game.pokedex).filter((entry) => entry.caught).length;
    const seen = Object.values(game.pokedex).filter((entry) => entry.seen).length;
    this.menuRoot.innerHTML = `
      <div class="menu-title">REPORT</div>
      <div class="report-box">
        <p>Party ${game.partyPokemon.length} / 6</p>
        <p>Owned ${game.ownedPokemon.length}</p>
        <p>Pokédex Seen ${seen} / Caught ${caught}</p>
        <p>Ball ${game.balls.pokeBall}</p>
        <p>Save Version ${game.saveVersion}</p>
      </div>
      <div class="menu-grid">
        <button data-action="save">저장</button>
        <button data-action="load">이어하기</button>
        <button data-action="back">뒤로</button>
        <button data-action="close">닫기</button>
      </div>
    `;
    this.bindMenuButton("[data-action='save']", () => game.saveGame());
    this.bindMenuButton("[data-action='load']", () => game.loadGame());
    this.bindMenuButton("[data-action='back']", () => game.openMenuView("main"));
    this.bindMenuButton("[data-action='close']", () => game.toggleMenu());
  }

  bindMenuButton(selector, handler) {
    this.menuRoot.querySelectorAll(selector).forEach((button) => {
      button.addEventListener("click", () => handler(button));
    });
  }
};
