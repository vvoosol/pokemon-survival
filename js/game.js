window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.Game = class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = canvas.width;
    this.height = canvas.height;
    this.maps = window.SurvivorRPG.Maps;
    this.map = this.maps.hub;
    this.assets = new window.SurvivorRPG.AssetManager();
    this.input = new window.SurvivorRPG.InputManager(document.getElementById("gameRoot"));
    this.worldZoom = 1.5;
    this.camera = new window.SurvivorRPG.Camera(this.width / this.worldZoom, this.height / this.worldZoom, this.map);
    this.statSystem = new window.SurvivorRPG.StatSystem();
    this.movementSystem = new window.SurvivorRPG.MovementSystem();
    this.combatSystem = new window.SurvivorRPG.CombatSystem(this.statSystem, this.assets);
    this.partyBattle = new window.SurvivorRPG.PartyBattleSystem();
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
    this.money = 150;
    this.journal=window.SurvivorRPG.SaveStore.readJournal();
    this.runStats={defeats:0,earned:0,caught:[],damage:{},rewards:[]};
    this.autosaveTimer=0;
    this.suspended=false;
    this.items = { potion: 0, expShare: false, expShareEnabled: false };
    this.currentMapId = "hub";
    this.currentHuntingArea = null;
    this.nearbyNpc = null;
    this.currentBagUse = null;
    this.mode = "trainer";
    this.menuOpen = false;
    this.menuView = "main";
    this.menuSelectedPokemonIndex = 0;
    this.partySwapIndex = null;
    this.pokedex = {};
    this.saveVersion = 4;
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
    this.progressNotices = [];
    this.progressNotice = null;
    this.lastCaptureResult = null;
    this.evolutionFlash = null;
    this.switchFlash = null;
    this.lastTime = 0;
    this.fps = 0;
    this.fpsSmoothing = 0.9;
  }

  async init() {
    await Promise.all([
      this.assets.loadImage("tileset", this.map.tileset),
      this.assets.loadImage("caveTiles", "assets/tilesets/cave.png"),
      this.assets.loadImage("trainer", "assets/trainer/trainer.png"),
      this.assets.loadImage("pokeball", window.SurvivorRPG.BallData.pokeBall.sprite),
      this.assets.loadImage("typesMini", "assets/ui/types-mini.png"),
      ...[...new Map(Object.values(window.SurvivorRPG.NpcSprites).map((npc) => [npc.key, npc])).values()]
        .map((npc) => this.assets.loadImage(npc.key, npc.src)),
      window.SurvivorRPG.MoveVisualAdapter.load(this.assets),
      ...Object.values(window.SurvivorRPG.MegaForms || {}).map(form => this.assets.loadImage(form.id, form.sprite)),
      ...Object.values(window.SurvivorRPG.PokemonData).map((pokemon) => this.assets.loadImage(pokemon.id, pokemon.sprite))
    ]);
    this.assets.loadSound("tackle", "assets/audio/tackle.wav");
    this.assets.loadSound("hit", "assets/audio/hit.ogg");
    this.assets.loadSound("exp", "assets/audio/exp.ogg");
    this.assets.loadSound("level", "assets/audio/level-up.ogg");
    this.assets.loadSound("uiCursor", "assets/audio/ui-cursor.ogg");
    this.assets.loadSound("uiConfirm", "assets/audio/ui-confirm.ogg");
    this.assets.loadSound("uiCancel", "assets/audio/ui-cancel.ogg");
    this.assets.loadSound("uiOpen", "assets/audio/ui-open.ogg");
    this.assets.loadSound("uiClose", "assets/audio/ui-close.ogg");
    this.assets.loadSound("uiBuy", "assets/audio/ui-buy.ogg");
    this.combatSystem.onLevelUp = (event) => this.enqueueLevelUp(event);
    this.combatSystem.onEnemyDefeated = (enemy) => this.awardParticipantExp(enemy);
    this.combatSystem.onDamage=(cast,target,damage)=>{
      if(cast.team!=='player')return;
      const key=cast.caster.uniqueId;
      this.runStats.damage[key]=(this.runStats.damage[key] || 0)+damage;
      if(this.survival)this.survival.stats.damage[key]=(this.survival.stats.damage[key] || 0)+damage;
    };
    if(this.journal.awaitingStarter)this.beginStarterJourney();else this.reset();
  }

  reset({starterPending=false}={}) {
    this.progressNotices = [];
    this.progressNotice = null;
    this.awaitingStarter = false;
    this.menuOpen = false;
    this.menuView = "main";
    this.menuSelectedPokemonIndex = 0;
    this.partySwapIndex = null;
    this.pendingStarter = null;
    this.ui.hideGameMenu();
    this.partyBattle.clear();
    this.battleFormation = "single";
    this.setMap("hub", { clearEnemies: true, movePlayer: false });
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
    this.starterId = starter.uniqueId;
    starter.inField = false;
    this.player = starter;
    this.activePokemon = null;
    this.selectedPokemon = starter;
    this.selectedPartyIndex = 0;
    this.ownedPokemon = [starter];
    this.partyPokemon = [starter];
    this.reservePokemon = [];
    this.balls = { pokeBall: 10 };
    this.money = 150;
    this.runStats={defeats:0,earned:0,caught:[],damage:{},rewards:[]};
    this.items = { potion: 0, expShare: false, expShareEnabled: false, doubleBattle: false, tripleBattle: false };
    this.currentMapId = "hub";
    this.currentHuntingArea = null;
    this.nearbyNpc = null;
    this.currentBagUse = null;
    this.pokedex = JSON.parse(JSON.stringify(this.journal.dex));
    if(!starterPending&&!this.pokedex.bulbasaur?.caught)this.markPokedex("bulbasaur", "caught");
    this.enemies = [];
    this.spawnSystem.zones.forEach((zone) => {
      zone.timer = 0;
    });
    this.camera.x = this.trainer.x - this.camera.width / 2;
    this.camera.y = this.trainer.y - this.camera.height / 2;
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
    this.switchFlash = null;
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

  setMap(mapId, options = {}) {
    const nextMap = this.maps[mapId];
    if (!nextMap) return false;
    this.partyBattle.clear();
    this.map = nextMap;
    this.combatSystem.world = nextMap;
    this.assets.setMusic(mapId==='hub'?'hub':mapId==='survival'?'survival':nextMap.biome==='cave'?'cave':'field');
    this.currentMapId = mapId;
    this.currentHuntingArea = mapId === "hub" ? null : mapId;
    this.survival = mapId === "survival" ? new window.SurvivorRPG.SurvivalSystem() : null;
    this.camera.world = nextMap;
    this.spawnSystem.setMap(nextMap);
    if (options.clearEnemies !== false) {
      this.enemies = [];
      this.captureTarget=null;
      this.captureSystem.lockedTarget=null;
      this.combatSystem.clear();
    }
    if (options.movePlayer !== false && this.trainer) {
      const start = nextMap.playerStart;
      this.trainer.x = start.x;
      this.trainer.y = start.y;
      this.trainer.vx = 0;
      this.trainer.vy = 0;
      this.activePokemon = null;
      this.player = this.selectedPokemon;
      if (this.player) this.player.inField = false;
      this.mode = "trainer";
      this.camera.x = this.trainer.x - this.camera.width / 2;
      this.camera.y = this.trainer.y - this.camera.height / 2;
      this.camera.clamp();
    }
    return true;
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
    if(this.suspended)return;
    this.updateProgressNotices(dt);
    const crisis=this.mode==='pokemon' && (this.player.hp/this.player.maxHp<(this.musicCrisis ? 0.4 : 0.2));
    this.musicCrisis=crisis;
    this.assets.setMusic(this.survival?.status==='cleared'?'hub':crisis||this.survival?.elapsed>=840?'final'
      :this.currentMapId==='hub'?'hub':this.survival?'survival':this.map.biome==='cave'?'cave':'field');
    this.autosaveTimer+=dt;
    if(this.autosaveTimer>=60 && ['trainer','pokemon'].includes(this.mode) && !this.menuOpen) {
      this.autosaveTimer=0;this.saveGame(true);
    }
    if (this.mode === "survivalClear") {
      if (this.input.consumeSwitch() || this.input.consumeBall()) this.travelToHub();
      return;
    }
    if (this.input.consumeDebugToggle()) this.debug = !this.debug;
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    if (this.evolutionFlash) {
      this.evolutionFlash.timer -= dt;
      if (this.evolutionFlash.timer <= 0) this.evolutionFlash = null;
    }
    if (this.switchFlash) {
      this.switchFlash.timer -= dt;
      if (this.switchFlash.timer <= 0) this.switchFlash = null;
    }
    this.updateNearbyNpc();

    const forcedRarity = this.debug ? this.input.consumeForceRarity() : null;
    if (forcedRarity) {
      this.upgradeSystem.forceRarityNext = forcedRarity;
      this.message(`다음 레벨업에 ${forcedRarity} 선택지가 포함됩니다.`, 1.5);
    }
    if (this.debug && this.input.consumeTestExp() && !this.player.dead && this.mode !== "transition" && this.mode !== "levelChoice" && this.mode !== "moveLearn") {
      const target = this.activePokemon || this.selectedPokemon || this.player;
      const events = target.gainExp(target.expToNext);
      events.forEach((event) => this.enqueueLevelUp({ ...event, pokemon: target }));
    }
    if (this.debug && this.input.consumeSetTargetWeak()) {
      this.debugWeakenCaptureTarget();
    }

    if (this.input.consumeMenu()) {
      this.toggleMenu();
      return;
    }

    if (this.menuOpen) {
      this.ui.navigateMenu(this.input.movementVector(), dt);
      if (this.input.consumeSwitch()) {
        this.ui.activateSelection();
        return;
      }
      if (this.input.consumeBall()) {
        this.assets.play("uiCancel", 0.38);
        this.backMenu();
      }
      return;
    }

    if (this.mode === "moveLearn") {
      this.ui.navigateChoices(this.input.movementVector(), dt);
      if(this.input.consumeBall()) {
        if(this.currentMoveLearn?.confirmForgetIndex !== null) {
          this.currentMoveLearn.confirmForgetIndex=null;
          this.ui.showMoveLearning(this.currentMoveLearn,index=>this.selectMoveLearnChoice(index));
        } else this.selectMoveLearnChoice(4);
        return;
      }
      if (this.input.consumeSwitch()) {
        this.ui.activateChoice();
        return;
      }
      const choiceIndex = this.input.consumeChoiceIndex();
      if (choiceIndex !== null) this.selectMoveLearnChoice(choiceIndex);
      return;
    }

    if (this.mode === "levelChoice") {
      this.ui.navigateChoices(this.input.movementVector(), dt);
      if (this.input.consumeSwitch()) {
        this.ui.activateChoice();
        return;
      }
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

    if (this.input.consumeSwitch()) {
      this.handleSwitchAction();
    }
    if (this.input.consumeBall()) {
      this.handleBallAction();
    }
    if (this.input.consumeParty()) {
      this.handlePartyAction();
      return;
    }

    if (this.menuOpen || !["trainer", "pokemon"].includes(this.mode)) return;

    if (this.survival) this.survival.update(dt, this);
    else this.spawnSystem.update(dt, this.enemies);
    this.enemies.forEach((enemy) => this.markPokedex(enemy.id, "seen"));

    if (this.mode === "trainer") {
      this.trainer.update(dt, this.input, this.movementSystem, this.map);
      this.enemies.forEach((enemy) => enemy.update(dt, this.trainer, this.movementSystem, this.combatSystem, this.map, { passive: true }));
      this.combatSystem.update(dt, null, this.enemies, false);
      this.enemies = this.enemies.filter((enemy) => !enemy.dead && enemy.state !== "captured");
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
      this.partyBattle.update(dt, this);
      const fighters = [this.activePokemon, ...this.partyBattle.members];
      this.enemies.forEach((enemy) => {
        const target = fighters.filter((p) => !p.dead).reduce((best, p) =>
          !best || Math.hypot(p.x - enemy.x, p.y - enemy.y) < Math.hypot(best.x - enemy.x, best.y - enemy.y) ? p : best, null);
        if (target) enemy.update(dt, target, this.movementSystem, this.combatSystem, this.map);
      });
      this.combatSystem.update(dt, this.activePokemon, this.enemies, true, this.partyBattle.members);
      this.enemies = this.enemies.filter((enemy) => !enemy.dead && enemy.state !== "captured");
      this.camera.follow(this.activePokemon, dt);
      if (this.activePokemon.dead) this.handleActiveFainted();
      this.survival?.finish(this);
    }
  }

  handleSwitchAction() {
    if (this.nearbyNpc) {
      this.interactNpc(this.nearbyNpc);
      return;
    }
    if (this.mode === "trainer") {
      this.startDeploy();
    } else if (this.mode === "pokemon") {
      this.startRecall();
    }
  }

  handlePartyAction() {
    if (this.mode === "trainer") {
      const target=this.captureSystem.cycleTarget(this.trainer,this.enemies,this.captureTarget);
      if(target){this.captureTarget=target;return;}
      this.selectNextAvailablePokemon();
      return;
    }
    if (this.mode === "pokemon") {
      this.quickSwitchPokemon();
    }
  }

  handleBallAction() {
    if (this.mode === "pokemon") {
      this.quickSwitchPokemon();
      return;
    }
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

  updateNearbyNpc() {
    const actor = this.activePokemon || this.trainer;
    const npcs = this.map.npcs || [];
    this.nearbyNpc = npcs.find((npc) => Math.hypot(actor.x - npc.x, actor.y - npc.y) <= 72) || null;
  }

  interactNpc(npc) {
    if (!npc) return;
    if (this.survival && npc.type === "HEALER") {
      const actor = this.activePokemon || this.trainer;
      if (Math.hypot(actor.x - npc.x, actor.y - npc.y) > 72) return;
      const remaining = Math.ceil(this.survival.healReadyAt - this.survival.elapsed);
      if (remaining > 0) {
        this.message(`치료 준비 중 · 전투 시간 ${remaining}초`, 1.5);
        return;
      }
      this.healParty();
      this.survival.healReadyAt = this.survival.elapsed + 25;
      this.saveGame(true);
      return;
    }
    if (this.mode === "pokemon") this.startRecall();
    if (npc.type === "PROFESSOR") {
      this.menuOpen = true;
      this.openMenuView("professor");
      return;
    }
    if (npc.type === "HUNTING_GUIDE") {
      this.menuOpen = true;
      this.menuView = "areaSelect";
      this.message(npc.dialogue, 1.6);
      this.ui.showGameMenu(this);
      return;
    }
    if (npc.type === "HEALER") {
      this.healParty();
      this.saveGame(true);
      return;
    }
    if (npc.type === "SHOP") {
      this.menuOpen = true;
      this.menuView = "mart";
      this.message(npc.dialogue, 1.4);
      this.ui.showGameMenu(this);
      return;
    }
    if (npc.type === "RETURN_GUIDE") {
      this.travelToHub();
    }
  }

  travelToArea(areaId) {
    const area = window.SurvivorRPG.HuntingAreas.find((item) => item.id === areaId);
    if (!area) return false;
    if (areaId === "survival" && !this.partyPokemon.some((pokemon) => !pokemon.dead && pokemon.hp > 0)) {
      this.message("먼저 파티 포켓몬을 치료해 주세요.", 2);
      return false;
    }
    this.menuOpen = false;
    this.ui.hideGameMenu();
    this.setMap(area.mapId);
    if (this.survival) {
      if (this.selectedPokemon.dead) this.selectNextAvailablePokemon();
      this.startDeploy();
    }
    this.message(`${area.name}으로 이동했습니다.`, 1.8);
    this.saveGame(true);
    return true;
  }

  travelToHub() {
    this.setMap("hub");
    this.message("허브로 돌아왔습니다.", 1.8);
    this.saveGame(true);
    return true;
  }

  healParty() {
    this.partyPokemon.forEach((pokemon) => {
      pokemon.hp = pokemon.maxHp;
      pokemon.dead = false;
      pokemon.fainted = false;
      pokemon.equippedMoves.forEach((slot) => {
        slot.cooldownRemaining = 0;
      });
      pokemon.syncMoveState?.();
    });
    this.message("파티 포켓몬이 모두 회복되었습니다.", 2.0);
  }

  startDeploy() {
    if (this.awaitingStarter) return;
    const pokemon = this.selectedPokemon;
    if (!pokemon || pokemon.dead || pokemon.hp <= 0) {
      this.message("선택한 포켓몬은 더 싸울 수 없습니다.", 1.6);
      return;
    }
    pokemon.x = this.clampX(this.trainer.x);
    pokemon.y = this.clampY(this.trainer.y);
    pokemon.vx = 0;
    pokemon.vy = 0;
    pokemon.direction = this.trainer.direction;
    pokemon.inField = true;
    this.activePokemon = pokemon;
    this.player = pokemon;
    this.mode = "pokemon";
    this.enemies.forEach((enemy) => {
      if (enemy.state === "capture_ready") enemy.resumeWild();
    });
    this.resetMoveCooldowns(pokemon);
    this.spawnSwitchFlash(pokemon.x, pokemon.y);
    this.message(`${pokemon.name}, 부탁해!`, 1.2);
  }

  startRecall() {
    this.partyBattle.clear();
    this.combatSystem.meleeSwings = [];
    this.combatSystem.hitboxes = [];
    this.combatSystem.telegraphs = [];
    this.combatSystem.delayedAttacks = [];
    this.enemies.forEach((enemy) => {
      if (!enemy.dead && enemy.hp < enemy.maxHp) enemy.setCaptureReady();
    });
    const pokemon = this.activePokemon || this.player;
    this.trainer.x = this.clampX(pokemon.x);
    this.trainer.y = this.clampY(pokemon.y);
    this.trainer.direction = pokemon.direction;
    this.trainer.vx = 0;
    this.trainer.vy = 0;
    pokemon.vx = 0;
    pokemon.vy = 0;
    pokemon.inField = false;
    this.activePokemon = null;
    this.player = this.selectedPokemon;
    this.mode = "trainer";
    this.captureTarget = this.captureSystem.nearestTarget(this.trainer, this.enemies);
    this.spawnSwitchFlash(this.trainer.x, this.trainer.y);
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
    this.mode = "pokemon";
    this.resetMoveCooldowns(next);
    this.partyBattle.sync(this);
    this.spawnSwitchFlash(next.x, next.y);
    this.message(`${next.name}, 교체 출전!`, 1.1);
  }

  resetMoveCooldowns(pokemon) {
    pokemon.equippedMoves.forEach((slot) => {
      const move = window.SurvivorRPG.MoveData[slot.moveId];
      slot.cooldownRemaining = move ? this.statSystem.calculateMoveCooldown(move, pokemon.speed, slot.upgradeLevel || 0) : 1;
    });
    pokemon.syncMoveState?.();
  }

  spawnSwitchFlash(x, y) {
    this.switchFlash = { x, y, timer: 0.42, duration: 0.42 };
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
      if (target.survival && this.survival) this.survival.captures += 1;
      target.state = "captured";
      this.markPokedex(target.id, "caught");
      this.addCapturedPokemon(target);
      const reward = this.moneyRewardFor(target);
      const firstResearch=!this.journal.firstRewards[target.id];
      this.money += reward;
      this.runStats.earned+=reward;
      this.runStats.caught.push(target.id);
      if(target.survival&&this.survival){this.survival.stats.caught.push(target.id);this.survival.stats.earned+=reward;}
      if(firstResearch) {
        this.journal.firstRewards[target.id]=true;this.money+=100;this.runStats.earned+=100;
        this.runStats.rewards.push(`${target.name} 첫 연구 +100원`);
        if(target.survival&&this.survival)this.survival.stats.earned+=100;
        window.SurvivorRPG.SaveStore.writeJournal(this.journal);
      }
      this.message(`${target.name} 포획! +${reward}원${firstResearch?' · 첫 연구 +100원':''}`, 2.8);
      this.enemies = this.enemies.filter((enemy) => enemy !== target);
    } else {
      target.setCaptureReady();
      target.captureFailures=(target.captureFailures || 0)+1;
      this.message(`아깝다! ${target.name}이 몬스터볼에서 나왔다!`, 2.1);
    }
    this.captureTarget = this.captureSystem.nearestTarget(this.trainer, this.enemies);
    this.mode = "trainer";
    this.saveGame(true);
    if(result.success)this.grantEliteReward(target);
  }

  moneyRewardFor(target) {
    return Math.max(20, Math.round(20 + Math.max(0, target.level - 5) * 3));
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
      currentHp: overrides.currentHp ?? nativeStats.maxHp,
      nativeStats,
      equippedMoves,
      moveUpgradeLevels: overrides.moveUpgradeLevels || Object.fromEntries(equippedMoves.map((move) => [typeof move === "string" ? move : move.moveId, typeof move === "string" ? 0 : move.upgradeLevel || 0])),
      growthBonuses: overrides.growthBonuses,
      abilityId: overrides.abilityId || speciesData.abilities?.[0] || null,
      baseTypes: overrides.baseTypes || speciesData.types,
      teraType: overrides.teraType || null,
      hasTerastallized: overrides.hasTerastallized || false,
      exp: overrides.exp || 0,
      expToNext: overrides.expToNext,
      growthVersion: overrides.growthVersion
    };
    const pokemon = new window.SurvivorRPG.PlayerPokemon(data, x, y);
    this.statSystem.recalculateStats(pokemon);
    if (overrides.megaFormId) {
      window.SurvivorRPG.EvolutionSystem.applyMega(pokemon, overrides.megaFormId, this.statSystem);
      if (overrides.currentHp !== undefined) pokemon.hp = Math.max(0, Math.min(pokemon.maxHp, overrides.currentHp));
    }
    return pokemon;
  }

  awardParticipantExp(enemy) {
    const money=Math.max(5,Math.floor(enemy.level/2));
    this.money+=money;
    this.runStats.earned+=money;this.runStats.defeats++;
    this.journal.defeats++;
    if(this.journal.defeats>=5&&!this.journal.goals.first5) {
      this.journal.goals.first5=true;this.money+=50;this.runStats.earned+=50;
      if(enemy.survival&&this.survival)this.survival.stats.earned+=50;
      this.runStats.rewards.push('첫 5마리 조사 +50원');
      this.message('첫 5마리 조사 완료! 연구비 50원',2);
    }
    this.grantEliteReward(enemy);
    window.SurvivorRPG.SaveStore.writeJournal(this.journal);
    if(enemy.survival && this.survival)this.survival.stats.earned+=money;
    const survival = enemy.survival ? this.survival : null;
    if (survival) survival.kills += 1;
    const participantIds = enemy.participants ? [...enemy.participants] : [];
    const recipients = participantIds
      .map((id) => this.partyPokemon.find((pokemon) => pokemon.uniqueId === id))
      .filter((pokemon) => pokemon && !pokemon.dead);
    const rewardLabel = survival
      ? `EXP +${Math.round(survival.rewardFraction(this.player, enemy.expReward) * 100)}%`
      : `EXP +${enemy.expReward}`;
    this.combatSystem.damageNumbers.push({ x: enemy.x, y: enemy.y - 58, value: rewardLabel, life: 1.0, color: "#9fd4ff" });
    this.assets.play("exp", 0.28);
    recipients.forEach((pokemon) => {
      const levelEvents = survival ? survival.gainExperience(pokemon, enemy.expReward) : pokemon.gainExp(enemy.expReward);
      levelEvents.forEach((event) => this.enqueueLevelUp({ ...event, pokemon }));
    });
    if (this.items.expShare && this.items.expShareEnabled !== false) {
      const sharedExp = Math.max(1, Math.floor(enemy.expReward * 0.7));
      this.partyPokemon
        .filter((pokemon) => pokemon && !pokemon.dead && !participantIds.includes(pokemon.uniqueId))
        .forEach((pokemon) => {
          const levelEvents = survival ? survival.gainExperience(pokemon, sharedExp) : pokemon.gainExp(sharedExp);
          levelEvents.forEach((event) => this.enqueueLevelUp({ ...event, pokemon }));
        });
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
      if (this.survival) this.survival.status = "failed";
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
    this.partyBattle.sync(this);
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
      this.saveGame(true);
      return;
    }
    this.currentLevelEvent = event;
    this.processLevelEvent(event);
  }

  processLevelEvent(event) {
    const pokemon = event.pokemon || this.player;
    if(event.rewardOnly) {this.continueLevelPipeline(event);return;}
    this.notifyProgress(`레벨 업! ${pokemon.name} Lv.${event.fromLevel} → Lv.${event.toLevel}`, "level");
    this.statSystem.applyNativeStatGrowth(pokemon);
    const newMoveId = this.nextMoveForLevel(pokemon, event.toLevel);
    if (newMoveId && this.queueMoveLearning(pokemon, newMoveId, event)) return;
    this.continueLevelPipeline(event);
  }

  grantEliteReward(enemy) {
    const id=enemy.survivalElite;
    if(!id||!this.survival||this.survival.rewardedElites.includes(id))return;
    this.survival.rewardedElites.push(id);
    this.enqueueLevelUp({pokemon:this.activePokemon || this.selectedPokemon,toLevel:this.player.level,rewardOnly:true,
      forcedRarity:id==='final'?'legendary':'hero'});
    const label=id==='final'?'최종 정예: 전설 선택':'정예: 영웅 선택';
    this.runStats.rewards.push(label);this.survival.stats.rewards.push(label);
  }

  continueLevelPipeline(event) {
    const pokemon = event.pokemon || this.player;
    if (!event.rewardOnly) this.checkEvolution(event, pokemon);
    if (!event.rewardOnly && event.toLevel % 5 !== 0) {
      this.openNextLevelChoice();
      return;
    }
    this.mode = "levelChoice";
    this.menuOpen=false;
    this.ui.hideGameMenu();
    this.currentLevelEvent = event;
    if(event.forcedRarity)this.upgradeSystem.forceRarityNext=event.forcedRarity;
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
      this.notifyProgress(`${pokemon.name}은(는) ${move.name}을 배웠다!`, "move");
      this.message(`${pokemon.name}은(는) ${move.name}을 배웠다!`, 2.0);
      return false;
    }
    this.mode = "moveLearn";
    this.menuOpen=false;
    this.ui.hideGameMenu();
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
    this.notifyProgress(`${pokemon.name}은(는) ${newMove.name}을 배웠다!`, "move");
    this.message(`${pokemon.name}은(는) ${oldMove.name}을 잊고 ${newMove.name}을 배웠다!`, 2.2);
    this.finishMoveLearning();
  }

  finishMoveLearning() {
    const event = this.currentMoveLearn.event;
    const afterLevelChoice = this.currentMoveLearn.afterLevelChoice;
    this.currentMoveLearn = null;
    this.ui.hideMoveLearning();
    if (afterLevelChoice) {
      this.openNextLevelChoice();
      return;
    }
    this.continueLevelPipeline(event);
  }

  selectLevelChoice(index) {
    if (this.choiceLocked || this.mode !== "levelChoice") return;
    const choice = this.currentChoices[index];
    if (!choice) return;
    this.choiceLocked = true;
    const pokemon = this.currentLevelEvent.pokemon || this.player;
    if (choice.type === "learnTmMove") {
      this.ui.hideLevelChoices();
      if (this.queueMoveLearning(pokemon, choice.moveId, this.currentLevelEvent)) {
        this.currentMoveLearn.afterLevelChoice = true;
        return;
      }
      pokemon.syncMoveState?.();
      window.setTimeout(() => {
        this.openNextLevelChoice();
      }, 220);
      return;
    }
    if (choice.type === 'earlyEvolution') {
      const allowed = window.SurvivorRPG.DataAdapter.getEvolutionData(pokemon.speciesId).some(evolution => evolution.target === choice.targetSpeciesId);
      if (allowed && !pokemon.megaFormId) this.performEvolution(pokemon, choice.targetSpeciesId, 'EARLY_LEGENDARY');
    } else if (choice.type === 'megaEvolution') {
      if (window.SurvivorRPG.EvolutionSystem.applyMega(pokemon, choice.megaFormId, this.statSystem)) {
        this.evolutionFlash = { pokemon, timer: 0.9, duration: 0.9 };
        this.message(`${pokemon.name}(으)로 메가진화했다!`, 2);
      }
    } else this.upgradeSystem.applyChoice(pokemon, choice);
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

  notifyProgress(text, kind) {
    this.progressNotices ||= [];
    this.progressNotices.push({ text, kind, remaining: kind === "move" ? 3.2 : 2.6 });
    this.updateProgressNotices(0);
  }

  updateProgressNotices(dt) {
    // Use UI time so learning/choice dialogs do not freeze a stale notification.
    if (this.menuOpen) return;
    if (this.progressNotice) {
      this.progressNotice.remaining -= dt;
      if (this.progressNotice.remaining <= 0) this.progressNotice = null;
    }
    if (!this.progressNotice && this.progressNotices?.length) {
      this.progressNotice = this.progressNotices.shift();
      if (this.progressNotice.kind === "level") this.assets.play("level", 0.45);
    }
  }

  toggleMenu() {
    if (this.awaitingStarter) return;
    if (this.mode !== "trainer" && !this.menuOpen) {
      this.message("메뉴는 트레이너 모드에서 열 수 있습니다.", 1.4);
      return;
    }
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) {
      this.menuView = "main";
      this.assets.play("uiOpen", 0.4);
      this.ui.showGameMenu(this);
    } else {
      this.assets.play("uiClose", 0.4);
      this.ui.hideGameMenu();
    }
  }

  openMenuView(view, index = 0) {
    if (this.awaitingStarter && !['starterSelect', 'starterConfirm'].includes(view)) return;
    this.menuView = view;
    this.menuSelectedPokemonIndex = index;
    this.ui.showGameMenu(this);
  }

  backMenu() {
    if (!this.menuOpen) return;
    if (this.awaitingStarter && this.menuView === 'starterSelect') return;
    if (this.menuView === "main") {
      this.toggleMenu();
      return;
    }
    const previous = {
      starterSelect: "professor",
      starterConfirm: "starterSelect",
      resetConfirm: "professor",
      summary: "pokemon",
      bagTarget: "bag"
    }[this.menuView] || "main";
    this.openMenuView(previous);
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

  buyItem(itemId) {
    const item = window.SurvivorRPG.ItemData[itemId];
    if (!item) return false;
    const price = item.price;
    if (["doubleBattle", "tripleBattle"].includes(itemId) && this.items[itemId]) {
      this.message("이미 구매한 배틀 모드입니다.", 1.5);
      return false;
    }
    if (itemId === "expShare" && this.items.expShare) {
      this.message("학습장치는 이미 활성화되어 있습니다.", 1.5);
      this.ui.showGameMenu(this);
      return false;
    }
    if (this.money < price) {
      this.message("돈이 부족합니다.", 1.5);
      this.ui.showGameMenu(this);
      return false;
    }
    this.money -= price;
    if (["doubleBattle", "tripleBattle"].includes(itemId)) {
      this.items[itemId] = true;
      this.battleFormation = itemId === "doubleBattle" ? "double" : "triple";
    }
    if (itemId === "pokeBall") this.balls.pokeBall += 1;
    if (itemId === "potion") this.items.potion = (this.items.potion || 0) + 1;
    if (itemId === "expShare") {
      this.items.expShare = true;
      this.items.expShareEnabled = true;
    }
    this.message(`${price}원을 사용했습니다.`, 1.4);
    this.ui.showGameMenu(this);
    this.saveGame(true);
    return true;
  }

  setBattleFormation(mode) {
    if (!['single', 'double', 'triple'].includes(mode)) return false;
    if ((mode === 'double' && !this.items.doubleBattle) || (mode === 'triple' && !this.items.tripleBattle)) return false;
    this.battleFormation = mode;
    this.partyBattle.clear(this.activePokemon);
    this.message(mode === 'single' ? '동시 출전을 껐습니다.' : `${mode === 'double' ? '더블' : '트리플'} 배틀을 켰습니다.`, 1.5);
    this.ui.showGameMenu(this);
    return true;
  }

  professorAvailable() {
    const oak = this.map.npcs?.find((npc) => npc.type === 'PROFESSOR');
    return this.mode === 'trainer' && oak && Math.hypot(this.trainer.x - oak.x, this.trainer.y - oak.y) <= 72;
  }

  chooseStarter(speciesId) {
    if (!this.professorAvailable() || !['bulbasaur', 'charmander', 'squirtle'].includes(speciesId)) return false;
    this.pendingStarter = speciesId;
    this.openMenuView('starterConfirm');
    return true;
  }

  changeStarter() {
    if (this.menuView !== 'starterConfirm' || !this.professorAvailable()) return false;
    const id = this.pendingStarter;
    if (!['bulbasaur', 'charmander', 'squirtle'].includes(id)) return false;
    if (this.awaitingStarter) {
      const pokemon = this.createPartyPokemon(window.SurvivorRPG.PokemonData[id], this.trainer.x, this.trainer.y, { level: 5 });
      pokemon.hp = pokemon.maxHp;
      this.ownedPokemon = [pokemon];
      this.partyPokemon = [pokemon];
      this.selectedPokemon = this.player = pokemon;
      this.starterId = pokemon.uniqueId;
      this.selectedPartyIndex = 0;
      this.awaitingStarter = false;
      this.journal.awaitingStarter = false;
      this.pendingStarter = null;
      this.markPokedex(id, 'caught');
      this.menuOpen = false;
      this.ui.hideGameMenu();
      this.message(`오박사에게 ${pokemon.name}을 받았다!`, 2.5);
      this.saveGame(true);
      return true;
    }
    const old = this.ownedPokemon.find((pokemon) => pokemon.uniqueId === this.starterId);
    if (!old) return false;
    const replacement = this.createPartyPokemon(window.SurvivorRPG.PokemonData[id], old.x, old.y, {
      uniqueId: old.uniqueId, level: old.level, exp: old.exp, expToNext: old.expToNext, growthVersion: 1,
      growthBonuses: { ...old.growthBonuses }, currentHp: 1
    });
    replacement.hp = Math.min(replacement.maxHp, Math.max(old.hp > 0 ? 1 : 0,
      Math.round(replacement.maxHp * old.hp / old.maxHp)));
    replacement.reviveAtCurrentHp();
    const replace = (list) => list.map((pokemon) => pokemon.uniqueId === old.uniqueId ? replacement : pokemon);
    this.ownedPokemon = replace(this.ownedPokemon);
    this.partyPokemon = replace(this.partyPokemon);
    this.reservePokemon = replace(this.reservePokemon);
    if (this.selectedPokemon.uniqueId === old.uniqueId) {
      this.selectedPokemon = replacement;
      this.player = replacement;
    }
    this.markPokedex(id, 'caught');
    this.pendingStarter = null;
    this.openMenuView('professor');
    this.message(`첫 파트너를 ${replacement.name}(으)로 변경했습니다.`, 2);
    this.saveGame(true);
    return true;
  }

  resetAtProfessor() {
    if (this.menuView !== 'resetConfirm' || !this.professorAvailable()) return false;
    this.beginStarterJourney();
    return true;
  }

  receiveEmergencyBalls() {
    if(!this.professorAvailable() || this.balls.pokeBall>0 || this.money>=50)return false;
    this.balls.pokeBall=3;this.message('오박사가 몬스터볼 3개를 지원했다.',2);this.saveGame(true);
    this.ui.showGameMenu(this);return true;
  }

  async importReport(file) {
    if(!file)return false;
    if(file.size>2000000){this.message('리포트 파일이 너무 큽니다.',2);return false;}
    try {
      const data=JSON.parse(await file.text());
      if(!this.loadGame(data))return false;
      this.saveGame(true);return true;
    } catch {this.message('손상된 리포트입니다. 현재 진행은 유지됩니다.',2);return false;}
  }

  restartAfterDefeat() {
    if (this.mode !== 'gameOver') return false;
    this.beginStarterJourney();
    return true;
  }

  beginStarterJourney() {
    this.journal.awaitingStarter=true;
    window.SurvivorRPG.SaveStore.writeJournal(this.journal);
    localStorage.removeItem('scientistRpgSave');
    localStorage.removeItem('scientistRpgSave.backup');
    this.reset({starterPending:true});
    this.awaitingStarter = true;
    this.ownedPokemon = [];
    this.partyPokemon = [];
    this.reservePokemon = [];
    this.starterId = null;
    this.pokedex = JSON.parse(JSON.stringify(this.journal.dex));
    this.trainer.x = 800; this.trainer.y = 730;
    this.camera.follow(this.trainer, 1);
    this.menuOpen = true;
    this.openMenuView('starterSelect');
    this.message('도감 기록은 보존했습니다. 새 파트너를 선택하세요.', 2);
  }

  startBagUse(itemId) {
    if (this.mode !== "trainer") {
      this.message("도구는 트레이너 모드에서만 사용할 수 있습니다.", 1.5);
      return false;
    }
    if (itemId === "potion") {
      this.currentBagUse = itemId;
      this.menuView = "bagTarget";
      this.ui.showGameMenu(this);
      return true;
    }
    return false;
  }

  toggleExpShare() {
    if (!this.items.expShare) return false;
    this.items.expShareEnabled = this.items.expShareEnabled === false;
    this.message(`학습장치를 ${this.items.expShareEnabled ? "켰습니다." : "껐습니다."}`, 1.5);
    this.ui.showGameMenu(this);
    return true;
  }

  usePotion(partyIndex) {
    const item = window.SurvivorRPG.ItemData.potion;
    const pokemon = this.partyPokemon[partyIndex];
    if (!pokemon || pokemon.dead || this.items.potion <= 0 || pokemon.hp >= pokemon.maxHp) {
      this.message("상처약을 사용할 수 없습니다.", 1.4);
      this.ui.showGameMenu(this);
      return false;
    }
    pokemon.hp = Math.min(pokemon.maxHp, pokemon.hp + item.healAmount);
    this.items.potion -= 1;
    this.message(`${pokemon.name}의 HP가 ${item.healAmount} 회복되었습니다.`, 1.7);
    this.openMenuView("bag");
    return true;
  }

  markPokedex(speciesId, state) {
    const entry = this.pokedex[speciesId] || { seen: false, caught: false, count: 0 };
    entry.seen = true;
    if (state === "caught") {
      entry.caught = true;
      entry.count += 1;
    }
    this.pokedex[speciesId] = entry;
    if(this.journal) {
      const old=this.journal.dex[speciesId] || {};
      this.journal.dex[speciesId]={seen:true,caught:old.caught||entry.caught,count:Math.max(old.count||0,entry.count||0)};
    }
  }

  serializeRun() {
    if (this.awaitingStarter) return false;
    const actor=this.activePokemon || this.trainer;
    const data = {
      version: this.saveVersion,
      savedAt: Date.now(),
      trainer: { x: actor.x, y: actor.y, direction: actor.direction },
      currentMapId: this.currentMapId,
      currentHuntingArea: this.currentHuntingArea,
      starterId: this.starterId,
      battleFormation: this.battleFormation,
      survival: this.survival?.serialize() || null,
      balls: this.balls,
      money: this.money,
      items: this.items,
      pokedex: this.pokedex,
      ownedPokemon: this.ownedPokemon.map((pokemon) => this.serializePokemon(pokemon)),
      partyIds: this.partyPokemon.map((pokemon) => pokemon.uniqueId),
      reserveIds: this.reservePokemon.map((pokemon) => pokemon.uniqueId),
      selectedId: this.selectedPokemon?.uniqueId || null
    };
    data.runStats=this.runStats;
    return data;
  }

  saveGame(quiet=false) {
    if(this.awaitingStarter || !this.ownedPokemon.length)return false;
    // Never checkpoint halfway through a growth choice: its reward is not committed yet.
    if(['levelChoice','moveLearn','transition'].includes(this.mode)||this.levelUpQueue.length)return false;
    try {
      window.SurvivorRPG.SaveStore.write(this.serializeRun());
      window.SurvivorRPG.SaveStore.writeJournal(this.journal);
      if(!quiet){this.message('리포트를 작성했다.',1.8);this.ui.showGameMenu(this);}
      return true;
    } catch {this.message('저장하지 못했습니다. 리포트 내보내기로 보관해 주세요.',2);return false;}
  }

  loadGame(imported=null) {
    let report;
    try {report=imported?{data:window.SurvivorRPG.SaveStore.validate(imported)}:window.SurvivorRPG.SaveStore.read();}catch{}
    if (!report) {
      this.message("불러올 수 있는 리포트가 없습니다. 현재 진행은 유지됩니다.", 2);
      return false;
    }
    const data = report.data;
    const restored = data.ownedPokemon.map((saved) => this.deserializePokemon(saved));
    const byId = new Map(restored.map((pokemon) => [pokemon.uniqueId, pokemon]));
    this.ownedPokemon = restored;
    this.partyPokemon = data.partyIds.map((id) => byId.get(id)).filter(Boolean).slice(0, 6);
    this.reservePokemon = data.reserveIds.map((id) => byId.get(id)).filter(Boolean);
    this.selectedPokemon = byId.get(data.selectedId) || this.partyPokemon[0];
    this.selectedPartyIndex = Math.max(0, this.partyPokemon.findIndex((pokemon) => pokemon.uniqueId === this.selectedPokemon.uniqueId));
    this.player = this.selectedPokemon;
    this.activePokemon = null;
    this.awaitingStarter=false;
    this.journal.awaitingStarter=false;
    this.levelUpQueue=[];this.currentLevelEvent=null;this.currentMoveLearn=null;
    this.progressNotices=[];this.progressNotice=null;
    this.currentChoices=[];this.choiceLocked=false;this.transition=null;
    this.ui.hideLevelChoices();this.ui.hideMoveLearning();
    this.mode = "trainer";
    this.setMap(data.currentMapId || "hub", { clearEnemies: true, movePlayer: false });
    if (this.survival && data.survival) this.survival = new window.SurvivorRPG.SurvivalSystem(data.survival);
    this.currentHuntingArea = data.currentHuntingArea || (this.currentMapId === "hub" ? null : this.currentMapId);
    this.balls = data.balls || { pokeBall: 10 };
    this.money = data.money || 0;
    this.items = { potion: 0, expShare: false, expShareEnabled: false, doubleBattle: false, tripleBattle: false, ...(data.items || {}) };
    this.starterId = byId.has(data.starterId) ? data.starterId : this.ownedPokemon[0]?.uniqueId;
    this.battleFormation = data.battleFormation === "triple" && this.items.tripleBattle ? "triple"
      : data.battleFormation === "double" && this.items.doubleBattle ? "double" : "single";
    if (this.items.expShare && data.items?.expShareEnabled === undefined) this.items.expShareEnabled = true;
    this.pokedex = {...this.journal.dex,...(data.pokedex || {})};
    this.runStats=data.runStats || {defeats:0,earned:0,caught:[],damage:{},rewards:[]};
    this.trainer.x = data.trainer?.x || this.trainer.x;
    this.trainer.y = data.trainer?.y || this.trainer.y;
    const safe=window.SurvivorRPG.MovementSystem.safePosition(this.map,this.trainer.x,this.trainer.y,this.trainer.radius) || this.map.playerStart;
    this.trainer.x=safe.x;this.trainer.y=safe.y;
    this.trainer.direction = data.trainer?.direction || "down";
    this.camera.follow(this.trainer, 1);
    this.message(report.recovered?'백업 리포트로 복구했습니다.':'리포트를 불러왔다.', 1.8);
    if(this.menuOpen)this.ui.showGameMenu(this);else this.ui.hideGameMenu();
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
      growthVersion: 1,
      hp: pokemon.hp,
      growthBonuses: pokemon.growthBonuses,
      equippedMoves: pokemon.equippedMoves,
      abilityId: pokemon.abilityId,
      baseTypes: pokemon.baseTypes,
      teraType: pokemon.teraType,
      hasTerastallized: pokemon.hasTerastallized,
      fainted: pokemon.fainted,
      evolutionData: pokemon.evolutionData,
      megaFormId: pokemon.megaFormId
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
      growthVersion: saved.growthVersion,
      currentHp: saved.hp,
      growthBonuses: saved.growthBonuses,
      equippedMoves: saved.equippedMoves,
      abilityId: saved.abilityId,
      baseTypes: saved.baseTypes || species.types,
      teraType: saved.teraType || null,
      hasTerastallized: saved.hasTerastallized || !!saved.teraType,
      evolutionData: saved.evolutionData,
      megaFormId: saved.megaFormId
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
    pokemon.types = pokemon.teraType ? [pokemon.teraType] : [...newSpecies.types];
    pokemon.baseTypes = [...newSpecies.types];
    pokemon.spriteKey = newSpecies.id;
    pokemon.frameSize = newSpecies.frameSize || pokemon.frameSize;
    pokemon.scale = newSpecies.scale || pokemon.scale;
    pokemon.radius = newSpecies.radius || pokemon.radius;
    pokemon.movementSpeed = newSpecies.movementSpeed || pokemon.movementSpeed;
    pokemon.evolutionData = { from: oldSpecies.id, to: newSpecies.id, reason, level: pokemon.level };
    this.markPokedex(newSpecies.id, 'caught');
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
    this.ctx.save();
    this.ctx.scale(this.worldZoom,this.worldZoom);
    this.drawMap();
    if (this.debug) this.drawDebugZones();

    const drawables = [];
    drawables.push(...(this.map.objects || []).map(object => ({ scenery:object, y:object.y+object.height-12 })));
    drawables.push(...this.map.npcs.map(npc => ({ npc, y:npc.y })));
    if (this.mode === "trainer" || this.mode === "transition") drawables.push(this.trainer);
    if (this.mode === "pokemon" || (this.mode === "transition" && this.player.inField)) drawables.push(this.player);
    if (this.mode !== "trainer") drawables.push(...this.partyBattle.members.filter((pokemon) => pokemon !== this.player));
    drawables.push(...this.enemies);
    drawables.sort((a, b) => a.y - b.y);

    drawables.forEach((entity) => {
      if(entity.scenery) { this.drawScenery(entity.scenery); return; }
      if(entity.npc) { this.drawNpcs([entity.npc]); return; }
      this.drawShadow(entity);
      entity.draw(this.ctx, this.camera, this.assets, this.combatSystem.poseFor(entity));
      if (entity !== this.trainer) {
        this.drawPokemonOverheadLabel(entity, entity === this.player || this.partyBattle.members.includes(entity));
      }
      if (entity !== this.player && entity !== this.trainer && !this.partyBattle.members.includes(entity)) {
        this.drawEnemyHp(entity);
        entity.drawOverhead(this.ctx, this.camera);
      }
    });

    this.drawCaptureTarget();
    if (this.debug) this.drawDebugAggro();
    this.combatSystem.drawEffects(this.ctx, this.camera);
    this.drawTransitionEffects();
    this.drawEvolutionFlash();
    this.drawSwitchFlash();
    this.ctx.restore();
  }

  drawMap() {
    const ctx = this.ctx;
    const tileset = this.assets.image(this.map.biome === 'cave' ? 'caveTiles' : 'tileset');
    const tileSize = this.map.tileSize;
    const startX = Math.floor(this.camera.x / tileSize) - 1;
    const endX = Math.ceil((this.camera.x + this.camera.width) / tileSize) + 1;
    const startY = Math.floor(this.camera.y / tileSize) - 1;
    const endY = Math.ceil((this.camera.y + this.camera.height) / tileSize) + 1;

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
    if(this.map.biome === 'cave')return {sx:(Math.abs(tx+ty)%3)*32,sy:0,sw:32,sh:32};
    const n = Math.abs(Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453) % 1;
    return n > 0.58 ? this.map.tileSources.grassB : this.map.tileSources.grassA;
  }

  drawPath(tileset) {
    if(this.map.biome === 'cave')return;
    const path = this.map.tileSources.path;
    const paths = this.map.paths || [];
    paths.forEach((area) => {
      for (let y = area.y; y < area.y + area.height; y += 32) {
        for (let x = area.x; x < area.x + area.width; x += 32) {
          const edgeX=x===area.x?0:x+32>=area.x+area.width?64:32;
          const edgeY=y===area.y?128:y+32>=area.y+area.height?192:160;
          this.drawTile(tileset, {...path,sx:edgeX,sy:edgeY}, x - this.camera.x, y - this.camera.y);
        }
      }
    });
  }

  drawGrassPatch(tileset, patch) {
    if(this.map.biome === 'cave')return;
    const source = {sx:128,sy:0,sw:32,sh:32};
    const step = this.map.tileSize;
    for (let y = patch.y; y < patch.y + patch.height; y += step) {
      for (let x = patch.x; x < patch.x + patch.width; x += step) {
        if(this.map.paths.some(path=>x+16>=path.x&&x+16<path.x+path.width&&y+16>=path.y&&y+16<path.y+path.height))continue;
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

  drawScenery(object) {
    const source=window.SurvivorRPG.WorldArt[object.art];
    const x=Math.round(object.x-this.camera.x),y=Math.round(object.y-this.camera.y);
    if(x+object.width<0||y+object.height<0||x>this.width||y>this.height)return;
    this.ctx.drawImage(this.assets.image(source.atlas || 'tileset'),source.sx,source.sy,source.sw,source.sh,x,y,object.width,object.height);
  }

  drawNpcs(npcs = this.map.npcs || []) {
    const ctx = this.ctx;
    npcs.forEach((npc) => {
      const sprite = window.SurvivorRPG.NpcSprites[npc.type];
      const img = sprite && this.assets.image(sprite.key);
      const x = npc.x - this.camera.x;
      const y = npc.y - this.camera.y;
      ctx.save();
      if (img) {
        const actor = this.activePokemon || this.trainer;
        const dx = actor.x - npc.x, dy = actor.y - npc.y;
        const row = Math.hypot(dx, dy) > 100 ? 0 : Math.abs(dx) > Math.abs(dy)
          ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
        // Anil's NPC sheets have 4x4 frames (60x64), unlike the player's 64x64 sheet.
        const frameWidth = img.width / 4, frameHeight = img.height / 4;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, row * frameHeight, frameWidth, frameHeight,
          Math.round(x - frameWidth / 2), Math.round(y - frameHeight + 14), frameWidth, frameHeight);
      }
      ctx.font = "bold 18px FusionPokemon, Segoe UI, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(20, 24, 36, 0.9)";
      ctx.fillStyle = this.nearbyNpc?.id === npc.id ? "#fff36b" : "#ffffff";
      ctx.strokeText(npc.name, x, y - 58);
      ctx.fillText(npc.name, x, y - 58);
      if (this.nearbyNpc?.id === npc.id) {
        ctx.fillStyle = "#ffffff";
        ctx.strokeText("Z", x, y - 78);
        ctx.fillText("Z", x, y - 78);
      }
      ctx.restore();
    });
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

  drawPokemonOverheadLabel(entity, owned) {
    const ctx = this.ctx;
    const x = entity.x - this.camera.x;
    const y = entity.y - this.camera.y - entity.drawSize * 0.55 - 16;
    const levelText = `Lv.${entity.level}`;
    const nameText = entity.name;
    const types = (entity.types || entity.baseTypes || []).slice(0, 2);
    const typeIcon = this.assets.image("typesMini");
    const typeIndexes = {
      normal: 0, fighting: 1, flying: 2, poison: 3, ground: 4, rock: 5,
      bug: 6, ghost: 7, steel: 8, unknown: 9, fire: 10, water: 11,
      grass: 12, electric: 13, psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18
    };
    ctx.save();
    ctx.font = "bold 19px FusionPokemon, Segoe UI, Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(20, 24, 36, 0.9)";
    ctx.fillStyle = "#ffffff";
    const levelWidth = ctx.measureText(levelText).width;
    const nameWidth = ctx.measureText(nameText).width;
    const iconSize = 17;
    const iconWidth = types.length * (iconSize + 2);
    const totalWidth = levelWidth + nameWidth + iconWidth + 10;
    let cursorX = x - totalWidth / 2;
    ctx.strokeText(levelText, cursorX, y);
    ctx.fillText(levelText, cursorX, y);
    cursorX += levelWidth + 5;
    types.forEach((type) => {
      const sourceIndex = typeIndexes[type];
      if (typeIcon && sourceIndex !== undefined) {
        ctx.drawImage(typeIcon, sourceIndex * 24, 0, 24, 24, Math.round(cursorX), Math.round(y - iconSize / 2), iconSize, iconSize);
      }
      cursorX += iconSize + 2;
    });
    ctx.strokeText(nameText, cursorX + 1, y);
    ctx.fillText(nameText, cursorX + 1, y);

    if (owned) {
      ctx.fillStyle = "#e22b35";
      ctx.beginPath();
      ctx.moveTo(x, y - 14);
      ctx.lineTo(x - 6, y - 24);
      ctx.lineTo(x + 6, y - 24);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#6f0b12";
      ctx.stroke();
    }
    ctx.restore();
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  typeColor(type) {
    return {
      normal: "#a8a878", fire: "#f08030", water: "#6890f0", electric: "#f8d030",
      grass: "#78c850", ice: "#98d8d8", fighting: "#c03028", poison: "#a040a0",
      ground: "#e0c068", flying: "#a890f0", psychic: "#f85888", bug: "#a8b820",
      rock: "#b8a038", ghost: "#705898", dragon: "#7038f8", dark: "#705848",
      steel: "#b8b8d0", fairy: "#ee99ac"
    }[type] || "#b8b8b8";
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
    this.ctx.font='bold 19px FusionPokemon, Segoe UI, Arial';
    this.ctx.textAlign='center';this.ctx.strokeStyle='#202020';this.ctx.lineWidth=3;this.ctx.fillStyle='#fff7a8';
    const chance=Math.round(this.captureSystem.calculateCaptureChance(target,window.SurvivorRPG.BallData.pokeBall)*100);
    const label=`${this.captureSystem.lockedTarget===target?'고정 · ':''}포획 ${chance}%`;
    this.ctx.strokeText(label,x,y+26);this.ctx.fillText(label,x,y+26);
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

  drawSwitchFlash() {
    if (!this.switchFlash) return;
    const { x, y, timer, duration } = this.switchFlash;
    const t = 1 - timer / duration;
    const sx = x - this.camera.x;
    const sy = y - this.camera.y;
    this.ctx.save();
    this.ctx.globalAlpha = Math.max(0, 1 - t * 0.2);
    this.ctx.strokeStyle = "#fff7a8";
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.arc(sx, sy, 12 + t * 54, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.globalAlpha = Math.max(0, 0.9 - t);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.beginPath();
    this.ctx.arc(sx, sy, 18 + t * 18, 0, Math.PI * 2);
    this.ctx.fill();
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
