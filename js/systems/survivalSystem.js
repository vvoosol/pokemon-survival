window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.SurvivalSystem = class SurvivalSystem {
  constructor(saved = {}) {
    this.duration = 15 * 60;
    this.elapsed = Math.max(0, Math.min(900, Number(saved.elapsed) || 0));
    this.kills = Math.max(0, Number(saved.kills) || 0);
    this.captures = Math.max(0, Number(saved.captures) || 0);
    this.healReadyAt = Math.max(0, Number(saved.healReadyAt) || 0);
    this.status = ['active', 'cleared', 'failed'].includes(saved.status) ? saved.status : 'active';
    this.spawnTimer = 0;
    this.spawnIndex = 0;
  }

  difficulty() {
    const progress = Math.min(1, this.elapsed / 900);
    const level = Math.min(48, 5 + Math.floor(this.elapsed / 20));
    const pools = [
      ['rattata', 'pidgey', 'caterpie', 'oddish', 'poliwag'],
      ['pikachu', 'vulpix', 'geodude', 'machop', 'butterfree'],
      ['raticate', 'pidgeotto', 'gloom', 'poliwhirl', 'ivysaur'],
      ['graveler', 'machoke', 'kadabra', 'raichu', 'ninetales'],
      ['venusaur', 'pidgeot', 'vileplume', 'poliwrath', 'machamp', 'golem', 'alakazam']
    ];
    return { levelMin: Math.max(3, level - 2), levelMax: Math.min(50, level + 2),
      pool: pools[Math.min(4, Math.floor(this.elapsed / 180))],
      cap: 16 + Math.floor(progress * 28), interval: 2.6 - progress * 1.2,
      batch: this.elapsed < 300 ? 1 : this.elapsed < 600 ? 2 : 3 };
  }

  update(dt, game) {
    if (this.status !== 'active' || game.mode !== 'pokemon' || game.menuOpen || game.activePokemon?.dead) return;
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    if (this.elapsed >= this.duration) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const difficulty = this.difficulty();
    const count = Math.min(this.spawnIndex === 0 ? 4 : difficulty.batch,
      difficulty.cap - game.enemies.filter((e) => !e.dead && e.state !== 'captured').length);
    for (let i = 0; i < count; i++) this.spawn(game, difficulty);
    this.spawnTimer = difficulty.interval;
  }

  spawn(game, difficulty) {
    const actor = game.activePokemon || game.trainer;
    const side = this.spawnIndex++ % 4;
    let position;
    // Start outside the visible playfield where possible, never on top of the player/NPC.
    for (let attempt = 0; attempt < 12; attempt++) {
      const edge = (side + attempt) % 4;
      const spread = (Math.random() - 0.5) * 0.85;
      const x = actor.x + (edge === 1 ? 740 : edge === 3 ? -740 : spread * 1280);
      const y = actor.y + (edge === 0 ? -460 : edge === 2 ? 460 : spread * 720);
      if (x < 55 || y < 55 || x > game.map.width - 55 || y > game.map.height - 55) continue;
      if (game.map.npcs.some((npc) => Math.hypot(x - npc.x, y - npc.y) < 110)) continue;
      position = { x, y }; break;
    }
    if (!position) return;
    const id = difficulty.pool[Math.floor(Math.random() * difficulty.pool.length)];
    const level = difficulty.levelMin + Math.floor(Math.random() * (difficulty.levelMax - difficulty.levelMin + 1));
    const base = window.SurvivorRPG.PokemonData[id];
    const data = game.spawnSystem.scaledWildData(base, level, 'SWARM');
    // Dense waves use lighter bodies, but keep native attack/defense and type interactions.
    data.hp = data.maxHp = Math.max(10, Math.round(data.maxHp * 0.65));
    data.aggroRadius = 10000;
    data.movementSpeed = 80 + level * 1.3;
    data.expReward = 12 + level * 2;
    const enemy = new window.SurvivorRPG.WildPokemon(data, position.x, position.y, 'survival');
    enemy.survival = true;
    game.enemies.push(enemy);
  }

  rewardFraction(pokemon, reward) {
    if (pokemon.level >= 50) return 0;
    return Math.min(0.8, reward / (120 + pokemon.level * 12));
  }

  gainExperience(pokemon, reward) {
    // Express run rewards as progress toward the existing threshold, keeping legacy saves intact.
    const fraction = this.rewardFraction(pokemon, reward);
    return fraction > 0 ? pokemon.gainExp(Math.ceil(pokemon.expToNext * fraction)) : [];
  }

  finish(game) {
    if (this.status !== 'active' || this.elapsed < this.duration || game.mode !== 'pokemon' || game.activePokemon?.dead) return;
    this.status = 'cleared';
    game.combatSystem.clear();
    game.enemies = [];
    game.levelUpQueue = [];
    game.currentLevelEvent = null;
    game.currentMoveLearn = null;
    game.ui.hideLevelChoices();
    game.menuOpen = false;
    game.ui.hideGameMenu();
    game.mode = 'survivalClear';
    game.assets.play('level', 0.45);
  }

  serialize() {
    return { elapsed: this.elapsed, kills: this.kills, captures: this.captures,
      healReadyAt: this.healReadyAt, status: this.status };
  }
};
