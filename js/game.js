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
    this.ownedPokemon = [];
    this.balls = { pokeBall: 10 };
    this.mode = "trainer";
    this.modeBeforeLevelUp = "pokemon";
    this.transition = null;
    this.captureTarget = null;
    this.levelUpQueue = [];
    this.currentChoices = [];
    this.currentLevelEvent = null;
    this.choiceLocked = false;
    this.debug = false;
    this.messageText = "";
    this.messageTimer = 0;
    this.lastCaptureResult = null;
    this.lastTime = 0;
    this.fps = 0;
    this.fpsSmoothing = 0.9;
  }

  async init() {
    await Promise.all([
      this.assets.loadImage("tileset", this.map.tileset),
      this.assets.loadImage("trainer", "assets/trainer/trainer.png"),
      this.assets.loadImage("pokeball", window.SurvivorRPG.BallData.pokeBall.sprite),
      this.assets.loadImage("bulbasaur", window.SurvivorRPG.PokemonData.bulbasaur.sprite),
      this.assets.loadImage("rattata", window.SurvivorRPG.PokemonData.rattata.sprite),
      this.assets.loadImage("pidgey", window.SurvivorRPG.PokemonData.pidgey.sprite)
    ]);
    this.assets.loadSound("tackle", "assets/audio/tackle.wav");
    this.assets.loadSound("hit", "assets/audio/hit.ogg");
    this.assets.loadSound("exp", "assets/audio/exp.ogg");
    this.assets.loadSound("level", "assets/audio/level-up.ogg");
    this.combatSystem.onLevelUp = (event) => this.enqueueLevelUp(event);
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
    this.player = new window.SurvivorRPG.PlayerPokemon(playerData, start.x, start.y);
    this.player.inField = false;
    this.activePokemon = this.player;
    this.selectedPokemon = this.player;
    this.ownedPokemon = [this.createOwnedPokemon(this.player, true)];
    this.balls = { pokeBall: 10 };
    this.enemies = [];
    this.spawnSystem.zones.forEach((zone) => {
      zone.timer = 0;
    });
    this.camera.x = this.trainer.x - this.width / 2;
    this.camera.y = this.trainer.y - this.height / 2;
    this.camera.clamp();
    this.combatSystem.damageNumbers = [];
    this.combatSystem.hitboxes = [];
    this.combatSystem.delayedAttacks = [];
    this.combatSystem.levelToastTime = 0;
    this.captureTarget = null;
    this.transition = null;
    this.lastCaptureResult = null;
    this.levelUpQueue = [];
    this.currentChoices = [];
    this.currentLevelEvent = null;
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

    if (this.debug && this.input.consumeForceRare()) {
      this.upgradeSystem.forceRareNext = true;
      this.message("다음 레벨업에 rare 선택지가 포함됩니다.", 1.5);
    }
    if (this.debug && this.input.consumeTestExp() && !this.player.dead && this.mode !== "transition" && this.mode !== "levelChoice") {
      const events = this.player.gainExp(this.player.expToNext, this.statSystem);
      events.forEach((event) => this.enqueueLevelUp(event));
      this.combatSystem.levelToastTime = 1.2;
    }
    if (this.debug && this.input.consumeSetTargetWeak()) {
      this.debugWeakenCaptureTarget();
    }

    if (this.mode === "levelChoice") {
      const choiceIndex = this.input.consumeChoiceIndex();
      if (choiceIndex !== null) this.selectLevelChoice(choiceIndex);
      return;
    }

    if (this.mode === "transition") {
      this.input.consumeSwitch();
      this.input.consumeBall();
      this.updateTransition(dt);
      return;
    }

    if (this.mode === "gameOver") return;

    if (this.input.consumeSwitch()) {
      this.handleSwitchAction();
      return;
    }
    if (this.input.consumeBall()) {
      this.handleBallAction();
      return;
    }

    this.spawnSystem.update(dt, this.enemies);

    if (this.mode === "trainer") {
      this.trainer.update(dt, this.input, this.movementSystem, this.map);
      this.enemies.forEach((enemy) => enemy.update(dt, this.trainer, this.movementSystem, this.combatSystem, this.map, { passive: true }));
      this.captureTarget = this.captureSystem.nearestTarget(this.trainer, this.enemies);
      this.camera.follow(this.trainer, dt);
      return;
    }

    if (this.mode === "pokemon") {
      if (this.player.dead) {
        this.mode = "gameOver";
        return;
      }
      this.player.update(dt, this.input, this.movementSystem, this.map);
      this.enemies.forEach((enemy) => enemy.update(dt, this.player, this.movementSystem, this.combatSystem, this.map));
      this.combatSystem.update(dt, this.player, this.enemies);
      this.enemies = this.enemies.filter((enemy) => !enemy.dead && enemy.state !== "captured");
      this.camera.follow(this.player, dt);
      if (this.player.dead) this.mode = "gameOver";
    }
  }

  handleSwitchAction() {
    if (this.mode === "trainer") {
      this.startDeploy();
    } else if (this.mode === "pokemon") {
      this.startRecall();
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
    if (this.player.dead || this.player.hp <= 0) {
      this.message("이상해씨는 더 싸울 수 없습니다.", 1.6);
      return;
    }
    const dir = this.directionVector(this.trainer.direction);
    this.player.x = this.clampX(this.trainer.x + dir.x * 58);
    this.player.y = this.clampY(this.trainer.y + dir.y * 58);
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.direction = this.trainer.direction;
    this.player.inField = true;
    this.mode = "transition";
    this.transition = { type: "deploy", timer: 0, duration: 0.52 };
    this.message("이상해씨, 부탁해!", 1.2);
  }

  startRecall() {
    this.combatSystem.hitboxes = [];
    this.combatSystem.delayedAttacks = [];
    this.enemies.forEach((enemy) => {
      if (!enemy.dead && enemy.hp < enemy.maxHp) enemy.setCaptureReady();
    });
    const dir = this.directionVector(this.player.direction);
    this.trainer.x = this.clampX(this.player.x - dir.x * 42);
    this.trainer.y = this.clampY(this.player.y - dir.y * 42);
    this.trainer.direction = this.player.direction;
    this.trainer.vx = 0;
    this.trainer.vy = 0;
    this.player.vx = 0;
    this.player.vy = 0;
    this.mode = "transition";
    this.transition = { type: "recall", timer: 0, duration: 0.48 };
    this.message("이상해씨를 되돌렸다.", 1.2);
  }

  updateTransition(dt) {
    if (!this.transition) {
      this.mode = "trainer";
      return;
    }
    this.transition.timer += dt;
    if (this.transition.type === "deploy") {
      this.camera.follow(this.player, dt);
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
      this.player.inField = false;
      this.mode = "trainer";
      this.captureTarget = this.captureSystem.nearestTarget(this.trainer, this.enemies);
    } else if (this.transition.type === "capture") {
      this.finishCapture();
    }
    this.transition = null;
  }

  finishCapture() {
    const { target, result } = this.transition;
    if (result.success) {
      target.state = "captured";
      this.ownedPokemon.push(this.createOwnedPokemon(target));
      this.enemies = this.enemies.filter((enemy) => enemy !== target);
      this.message(`좋았어! ${target.name}을 잡았다!`, 2.1);
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

  createOwnedPokemon(entity, starter = false) {
    return {
      uniqueId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      species: entity.id,
      name: entity.name,
      level: entity.level,
      currentHp: entity.hp,
      maxHp: entity.maxHp,
      stats: {
        attack: entity.attack,
        defense: entity.defense,
        specialAttack: entity.specialAttack,
        specialDefense: entity.specialDefense,
        speed: entity.speed
      },
      types: [...entity.types],
      exp: starter ? entity.exp : 0,
      moves: starter ? [...entity.equippedMoves] : ["wildBite"],
      moveUpgradeLevels: starter ? { ...entity.moveUpgradeLevels } : {},
      growthBonuses: starter ? { ...entity.growthBonuses } : {
        maxHpPct: 0,
        attackPct: 0,
        defensePct: 0,
        specialAttackPct: 0,
        specialDefensePct: 0,
        speedPct: 0
      },
      ability: null
    };
  }

  enqueueLevelUp(event) {
    this.levelUpQueue.push(event);
    if (this.mode !== "levelChoice") {
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
      this.choiceLocked = false;
      this.ui.hideLevelChoices();
      return;
    }
    this.mode = "levelChoice";
    this.currentLevelEvent = event;
    this.currentChoices = this.upgradeSystem.createChoices(this.player);
    this.choiceLocked = false;
    this.ui.showLevelChoices(event, this.currentChoices, (index) => this.selectLevelChoice(index));
  }

  selectLevelChoice(index) {
    if (this.choiceLocked || this.mode !== "levelChoice") return;
    const choice = this.currentChoices[index];
    if (!choice) return;
    this.choiceLocked = true;
    this.upgradeSystem.applyChoice(this.player, choice);
    const move = window.SurvivorRPG.MoveData[this.player.moveId];
    const upgradeLevel = this.player.moveUpgradeLevels[this.player.moveId] || 0;
    this.player.attackCooldown = Math.min(this.player.attackCooldown, this.statSystem.calculateMoveCooldown(move, this.player.speed, upgradeLevel));
    window.setTimeout(() => {
      this.ui.hideLevelChoices();
      this.openNextLevelChoice();
    }, 220);
  }

  message(text, seconds = 1.8) {
    this.messageText = text;
    this.messageTimer = seconds;
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
