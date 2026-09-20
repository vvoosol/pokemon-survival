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
      return start <= maxLevel && (species.name == null || /[가-힣]/.test(String(species.name))) &&
        (!species.generation || [2,3,4,5,6].includes(species.generation));
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
  constructor(game, trainer) { this.game = game; this.trainer = trainer; this.index = 0; this.finished = false; }
  async start() {
    const g = this.game;
    this.wildEnemies = g.enemies; this.zones = g.spawnSystem.zones;
    g.enemies = []; g.spawnSystem.zones = []; g.combatSystem.clear();
    this.isGym = /^LIDER[123](?:REVANCHA)?$/.test(this.trainer.type);
    if (this.isGym) {
      g.enterGymArena(this.trainer);
      await g.askStory(`체육관 배틀 규칙\n방향키로 이동하며 자동으로 공격합니다. Z로 회수·재출전할 수 있습니다.\n현재 동시 출전: ${g.story.activeCount}마리. 관장의 포켓몬은 포획할 수 없습니다.\n상대 ${this.trainer.party.length}마리를 모두 쓰러뜨리면 승리합니다.\n내 파티가 모두 쓰러지면 포켓몬센터에서 회복하고 모험을 이어갑니다.`, ['배틀 시작']);
    }
    return new Promise(resolve => {
      this.resolve = resolve; this.sendNext();
      g.storyBusy = false; g.menuOpen = false; g.ui.hideGameMenu();
      if (!g.activePokemon) g.startDeploy();
    });
  }
  sendNext() {
    const g = this.game, R = window.SurvivorRPG;
    const member = this.trainer.party[this.index++];
    if (!member) { this.finish(true); return; }
    const species = R.PokemonData[member.species.toLowerCase()];
    if (!species) throw Error(`Trainer species unavailable: ${member.species}`);
    const actor = g.activePokemon || g.trainer;
    const point = this.spawnPoint(actor);
    const data = {...g.spawnSystem.scaledWildData(species, member.level), radius: 10, scale: .7, aggroRadius: 1200};
    const enemy = new R.WildPokemon(data, point.x, point.y, 'story_trainer');
    enemy.trainerOwned = true; enemy.nativeTrainerMember = member;
    enemy.abilityId = member.Ability || species.abilities[Number(member.AbilityIndex || 0)];
    if (member.Moves) {
      const ids = member.Moves.split(',').map(id => g.storyData.moveIds[id]).filter(id => R.MoveData[id]?.power > 0);
      if (ids.length) enemy.equippedMoves = ids;
    }
    enemy.state = 'chase'; g.enemies = [enemy];
  }
  spawnPoint(actor) {
    const canStand = window.SurvivorRPG.MovementSystem.canStand;
    // A nearest free tile can be across a gym wall or pool. Keep the approach
    // clear as well, so the next trainer Pokemon can actually reach the party.
    for (const distance of [96, 72, 48, 32]) for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8, dx = Math.cos(angle), dy = Math.sin(angle);
      let clear = true;
      for (let step = 8; step <= distance; step += 8)
        if (!canStand(this.game.map, actor.x + dx * step, actor.y + dy * step, 10)) { clear = false; break; }
      if (clear) return {x: actor.x + dx * distance, y: actor.y + dy * distance};
    }
    if (canStand(this.game.map, actor.x, actor.y, 10)) return {x: actor.x, y: actor.y};
    throw Error('No reachable trainer battle spawn');
  }
  update() {
    const g = this.game;
    if (this.finished || ['levelChoice', 'moveLearn', 'transition'].includes(g.mode)) return;
    if (g.mode === 'gameOver') { this.finish(false); return; }
    if (!g.enemies.some(e => !e.dead)) this.sendNext();
  }
  finish(won) {
    if (this.finished) return;
    this.finished = true;
    const g = this.game;
    if (this.isGym) g.leaveGymArena(won);
    g.combatSystem.clear(); g.enemies = this.wildEnemies; g.spawnSystem.zones = this.zones;
    g.storyBusy = true; g.storyBattle = null;
    if (won) {
      const money = Number(g.storyData.trainerTypes[this.trainer.type]?.BaseMoney || 30) * Math.max(...this.trainer.party.map(p => p.level));
      g.money += money; g.runStats.earned += money;
      g.notifyProgress(`${this.trainer.name} · +${money}원`, 'reward');
    }
    this.resolve(won);
  }
};
