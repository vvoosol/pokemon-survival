window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.PartyBattleSystem = class PartyBattleSystem {
  constructor() { this.entries = []; }

  clear(leader = null) {
    for (const entry of this.entries) if (entry.pokemon !== leader) entry.pokemon.inField = false;
    this.entries = [];
  }

  get members() { return this.entries.filter((entry) => entry.ready && !entry.pokemon.dead).map((entry) => entry.pokemon); }

  capacity(game) {
    if (game.battleFormation === 'triple' && game.items.tripleBattle) return 3;
    if (game.battleFormation === 'double' && game.items.doubleBattle) return 2;
    return 1;
  }

  sync(game) {
    const leader = game.activePokemon;
    if (!leader || leader.dead) { this.clear(); return; }
    const index = game.partyPokemon.indexOf(leader);
    const ordered = [...game.partyPokemon.slice(index + 1), ...game.partyPokemon.slice(0, index)];
    const desired = ordered.filter((p) => p && !p.dead && p.hp > 0).slice(0, this.capacity(game) - 1);
    for (const entry of this.entries) if (!desired.includes(entry.pokemon) && entry.pokemon !== leader) entry.pokemon.inField = false;
    this.entries = desired.map((pokemon, i) => {
      const previous = this.entries.find((entry) => entry.pokemon === pokemon);
      if (previous) return previous;
      pokemon.inField = false;
      pokemon.x = leader.x; pokemon.y = leader.y;
      pokemon.vx = 0; pokemon.vy = 0;
      return { pokemon, delay: (i + 1) * 0.18, ready: false };
    });
  }

  update(dt, game) {
    this.sync(game);
    const leader = game.activePokemon;
    this.entries.forEach((entry, i) => {
      const pokemon = entry.pokemon;
      if (!entry.ready) {
        entry.delay -= dt;
        if (entry.delay > 0) return;
        entry.ready = true; pokemon.inField = true;
        pokemon.x = leader.x; pokemon.y = leader.y;
        game.resetMoveCooldowns(pokemon);
        game.spawnSwitchFlash(pokemon.x, pokemon.y);
      }
      const direction = game.combatSystem.attackDirection(leader);
      const side = i === 0 ? -1 : 1;
      let x = leader.x - direction.x * 58 - direction.y * side * 58;
      let y = leader.y - direction.y * 58 + direction.x * side * 58;
      const target = game.combatSystem.nearestEnemy(pokemon, game.enemies);
      if (target && Math.hypot(target.x - leader.x, target.y - leader.y) < 260) {
        const toward = game.combatSystem.normalized(pokemon.x - target.x, pokemon.y - target.y);
        const ranges = pokemon.equippedMoves.map((slot) => window.SurvivorRPG.MoveData[slot.moveId]?.range || 96);
        const distance = Math.max(42, Math.min(110, Math.min(...ranges) * 0.6));
        x = target.x + toward.x * distance; y = target.y + toward.y * distance;
      }
      const dx = x - pokemon.x, dy = y - pokemon.y;
      const length = Math.hypot(dx, dy);
      const step = Math.min(1, length / Math.max(1, pokemon.movementSpeed * dt));
      const vector = length > 6 ? { x: dx / length * step, y: dy / length * step } : { x: 0, y: 0 };
      const before={x:pokemon.x,y:pokemon.y};
      pokemon.update(dt, { movementVector: () => vector }, game.movementSystem, game.map);
      if(length>30 && Math.hypot(pokemon.x-before.x,pokemon.y-before.y)<1)game.movementSystem.moveToward(pokemon,x,y,dt,game.map);
    });
  }
};
