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
    this.switchActionBtn = document.getElementById("switchActionBtn");
    this.switchActionLabel = document.getElementById("switchActionLabel");
    this.xActionLabel = document.getElementById("xActionLabel");
    this.ballActionBtn = document.getElementById("ballActionBtn");
    this.ballCounter = document.querySelector(".ball-counter");
    this.partyActionBtn = document.getElementById("partyActionBtn");
    this.menuActionBtn = document.getElementById("menuActionBtn");
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
    const trainerEngine = game.storyBattle?.engine || game.trainerBattle || null;
    const trainerBattleUi = !!trainerEngine && !["levelChoice", "moveLearn"].includes(game.mode);
    this.currentGame = game;
    document.getElementById('gameRoot').dataset.awaitingStarter = String(!!game.awaitingStarter);
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
    this.switchActionBtn.hidden = trainerBattleUi;
    this.ballCounter.hidden = trainerBattleUi;
    this.ballActionBtn.disabled = trainerBattleUi
      ? trainerEngine.playerActive.filter((pokemon) => pokemon && !pokemon.dead).length < 2
      : game.mode === "trainer" && game.balls.pokeBall <= 0;
    this.partyActionBtn.disabled = trainerBattleUi
      ? trainerEngine.playerReserves().length === 0 || trainerEngine.playerSwitchCooldown > 0
      : game.partyPokemon.filter((pokemon) => pokemon && !pokemon.dead).length < 2;
    this.partyActionBtn.textContent = trainerBattleUi ? "교체" : "SELECT";
    this.menuActionBtn.textContent = trainerBattleUi ? "PAUSE" : "START";
    this.renderMoveCooldowns(game, player);
    this.renderParty(game);
    this.levelToast.hidden = !game.progressNotice;
    if (!this.levelToast.hidden) this.levelToast.textContent = game.progressNotice.text;
    this.messageBox.hidden = game.messageTimer <= 0;
    if (!this.messageBox.hidden) this.messageBox.textContent = game.messageText;
    this.gameOver.hidden = game.mode !== "gameOver" || !!game.story;
    document.getElementById("restartBtn").textContent = game.story ? '포켓몬센터에서 계속하기' : "오박사에게 새 파트너 받기";
    this.updateSurvival(game);
    this.debugPanel.hidden = !game.debug;
    if (game.debug) {
      const debugLines = [
        `FPS ${game.fps.toFixed(0)}`,
        `모드 ${game.mode}`,
        `맵 ${game.map.name}`,
        `좌표 ${player.x.toFixed(0)}, ${player.y.toFixed(0)}`,
        `속도 ${player.speed} / 이동 ${player.movementSpeed.toFixed(0)}`,
        `적 ${game.enemies.filter((enemy) => !enemy.dead).length}`,
        `파티 ${game.partyPokemon.length} / 보유 ${game.ownedPokemon.length}`,
        `소지금 ${game.money}원`
      ];
      if (trainerEngine) {
        debugLines.push(
          `TB ${trainerEngine.phase} · AI ${trainerEngine.trainerAI.profile.name}`,
          `Active ${trainerEngine.playerActive.length}v${trainerEngine.opponentActive.length} · 교체 ${trainerEngine.playerSwitchCooldown.toFixed(1)}s`
        );
        for (const pokemon of [...trainerEngine.playerActive, ...trainerEngine.opponentActive]) {
          const target = pokemon.aiTarget;
          const role = trainerEngine.pokemonAI.inferRole(pokemon);
          const threat = trainerEngine.trainerAI.threat.get(pokemon.uniqueId) || 0;
          const cast = game.combatSystem.telegraphs.find((entry) => entry.caster === pokemon)
            || game.combatSystem.meleeSwings.find((entry) => entry.cast?.caster === pokemon)?.cast;
          const moveName = cast?.move?.name || '-';
          const cooldown = pokemon.equippedMoves?.reduce((best, slot) => Math.max(best,
            typeof slot === 'object' ? Number(slot.cooldownRemaining || 0) : 0), 0) || pokemon.attackCooldown || 0;
          debugLines.push(`${pokemon.name}: ${pokemon.trainerBattleState || 'combat'} · ${role.role}/${role.preferredRange.toFixed(0)} · T ${target?.name || '-'} ${Number(pokemon.trainerTargetScore || 0).toFixed(1)} · M ${moveName} · CD ${Number(cooldown).toFixed(1)} · TH ${Number(threat).toFixed(0)} · SW ${Number(pokemon.trainerSwitchScore || 0).toFixed(2)}`);
        }
      }
      this.debugPanel.textContent = debugLines.join("\n");
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
    if ((game.storyBattle?.engine || game.trainerBattle) && !["levelChoice", "moveLearn"].includes(game.mode)) return "사용 안 함";
    if (game.mode === 'trainer' && game.trainer.running && !game.menuOpen) return '달리기';
    if (game.mode === "survivalClear") return "귀환";
    if (game.menuOpen || game.mode === "levelChoice" || game.mode === "moveLearn") return "결정";
    if (game.nearbyNpc) return game.nearbyNpc.type === "HEALER" ? "치료" : "대화";
    return game.mode === "pokemon" ? "회수" : "출전";
  }

  xActionText(game) {
    if ((game.storyBattle?.engine || game.trainerBattle) && !["levelChoice", "moveLearn"].includes(game.mode)) return "리더 변경";
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
    this.survivalHud.textContent = `${run.phase()} ${clock} · ${state}\n야생 Lv.${difficulty.levelMin}~${difficulty.levelMax} · 처치 ${run.kills}\n치료소 ${arrow} ${cooldown ? `${cooldown}초` : '준비 완료'}`;
    if (!this.survivalResult.hidden) document.getElementById('survivalResultStats').textContent =
      `생존 15:00 · 처치 ${run.kills} · 포획 ${run.captures}\n획득 ${run.stats.earned}원\n`
      + game.partyPokemon.map(p=>`${p.name}: 피해 ${run.stats.damage[p.uniqueId] || 0}`).join('\n')
      + (run.stats.caught.length?'\n포획: '+[...new Set(run.stats.caught)].map(id=>window.SurvivorRPG.PokemonData[id]?.name || id).join(', '):'')
      + '\n' + run.stats.rewards.join(' · ');
  }

  renderParty(game) {
    const signature=game.partyPokemon.map(p=>[p.uniqueId,p.speciesId,p.hp,p.maxHp,p.dead,this.iconFor(p)].join(':')).join('|')
      +game.selectedPokemon?.uniqueId+game.activePokemon?.uniqueId+game.partyBattle.members.map(p=>p.uniqueId).join(',');
    if(this.partySignature===signature)return;
    this.partySignature=signature;
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
    const slots = [...player.equippedMoves];
    while (slots.length < 4) slots.push(null);
    const signature=slots.map(slot=>slot?slot.moveId+':'+slot.upgradeLevel:'-').join('|');
    if(this.moveSignature!==signature) {
      this.moveSignature=signature;this.moveCooldownList.innerHTML='';
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
    slots.forEach((slot,index)=>{
      const row=this.moveCooldownList.children[index];if(!slot)return;
      const move=window.SurvivorRPG.MoveData[slot.moveId];
      const cooldown=game.statSystem.calculateMoveCooldown(move,player.speed,slot.upgradeLevel || 0);
      row.querySelector('.meter > div').style.width=(game.mode==='pokemon'?(1-Math.min(1,(slot.cooldownRemaining || 0)/cooldown))*100:0)+'%';
      row.classList.toggle('ready',game.mode==='pokemon'&&slot.cooldownRemaining<=0);
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
        <span class="choice-rarity">${{ common: '일반', rare: '희귀', hero: '영웅', legendary: '전설' }[choice.rarity]}</span>
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
    this.bindChoiceFocus();
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
      card.innerHTML = this.moveCardHtml(move, slot.upgradeLevel || 0, learn.confirmForgetIndex===index
        ? "강화 효과도 사라집니다. 이 기술을 잊겠습니까?" : "이 기술을 잊고 새 기술을 배웁니다.", index + 1);
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
    this.bindChoiceFocus();
    this.choiceOverlay.hidden = false;
  }

  moveCardHtml(move, upgradeLevel, description, key, label = "잊을 기술") {
    const stars = "★".repeat(upgradeLevel) + "☆".repeat(Math.max(0, 4 - upgradeLevel));
    return `
      <strong>${label}: ${move.name}</strong>
      <span class="choice-summary">${window.SurvivorRPG.DataAdapter.getTypeData(move.type).name} · ${move.category==='physical'?'물리':'특수'} · 위력 ${move.power}</span>
      <span class="choice-description">쿨타임 ${move.baseCooldown.toFixed(1)}초 · ${stars}<br>${description}</span>
      <span class="choice-key">${key}</span>
    `;
  }

  hideLevelChoices() {
    this.choiceOverlay.hidden = true;
    this.choiceCards.innerHTML = "";
  }

  bindChoiceFocus() {
    [...this.choiceCards.children].forEach((card,index)=>{
      card.addEventListener('pointerenter',()=>{this.choiceSelection=index;this.updateChoiceSelection();});
      card.addEventListener('focus',()=>{this.choiceSelection=index;this.updateChoiceSelection();});
      card.addEventListener('click',()=>this.currentGame?.assets.play('uiConfirm',.32));
    });
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
    if (["main", "report", "settings", "areaSelect", "formation", "professor", "starterSelect", "starterConfirm", "resetConfirm"].includes(game.menuView)) this.menuWindow.classList.add("menu-window--compact");

    if (game.menuView === "pokemon") this.renderPokemonMenu(game);
    else if (game.menuView === "summary") this.renderSummaryMenu(game, game.menuSelectedPokemonIndex);
    else if (game.menuView === "pokedex") this.renderPokedexMenu(game);
    else if (game.menuView === "areaSelect") this.renderAreaSelectMenu(game);
    else if (game.menuView === "bag") this.renderBagMenu(game);
    else if (game.menuView === "bagTarget") this.renderBagTargetMenu(game);
    else if (game.menuView === "mart") this.renderMartMenu(game);
    else if (game.menuView === "report") this.renderReportMenu(game);
    else if (game.menuView === "settings") this.renderSettingsMenu(game);
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
      <section class="anil-pause-screen">
        <div class="menu-list" aria-label="메뉴">
          ${this.menuOption("pokemon", "assets/ui/pause/pokemonA.png", "포켓몬")}
          ${this.menuOption("bag", "assets/ui/pause/bagA.png", "가방")}
          ${this.menuOption("pokedex", "assets/ui/pause/pokedexA.png", "도감")}
          ${this.menuOption("report", "assets/ui/pause/saveA.png", "리포트")}
          ${this.menuOption("formation", "assets/ui/pause/controlesA.png", "배틀 설정")}
          ${this.menuOption("settings", "assets/ui/pause/optionsA.png", "설정")}
          <button class="menu-option" data-action="close" data-selectable><span class="menu-option-content"><img class="menu-icon" src="assets/ui/pause/exitA.png" alt="">닫기</span></button>
        </div>
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
          data-formation="${mode}" ${owned ? 'data-selectable' : 'disabled'}>${name}${!owned ? (game.story ? ' · 체육관 보상' : ' · 미구매') : game.battleFormation === mode ? ' · ON' : ''}</button>`).join('')}
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
        ${game.balls.pokeBall===0&&game.money<50?'<button class="menu-option" data-supply data-selectable>몬스터볼 지원받기</button>':''}
        <button class="menu-option" data-professor="resetConfirm" data-selectable>새로 시작</button>
        <button class="menu-option" data-close data-selectable>대화 종료</button>`;
    } else if (game.menuView === 'starterSelect') {
      content = ['bulbasaur', 'charmander', 'squirtle'].map((id) => {
        const data = window.SurvivorRPG.PokemonData[id];
        const icon = data?.icon || `assets/pokemon-icons/${id}.png`;
        return `<button class="menu-option" data-starter="${id}" data-selectable>
        <span class="menu-option-content"><span class="starter-icon" style="background-image:url('${icon}')"></span>${data.name}</span></button>`;
      }).join('')
        + (game.awaitingStarter ? '' : '<button class="menu-option" data-back data-selectable>뒤로</button>');
    } else if (game.menuView === 'starterConfirm') {
      const name = window.SurvivorRPG.PokemonData[game.pendingStarter]?.name || '';
      content = `<p class="professor-notice">${game.awaitingStarter ? `${name}와 함께 새 모험을 시작할까요?` : `첫 파트너를 ${name}(으)로 바꿀까요?<br>레벨·성장·HP 비율·소지품은 유지됩니다. 기술 강화·특성·타입은 새 파트너 기준으로 바뀝니다.`}</p>
        <button class="menu-option" data-change data-selectable>${game.awaitingStarter ? '파트너 받기' : '변경하기'}</button>
        <button class="menu-option" data-back data-selectable>취소</button>`;
    } else {
      content = `<p class="professor-notice">${game.story ? '스토리를 오박사부터 새로 시작할까요?<br>스토리 진행·파티·재화는 초기화되고 야생 포켓몬 레벨 구성도 새로 정해집니다. 도감·연구 기록은 보존됩니다.' : '새 모험을 시작할까요?<br>파티·재화·구매한 배틀 모드는 초기화됩니다. 도감·연구 업적은 보존됩니다.'}</p>
        <button class="menu-option" data-back data-selectable>취소</button>
        <button class="menu-option" data-reset data-selectable>${game.story ? '오박사부터 새로 시작' : '새 파트너로 시작'}</button>`;
    }
    this.menuRoot.innerHTML = `<section class="compact-screen"><div class="menu-title">오박사</div><div class="menu-list">${content}</div></section>`;
    this.menuRoot.dataset.columns = '1';
    this.bindMenuButton('[data-professor]', (button) => game.openMenuView(button.dataset.professor));
    this.bindMenuButton('[data-starter]', (button) => game.chooseStarter(button.dataset.starter));
    this.bindMenuButton('[data-change]', () => game.changeStarter());
    this.bindMenuButton('[data-reset]', () => game.resetAtProfessor());
    this.bindMenuButton('[data-supply]', () => game.receiveEmergencyBalls());
    this.bindMenuButton('[data-back]', () => game.backMenu(), 'cancel');
    this.bindMenuButton('[data-close]', () => game.toggleMenu(), 'cancel');
  }

  renderPokemonMenu(game) {
    this.menuRoot.innerHTML = `
      <section class="native-screen anil-party-screen" aria-label="포켓몬 파티">
        <div class="anil-party-list"></div>
        <div class="anil-party-message">포켓몬을 선택해 주세요.</div>
        <button class="anil-cancel" data-action="back" data-selectable>취소</button>
      </section>
    `;
    const list = this.menuRoot.querySelector(".anil-party-list");
    for (let index = 0; index < 6; index++) {
      const pokemon = game.partyPokemon[index];
      const position = `left:${index % 2 * 256}px;top:${[0, 104, 200][Math.floor(index / 2)] + index % 2 * 26}px`;
      if (!pokemon) {
        list.insertAdjacentHTML('beforeend', `<div class="anil-party-empty" style="${position}" aria-label="빈 슬롯"></div>`);
        continue;
      }
      const hpRatio = Math.max(0, pokemon.hp / pokemon.maxHp) * 100;
      const row = document.createElement("button");
      row.type = "button";
      row.className = `anil-party-row${index === 0 ? ' first' : ''}${pokemon.dead || pokemon.hp <= 0 ? " fainted" : ""}`;
      row.style.cssText = position;
      row.dataset.summary = index;
      row.dataset.selectable = "";
      row.innerHTML = `
        <span class="anil-party-ball"></span>
        <span class="anil-party-icon" style="background-image:url('${this.iconFor(pokemon)}')"></span>
        <span class="anil-party-name">${pokemon.name}</span>
        <span class="anil-party-level">Lv.${pokemon.level}</span>
        <span class="anil-party-hptext">${pokemon.hp} / ${pokemon.maxHp}</span>
        <span class="anil-party-hp"><span style="width:${hpRatio}%;background-position-y:${hpRatio <= 20 ? -16 : hpRatio <= 50 ? -8 : 0}px"></span></span>
      `;
      list.appendChild(row);
    }
    this.menuRoot.dataset.columns = "2";
    this.bindMenuButton("[data-summary]", (button) => {
      this.summaryPage = "moves";
      game.openMenuView("summary", Number(button.dataset.summary));
    });
    this.bindMenuButton("[data-action='back']", () => game.openMenuView("main"), "cancel");
  }

  typeIcon(type) {
    const order = ['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'unknown', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy'];
    return `<span class="anil-type-icon" style="background-position:-${Math.max(0, order.indexOf(type)) * 24}px 0" title="${type}"></span>`;
  }

  renderSummaryMenu(game, index) {
    const pokemon = game.partyPokemon[index] || game.partyPokemon[0];
    if (!pokemon) { game.openMenuView('pokemon'); return; }
    const page = this.summaryPage;
    this.menuOverlay.dataset.summaryPage = page;
    const ability = window.SurvivorRPG.DataAdapter.getAbilityData(pokemon.abilityId);
    const slots = Array.from({ length: 4 }, (_, i) => pokemon.equippedMoves[i]);
    let detail;
    if (page === 'moves') {
      detail = `<div class="anil-move-list">${slots.map((slot, i) => {
        const move = slot && window.SurvivorRPG.MoveData[slot.moveId];
        if (!move) return '<div class="anil-move-row empty"><span class="anil-move-name">-</span><span class="anil-move-cd">--</span></div>';
        const cooldown = game.statSystem.calculateMoveCooldown(move, pokemon.speed, slot.upgradeLevel || 0);
        return `<button class="anil-move-row" data-move-detail="${i}" data-selectable data-description="${move.category === 'physical' ? '물리' : '특수'} · 위력 ${move.power} · 강화 +${slot.upgradeLevel || 0}">
          ${this.typeIcon(move.type)}<span class="anil-move-name">${move.name}</span><span class="anil-move-cd"><small>쿨타임</small> ${cooldown.toFixed(1)}초</span></button>`;
      }).join('')}</div><div class="anil-move-detail"></div>`;
    } else {
      const rows = page === 'stats' ? [['HP', `${pokemon.hp} / ${pokemon.maxHp}`], ['공격', pokemon.attack], ['방어', pokemon.defense],
        ['특수공격', pokemon.specialAttack], ['특수방어', pokemon.specialDefense], ['스피드', pokemon.speed], ['이동 속도', pokemon.movementSpeed.toFixed(0)]]
        : [['도감 번호', `No.${String(pokemon.data.dexNo || 0).padStart(3, '0')}`], ['이름', pokemon.name],
          ['레벨', pokemon.level], ['경험치', `${pokemon.exp} / ${pokemon.expToNext}`], ['특성', ability.name],
          ['원래 타입', (pokemon.baseTypes || pokemon.types).map(type => this.typeIcon(type)).join(' ')],
          ['테라스탈', pokemon.teraType ? this.typeIcon(pokemon.teraType) : '없음']];
      detail = `<dl class="anil-summary-data">${rows.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('')}</dl>
        <div class="anil-summary-note">${page === 'stats' ? 'HP ' + pokemon.hp + ' / ' + pokemon.maxHp : ability.description}</div>`;
    }
    this.menuRoot.innerHTML = `<section class="native-screen anil-summary-screen ${page === 'moves' ? 'moves' : 'info'}">
      <h2 class="anil-summary-title">${{info:'포켓몬 정보',stats:'능력치',moves:'기술'}[page]}</h2>
      <nav class="anil-summary-tabs" aria-label="상태 페이지">${[['info','정보'],['stats','능력치'],['moves','기술']].map(([key,label]) =>
        `<button title="${label}" aria-label="${label}" aria-pressed="${page === key}" data-page="${key}" data-selectable class="${page === key ? 'active' : ''}" style="background-image:url('assets/ui/summary/page_${key === 'stats' ? 'skills' : key}.png')"></button>`).join('')}
        <button class="anil-summary-back" data-action="back" title="파티로 돌아가기" aria-label="파티로 돌아가기" data-selectable></button>
      </nav>
      <div class="anil-summary-sprite"><img src="${pokemon.data.frontSprite}" alt="${pokemon.name}"></div>
      <img class="anil-summary-ball" src="assets/ui/summary/icon_ball_POKEBALL.png" alt="">
      <span class="anil-summary-name">${pokemon.name}</span><span class="anil-summary-level">${pokemon.level}</span>
      <div class="anil-summary-types">${pokemon.types.map((type) => this.typeIcon(type)).join('')}</div>
      ${detail}
      <div class="anil-summary-party">${game.partyPokemon.map((p,i) => `<button data-party-preview="${i}" data-selectable title="${p.name}" aria-label="${p.name}" class="${index === i ? 'current' : ''}"><span style="background-image:url('${this.iconFor(p)}')"></span></button>`).join('')}</div>
      <div class="anil-party-order">
        <button data-up="${index}" ${index === 0 ? 'disabled' : ''} data-selectable title="파티 순서 앞으로" aria-label="파티 순서 앞으로"></button>
        <button data-down="${index}" ${index === game.partyPokemon.length - 1 ? 'disabled' : ''} data-selectable title="파티 순서 뒤로" aria-label="파티 순서 뒤로"></button>
      </div>
    </section>`;
    this.menuRoot.dataset.columns = '1';
    this.bindMenuButton('[data-page]', (button) => {
      this.summaryPage = button.dataset.page;
      this.selectedByView.set('summary', 0);
      this.renderSummaryMenu(game, index); this.selectedIndex = 0; this.refreshSelection(false);
    });
    this.bindMenuButton('[data-party-preview]', (button) => game.openMenuView('summary', Number(button.dataset.partyPreview)));
    this.bindMenuButton('[data-move-detail]', (button) => {
      this.menuRoot.querySelector('.anil-move-detail').textContent = button.dataset.description;
    });
    this.bindMenuButton('[data-up]', () => { game.swapPartySlots(index, index - 1); game.openMenuView('summary', index - 1); });
    this.bindMenuButton('[data-down]', () => { game.swapPartySlots(index, index + 1); game.openMenuView('summary', index + 1); });
    this.bindMenuButton("[data-action='back']", () => game.openMenuView('pokemon'), 'cancel');
  }

  renderPokedexMenu(game) {
    const species = Object.values(window.SurvivorRPG.PokemonData).sort((a, b) => (a.dexNo || 999) - (b.dexNo || 999));
    this.menuRoot.innerHTML = `
      <section class="native-screen anil-pokedex-screen" aria-label="포켓몬 도감">
        <h2 class="anil-pokedex-title">포켓몬 도감</h2>
        <div class="pokedex-preview"></div>
        <div class="pokedex-list" aria-label="도감 목록"></div>
        <button class="anil-pokedex-back" data-action="back" data-selectable aria-label="메뉴로 돌아가기">뒤로</button>
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
        ${state.seen ? `<span class="pokedex-icon" style="background-image:url('${item.icon || `assets/pokemon-icons/${item.id}.png`}')" aria-hidden="true"></span>` : '<span class="pokedex-icon pokedex-icon--unknown" aria-hidden="true">?</span>'}
        <strong><small>No.${String(item.dexNo || 0).padStart(3, "0")}</small>${state.seen ? item.name : "???"}</strong>
        <span class="pokedex-state">${state.caught ? "●" : state.seen ? "○" : "―"}</span>
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
      <div class="pokedex-types">${(item.types || []).map((type) => this.typeIcon(type)).join("")}</div>
      <p class="pokedex-description">${item.pokedex || "관찰 기록이 아직 없습니다."}</p>
      <p class="pokedex-caught">${state.caught ? "포획 완료" : "발견 기록"}</p>
    ` : `<div class="pokedex-unknown">?</div><h2>미발견 포켓몬</h2><p class="pokedex-description">필드에서 만나면 정보가 기록됩니다.</p>`;
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
          <button class="menu-action" data-action="export" data-selectable>리포트 내보내기</button>
          <button class="menu-action" data-action="import" data-selectable>리포트 가져오기</button>
          <input type="file" accept=".json,application/json" id="reportImport" hidden>
          <button class="menu-action" data-action="back" data-selectable>뒤로</button>
        </div>
      </section>
    `;
    this.menuRoot.dataset.columns = "1";
    this.bindMenuButton("[data-action='save']", () => game.saveGame());
    this.bindMenuButton("[data-action='load']", () => game.loadGame());
    this.bindMenuButton("[data-action='export']", () => {
      try{game.store.export(game.serializeRun());}catch{game.message('내보낼 리포트가 없습니다.',2);}
    });
    this.bindMenuButton("[data-action='import']", () => this.menuRoot.querySelector('#reportImport').click());
    this.menuRoot.querySelector('#reportImport').addEventListener('change',event=>game.importReport(event.target.files[0]));
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

  renderSettingsMenu(game) {
    const s=game.assets.settings;
    this.menuRoot.innerHTML=`<section class="compact-screen"><div class="menu-title">설정</div>
      <div class="menu-list">
        <label class="menu-option">배경 음악 <input aria-label="배경 음악" data-setting="music" data-selectable type="range" min="0" max="100" step="5" value="${Math.round(s.music*100)}"></label>
        <label class="menu-option">효과음 <input aria-label="효과음" data-setting="effects" data-selectable type="range" min="0" max="100" step="5" value="${Math.round(s.effects*100)}"></label>
        <label class="menu-option"><input data-setting="mute" data-selectable type="checkbox" ${s.mute?'checked':''}> 전체 음소거</label>
        <label class="menu-option"><input data-setting="reducedEffects" data-selectable type="checkbox" ${s.reducedEffects?'checked':''}> 전투 이펙트 LOW</label>
        ${game.story ? '<button class="menu-action" data-action="newStory" data-selectable>스토리 새로 시작</button>' : ''}
        <button class="menu-action" data-action="opening" data-selectable>처음 오프닝으로 돌아가기</button>
        <small>진행 상황을 저장하고 모드 선택 화면으로 돌아갑니다.</small>
        <small>${window.SurvivorRPG.BuildConfig?.VERSION || 'dev'} · Save v${game.saveVersion}</small>
        <button class="menu-action" data-action="back" data-selectable>뒤로</button>
      </div></section>`;
    this.menuRoot.dataset.columns='1';
    this.menuRoot.querySelectorAll('[data-setting]').forEach(input=>input.addEventListener('input',()=>game.assets.configure(input.dataset.setting,input.type==='checkbox'?input.checked:input.value/100)));
    this.bindMenuButton('[data-action="newStory"]',()=>game.openMenuView('resetConfirm'));
    this.bindMenuButton('[data-action="opening"]',()=>game.returnToOpening());
    this.bindMenuButton('[data-action="back"]',()=>game.backMenu(),'cancel');
  }

  bindMenuButton(selector, handler, sound = "confirm") {
    this.menuRoot.querySelectorAll(selector).forEach((button) => {
      let gestureStartedHere = false;
      button.addEventListener("pointerdown", () => { gestureStartedHere = true; });
      button.addEventListener("pointercancel", () => { gestureStartedHere = false; });
      button.addEventListener("pointerenter", () => {
        const index = this.selectables().indexOf(button);
        if (index >= 0 && index !== this.selectedIndex) {
          this.selectedIndex = index;
          this.refreshSelection(true);
        }
      });
      button.addEventListener("click", (event) => {
        const freshGesture = gestureStartedHere;
        gestureStartedHere = false;
        if (event.detail > 0 && !freshGesture) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        this.selectedIndex=this.selectables().indexOf(button);
        this.selectedByView.set(this.currentGame.menuView,this.selectedIndex);
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
    if(!isChoice && items[current]?.type==='range' && ['left','right'].includes(direction)) {
      const slider=items[current];slider.value=Number(slider.value)+(direction==='right'?5:-5);slider.dispatchEvent(new Event('input'));return true;
    }
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
    const moveDetail = this.menuRoot.querySelector('.anil-move-detail');
    if (moveDetail && selected.dataset.moveDetail !== undefined) moveDetail.textContent = selected.dataset.description;
    this.updatePokedexPreview();
    if (playSound) this.currentGame?.assets.play("uiCursor", 0.3);
  }
};
