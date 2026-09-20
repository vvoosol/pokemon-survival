window.SurvivorRPG.StorySpawnSystem = class StorySpawnSystem extends window.SurvivorRPG.SpawnSystem {
  update(dt, enemies) {
    if (!this.zones.length) return;
    const alive = enemies.filter(enemy => !enemy.dead);
    for (const zone of this.zones) {
      const aliveInZone = alive.filter(enemy => enemy.spawnZoneId === zone.id).length;
      // Each grass zone fills quickly to two encounters, then slows down for the
      // third/fourth so adjacent zones can operate independently without flooding.
      const pace = aliveInZone < 2 ? 1 : aliveInZone === 2 ? 0.38 : 0.22;
      zone.timer -= dt * pace;
      if (zone.timer > 0) continue;
      if (aliveInZone < Math.min(4, zone.maxAlive)) {
        const enemy = this.spawnOne(zone);
        if (enemy) enemies.push(enemy);
      }
      zone.timer = this.randomRange(zone.respawnMin, zone.respawnMax);
    }
  }

  spawnOne(zone) {
    const R = window.SurvivorRPG, id = this.pickWeighted(zone.spawnTable);
    const entry = zone.spawnTable.find(p => p.speciesId === id);
    const level = entry.minLevel + Math.floor(Math.random() * (entry.maxLevel - entry.minLevel + 1));
    const species = this.resolveSpeciesForLevel(R.PokemonData[id], level);
    const data = {...this.scaledWildData(species, level), radius: 10, scale: .7, aggroRadius: 220};
    for (let attempt = 0; attempt < 40; attempt++) {
      const tile = zone.tiles[Math.floor(Math.random() * zone.tiles.length)];
      const x = tile[0] * 32 + 16, y = tile[1] * 32 + 16;
      if (R.MovementSystem.canStand(this.mapData, x, y, data.radius)) return new R.WildPokemon(data, x, y, zone.id);
    }
    return null;
  }
  static zones(renderer, encounters, classic, levelRange = null) {
    const table = encounters[(classic ? 'LandClassic' : 'Land')] || encounters.Land ||
      encounters[(classic ? 'CaveClassic' : 'Cave')] || encounters.Cave;
    if (!table?.length) return [];
    const sourceMin = Math.min(...table.map(p => Number(p.minLevel) || 1));
    const sourceMax = Math.max(...table.map(p => Number(p.maxLevel) || sourceMin));
    const minLevel = Number.isInteger(levelRange?.min) ? levelRange.min : sourceMin;
    const maxLevel = Number.isInteger(levelRange?.max) ? levelRange.max : sourceMax;
    const candidates = Object.values(window.SurvivorRPG.PokemonData).filter(species => {
      const start = Number(species.level) || 1;
      return start <= maxLevel;
    });
    const randomizedTable = candidates.map(species => ({
      species: species.sourceId || species.id.toUpperCase(), speciesId: species.id,
      minLevel: Math.max(minLevel, Math.min(maxLevel, Number(species.level) || minLevel)),
      maxLevel, weight: 1
    }));
    const cave = !encounters.Land && !encounters.LandClassic, cells = new Set();
    const {map, tileset} = renderer;
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      for (let z = 2; z >= 0; z--) {
        const id = renderer.tileAt(x, y, z); if (!id) continue;
        if ([2, 10, 11].includes(tileset.terrain_tags.values[id]) || cave && !(tileset.passages.values[id] & 15) && !tileset.priorities.values[id]) {
          cells.add(`${x},${y}`); break;
        }
        if (!tileset.priorities.values[id]) break;
      }
    }
    const zones = [];
    const addZone = tiles => zones.push({id: `story_${map.id}_${zones.length}`, tiles, maxAlive: 4,
      respawnMin: 10, respawnMax: 16, spawnStyle: 'NORMAL', spawnTable: randomizedTable});
    while (cells.size) {
      const start = cells.values().next().value, component = [start.split(',').map(Number)]; cells.delete(start);
      for (let i = 0; i < component.length; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = component[i][0] + dx, y = component[i][1] + dy, key = `${x},${y}`;
        if (cells.delete(key)) component.push([x, y]);
      }
      if (component.length <= 64) { addZone(component); continue; }

      // A very large connected grass field is divided into local 8x8 tile sectors.
      // This keeps each sector's four-Pokemon population independent and spatially local.
      const minX = Math.min(...component.map(tile => tile[0]));
      const minY = Math.min(...component.map(tile => tile[1]));
      const sectors = new Map();
      for (const tile of component) {
        const key = `${Math.floor((tile[0] - minX) / 8)},${Math.floor((tile[1] - minY) / 8)}`;
        if (!sectors.has(key)) sectors.set(key, []);
        sectors.get(key).push(tile);
      }
      for (const tiles of sectors.values()) addZone(tiles);
    }
    return zones;
  }
};

window.SurvivorRPG.StoryTrainerBattle = class StoryTrainerBattle {
  constructor(game, trainer, options = {}) {
    this.game = game; this.trainer = trainer; this.options = options;
    this.finished = false; this.engine = null; this.debugOnly = !!options.debugOnly;
  }
  async start() {
    const g = this.game, R = window.SurvivorRPG;
    this.previousStoryBusy = g.storyBusy;
    this.savedPlayerState = this.debugOnly ? {
      player: g.player, selectedPokemon: g.selectedPokemon, selectedPartyIndex: g.selectedPartyIndex
    } : null;
    this.wildEnemies = g.enemies; this.zones = g.spawnSystem.zones;
    g.enemies = []; g.spawnSystem.zones = []; g.combatSystem.clear();
    this.isGym = /^LIDER[123](?:REVANCHA)?$/.test(this.trainer.type);
    g.enterGymArena(this.trainer);
    const activeCount = Math.max(1, Math.min(6, Number(this.options.activeCount ?? g.story.activeCount) || 1));
    if (this.isGym) {
      await g.askStory(`체육관 배틀 규칙\n방향키로 리더를 이동하면 자동으로 공격합니다.\nX: 출전 중 리더 변경 / C: 대기 포켓몬 교체 / ESC: 일시정지\nZ 회수와 포획은 사용할 수 없습니다.\n현재 동시 출전: ${activeCount}마리.\n상대 ${this.trainer.party.length}마리를 모두 쓰러뜨리면 승리합니다.`, ['배틀 시작']);
    }
    const opponents = this.trainer.party.map((member, index) => this.createOpponent(member, index));
    this.engine = new R.TrainerBattleEngine(g, {
      playerParty: this.options.playerParty || g.partyPokemon,
      opponentParty: opponents,
      maxActiveCount: activeCount,
      opponentMaxActiveCount: activeCount,
      switchCooldown: 3,
      aiProfile: this.options.aiProfile || 'normal'
    });
    return new Promise(resolve => {
      this.resolve = resolve;
      g.storyBusy = false; g.menuOpen = false; g.ui.hideGameMenu();
      if (!this.engine.begin()) this.finish(false);
    });
  }
  createOpponent(member, index) {
    const g = this.game, R = window.SurvivorRPG;
    const species = R.PokemonData[member.species.toLowerCase()];
    if (!species) throw Error(`Trainer species unavailable: ${member.species}`);
    const data = {...g.spawnSystem.scaledWildData(species, member.level), radius: 10, scale: .7, aggroRadius: 1200};
    const enemy = new R.WildPokemon(data, 724, 300 + index * 36, 'story_trainer');
    enemy.trainerOwned = true; enemy.nativeTrainerMember = member;
    enemy.abilityId = member.Ability || species.abilities[Number(member.AbilityIndex || 0)];
    if (member.Moves) {
      const ids = member.Moves.split(',').map(id => g.storyData.moveIds[id]).filter(id => R.MoveData[id]?.power > 0);
      if (ids.length) enemy.equippedMoves = ids;
    }
    enemy.state = 'aggro'; enemy.inField = false;
    return enemy;
  }
  update(dt) {
    if (this.finished || !this.engine) return;
    const result = this.engine.update(dt);
    if (result === 'win') this.finish(true);
    else if (result === 'lose') this.finish(false);
  }
  finish(won) {
    if (this.finished) return;
    this.finished = true;
    const g = this.game;
    this.engine?.stop();
    g.leaveGymArena(this.debugOnly ? true : won);
    g.combatSystem.clear(); g.enemies = this.wildEnemies; g.spawnSystem.zones = this.zones;
    g.storyBusy = this.debugOnly ? this.previousStoryBusy : true; g.storyBattle = null;
    if (this.savedPlayerState) {
      g.player = this.savedPlayerState.player;
      g.selectedPokemon = this.savedPlayerState.selectedPokemon;
      g.selectedPartyIndex = this.savedPlayerState.selectedPartyIndex;
      g.activePokemon = null;
    }
    if (won && !this.debugOnly) {
      const money = Number(g.storyData.trainerTypes[this.trainer.type]?.BaseMoney || 30) * Math.max(...this.trainer.party.map(p => p.level));
      g.money += money; g.runStats.earned += money;
      g.notifyProgress(`${this.trainer.name} · +${money}원`, 'reward');
    }
    this.resolve?.(won);
  }
};
