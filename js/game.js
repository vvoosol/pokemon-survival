window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.Game = class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = canvas.width;
    this.height = canvas.height;
    this.map = window.SurvivorRPG.MapData;
    this.assets = new window.SurvivorRPG.AssetManager();
    this.input = new window.SurvivorRPG.InputManager(document.getElementById("gameRoot"));
    this.camera = new window.SurvivorRPG.Camera(this.width, this.height, this.map);
    this.statSystem = new window.SurvivorRPG.StatSystem();
    this.movementSystem = new window.SurvivorRPG.MovementSystem();
    this.combatSystem = new window.SurvivorRPG.CombatSystem(this.statSystem, this.assets);
    this.captureSystem = new window.SurvivorRPG.CaptureSystem();
    this.spawnSystem = new window.SurvivorRPG.SpawnSystem(this.map);
    this.upgradeSystem = new window.SurvivorRPG.UpgradeSystem(this.statSystem);
    this.ui = new window.SurvivorRPG.UIManager();
    this.enemies = [];
    this.trainer = null;
    this.player = null;
    this.activePokemon = null;
    this.selectedPokemon = null;
    this.selectedPartyIndex = 0;
    this.ownedPokemon = [];
    this.partyPokemon = [];
    this.reservePokemon = [];
    this.balls = { pokeBall: 10 };
    this.mode = "trainer";
    this.menuOpen = false;
    this.menuView = "main";
    this.menuSelectedPokemonIndex = 0;
    this.partySwapIndex = null;
    this.pokedex = {};
    this.saveVersion = 1;
    this.modeBeforeLevelUp = "pokemon";
    this.transition = null;
    this.captureTarget = null;
    this.levelUpQueue = [];
    this.currentChoices = [];
    this.currentLevelEvent = null;
    this.currentMoveLearn = null;
    this.choiceLocked = false;
    this.debug = false;
    this.messageText = "";
    this.messageTimer = 0;
    this.lastCaptureResult = null;
    this.evolutionFlash = null;
    this.lastTime = 0;
    this.fps = 0;
    this.fpsSmoothing = 0.9;
  }

  async init() {
    await Promise.all([
      this.assets.loadImage("tileset", this.map.tileset),
      this.assets.loadImage("trainer", "assets/trainer/trainer.png"),
      this.assets.loadImage("pokeball", window.SurvivorRPG.BallData.pokeBall.sprite),
      ...Object.values(window.SurvivorRPG.PokemonData).map((pokemon) => this.assets.loadImage(pokemon.id, pokemon.sprite))
    ]);
    this.assets.loadSound("tackle", "assets/audio/tackle.wav");
    this.assets.loadSound("hit", "assets/audio/hit.ogg");
    this.assets.loadSound("exp", "assets/audio/exp.ogg");
    this.assets.loadSound("level", "assets/audio/level-up.ogg");
    this.combatSystem.onLevelUp = (event) => this.enqueueLevelUp(event);
    this.combatSystem.onEnemyDefeated = (enemy) => this.awardParticipantExp(enemy);
    this.reset();
  }

  reset() {
    const start = this.map.playerStart;
    const trainerData = {
      id: "trainer",
      name: "트레이너",
      level: 1,
      types: ["human"],
      hp: 1,
      maxHp: 1,
      attack: 1,
      defense: 1,
      specialAttack: 1,
      specialDefense: 1,
      speed: 45,
      movementSpeed: 205,
      frameSize: 64,
      scale: 1.08,
      radius: 22
    };
    const playerData = window.SurvivorRPG.PokemonData.bulbasaur;
    this.trainer = new window.SurvivorRPG.Trainer(trainerData, start.x, start.y);
    const starter = this.createPartyPokemon(playerData, start.x, start.y, { currentHp: playerData.hp });
    starter.inField = false;
    this.player = starter;
    this.activePokemon = null;
    this.selectedPokemon = starter;
    this.selectedPartyIndex = 0;
    this.ownedPokemon = [starter];
    this.partyPokemon = [starter];
    this.reservePokemon = [];
    this.balls = { pokeBall: 10 };
    this.pokedex = {};
    this.markPokedex("bulbasaur", "caught");
    this.enemies = [];
    this.spawnSystem.zones.forEach((zone) => {
      zone.timer = 0;
    });
    this.camera.x = this.trainer.x - this.width / 2;
    this.camera.y = this.trainer.y - this.height / 2;
    this.camera.clamp();
    this.combatSystem.damageNumbers = [];
    this.combatSystem.telegraphs = [];
    this.combatSystem.hitboxes = [];
    this.combatSystem.delayedAttacks = [];
    this.combatSystem.levelToastTime = 0;
    this.captureTarget = null;
    this.transition = null;
    this.lastCaptureResult = null;
    this.evolutionFlash = null;
    this.levelUpQueue = [];
    this.currentChoices = [];
    this.currentLevelEvent = null;
    this.currentMoveLearn = null;
    this.choiceLocked = false;
    this.mode = "trainer";
    this.modeBeforeLevelUp = "pokemon";
    this.message("Z로 이상해씨를 내보내세요.", 2.2);
    this.ui.hideLevelChoices();
    this.ui.update(this);
  }

  start() {
    requestAnimationFrame((time) => this.loop(time));
  }

  loop(time) {
    const rawDt = this.lastTime ? (time - this.lastTime) / 1000 : 0;
    const dt = Math.min(rawDt, 0.05);
    this.lastTime = time;
    if (dt > 0) {
      const instantFps = 1 / dt;
      this.fps = this.fps ? this.fps * this.fpsSmoothing + instantFps * (1 - this.fpsSmoothing) : instantFps;
      this.update(dt);
      this.draw();
      this.ui.update(this);
    }
    requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  update(dt) {
    if (this.input.consumeDebugToggle()) this.debug = !this.debug;
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    if (this.evolutionFlash) {
      this.evolutionFlash.timer -= dt;
      if (this.evolutionFlash.timer <= 0) this.evolutionFlash = null;
    }

    if (this.debug && this.input.consumeForceRare()) {
      this.upgradeSystem.forceRareNext = true;
      this.message("다음 레벨업에 rare 선택지가 포함됩니다.", 1.5);
    }
    if (this.debug && this.input.consumeTestExp() && !this.player.dead && this.mode !== "transition" && this.mode !== "levelChoice" && this.mode !== "moveLearn") {
      const target = this.activePokemon || this.selectedPokemon || this.player;
      const events = target.gainExp(target.expToNext);
      events.forEach((event) => this.enqueueLevelUp({ ...event, pokemon: target }));
      this.combatSystem.levelToastTime = 1.2;
    }
    if (this.debug && this.input.consumeSetTargetWeak()) {
      this.debugWeakenCaptureTarget();
    }

    if (this.input.consumeMenu()) {
      this.toggleMenu();
      return;
    }

    if (this.menuOpen) return;

    if (this.mode === "moveLearn") {
      const choiceIndex = this.input.consumeChoiceIndex();
      if (choiceIndex !== null) this.selectMoveLearnChoice(choiceIndex);
      return;
    }

    if (this.mode === "levelChoice") {
      const choiceIndex = this.input.consumeChoiceIndex();
      if (choiceIndex !== null) this.selectLevelChoice(choiceIndex);
      return;
    }

    if (this.mode === "transition") {
      this.input.consumeSwitch();
      this.input.consumeBall();
      this.input.consumeParty();
      this.updateTransition(dt);
      return;
    }

    if (this.mode === "gameOver") return;

    if (this.input.consumeParty()) {
      this.handlePartyAction();
      return;
    }
    if (this.input.consumeSwitch()) {
      this.handleSwitchAction();
      return;
    }
    if (this.input.consumeBall()) {
      this.handleBallAction();
      return;
    }

    this.spawnSystem.update(dt, this.enemies);
    this.enemies.forEach((enemy) => this.markPokedex(enemy.id, "seen"));

    if (this.mode === "trainer") {
      this.trainer.update(dt, this.input, this.movementSystem, this.map);
      this.enemies.forEach((enemy) => enemy.update(dt, this.trainer, this.movementSystem, this.combatSystem, this.map, { passive: true }));
      this.captureTarget = this.captureSystem.nearestTarget(this.trainer, this.enemies);
      this.camera.follow(this.trainer, dt);
      return;
    }

    if (this.mode === "pokemon") {
      if (!this.activePokemon || this.activePokemon.dead) {
        this.handleActiveFainted();
        return;
      }
      this.activePokemon.update(dt, this.input, this.movementSystem, this.map);
      this.enemies.forEach((enemy) => enemy.update(dt, this.activePokemon, this.movementSystem, this.combatSystem, this.map));
      this.combatSystem.update(dt, this.activePokemon, this.enemies);
      this.enemies = this.enemies.filter((enemy) => !enemy.dead && enemy.state !== "captured");
      this.camera.follow(this.activePokemon, dt);
      if (this.activePokemon.dead) this.handleActiveFainted();
    }
  }

  handleSwitchAction() {
    if (this.mode === "trainer") {
      this.startDeploy();
    } else if (this.mode === "pokemon") {
      this.startRecall();
    }
  }

  handlePartyAction() {
    if (this.mode === "trainer") {
      this.selectNextAvailablePokemon();
      return;
    }
    if (this.mode === "pokemon") {
      this.quickSwitchPokemon();
    }
  }

  handleBallAction() {
    if (this.mode !== "trainer") return;
    const ball = window.SurvivorRPG.BallData.pokeBall;
    if (this.balls.pokeBall <= 0) {
      this.message("몬스터볼이 없습니다.", 1.5);
      return;
    }
    const target = this.captureSystem.nearestTarget(this.trainer, this.enemies);
    if (!target) {
      this.message("포획 가능한 포켓몬이 근처에 없습니다.", 1.5);
      return;
    }
    this.balls.pokeBall -= 1;
    const result = this.captureSystem.tryCapture(target, ball);
    this.lastCaptureResult = { targetName: target.name, chance: result.chance, success: result.success };
    target.state = "capture_sequence";
    target.windup = 0;
    this.mode = "transition";
    this.transition = {
      type: "capture",
      timer: 0,
      duration: result.success ? 2.45 : 1.55,
      target,
      ball,
      result,
      startX: this.trainer.x,
      startY: this.trainer.y - 18,
      endX: target.x,
      endY: target.y - 18
    };
    this.message(`야생 ${target.name}에게 몬스터볼을 던졌다!`, 1.1);
  }

  startDeploy() {
    const pokemon = this.selectedPokemon;
    if (!pokemon || pokemon.dead || pokemon.hp <= 0) {
      this.message("선택한 포켓몬은 더 싸울 수 없습니다.", 1.6);
      return;
    }
    const dir = this.directionVector(this.trainer.direction);
    pokemon.x = this.clampX(this.trainer.x + dir.x * 58);
    pokemon.y = this.clampY(this.trainer.y + dir.y * 58);
    pokemon.vx = 0;
    pokemon.vy = 0;
    pokemon.direction = this.trainer.direction;
    pokemon.inField = true;
    this.activePokemon = pokemon;
    this.player = pokemon;
    this.mode = "transition";
    this.transition = { type: "deploy", timer: 0, duration: 0.52 };
    this.message(`${pokemon.name}, 부탁해!`, 1.2);
  }

  startRecall() {
    this.combatSystem.hitboxes = [];
    this.combatSystem.telegraphs = [];
    this.combatSystem.delayedAttacks = [];
    this.enemies.forEach((enemy) => {
      if (!enemy.dead && enemy.hp < enemy.maxHp) enemy.setCaptureReady();
    });
    const pokemon = this.activePokemon || this.player;
    const dir = this.directionVector(pokemon.direction);
    this.trainer.x = this.clampX(pokemon.x - dir.x * 42);
    this.trainer.y = this.clampY(pokemon.y - dir.y * 42);
    this.trainer.direction = pokemon.direction;
    this.trainer.vx = 0;
    this.trainer.vy = 0;
    pokemon.vx = 0;
    pokemon.vy = 0;
    this.mode = "transition";
    this.transition = { type: "recall", timer: 0, duration: 0.48 };
    this.message(`${pokemon.name}을 되돌렸다.`, 1.2);
  }

  selectNextAvailablePokemon() {
    const nextIndex = this.nextAvailablePartyIndex(this.selectedPartyIndex, false);
    if (nextIndex < 0) {
      this.message("싸울 수 있는 포켓몬이 없습니다.", 1.4);
      return;
    }
    this.selectedPartyIndex = nextIndex;
    this.selectedPokemon = this.partyPokemon[nextIndex];
    this.player = this.selectedPokemon;
    this.message(`${this.selectedPokemon.name}을 선택했다.`, 1.2);
  }

  quickSwitchPokemon() {
    const current = this.activePokemon;
    const currentIndex = this.partyPokemon.findIndex((pokemon) => pokemon?.uniqueId === current?.uniqueId);
    const nextIndex = this.nextAvailablePartyIndex(currentIndex >= 0 ? currentIndex : this.selectedPartyIndex, true);
    if (nextIndex < 0 || !current) {
      this.message("교체할 포켓몬이 없습니다.", 1.3);
      return;
    }
    const next = this.partyPokemon[nextIndex];
    current.inField = false;
    current.vx = 0;
    current.vy = 0;
    next.x = current.x;
    next.y = current.y;
    next.direction = current.direction;
    next.vx = 0;
    next.vy = 0;
    next.inField = true;
    this.selectedPartyIndex = nextIndex;
    this.selectedPokemon = next;
    this.activePokemon = next;
    this.player = next;
    this.combatSystem.hitboxes = [];
    this.combatSystem.telegraphs = [];
    this.combatSystem.delayedAttacks = [];
    this.mode = "transition";
    this.transition = { type: "partySwitch", timer: 0, duration: 0.42 };
    this.message(`${next.name}, 교체 출전!`, 1.1);
  }

  nextAvailablePartyIndex(fromIndex, excludeActive) {
    if (!this.partyPokemon.length) return -1;
    for (let step = 1; step <= this.partyPokemon.length; step += 1) {
      const index = (fromIndex + step) % this.partyPokemon.length;
      const pokemon = this.partyPokemon[index];
      if (!pokemon || pokemon.dead || pokemon.hp <= 0) continue;
      if (excludeActive && this.activePokemon && pokemon.uniqueId === this.activePokemon.uniqueId) continue;
      return index;
    }
    return -1;
  }

  updateTransition(dt) {
    if (!this.transition) {
      this.mode = "trainer";
      return;
    }
    this.transition.timer += dt;
    if (this.transition.type === "deploy" || this.transition.type === "partySwitch") {
      this.camera.follow(this.activePokemon || this.player, dt);
    } else {
      this.camera.follow(this.trainer, dt);
    }
    if (this.transition.timer < this.transition.duration) return;

    if (this.transition.type === "deploy") {
      this.enemies.forEach((enemy) => {
        if (enemy.state === "capture_ready") enemy.resumeWild();
      });
      this.mode = "pokemon";
      this.message("포켓몬 모드: 자동 전투 시작.", 1.4);
    } else if (this.transition.type === "recall") {
      if (this.activePokemon) this.activePokemon.inField = false;
      this.activePokemon = null;
      this.player = this.selectedPokemon;
      this.mode = "trainer";
      this.captureTarget = this.captureSystem.nearestTarget(this.trainer, this.enemies);
    } else if (this.transition.type === "partySwitch") {
      this.mode = "pokemon";
    } else if (this.transition.type === "capture") {
      this.finishCapture();
    }
    this.transition = null;
  }

  finishCapture() {
    const { target, result } = this.transition;
    if (result.success) {
      target.state = "captured";
      this.markPokedex(target.id, "caught");
      this.addCapturedPokemon(target);
      this.enemies = this.enemies.filter((enemy) => enemy !== target);
    } else {
      target.setCaptureReady();
      this.message(`아깝다! ${target.name}이 몬스터볼에서 나왔다!`, 2.1);
    }
    this.captureTarget = this.captureSystem.nearestTarget(this.trainer, this.enemies);
    this.mode = "trainer";
  }

  debugWeakenCaptureTarget() {
    const target = this.captureSystem.nearestTarget(this.trainer, this.enemies) || this.enemies.find((enemy) => !enemy.dead);
    if (!target) {
      this.message("디버그 대상이 없습니다.", 1.2);
      return;
    }
    target.hp = Math.max(1, Math.round(target.maxHp * 0.2));
    target.setCaptureReady();
    this.captureTarget = target;
    this.message(`${target.name} HP를 20%로 설정했습니다.`, 1.4);
  }

  addCapturedPokemon(wildPokemon) {
    const speciesData = window.SurvivorRPG.PokemonData[wildPokemon.id];
    const pokemon = this.createPartyPokemon(speciesData, wildPokemon.x, wildPokemon.y, {
      level: wildPokemon.level,
      currentHp: wildPokemon.hp,
      exp: 0
    });
    this.ownedPokemon.push(pokemon);
    if (this.partyPokemon.length < 6) {
      this.partyPokemon.push(pokemon);
      this.message(`좋았어! ${pokemon.name}을 잡았다!`, 2.1);
    } else {
      this.reservePokemon.push(pokemon);
      this.message(`파티가 가득 찼다! ${pokemon.name}은 보관함으로 갔다.`, 2.4);
    }
  }

  createPartyPokemon(speciesData, x, y, overrides = {}) {
    const level = overrides.level || speciesData.level;
    const nativeStats = overrides.nativeStats || this.statSystem.calculateNativeStats(speciesData, level);
    const equippedMoves = overrides.equippedMoves || this.initialMovesForSpecies(speciesData, level);
    const data = {
      ...speciesData,
      ...overrides,
      uniqueId: overrides.uniqueId || `${speciesData.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      speciesId: speciesData.id,
      id: speciesData.id,
      name: overrides.name || speciesData.name,
      level,
      currentHp: overrides.currentHp ?? speciesData.hp,
      nativeStats,
      equippedMoves,
      moveUpgradeLevels: overrides.moveUpgradeLevels || Object.fromEntries(equippedMoves.map((move) => [typeof move === "string" ? move : move.moveId, typeof move === "string" ? 0 : move.upgradeLevel || 0])),
      growthBonuses: overrides.growthBonuses,
      abilityId: overrides.abilityId || speciesData.abilities?.[0] || null,
      exp: overrides.exp || 0,
      expToNext: overrides.expToNext || 30
    };
    const pokemon = new window.SurvivorRPG.PlayerPokemon(data, x, y);
    this.statSystem.recalculateStats(pokemon);
    return pokemon;
  }

  awardParticipantExp(enemy) {
    const participantIds = enemy.participants ? [...enemy.participants] : [];
    const recipients = participantIds
      .map((id) => this.partyPokemon.find((pokemon) => pokemon.uniqueId === id))
      .filter((pokemon) => pokemon && !pokemon.dead);
    this.combatSystem.damageNumbers.push({ x: enemy.x, y: enemy.y - 58, value: `EXP +${enemy.expReward}`, life: 1.0, color: "#9fd4ff" });
    this.assets.play("exp", 0.28);
    recipients.forEach((pokemon) => {
      const levelEvents = pokemon.gainExp(enemy.expReward);
      levelEvents.forEach((event) => this.enqueueLevelUp({ ...event, pokemon }));
    });
    if (recipients.length && this.levelUpQueue.length) {
      this.combatSystem.levelToastTime = 1.5;
      this.assets.play("level", 0.45);
    }
  }

  handleActiveFainted() {
    const oldX = this.activePokemon?.x || this.trainer.x;
    const oldY = this.activePokemon?.y || this.trainer.y;
    const oldDirection = this.activePokemon?.direction || "down";
    if (this.activePokemon) {
      this.activePokemon.dead = true;
      this.activePokemon.fainted = true;
      this.activePokemon.inField = false;
      this.message(`${this.activePokemon.name}이 쓰러졌다!`, 1.6);
    }
    const nextIndex = this.nextAvailablePartyIndex(this.selectedPartyIndex, true);
    if (nextIndex < 0) {
      this.mode = "gameOver";
      this.message("싸울 수 있는 포켓몬이 없습니다!", 2.0);
      return;
    }
    this.selectedPartyIndex = nextIndex;
    this.selectedPokemon = this.partyPokemon[nextIndex];
    this.activePokemon = this.selectedPokemon;
    this.player = this.selectedPokemon;
    this.activePokemon.x = oldX;
    this.activePokemon.y = oldY;
    this.activePokemon.direction = oldDirection;
    this.activePokemon.inField = true;
    this.mode = "transition";
    this.transition = { type: "partySwitch", timer: 0, duration: 0.5 };
    this.message(`${this.activePokemon.name}이 나섰다!`, 1.4);
  }

  enqueueLevelUp(event) {
    this.levelUpQueue.push(event);
    if (this.mode !== "levelChoice" && this.mode !== "moveLearn") {
      this.modeBeforeLevelUp = this.mode === "pokemon" ? "pokemon" : "trainer";
      this.openNextLevelChoice();
    }
  }

  openNextLevelChoice() {
    const event = this.levelUpQueue.shift();
    if (!event) {
      this.mode = this.modeBeforeLevelUp || "pokemon";
      this.currentChoices = [];
      this.currentLevelEvent = null;
      this.currentMoveLearn = null;
      this.choiceLocked = false;
      this.ui.hideLevelChoices();
      this.ui.hideMoveLearning();
      return;
    }
    this.currentLevelEvent = event;
    this.processLevelEvent(event);
  }

  processLevelEvent(event) {
    const pokemon = event.pokemon || this.player;
    this.statSystem.applyNativeStatGrowth(pokemon);
    const newMoveId = this.nextMoveForLevel(pokemon, event.toLevel);
    if (newMoveId && this.queueMoveLearning(pokemon, newMoveId, event)) return;
    this.continueLevelPipeline(event);
  }

  continueLevelPipeline(event) {
    const pokemon = event.pokemon || this.player;
    this.checkEvolution(event, pokemon);
    this.mode = "levelChoice";
    this.currentLevelEvent = event;
    this.currentChoices = this.upgradeSystem.createChoices(pokemon);
    this.choiceLocked = false;
    this.ui.showLevelChoices(event, this.currentChoices, (index) => this.selectLevelChoice(index));
  }

  queueMoveLearning(pokemon, moveId, event) {
    if (pokemon.knowsMove?.(moveId)) return false;
    const move = window.SurvivorRPG.MoveData[moveId];
    if (!move || move.category === "status" || move.power <= 0) return false;
    if (pokemon.equippedMoves.length < 4) {
      pokemon.addMove(moveId);
      this.message(`${pokemon.name}은(는) ${move.name}을 배웠다!`, 2.0);
      return false;
    }
    this.mode = "moveLearn";
    this.choiceLocked = false;
    this.currentMoveLearn = { pokemon, moveId, event, confirmForgetIndex: null };
    this.ui.showMoveLearning(this.currentMoveLearn, (index) => this.selectMoveLearnChoice(index));
    return true;
  }

  selectMoveLearnChoice(index) {
    if (this.choiceLocked || this.mode !== "moveLearn" || !this.currentMoveLearn) return;
    const learn = this.currentMoveLearn;
    const pokemon = learn.pokemon;
    if (index === 4) {
      pokemon.declineMove?.(learn.moveId);
      this.message(`${pokemon.name}은(는) 새 기술을 배우지 않았다.`, 1.7);
      this.finishMoveLearning();
      return;
    }
    const oldSlot = pokemon.equippedMoves[index];
    if (!oldSlot) return;
    if ((oldSlot.upgradeLevel || 0) > 0 && learn.confirmForgetIndex !== index) {
      learn.confirmForgetIndex = index;
      this.ui.showMoveLearning(learn, (nextIndex) => this.selectMoveLearnChoice(nextIndex));
      return;
    }
    const oldMove = window.SurvivorRPG.MoveData[oldSlot.moveId];
    const newMove = window.SurvivorRPG.MoveData[learn.moveId];
    pokemon.replaceMove(index, learn.moveId);
    this.message(`${pokemon.name}은(는) ${oldMove.name}을 잊고 ${newMove.name}을 배웠다!`, 2.2);
    this.finishMoveLearning();
  }

  finishMoveLearning() {
    const event = this.currentMoveLearn.event;
    this.currentMoveLearn = null;
    this.ui.hideMoveLearning();
    this.continueLevelPipeline(event);
  }

  selectLevelChoice(index) {
    if (this.choiceLocked || this.mode !== "levelChoice") return;
    const choice = this.currentChoices[index];
    if (!choice) return;
    this.choiceLocked = true;
    const pokemon = this.currentLevelEvent.pokemon || this.player;
    this.upgradeSystem.applyChoice(pokemon, choice);
    pokemon.equippedMoves.forEach((slot) => {
      const move = window.SurvivorRPG.MoveData[slot.moveId];
      if (!move) return;
      slot.cooldownRemaining = Math.min(slot.cooldownRemaining || 0, this.statSystem.calculateMoveCooldown(move, pokemon.speed, slot.upgradeLevel || 0));
    });
    pokemon.syncMoveState?.();
    window.setTimeout(() => {
      this.ui.hideLevelChoices();
      this.openNextLevelChoice();
    }, 220);
  }

  message(text, seconds = 1.8) {
    this.messageText = text;
    this.messageTimer = seconds;
  }

  toggleMenu() {
    if (this.mode !== "trainer" && !this.menuOpen) {
      this.message("메뉴는 트레이너 모드에서 열 수 있습니다.", 1.4);
      return;
    }
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) {
      this.menuView = "main";
      this.ui.showGameMenu(this);
    } else {
      this.ui.hideGameMenu();
    }
  }

  openMenuView(view, index = 0) {
    this.menuView = view;
    this.menuSelectedPokemonIndex = index;
    this.ui.showGameMenu(this);
  }

  swapPartySlots(a, b) {
    if (a === b || !this.partyPokemon[a] || !this.partyPokemon[b]) return;
    [this.partyPokemon[a], this.partyPokemon[b]] = [this.partyPokemon[b], this.partyPokemon[a]];
    this.selectedPartyIndex = this.partyPokemon.findIndex((pokemon) => pokemon?.uniqueId === this.selectedPokemon?.uniqueId);
    if (this.selectedPartyIndex < 0) {
      this.selectedPartyIndex = 0;
      this.selectedPokemon = this.partyPokemon[0];
    }
    if (this.mode === "trainer") this.player = this.selectedPokemon;
    this.ui.showGameMenu(this);
  }

  markPokedex(speciesId, state) {
    const entry = this.pokedex[speciesId] || { seen: false, caught: false, count: 0 };
    entry.seen = true;
    if (state === "caught") {
      entry.caught = true;
      entry.count += 1;
    }
    this.pokedex[speciesId] = entry;
  }

  saveGame() {
    const data = {
      version: this.saveVersion,
      savedAt: Date.now(),
      trainer: { x: this.trainer.x, y: this.trainer.y, direction: this.trainer.direction },
      balls: this.balls,
      pokedex: this.pokedex,
      ownedPokemon: this.ownedPokemon.map((pokemon) => this.serializePokemon(pokemon)),
      partyIds: this.partyPokemon.map((pokemon) => pokemon.uniqueId),
      reserveIds: this.reservePokemon.map((pokemon) => pokemon.uniqueId),
      selectedId: this.selectedPokemon?.uniqueId || null
    };
    localStorage.setItem("scientistRpgSave", JSON.stringify(data));
    this.message("리포트를 작성했다.", 1.8);
    this.ui.showGameMenu(this);
  }

  loadGame() {
    const raw = localStorage.getItem("scientistRpgSave");
    if (!raw) {
      this.message("저장된 리포트가 없습니다.", 1.5);
      return false;
    }
    const data = JSON.parse(raw);
    const restored = data.ownedPokemon.map((saved) => this.deserializePokemon(saved));
    const byId = new Map(restored.map((pokemon) => [pokemon.uniqueId, pokemon]));
    this.ownedPokemon = restored;
    this.partyPokemon = data.partyIds.map((id) => byId.get(id)).filter(Boolean).slice(0, 6);
    this.reservePokemon = data.reserveIds.map((id) => byId.get(id)).filter(Boolean);
    this.selectedPokemon = byId.get(data.selectedId) || this.partyPokemon[0];
    this.selectedPartyIndex = Math.max(0, this.partyPokemon.findIndex((pokemon) => pokemon.uniqueId === this.selectedPokemon.uniqueId));
    this.player = this.selectedPokemon;
    this.activePokemon = null;
    this.mode = "trainer";
    this.balls = data.balls || { pokeBall: 10 };
    this.pokedex = data.pokedex || {};
    this.trainer.x = data.trainer?.x || this.trainer.x;
    this.trainer.y = data.trainer?.y || this.trainer.y;
    this.trainer.direction = data.trainer?.direction || "down";
    this.camera.follow(this.trainer, 1);
    this.message("리포트를 불러왔다.", 1.8);
    this.ui.showGameMenu(this);
    return true;
  }

  serializePokemon(pokemon) {
    return {
      uniqueId: pokemon.uniqueId,
      speciesId: pokemon.speciesId,
      nickname: pokemon.nickname,
      level: pokemon.level,
      exp: pokemon.exp,
      expToNext: pokemon.expToNext,
      hp: pokemon.hp,
      growthBonuses: pokemon.growthBonuses,
      equippedMoves: pokemon.equippedMoves,
      abilityId: pokemon.abilityId,
      fainted: pokemon.fainted,
      evolutionData: pokemon.evolutionData
    };
  }

  deserializePokemon(saved) {
    const species = window.SurvivorRPG.DataAdapter.getSpeciesData(saved.speciesId);
    const pokemon = this.createPartyPokemon(species, this.trainer.x, this.trainer.y, {
      uniqueId: saved.uniqueId,
      nickname: saved.nickname,
      level: saved.level,
      exp: saved.exp,
      expToNext: saved.expToNext,
      currentHp: saved.hp,
      growthBonuses: saved.growthBonuses,
      equippedMoves: saved.equippedMoves,
      abilityId: saved.abilityId,
      evolutionData: saved.evolutionData
    });
    pokemon.fainted = !!saved.fainted || pokemon.hp <= 0;
    pokemon.dead = pokemon.fainted;
    return pokemon;
  }

  initialMovesForSpecies(species, level) {
    const moves = species.learnset
      .filter((entry) => entry.level <= level)
      .map((entry) => entry.moveId)
      .filter((moveId) => {
        const move = window.SurvivorRPG.MoveData[moveId];
        return move && move.category !== "status" && move.power > 0;
      })
      .filter((moveId, index, list) => list.indexOf(moveId) === index)
      .slice(-4);
    if (!moves.length) moves.push(species.playerMove || "tackle");
    return moves.map((moveId) => ({ moveId, upgradeLevel: 0, cooldownRemaining: 0 }));
  }

  nextMoveForLevel(pokemon, level) {
    const species = window.SurvivorRPG.PokemonData[pokemon.speciesId];
    if (!species) return null;
    const candidates = species.learnset
      .filter((entry) => entry.level === level)
      .map((entry) => entry.moveId)
      .filter((moveId) => {
        const move = window.SurvivorRPG.MoveData[moveId];
        return move && move.category !== "status" && move.power > 0 && !pokemon.knowsMove?.(moveId);
      });
    return candidates[0] || null;
  }

  checkEvolution(event, pokemon) {
    const species = window.SurvivorRPG.PokemonData[pokemon.speciesId];
    const evolution = species?.evolutions?.find((item) => item.method === "level" && event.toLevel >= item.level);
    if (!evolution) return;
    this.performEvolution(pokemon, evolution.target, "NORMAL_LEVEL");
  }

  performEvolution(pokemon, targetSpeciesId, reason) {
    const oldSpecies = window.SurvivorRPG.PokemonData[pokemon.speciesId];
    const newSpecies = window.SurvivorRPG.PokemonData[targetSpeciesId];
    if (!oldSpecies || !newSpecies) return false;
    const beforeMaxHp = pokemon.maxHp;
    pokemon.speciesId = newSpecies.id;
    pokemon.id = newSpecies.id;
    pokemon.data = newSpecies;
    pokemon.name = pokemon.nickname || newSpecies.name;
    pokemon.types = [...newSpecies.types];
    pokemon.spriteKey = newSpecies.id;
    pokemon.frameSize = newSpecies.frameSize || pokemon.frameSize;
    pokemon.scale = newSpecies.scale || pokemon.scale;
    pokemon.radius = newSpecies.radius || pokemon.radius;
    pokemon.movementSpeed = newSpecies.movementSpeed || pokemon.movementSpeed;
    pokemon.evolutionData = { from: oldSpecies.id, to: newSpecies.id, reason, level: pokemon.level };
    pokemon.nativeStats = this.statSystem.calculateNativeStats(newSpecies, pokemon.level);
    this.statSystem.recalculateStats(pokemon);
    if (!pokemon.dead && !pokemon.fainted) {
      pokemon.hp = Math.min(pokemon.maxHp, pokemon.hp + Math.max(0, pokemon.maxHp - beforeMaxHp));
    } else {
      pokemon.hp = 0;
    }
    this.message(`${oldSpecies.name}은(는) ${newSpecies.name}(으)로 진화했다!`, 2.4);
    this.evolutionFlash = { pokemon, timer: 0.9, duration: 0.9 };
    return true;
  }

  directionVector(direction) {
    return {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 }
    }[direction] || { x: 0, y: 1 };
  }

  clampX(x) {
    return Math.max(28, Math.min(this.map.width - 28, x));
  }

  clampY(y) {
    return Math.max(28, Math.min(this.map.height - 28, y));
  }

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawMap();
    if (this.debug) this.drawDebugZones();

    const drawables = [];
    if (this.mode === "trainer" || this.mode === "transition") drawables.push(this.trainer);
    if (this.mode === "pokemon" || (this.mode === "transition" && this.player.inField)) drawables.push(this.player);
    drawables.push(...this.enemies);
    drawables.sort((a, b) => a.y - b.y);

    drawables.forEach((entity) => {
      this.drawShadow(entity);
      entity.draw(this.ctx, this.camera, this.assets);
      if (entity !== this.player && entity !== this.trainer) {
        this.drawEnemyHp(entity);
        entity.drawOverhead(this.ctx, this.camera);
      }
    });

    this.drawCaptureTarget();
    if (this.debug) this.drawDebugAggro();
    this.combatSystem.drawEffects(this.ctx, this.camera);
    this.drawTransitionEffects();
    this.drawEvolutionFlash();
  }

  drawMap() {
    const ctx = this.ctx;
    const tileset = this.assets.image("tileset");
    const tileSize = this.map.tileSize;
    const startX = Math.floor(this.camera.x / tileSize) - 1;
    const endX = Math.ceil((this.camera.x + this.width) / tileSize) + 1;
    const startY = Math.floor(this.camera.y / tileSize) - 1;
    const endY = Math.ceil((this.camera.y + this.height) / tileSize) + 1;

    for (let ty = startY; ty < endY; ty += 1) {
      for (let tx = startX; tx < endX; tx += 1) {
        const source = this.baseTileFor(tx, ty);
        this.drawTile(tileset, source, tx * tileSize - this.camera.x, ty * tileSize - this.camera.y);
      }
    }

    this.drawPath(tileset);
    this.map.grassPatches.forEach((patch) => this.drawGrassPatch(tileset, patch));
    this.map.decorations.forEach((deco) => this.drawDecoration(tileset, deco));
  }

  baseTileFor(tx, ty) {
    const n = Math.abs(Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453) % 1;
    return n > 0.58 ? this.map.tileSources.grassB : this.map.tileSources.grassA;
  }

  drawPath(tileset) {
    const path = this.map.tileSources.path;
    for (let x = 0; x < this.map.width; x += 32) {
      this.drawTile(tileset, path, x - this.camera.x, 760 - this.camera.y);
      this.drawTile(tileset, path, x - this.camera.x, 792 - this.camera.y);
    }
    for (let y = 0; y < this.map.height; y += 32) {
      this.drawTile(tileset, path, 384 - this.camera.x, y - this.camera.y);
      this.drawTile(tileset, path, 416 - this.camera.x, y - this.camera.y);
    }
  }

  drawGrassPatch(tileset, patch) {
    const source = this.map.tileSources.darkGrass;
    const step = this.map.tileSize;
    for (let y = patch.y; y < patch.y + patch.height; y += step) {
      for (let x = patch.x; x < patch.x + patch.width; x += step) {
        this.drawTile(tileset, source, x - this.camera.x, y - this.camera.y);
      }
    }
  }

  drawDecoration(tileset, deco) {
    const source = this.map.tileSources[deco.type];
    if (!source) return;
    this.drawTile(tileset, source, deco.x - this.camera.x, deco.y - this.camera.y);
  }

  drawTile(tileset, source, dx, dy) {
    this.ctx.drawImage(tileset, source.sx, source.sy, source.sw, source.sh, Math.round(dx), Math.round(dy), 32, 32);
  }

  drawShadow(entity) {
    this.ctx.save();
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
    this.ctx.beginPath();
    this.ctx.ellipse(entity.x - this.camera.x, entity.y - this.camera.y + entity.radius * 0.65, entity.radius * 0.9, entity.radius * 0.34, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  drawEnemyHp(enemy) {
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    const width = 46;
    const x = enemy.x - this.camera.x - width / 2;
    const y = enemy.y - this.camera.y - enemy.drawSize * 0.42;
    this.ctx.save();
    this.ctx.fillStyle = "rgba(18, 20, 24, 0.72)";
    this.ctx.fillRect(x, y, width, 6);
    this.ctx.fillStyle = ratio > 0.35 ? "#78db68" : "#e45e54";
    this.ctx.fillRect(x + 1, y + 1, (width - 2) * ratio, 4);
    this.ctx.restore();
  }

  drawCaptureTarget() {
    if (this.mode !== "trainer" || !this.captureTarget) return;
    const target = this.captureTarget;
    const x = target.x - this.camera.x;
    const y = target.y - this.camera.y + target.radius * 0.72;
    this.ctx.save();
    this.ctx.strokeStyle = "rgba(255, 236, 86, 0.95)";
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, target.radius * 1.35, target.radius * 0.5, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawTransitionEffects() {
    if (!this.transition) return;
    const t = Math.min(1, this.transition.timer / this.transition.duration);
    const ctx = this.ctx;
    if (this.transition.type === "deploy" || this.transition.type === "recall") {
      const entity = this.transition.type === "deploy" ? this.player : this.trainer;
      const x = entity.x - this.camera.x;
      const y = entity.y - this.camera.y;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = "#fff7a8";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 28 + t * 62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (this.transition.type === "capture") {
      this.drawCaptureSequence(t);
    }
  }

  drawEvolutionFlash() {
    if (!this.evolutionFlash) return;
    const { pokemon, timer, duration } = this.evolutionFlash;
    const t = 1 - timer / duration;
    const x = pokemon.x - this.camera.x;
    const y = pokemon.y - this.camera.y;
    this.ctx.save();
    this.ctx.globalAlpha = Math.max(0, 1 - t);
    this.ctx.strokeStyle = "#fff7a8";
    this.ctx.lineWidth = 5;
    for (let i = 0; i < 3; i += 1) {
      this.ctx.beginPath();
      this.ctx.arc(x, y, 28 + t * 90 + i * 18, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawCaptureSequence(t) {
    const ctx = this.ctx;
    const seq = this.transition;
    const ball = this.assets.image("pokeball");
    const flyT = Math.min(1, t / 0.32);
    const x = seq.startX + (seq.endX - seq.startX) * flyT - this.camera.x;
    const arc = Math.sin(flyT * Math.PI) * 64;
    const y = seq.startY + (seq.endY - seq.startY) * flyT - arc - this.camera.y;
    const shake = t > 0.38 ? Math.sin(t * Math.PI * 18) * Math.max(0, 1 - t) * 8 : 0;
    ctx.save();
    if (ball) {
      ctx.drawImage(ball, x - 18 + shake, y - 18, 36, 36);
    } else {
      ctx.fillStyle = "#f05050";
      ctx.beginPath();
      ctx.arc(x + shake, y, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    if (t > 0.34) {
      const pulse = Math.sin(t * Math.PI * 8) * 0.5 + 0.5;
      ctx.globalAlpha = 0.28 + pulse * 0.22;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(seq.endX - this.camera.x, seq.endY - this.camera.y, 32 + pulse * 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawDebugZones() {
    this.ctx.save();
    this.ctx.strokeStyle = "rgba(95, 190, 255, 0.75)";
    this.ctx.fillStyle = "rgba(95, 190, 255, 0.09)";
    this.spawnSystem.zones.forEach((zone) => {
      this.ctx.fillRect(zone.x - this.camera.x, zone.y - this.camera.y, zone.width, zone.height);
      this.ctx.strokeRect(zone.x - this.camera.x, zone.y - this.camera.y, zone.width, zone.height);
    });
    if (this.mode === "trainer") {
      this.ctx.strokeStyle = "rgba(255, 235, 120, 0.54)";
      this.ctx.beginPath();
      this.ctx.arc(this.trainer.x - this.camera.x, this.trainer.y - this.camera.y, this.captureSystem.captureRange, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawDebugAggro() {
    this.ctx.save();
    this.enemies.forEach((enemy) => {
      this.ctx.strokeStyle = "rgba(255, 100, 100, 0.42)";
      this.ctx.beginPath();
      this.ctx.arc(enemy.x - this.camera.x, enemy.y - this.camera.y, enemy.aggroRadius, 0, Math.PI * 2);
      this.ctx.stroke();
    });
    this.ctx.restore();
  }
};
