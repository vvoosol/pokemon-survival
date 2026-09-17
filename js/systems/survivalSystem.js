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
    this.milestones=Array.isArray(saved.milestones)?saved.milestones:[];
    this.rewardedElites=Array.isArray(saved.rewardedElites)?saved.rewardedElites:[];
    // Field enemies are not serialized: unfinished milestone encounters must respawn on resume.
    if(saved.milestones)this.milestones=this.milestones.filter(id=>this.rewardedElites.includes(id));
    this.stats=saved.stats || {earned:0,caught:[],damage:{},rewards:[]};
  }

  phase() {
    return this.elapsed<180?'탐색과 준비':this.elapsed<360?'첫 정예 출현':this.elapsed<600?'혼합 공격':this.elapsed<840?'포위와 정비':'최종 웨이브';
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
    const extra = Object.values(window.SurvivorRPG.PokemonData).filter(species =>
      [2,3].includes(species.generation) && species.level <= Math.min(50,level + 2) && species.level >= Math.max(1,level - 15));
    return { levelMin: Math.max(3, level - 2), levelMax: Math.min(50, level + 2),
      pool: [...pools[Math.min(4, Math.floor(this.elapsed / 180))], ...extra.map(species => species.id)],
      cap: 16 + Math.floor(progress * 28), interval: 4 - progress * 1.8,
      batch: this.elapsed < 300 ? 1 : this.elapsed < 600 ? 2 : 3 };
  }

  update(dt, game) {
    if (this.status !== 'active' || game.mode !== 'pokemon' || game.menuOpen || game.activePokemon?.dead) return;
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    if (this.elapsed >= this.duration) return;
    for(const [time,id] of [[180,'first'],[360,'mixed'],[600,'siege'],[840,'final']]) {
      if(this.elapsed>=time&&!this.milestones.includes(id)) {
        if(game.enemies.filter(e=>!e.dead&&e.state!=='captured').length>=this.difficulty().cap)break;
        const enemy=this.spawn(game,this.difficulty(),id);
        if(enemy){this.milestones.push(id);game.message?.(id==='final'?'최종 정예 출현!':'정예 포켓몬이 나타났다!',2);}
      }
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const difficulty = this.difficulty();
    const count = Math.min(this.spawnIndex === 0 ? 4 : difficulty.batch,
      difficulty.cap - game.enemies.filter((e) => !e.dead && e.state !== 'captured').length);
    for (let i = 0; i < count; i++) this.spawn(game, difficulty);
    const rest=[180,360,600].some(time=>this.elapsed>=time+35 && this.elapsed<time+55);
    this.spawnTimer = difficulty.interval*(rest?3:1);
  }

  spawn(game, difficulty, eliteId=null) {
    const actor = game.activePokemon || game.trainer;
    const side = this.spawnIndex++ % 4;
    let position;
    // Start outside the visible playfield where possible, never on top of the player/NPC.
    for (let attempt = 0; attempt < 12; attempt++) {
      const edge = (side + attempt) % 4;
      const spread = (Math.random() - 0.5) * 0.85;
      // Zoom must not shorten the approach time of the four-sided opening wave.
      const halfWidth=Math.max(740,(game.camera?.width || 1280)/2+100);
      const halfHeight=Math.max(460,(game.camera?.height || 720)/2+100);
      const x = actor.x + (edge === 1 ? halfWidth : edge === 3 ? -halfWidth : spread * halfWidth*2);
      const y = actor.y + (edge === 0 ? -halfHeight : edge === 2 ? halfHeight : spread * halfHeight*2);
      if (x < 55 || y < 55 || x > game.map.width - 55 || y > game.map.height - 55) continue;
      if (game.map.npcs.some((npc) => Math.hypot(x - npc.x, y - npc.y) < 110)) continue;
      if(window.SurvivorRPG.MovementSystem && !window.SurvivorRPG.MovementSystem.canStand(game.map,x,y,30))continue;
      position = { x, y }; break;
    }
    if (!position) return;
    const id = difficulty.pool[Math.floor(Math.random() * difficulty.pool.length)];
    const base = window.SurvivorRPG.PokemonData[id];
    const minimum = Math.max(difficulty.levelMin, base.generation ? base.level : 1);
    const level = minimum + Math.floor(Math.random() * (difficulty.levelMax - minimum + 1));
    const data = game.spawnSystem.scaledWildData(base, level, 'SWARM');
    // Dense waves use lighter bodies, but keep native attack/defense and type interactions.
    data.hp = data.maxHp = Math.max(10, Math.round(data.maxHp * 0.65));
    data.aggroRadius = 10000;
    data.movementSpeed = 80 + level * 1.3;
    data.expReward = 12 + level * 2;
    const enemy = new window.SurvivorRPG.WildPokemon(data, position.x, position.y, 'survival');
    if(eliteId) {
      enemy.survivalElite=eliteId;
      enemy.hp=enemy.maxHp=Math.round(enemy.maxHp*(eliteId==='final'?5:3));
      enemy.attack=Math.round(enemy.attack*1.15);enemy.specialAttack=Math.round(enemy.specialAttack*1.15);
      enemy.scale*=1.15;enemy.name='정예 '+enemy.name;
    }
    enemy.survival = true;
    game.enemies.push(enemy);
    return enemy;
  }

  rewardFraction(pokemon, reward) {
    if (pokemon.level >= 50) return 0;
    return Math.min(0.8, reward / (120 + pokemon.level * 12));
  }

  gainExperience(pokemon, reward) {
    // Survival keeps its timed level-50 target while using each species' native bar size.
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
    if(game.journal) {
      game.journal.clears++;game.money+=150;this.stats.earned+=150;
      this.stats.rewards.push('15분 생존 보상 +150원');
      window.SurvivorRPG.SaveStore.writeJournal(game.journal);
      game.saveGame(true);
    }
  }

  serialize() {
    return { elapsed: this.elapsed, kills: this.kills, captures: this.captures,
      healReadyAt: this.healReadyAt, status: this.status,milestones:this.milestones,rewardedElites:this.rewardedElites,stats:this.stats };
  }
};
