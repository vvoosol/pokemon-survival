window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.UIManager = class UIManager {
  constructor() {
    this.hpFill = document.getElementById("hpFill");
    this.expFill = document.getElementById("expFill");
    this.playerName = document.getElementById("playerName");
    this.playerLevel = document.getElementById("playerLevel");
    this.playerMode = document.getElementById("playerMode");
    this.ballCount = document.getElementById("ballCount");
    this.moveCooldownList = document.getElementById("moveCooldownList");
    this.partyPanel = document.getElementById("partyPanel");
    this.debugPanel = document.getElementById("debugPanel");
    this.levelToast = document.getElementById("levelToast");
    this.messageBox = document.getElementById("messageBox");
    this.gameOver = document.getElementById("gameOver");
    this.survivalHud = document.getElementById("survivalHud");
    this.survivalResult = document.getElementById("survivalResult");
    document.getElementById("survivalReturnBtn").addEventListener("click", () => this.currentGame?.travelToHub());
    this.choiceOverlay = document.getElementById("levelChoiceOverlay");
    this.choiceTitle = document.getElementById("choiceTitle");
    this.choiceCards = document.getElementById("choiceCards");
    this.switchActionLabel = document.getElementById("switchActionLabel");
    this.xActionLabel = document.getElementById("xActionLabel");
    this.ballActionBtn = document.getElementById("ballActionBtn");
    this.partyActionBtn = document.getElementById("partyActionBtn");
    this.menuOverlay = document.getElementById("mainMenuOverlay");
    this.menuWindow = this.menuOverlay.querySelector(".menu-window");
    this.menuRoot = document.getElementById("menuRoot");
    this.currentGame = null;
    this.selectedByView = new Map();
    this.selectedIndex = 0;
    this.navDirection = "";
    this.navRepeat = 0;
    this.summaryPage = "info";
    this.choiceSelection = 0;
  }

  update(game) {
    const player = game.player;
    if (!player) return;
    this.currentGame = game;
    this.playerName.textContent = player.name;
    this.playerLevel.textContent = `Lv.${player.level}`;
    this.playerMode.textContent = this.modeLabel(game.mode);
    this.hpFill.style.width = `${Math.max(0, player.hp / player.maxHp) * 100}%`;
    this.expFill.style.width = `${Math.max(0, player.exp / player.expToNext) * 100}%`;
    const hpRatio = player.hp / player.maxHp;
    document.documentElement.style.setProperty("--hp-row", hpRatio <= 0.2 ? "-15px" : hpRatio <= 0.5 ? "-7px" : "0px");
    this.ballCount.textContent = `x${game.balls.pokeBall}`;
    this.switchActionLabel.textContent = this.zActionText(game);
    this.xActionLabel.textContent = this.xActionText(game);
    this.ballActionBtn.disabled = game.mode === "trainer" && game.balls.pokeBall <= 0;
    this.partyActionBtn.disabled = game.partyPokemon.filter((pokemon) => pokemon && !pokemon.dead).length < 2;
    this.renderMoveCooldowns(game, player);
    this.renderParty(game);
    this.levelToast.hidden = game.combatSystem.levelToastTime <= 0;
    if (!this.levelToast.hidden) this.levelToast.textContent = `레벨 업! ${player.name} Lv.${player.level}`;
    this.messageBox.hidden = game.messageTimer <= 0;
    if (!this.messageBox.hidden) this.messageBox.textContent = game.messageText;
    this.gameOver.hidden = game.mode !== "gameOver";
    document.getElementById("restartBtn").textContent = game.survival ? "허브로 돌아가기" : "다시 시작";
    this.updateSurvival(game);
    this.debugPanel.hidden = !game.debug;
    if (game.debug) {
      this.debugPanel.textContent = [
        `FPS ${game.fps.toFixed(0)}`,
        `모드 ${game.mode}`,
        `맵 ${game.map.name}`,
        `좌표 ${player.x.toFixed(0)}, ${player.y.toFixed(0)}`,
        `속도 ${player.speed} / 이동 ${player.movementSpeed.toFixed(0)}`,
        `적 ${game.enemies.filter((enemy) => !enemy.dead).length}`,
        `파티 ${game.partyPokemon.length} / 보유 ${game.ownedPokemon.length}`,
        `소지금 ${game.money}원`
      ].join("\n");
    }
  }

  modeLabel(mode) {
    return {
      trainer: "트레이너",
      pokemon: "출전 중",
      transition: "교체 중",
      levelChoice: "레벨 업",
      moveLearn: "기술 학습",
      gameOver: "전투 불능",
      survivalClear: "생존 성공"
    }[mode] || mode;
  }

  zActionText(game) {
    if (game.mode === "survivalClear") return "귀환";
    if (game.menuOpen || game.mode === "levelChoice" || game.mode === "moveLearn") return "결정";
    if (game.nearbyNpc) return game.nearbyNpc.type === "HEALER" ? "치료" : "대화";
    return game.mode === "pokemon" ? "회수" : "출전";
  }

  xActionText(game) {
    if (game.mode === "survivalClear") return "귀환";
    if (game.menuOpen) return "뒤로";
    if (game.mode === "pokemon") return "교체";
    return "볼";
  }

  iconFor(pokemon) {
    return pokemon.data.icon || `assets/pokemon-icons/${pokemon.speciesId}.png`;
  }

  updateSurvival(game) {
    const run = game.survival;
    this.survivalHud.hidden = !run;
    this.survivalResult.hidden = game.mode !== "survivalClear";
    if (!run) return;
    const seconds = Math.max(0, Math.ceil(run.duration - run.elapsed));
    const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const difficulty = run.difficulty();
    const state = run.status === 'cleared' ? '생존 성공' : run.status === 'failed' ? '도전 종료'
      : game.mode === 'pokemon' && !game.menuOpen ? '전투 중' : '일시 정지';
    const actor = game.activePokemon || game.trainer;
    const healer = game.map.npcs.find((npc) => npc.type === 'HEALER');
    const angle = Math.atan2(healer.y - actor.y, healer.x - actor.x);
    const arrow = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][(Math.round(angle / (Math.PI / 4)) + 8) % 8];
    const cooldown = Math.max(0, Math.ceil(run.healReadyAt - run.elapsed));
    this.survivalHud.textContent = `서바이벌 ${clock} · ${state}\n야생 Lv.${difficulty.levelMin}~${difficulty.levelMax} · 처치 ${run.kills}\n치료소 ${arrow} ${cooldown ? `${cooldown}초` : '준비 완료'}`;
    if (!this.survivalResult.hidden) document.getElementById('survivalResultStats').textContent =
      `생존 15:00 · 처치 ${run.kills} · 포획 ${run.captures}`;
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
      if (pokemon.uniqueId === game.activePokemon?.uniqueId || game.partyBattle.members.includes(pokemon)) slot.classList.add("active");
      if (pokemon.dead || pokemon.hp <= 0) slot.classList.add("fainted");
      slot.title = `${pokemon.name} Lv.${pokemon.level} HP ${pokemon.hp}/${pokemon.maxHp}`;
      slot.innerHTML = `
        <img src="${this.iconFor(pokemon)}" alt="${pokemon.name}">
        <div class="party-hp"><span style="width:${Math.max(0, pokemon.hp / pokemon.maxHp) * 100}%"></span></div>
      `;
      this.partyPanel.appendChild(slot);
    }
  }

  renderMoveCooldowns(game, player) {
    this.moveCooldownList.innerHTML = "";
    const slots = [...player.equippedMoves];
    while (slots.length < 4) slots.push(null);
    slots.forEach((slot) => {
      const row = document.createElement("div");
      row.className = "move-cooldown-row";
      if (!slot) {
        row.classList.add("empty");
        row.innerHTML = `<span class="move-label">-</span><div class="meter"><div style="width:0%"></div></div>`;
        this.moveCooldownList.appendChild(row);
        return;
      }
      const move = window.SurvivorRPG.MoveData[slot.moveId];
      const cooldown = move ? game.statSystem.calculateMoveCooldown(move, player.speed, slot.upgradeLevel || 0) : 1;
      const remaining = slot.cooldownRemaining || 0;
      const ratio = game.mode === "pokemon" ? 1 - Math.min(1, remaining / cooldown) : 0;
      if (game.mode === "pokemon" && remaining <= 0) row.classList.add("ready");
      row.innerHTML = `
        <span class="move-label">${move ? move.name : slot.moveId}${slot.upgradeLevel ? ` +${slot.upgradeLevel}` : ""}</span>
        <div class="meter"><div style="width:${ratio * 100}%"></div></div>
      `;
      this.moveCooldownList.appendChild(row);
    });
  }

  showLevelChoices(event, choices, onSelect) {
    const pokemonName = event.pokemon?.name || "포켓몬";
    this.choiceTitle.textContent = `${pokemonName} Lv.${event.toLevel}`;
    this.choiceCards.innerHTML = "";
    choices.forEach((choice, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `choice-card ${choice.rarity}`;
      card.dataset.selectable = "";
      card.innerHTML = `
        <strong>${choice.title}</strong>
        <span class="choice-summary">${choice.summary}</span>
        <span class="choice-description">${choice.description}</span>
        <span class="choice-key">${index + 1}</span>
      `;
      card.addEventListener("click", () => {
        card.classList.add("selected");
        onSelect(index);
      }, { once: true });
      this.choiceCards.appendChild(card);
    });
    this.choiceSelection = 0;
    this.updateChoiceSelection();
    this.choiceOverlay.hidden = false;
  }

  showMoveLearning(learn, onSelect) {
    const pokemon = learn.pokemon;
    const newMove = window.SurvivorRPG.MoveData[learn.moveId];
    this.choiceTitle.textContent = `${pokemon.name}에게 ${newMove.name}을 배우게 할까요?`;
    this.choiceCards.innerHTML = "";
    pokemon.equippedMoves.forEach((slot, index) => {
      const move = window.SurvivorRPG.MoveData[slot.moveId];
      const card = document.createElement("button");
      card.type = "button";
      card.className = "choice-card";
      card.dataset.selectable = "";
      card.innerHTML = this.moveCardHtml(move, slot.upgradeLevel || 0, "이 기술을 잊고 새 기술을 배웁니다.", index + 1);
      card.addEventListener("click", () => onSelect(index));
      this.choiceCards.appendChild(card);
    });
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "choice-card";
    skip.dataset.selectable = "";
    skip.innerHTML = this.moveCardHtml(newMove, 0, "새 기술을 배우지 않습니다.", 5, "배우지 않기");
    skip.addEventListener("click", () => onSelect(4));
    this.choiceCards.appendChild(skip);
    this.choiceSelection = 0;
    this.updateChoiceSelection();
    this.choiceOverlay.hidden = false;
  }

  moveCardHtml(move, upgradeLevel, description, key, label = "잊을 기술") {
    const stars = "★".repeat(upgradeLevel) + "☆".repeat(Math.max(0, 4 - upgradeLevel));
    return `
      <strong>${label}: ${move.name}</strong>
      <span class="choice-summary">${move.type.toUpperCase()} · ${move.category} · 위력 ${move.power}</span>
      <span class="choice-description">쿨타임 ${move.baseCooldown.toFixed(1)}초 · ${stars}<br>${description}</span>
      <span class="choice-key">${key}</span>
    `;
  }

  hideLevelChoices() {
    this.choiceOverlay.hidden = true;
    this.choiceCards.innerHTML = "";
  }

  hideMoveLearning() {
    this.hideLevelChoices();
  }

  updateChoiceSelection() {
    [...this.choiceCards.querySelectorAll("[data-selectable]")].forEach((item, index) => {
      item.classList.toggle("is-selected", index === this.choiceSelection);
    });
  }

  showGameMenu(game) {
    this.currentGame = game;
    this.menuOverlay.hidden = false;
    this.menuOverlay.dataset.view = game.menuView;
    this.menuOverlay.dataset.summaryPage = this.summaryPage;
    this.menuWindow.className = "menu-window";
    if (["main", "report", "areaSelect", "formation", "professor", "starterSelect", "starterConfirm", "resetConfirm"].includes(game.menuView)) this.menuWindow.classList.add("menu-window--compact");

    if (game.menuView === "pokemon") this.renderPokemonMenu(game);
    else if (game.menuView === "summary") this.renderSummaryMenu(game, game.menuSelectedPokemonIndex);
    else if (game.menuView === "pokedex") this.renderPokedexMenu(game);
    else if (game.menuView === "areaSelect") this.renderAreaSelectMenu(game);
    else if (game.menuView === "bag") this.renderBagMenu(game);
    else if (game.menuView === "bagTarget") this.renderBagTargetMenu(game);
    else if (game.menuView === "mart") this.renderMartMenu(game);
    else if (game.menuView === "report") this.renderReportMenu(game);
    else if (game.menuView === "formation") this.renderFormationMenu(game);
    else if (["professor", "starterSelect", "starterConfirm", "resetConfirm"].includes(game.menuView)) this.renderProfessorMenu(game);
    else this.renderMainMenu(game);

    this.selectedIndex = this.selectedByView.get(game.menuView) || 0;
    this.refreshSelection(false);
  }

  hideGameMenu() {
    this.menuOverlay.hidden = true;
    this.menuRoot.innerHTML = "";
    this.navDirection = "";
    this.navRepeat = 0;
  }

  renderMainMenu(game) {
    this.menuRoot.innerHTML = `
      <section class="compact-screen">
        <div class="menu-title">메뉴</div>
        <div class="menu-list">
          ${this.menuOption("pokedex", "assets/items/pokedex.png", "포켓몬 도감")}
          ${this.menuOption("pokemon", "assets/items/pokemon-box-link.png", "포켓몬")}
          ${this.menuOption("bag", "assets/ui/anil-bag.png", "가방")}
          ${this.menuOption("mart", "assets/items/pokeball.png", "포켓마트")}
          ${this.menuOption("formation", "assets/items/pokemon-box-link.png", "배틀 모드")}
          ${this.menuOption("report", "assets/ui/anil-save-panels.png", "리포트")}
          <button class="menu-option" data-action="close" data-selectable>닫기</button>
        </div>
        <div class="menu-help">방향키 이동 · Z 결정 · X 취소</div>
      </section>
    `;
    this.menuRoot.dataset.columns = "1";
    this.bindMenuButton("[data-view]", (button) => game.openMenuView(button.dataset.view));
    this.bindMenuButton("[data-action='close']", () => game.toggleMenu(), "cancel");
  }

  menuOption(view, icon, label) {
    return `
      <button class="menu-option" data-view="${view}" data-selectable>
        <span class="menu-option-content"><img class="menu-icon" src="${icon}" alt="">${label}</span>
      </button>
    `;
  }

  renderFormationMenu(game) {
    const choices = [['single', 'OFF · 1마리', true], ['double', '더블 배틀 · 2마리', game.items.doubleBattle], ['triple', '트리플 배틀 · 3마리', game.items.tripleBattle]];
    this.menuRoot.innerHTML = `<section class="compact-screen"><div class="menu-title">배틀 모드</div>
      <div class="menu-list" role="radiogroup" aria-label="동시 출전">
        ${choices.map(([mode, name, owned]) => `<button class="menu-option" role="radio" aria-checked="${game.battleFormation === mode}"
          data-formation="${mode}" ${owned ? 'data-selectable' : 'disabled'}>${name}${!owned ? ' · 미구매' : game.battleFormation === mode ? ' · ON' : ''}</button>`).join('')}
        <button class="menu-option" data-back data-selectable>뒤로</button>
      </div></section>`;
    this.menuRoot.dataset.columns = '1';
    this.bindMenuButton('[data-formation]', (button) => game.setBattleFormation(button.dataset.formation));
    this.bindMenuButton('[data-back]', () => game.backMenu(), 'cancel');
  }

  renderProfessorMenu(game) {
    let content;
    if (game.menuView === 'professor') {
      content = `<button class="menu-option" data-professor="starterSelect" data-selectable>스타팅 포켓몬 변경</button>
        <button class="menu-option" data-professor="resetConfirm" data-selectable>새로 시작</button>
        <button class="menu-option" data-close data-selectable>대화 종료</button>`;
    } else if (game.menuView === 'starterSelect') {
      content = ['bulbasaur', 'charmander', 'squirtle'].map((id) => `<button class="menu-option" data-starter="${id}" data-selectable>
        <span class="menu-option-content"><span class="starter-icon" style="background-image:url('assets/pokemon-icons/${id}.png')"></span>${window.SurvivorRPG.PokemonData[id].name}</span></button>`).join('')
        + '<button class="menu-option" data-back data-selectable>뒤로</button>';
    } else if (game.menuView === 'starterConfirm') {
      const name = window.SurvivorRPG.PokemonData[game.pendingStarter]?.name || '';
      content = `<p class="professor-notice">첫 파트너를 ${name}(으)로 바꿀까요?<br>레벨·성장·HP 비율·소지품은 유지됩니다. 기술 강화·특성·타입은 새 파트너 기준으로 바뀝니다.</p>
        <button class="menu-option" data-change data-selectable>변경하기</button>
        <button class="menu-option" data-back data-selectable>취소</button>`;
    } else {
      content = `<p class="professor-notice">새 모험을 시작할까요?<br>포켓몬·재화·구매한 배틀 모드·도감·저장 리포트가 모두 초기화됩니다.</p>
        <button class="menu-option" data-back data-selectable>취소</button>
        <button class="menu-option" data-reset data-selectable>모두 초기화하고 시작</button>`;
    }
    this.menuRoot.innerHTML = `<section class="compact-screen"><div class="menu-title">오박사</div><div class="menu-list">${content}</div></section>`;
    this.menuRoot.dataset.columns = '1';
    this.bindMenuButton('[data-professor]', (button) => game.openMenuView(button.dataset.professor));
    this.bindMenuButton('[data-starter]', (button) => game.chooseStarter(button.dataset.starter));
    this.bindMenuButton('[data-change]', () => game.changeStarter());
    this.bindMenuButton('[data-reset]', () => game.resetAtProfessor());
    this.bindMenuButton('[data-back]', () => game.backMenu(), 'cancel');
    this.bindMenuButton('[data-close]', () => game.toggleMenu(), 'cancel');
  }

  renderPokemonMenu(game) {
    this.menuRoot.innerHTML = `
      <section class="party-screen">
        <div class="menu-title">포켓몬</div>
        <div class="party-menu-list"></div>
        <div class="menu-footer"><button class="menu-action" data-action="back" data-selectable>뒤로</button></div>
      </section>
    `;
    const list = this.menuRoot.querySelector(".party-menu-list");
    game.partyPokemon.forEach((pokemon, index) => {
      const hpRatio = Math.max(0, pokemon.hp / pokemon.maxHp) * 100;
      const row = document.createElement("button");
      row.type = "button";
      row.className = `party-menu-row${pokemon.dead || pokemon.hp <= 0 ? " fainted" : ""}`;
      row.dataset.summary = index;
      row.dataset.selectable = "";
      row.innerHTML = `
        <img class="party-menu-icon" src="${this.iconFor(pokemon)}" alt="">
        <strong class="party-menu-name">${pokemon.name}</strong>
        <span class="party-menu-meta"><span>Lv.${pokemon.level}</span><span>HP ${pokemon.hp}/${pokemon.maxHp}</span></span>
        <span class="inline-hp"><span style="width:${hpRatio}%"></span></span>
      `;
      list.appendChild(row);
    });
    this.menuRoot.dataset.columns = "2";
    this.bindMenuButton("[data-summary]", (button) => {
      this.summaryPage = "info";
      game.openMenuView("summary", Number(button.dataset.summary));
    });
    this.bindMenuButton("[data-action='back']", () => game.openMenuView("main"), "cancel");
  }

  renderSummaryMenu(game, index) {
    const pokemon = game.partyPokemon[index] || game.partyPokemon[0];
    if (!pokemon) {
      game.openMenuView("pokemon");
      return;
    }
    const ability = window.SurvivorRPG.DataAdapter.getAbilityData(pokemon.abilityId) || { name: "-", description: "" };
    const types = (pokemon.baseTypes || pokemon.types || []).map((type) => type.toUpperCase()).join(" / ");
    let detailHtml = "";
    if (this.summaryPage === "stats") {
      detailHtml = `
        <div class="summary-stat-grid">
          <span>HP</span><strong>${pokemon.hp} / ${pokemon.maxHp}</strong>
          <span>공격</span><strong>${pokemon.attack}</strong>
          <span>방어</span><strong>${pokemon.defense}</strong>
          <span>특수공격</span><strong>${pokemon.specialAttack}</strong>
          <span>특수방어</span><strong>${pokemon.specialDefense}</strong>
          <span>스피드</span><strong>${pokemon.speed}</strong>
          <span>이동 속도</span><strong>${pokemon.movementSpeed.toFixed(0)}</strong>
        </div>
      `;
    } else if (this.summaryPage === "moves") {
      detailHtml = `<div class="summary-move-list">${pokemon.equippedMoves.map((slot) => {
        const move = window.SurvivorRPG.DataAdapter.getMoveData(slot.moveId);
        const cooldown = game.statSystem.calculateMoveCooldown(move, pokemon.speed, slot.upgradeLevel || 0);
        return `<div class="summary-move"><strong>${move.name}</strong><br>${move.type.toUpperCase()} · ${move.category} · 위력 ${move.power} · ${cooldown.toFixed(1)}초 · +${slot.upgradeLevel || 0}</div>`;
      }).join("")}</div>`;
    } else {
      detailHtml = `
        <p>도감 번호: No.${String(pokemon.data.dexNo || 0).padStart(3, "0")}</p>
        <p>타입: <strong>${types}</strong></p>
        <p>테라스탈: <strong>${pokemon.teraType ? pokemon.teraType.toUpperCase() : "없음"}</strong></p>
        <p>특성: <strong>${ability.name}</strong></p>
        <p>${ability.description}</p>
      `;
    }
    this.menuRoot.innerHTML = `
      <section class="summary-screen">
        <div class="menu-title">포켓몬 상태</div>
        <div class="summary-tabs">
          <button data-page="info" class="${this.summaryPage === "info" ? "active" : ""}" data-selectable>정보</button>
          <button data-page="stats" class="${this.summaryPage === "stats" ? "active" : ""}" data-selectable>능력치</button>
          <button data-page="moves" class="${this.summaryPage === "moves" ? "active" : ""}" data-selectable>기술</button>
        </div>
        <div class="summary-layout">
          <div class="summary-main">
            <div class="summary-sprite-frame"><img src="${pokemon.data.frontSprite || pokemon.data.sprite}" alt=""></div>
            <h2>${pokemon.name}</h2>
            <p>Lv.${pokemon.level}</p>
            <p>HP ${pokemon.hp} / ${pokemon.maxHp}</p>
          </div>
          <div class="summary-details">${detailHtml}</div>
        </div>
        <div class="menu-footer">
          <button class="menu-action" data-up="${index}" ${index === 0 ? "disabled" : ""} data-selectable>위로 이동</button>
          <button class="menu-action" data-down="${index}" ${index === game.partyPokemon.length - 1 ? "disabled" : ""} data-selectable>아래로 이동</button>
          <button class="menu-action" data-action="back" data-selectable>뒤로</button>
        </div>
      </section>
    `;
    this.menuRoot.dataset.columns = "1";
    this.bindMenuButton("[data-page]", (button) => {
      this.summaryPage = button.dataset.page;
      this.menuOverlay.dataset.summaryPage = this.summaryPage;
      this.selectedByView.set("summary", 0);
      this.renderSummaryMenu(game, index);
      this.selectedIndex = 0;
      this.refreshSelection(false);
    });
    this.bindMenuButton("[data-up]", () => {
      game.swapPartySlots(index, index - 1);
      game.openMenuView("summary", index - 1);
    });
    this.bindMenuButton("[data-down]", () => {
      game.swapPartySlots(index, index + 1);
      game.openMenuView("summary", index + 1);
    });
    this.bindMenuButton("[data-action='back']", () => game.openMenuView("pokemon"), "cancel");
  }

  renderPokedexMenu(game) {
    const species = Object.values(window.SurvivorRPG.PokemonData).sort((a, b) => (a.dexNo || 999) - (b.dexNo || 999));
    this.menuRoot.innerHTML = `
      <section class="pokedex-screen">
        <div class="menu-title">포켓몬 도감</div>
        <div class="pokedex-content">
          <div class="pokedex-preview"></div>
          <div class="pokedex-list"></div>
        </div>
        <div class="menu-footer"><button class="menu-action" data-action="back" data-selectable>뒤로</button></div>
      </section>
    `;
    const list = this.menuRoot.querySelector(".pokedex-list");
    species.forEach((item) => {
      const state = game.pokedex[item.id] || { seen: false, caught: false };
      const row = document.createElement("button");
      row.type = "button";
      row.className = "pokedex-row";
      row.dataset.pokedexId = item.id;
      row.dataset.selectable = "";
      row.innerHTML = `
        ${state.seen ? `<img src="assets/pokemon-icons/${item.id}.png" alt="">` : "<span></span>"}
        <strong>No.${String(item.dexNo || 0).padStart(3, "0")} ${state.seen ? item.name : "???"}</strong>
        <span>${state.caught ? "포획" : state.seen ? "발견" : "미발견"}</span>
      `;
      list.appendChild(row);
    });
    this.menuRoot.dataset.columns = "1";
    this.bindMenuButton("[data-pokedex-id]", () => {});
    this.bindMenuButton("[data-action='back']", () => game.openMenuView("main"), "cancel");
  }

  updatePokedexPreview() {
    const preview = this.menuRoot.querySelector(".pokedex-preview");
    const selected = this.selectables()[this.selectedIndex];
    if (!preview || !selected?.dataset.pokedexId || !this.currentGame) return;
    const item = window.SurvivorRPG.PokemonData[selected.dataset.pokedexId];
    const state = this.currentGame.pokedex[item.id] || { seen: false, caught: false };
    preview.innerHTML = state.seen ? `
      <div class="pokedex-sprite-frame"><img src="${item.frontSprite || item.sprite}" alt=""></div>
      <h2>No.${String(item.dexNo || 0).padStart(3, "0")} ${item.name}</h2>
      <p>${(item.types || []).map((type) => type.toUpperCase()).join(" / ")}</p>
      <p>${item.pokedex || "관찰 기록이 아직 없습니다."}</p>
    ` : `<h2>미발견 포켓몬</h2><p>필드에서 만나면 정보가 기록됩니다.</p>`;
  }

  renderBagMenu(game) {
    const items = window.SurvivorRPG.ItemData;
    const expEnabled = game.items.expShare && game.items.expShareEnabled !== false;
    this.menuRoot.innerHTML = `
      <section class="bag-screen">
        <div class="menu-title">가방</div>
        <img class="bag-art" src="assets/ui/anil-bag.png" alt="">
        <strong class="bag-money">${game.money}원</strong>
        <div class="bag-content">
          <div class="item-list">
            ${this.itemRow("ball-info", items.pokeBall, `x${game.balls.pokeBall}`)}
            ${this.itemRow("potion", items.potion, `x${game.items.potion || 0}`, game.items.potion <= 0)}
            ${this.itemRow("exp-share", items.expShare, game.items.expShare ? (expEnabled ? "ON" : "OFF") : "없음", !game.items.expShare)}
          </div>
          <div class="item-description">아이템을 선택하세요.</div>
        </div>
        <div class="menu-footer"><button class="menu-action" data-action="back" data-selectable>뒤로</button></div>
      </section>
    `;
    this.menuRoot.dataset.columns = "1";
    this.bindMenuButton("[data-use='potion']", () => game.startBagUse("potion"));
    this.bindMenuButton("[data-use='exp-share']", () => game.toggleExpShare());
    this.bindMenuButton("[data-action='back']", () => game.openMenuView("main"), "cancel");
  }

  itemRow(action, item, amount, disabled = false) {
    const use = action === "potion" ? "potion" : action === "exp-share" ? "exp-share" : "";
    return `
      <button class="item-row" ${use ? `data-use="${use}"` : ""} data-description="${item.description}" ${disabled ? "disabled" : "data-selectable"}>
        <img class="item-icon" src="${item.icon}" alt=""><strong>${item.name}</strong><span>${amount}</span>
      </button>
    `;
  }

  renderBagTargetMenu(game) {
    this.menuRoot.innerHTML = `
      <section class="bag-screen">
        <div class="menu-title">상처약을 사용할 포켓몬</div>
        <img class="bag-art" src="assets/items/potion.png" alt="">
        <strong class="bag-money">상처약 x${game.items.potion || 0}</strong>
        <div class="bag-content"><div class="item-list"></div></div>
        <div class="menu-footer"><button class="menu-action" data-action="back" data-selectable>뒤로</button></div>
      </section>
    `;
    const list = this.menuRoot.querySelector(".item-list");
    game.partyPokemon.forEach((pokemon, index) => {
      const disabled = pokemon.hp >= pokemon.maxHp || pokemon.dead;
      list.insertAdjacentHTML("beforeend", `
        <button class="item-row" data-potion-target="${index}" ${disabled ? "disabled" : "data-selectable"}>
          <img class="item-icon" src="${this.iconFor(pokemon)}" alt="">
          <strong>${pokemon.name} Lv.${pokemon.level}</strong>
          <span>HP ${pokemon.hp}/${pokemon.maxHp}</span>
        </button>
      `);
    });
    this.menuRoot.dataset.columns = "1";
    this.bindMenuButton("[data-potion-target]", (button) => game.usePotion(Number(button.dataset.potionTarget)));
    this.bindMenuButton("[data-action='back']", () => game.openMenuView("bag"), "cancel");
  }

  renderMartMenu(game) {
    const items = window.SurvivorRPG.ItemData;
    this.menuRoot.innerHTML = `
      <section class="mart-screen">
        <div class="menu-title">포켓마트</div>
        <strong class="mart-money">${game.money}원</strong>
        <div class="mart-content">
          <div class="item-list">
            ${this.martRow("pokeBall", items.pokeBall, game.balls.pokeBall)}
            ${this.martRow("potion", items.potion, game.items.potion || 0)}
            ${this.martRow("expShare", items.expShare, game.items.expShare ? "보유" : 0, game.items.expShare)}
            ${this.martRow("doubleBattle", items.doubleBattle, game.items.doubleBattle ? "보유" : 0, game.items.doubleBattle)}
            ${this.martRow("tripleBattle", items.tripleBattle, game.items.tripleBattle ? "보유" : 0, game.items.tripleBattle)}
          </div>
          <div class="item-description">Z를 누르면 1개를 구매합니다.</div>
        </div>
        <div class="menu-footer"><button class="menu-action" data-action="back" data-selectable>뒤로</button></div>
      </section>
    `;
    this.menuRoot.dataset.columns = "1";
    this.bindMenuButton("[data-buy]", (button) => {
      if (game.buyItem(button.dataset.buy)) game.assets.play("uiBuy", 0.42);
    });
    this.bindMenuButton("[data-action='back']", () => game.openMenuView("main"), "cancel");
  }

  martRow(id, item, amount, disabled = false) {
    return `
      <button class="item-row" data-buy="${id}" data-description="${item.description}" ${disabled ? "disabled" : "data-selectable"}>
        <img class="item-icon" src="${item.icon}" alt="">
        <strong>${item.name}<br><small>${item.description}</small></strong>
        <span>${item.price}원 · ${amount}</span>
      </button>
    `;
  }

  renderReportMenu(game) {
    const caught = Object.values(game.pokedex).filter((entry) => entry.caught).length;
    const seen = Object.values(game.pokedex).filter((entry) => entry.seen).length;
    this.menuRoot.innerHTML = `
      <section class="compact-screen">
        <div class="menu-title">리포트</div>
        <div class="report-grid">
          <span>현재 장소</span><strong>${game.map.name}</strong>
          <span>파티</span><strong>${game.partyPokemon.length} / 6</strong>
          <span>보유 포켓몬</span><strong>${game.ownedPokemon.length}</strong>
          <span>도감</span><strong>${seen} 발견 · ${caught} 포획</strong>
          <span>소지금</span><strong>${game.money}원</strong>
          <span>학습장치</span><strong>${game.items.expShare ? (game.items.expShareEnabled === false ? "OFF" : "ON") : "없음"}</strong>
        </div>
        <div class="menu-list">
          <button class="menu-action" data-action="save" data-selectable>리포트 저장</button>
          <button class="menu-action" data-action="load" data-selectable>리포트 불러오기</button>
          <button class="menu-action" data-action="back" data-selectable>뒤로</button>
        </div>
      </section>
    `;
    this.menuRoot.dataset.columns = "1";
    this.bindMenuButton("[data-action='save']", () => game.saveGame());
    this.bindMenuButton("[data-action='load']", () => game.loadGame());
    this.bindMenuButton("[data-action='back']", () => game.openMenuView("main"), "cancel");
  }

  renderAreaSelectMenu(game) {
    this.menuRoot.innerHTML = `
      <section class="compact-screen">
        <div class="menu-title">사냥터 선택</div>
        <div class="menu-list">
          ${window.SurvivorRPG.HuntingAreas.map((area) => `
            <button class="menu-option" data-area="${area.id}" data-selectable>
              ${area.name}<br><small>권장 Lv.${area.recommendedLevelMin}~${area.recommendedLevelMax}</small>
            </button>
          `).join("")}
          <button class="menu-action" data-action="back" data-selectable>뒤로</button>
        </div>
      </section>
    `;
    this.menuRoot.dataset.columns = "1";
    this.bindMenuButton("[data-area]", (button) => game.travelToArea(button.dataset.area));
    this.bindMenuButton("[data-action='back']", () => game.openMenuView("main"), "cancel");
  }

  bindMenuButton(selector, handler, sound = "confirm") {
    this.menuRoot.querySelectorAll(selector).forEach((button) => {
      button.addEventListener("pointerenter", () => {
        const index = this.selectables().indexOf(button);
        if (index >= 0 && index !== this.selectedIndex) {
          this.selectedIndex = index;
          this.refreshSelection(true);
        }
      });
      button.addEventListener("click", () => {
        this.currentGame?.assets.play(sound === "cancel" ? "uiCancel" : "uiConfirm", 0.38);
        handler(button);
      });
    });
  }

  selectables() {
    return [...this.menuRoot.querySelectorAll("[data-selectable]:not(:disabled)")];
  }

  navigateMenu(vector, dt) {
    return this.navigateCollection(this.selectables(), vector, dt, false);
  }

  navigateChoices(vector, dt) {
    return this.navigateCollection(this.choiceCards.querySelectorAll("[data-selectable]"), vector, dt, true);
  }

  navigateCollection(itemsLike, vector, dt, isChoice) {
    const items = [...itemsLike];
    if (!items.length) return false;
    const magnitude = Math.hypot(vector.x, vector.y);
    if (magnitude < 0.42) {
      this.navDirection = "";
      this.navRepeat = 0;
      return false;
    }
    const direction = Math.abs(vector.x) > Math.abs(vector.y)
      ? (vector.x > 0 ? "right" : "left")
      : (vector.y > 0 ? "down" : "up");
    if (this.navDirection === direction && this.navRepeat > 0) {
      this.navRepeat -= dt;
      return false;
    }
    const firstPress = this.navDirection !== direction;
    this.navDirection = direction;
    this.navRepeat = firstPress ? 0.34 : 0.13;
    const columns = isChoice ? 3 : Math.max(1, Number(this.menuRoot.dataset.columns) || 1);
    const current = isChoice ? this.choiceSelection : this.selectedIndex;
    const delta = direction === "left" ? -1 : direction === "right" ? 1 : direction === "up" ? -columns : columns;
    const next = Math.max(0, Math.min(items.length - 1, current + delta));
    if (next === current) return false;
    if (isChoice) {
      this.choiceSelection = next;
      this.updateChoiceSelection();
    } else {
      this.selectedIndex = next;
      this.refreshSelection(false);
    }
    this.currentGame?.assets.play("uiCursor", 0.3);
    return true;
  }

  activateSelection() {
    this.selectables()[this.selectedIndex]?.click();
  }

  activateChoice() {
    const items = [...this.choiceCards.querySelectorAll("[data-selectable]")];
    items[this.choiceSelection]?.click();
  }

  refreshSelection(playSound = false) {
    const items = this.selectables();
    if (!items.length) return;
    this.selectedIndex = Math.max(0, Math.min(items.length - 1, this.selectedIndex));
    items.forEach((item, index) => item.classList.toggle("is-selected", index === this.selectedIndex));
    const selected = items[this.selectedIndex];
    selected.scrollIntoView?.({ block: "nearest" });
    const view = this.currentGame?.menuView || "main";
    this.selectedByView.set(view, this.selectedIndex);
    const description = this.menuRoot.querySelector(".item-description");
    if (description && selected.dataset.description) description.textContent = selected.dataset.description;
    this.updatePokedexPreview();
    if (playSound) this.currentGame?.assets.play("uiCursor", 0.3);
  }
};
