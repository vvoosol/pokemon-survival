window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.SpawnSystem = class SpawnSystem {
  constructor(mapData) {
    this.zones = mapData.spawnZones.map((zone) => ({
      ...zone,
      timer: Math.random() * 1.5
    }));
    this.maxTotalEnemies = 10;
  }

  update(dt, enemies) {
    for (const zone of this.zones) {
      zone.timer -= dt;
      const aliveInZone = enemies.filter((enemy) => !enemy.dead && enemy.spawnZoneId === zone.id).length;
      const aliveTotal = enemies.filter((enemy) => !enemy.dead).length;
      if (zone.timer <= 0 && aliveInZone < zone.maxAlive && aliveTotal < this.maxTotalEnemies) {
        enemies.push(this.spawnOne(zone));
        zone.timer = this.randomRange(zone.respawnMin, zone.respawnMax);
      }
    }
  }

  spawnOne(zone) {
    const pokemonId = this.pickWeighted(zone.spawnTable);
    const data = window.SurvivorRPG.PokemonData[pokemonId];
    const margin = 44;
    const x = this.randomRange(zone.x + margin, zone.x + zone.width - margin);
    const y = this.randomRange(zone.y + margin, zone.y + zone.height - margin);
    return new window.SurvivorRPG.WildPokemon(data, x, y, zone.id);
  }

  pickWeighted(table) {
    const total = table.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of table) {
      roll -= item.weight;
      if (roll <= 0) return item.pokemon;
    }
    return table[0].pokemon;
  }

  randomRange(min, max) {
    return min + Math.random() * (max - min);
  }
};
