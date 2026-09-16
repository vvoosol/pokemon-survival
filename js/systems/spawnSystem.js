window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.SpawnSystem = class SpawnSystem {
  constructor(mapData) {
    this.maxTotalEnemies = 14;
    this.setMap(mapData);
  }

  setMap(mapData) {
    this.mapData = mapData;
    this.zones = (mapData.spawnZones || []).map((zone) => ({
      ...zone,
      timer: this.randomRange(2.5, 6)
    }));
  }

  update(dt, enemies) {
    if (!this.zones.length) return;
    for (const zone of this.zones) {
      zone.timer -= dt;
      const aliveInZone = enemies.filter((enemy) => !enemy.dead && enemy.spawnZoneId === zone.id).length;
      const aliveTotal = enemies.filter((enemy) => !enemy.dead).length;
      if (zone.timer <= 0) {
        if (aliveInZone < zone.maxAlive && aliveTotal < this.maxTotalEnemies) enemies.push(this.spawnOne(zone));
        zone.timer = this.randomRange(zone.respawnMin, zone.respawnMax);
      }
    }
  }

  spawnOne(zone) {
    const speciesId = this.pickWeighted(zone.spawnTable);
    const base = window.SurvivorRPG.PokemonData[speciesId];
    const level = Math.round(this.randomRange(zone.levelMin || base.level, zone.levelMax || base.level));
    const data = this.scaledWildData(base, level, zone.spawnStyle);
    const margin = 44;
    const x = this.randomRange(zone.x + margin, zone.x + zone.width - margin);
    const y = this.randomRange(zone.y + margin, zone.y + zone.height - margin);
    return new window.SurvivorRPG.WildPokemon(data, x, y, zone.id);
  }

  scaledWildData(base, level, spawnStyle = "NORMAL") {
    const stats = this.calculateStats(base, level);
    const style = {
      NORMAL: { hp: 1, attack: 1, exp: 1 },
      SWARM: { hp: 0.88, attack: 0.9, exp: 0.9 },
      ELITE: { hp: 1.45, attack: 1.28, exp: 1.8 }
    }[spawnStyle] || { hp: 1, attack: 1, exp: 1 };
    return {
      ...base,
      level,
      hp: Math.max(1, Math.round(stats.maxHp * style.hp)),
      maxHp: Math.max(1, Math.round(stats.maxHp * style.hp)),
      attack: Math.max(1, Math.round(stats.attack * style.attack)),
      defense: stats.defense,
      specialAttack: Math.max(1, Math.round(stats.specialAttack * style.attack)),
      specialDefense: stats.specialDefense,
      speed: stats.speed,
      expReward: Math.max(5, Math.floor((base.baseExp || base.expReward || 40) * level / 7 * style.exp * (level <= 10 ? 1.5 : 1))),
      spawnStyle
    };
  }

  calculateStats(species, level) {
    const base = species.baseStats;
    return {
      maxHp: Math.floor((2 * base.hp * level) / 100) + level + 10,
      attack: Math.floor((2 * base.attack * level) / 100) + 5,
      defense: Math.floor((2 * base.defense * level) / 100) + 5,
      specialAttack: Math.floor((2 * base.specialAttack * level) / 100) + 5,
      specialDefense: Math.floor((2 * base.specialDefense * level) / 100) + 5,
      speed: Math.floor((2 * base.speed * level) / 100) + 5
    };
  }

  pickWeighted(table) {
    const total = table.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of table) {
      roll -= item.weight;
      if (roll <= 0) return item.speciesId || item.pokemon;
    }
    return table[0].speciesId || table[0].pokemon;
  }

  randomRange(min, max) {
    return min + Math.random() * (max - min);
  }
};
