window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.StatSystem = class StatSystem {
  constructor() {
    this.cooldownSpeedScale = 0.002;
    this.maxCooldownReduction = 0.35;
  }

  calculateCooldown(baseCooldown, speed) {
    const cdr = Math.min(speed * this.cooldownSpeedScale, this.maxCooldownReduction);
    return baseCooldown * (1 - cdr);
  }

  calculateMoveCooldown(move, speed, upgradeLevel = 0) {
    const upgradeModifier = upgradeLevel >= 3 ? 0.8 : 1;
    return this.calculateCooldown(move.baseCooldown * upgradeModifier, speed);
  }

  calculateDamage(attacker, defender, move) {
    return this.calculateDamageBreakdown(attacker, defender, move).finalDamage;
  }

  calculateDamageBreakdown(attacker, defender, move) {
    const attackStat = move.category === "physical" ? attacker.attack : attacker.specialAttack;
    const defenseStat = move.category === "physical" ? defender.defense : defender.specialDefense;
    const base = (((2 * attacker.level / 5 + 2) * move.power * attackStat / Math.max(1, defenseStat)) / 50) + 2;
    const attackerTypes = this.activeTypes(attacker);
    const defenderTypes = this.activeTypes(defender);
    const stab = attackerTypes.includes(move.type) ? 1.5 : 1;
    const type = window.SurvivorRPG.DataAdapter?.typeMultiplier(move.type, defenderTypes) ?? 1;
    const beforeAbility = window.SurvivorRPG.AbilityRuntime?.beforeDamage(defender, move) || { immune: false, label: "-" };
    const ability = window.SurvivorRPG.AbilityRuntime?.damageModifier(attacker, defender, move, { base, stab, type }) || { multiplier: 1, label: "-" };
    const variance = 0.9 + Math.random() * 0.15;
    const raw = beforeAbility.immune ? 0 : base * stab * type * ability.multiplier * variance;
    return {
      move: move.name,
      baseDamage: base,
      attackStat,
      defenseStat,
      stab,
      type,
      ability: ability.multiplier,
      abilityLabel: beforeAbility.immune ? beforeAbility.label : ability.label,
      finalDamage: type === 0 || beforeAbility.immune ? 0 : Math.max(1, Math.floor(raw))
    };
  }

  activeTypes(entity) {
    return window.SurvivorRPG.DataAdapter?.getActiveTypes(entity) || [...(entity?.types || [])];
  }

  movementSpeedFromStat(speed) {
    return Math.max(120, Math.min(255, 150 + speed * 2.2));
  }

  calculateNativeStats(species, level) {
    const base = species.baseStats || {
      hp: species.maxHp,
      attack: species.attack,
      defense: species.defense,
      specialAttack: species.specialAttack,
      specialDefense: species.specialDefense,
      speed: species.speed
    };
    return {
      maxHp: Math.floor((2 * base.hp * level) / 100) + level + 10,
      attack: Math.floor((2 * base.attack * level) / 100) + 5,
      defense: Math.floor((2 * base.defense * level) / 100) + 5,
      specialAttack: Math.floor((2 * base.specialAttack * level) / 100) + 5,
      specialDefense: Math.floor((2 * base.specialDefense * level) / 100) + 5,
      speed: Math.floor((2 * base.speed * level) / 100) + 5
    };
  }

  applyNativeStatGrowth(entity) {
    if (!entity.nativeStats) return null;
    if (entity.speciesId && window.SurvivorRPG.PokemonData?.[entity.speciesId]) {
      return this.applyNativeStatsForLevel(entity);
    }
    const beforeMaxHp = entity.maxHp;
    entity.nativeStats.maxHp += 5;
    entity.nativeStats.attack += 3;
    entity.nativeStats.defense += 2;
    entity.nativeStats.specialAttack += 3;
    entity.nativeStats.specialDefense += 2;
    entity.nativeStats.speed += 3;
    this.recalculateStats(entity);
    entity.hp = Math.min(entity.maxHp, entity.hp + Math.max(0, entity.maxHp - beforeMaxHp));
    return { beforeMaxHp, afterMaxHp: entity.maxHp };
  }

  applyNativeStatsForLevel(entity) {
    const species = window.SurvivorRPG.PokemonData[entity.speciesId];
    const beforeMaxHp = entity.maxHp;
    entity.nativeStats = this.calculateNativeStats(species, entity.level);
    this.recalculateStats(entity);
    const gainedHp = Math.max(0, entity.maxHp - beforeMaxHp);
    if (!entity.dead && !entity.fainted) {
      entity.hp = Math.min(entity.maxHp, entity.hp + gainedHp);
    } else {
      entity.hp = 0;
    }
    return { beforeMaxHp, afterMaxHp: entity.maxHp };
  }

  applyGrowthBonuses(entity, bonuses) {
    if (!entity.growthBonuses) return;
    const beforeMaxHp = entity.maxHp;
    Object.entries(bonuses).forEach(([key, value]) => {
      entity.growthBonuses[key] = (entity.growthBonuses[key] || 0) + value;
    });
    this.recalculateStats(entity);
    entity.hp = Math.min(entity.maxHp, entity.hp + Math.max(0, entity.maxHp - beforeMaxHp));
  }

  recalculateStats(entity) {
    if (!entity.nativeStats || !entity.growthBonuses) return;
    const native = entity.nativeStats;
    const bonus = entity.growthBonuses;
    entity.maxHp = Math.round(native.maxHp * (1 + bonus.maxHpPct));
    entity.attack = Math.round(native.attack * (1 + bonus.attackPct));
    entity.defense = Math.round(native.defense * (1 + bonus.defensePct));
    entity.specialAttack = Math.round(native.specialAttack * (1 + bonus.specialAttackPct));
    entity.specialDefense = Math.round(native.specialDefense * (1 + bonus.specialDefensePct));
    entity.speed = Math.round(native.speed * (1 + bonus.speedPct));
    const abilityId = entity.abilityId || entity.ability;
    if (["CHLOROPHYLL", "SWIFTSWIM", "STEADFAST"].includes(abilityId)) entity.speed = Math.round(entity.speed * 1.1);
    if (abilityId === "SANDVEIL") entity.defense = Math.round(entity.defense * 1.08);
    if (abilityId === "MAGICGUARD") entity.specialDefense = Math.round(entity.specialDefense * 1.08);
    if (entity instanceof window.SurvivorRPG.PlayerPokemon) {
      entity.movementSpeed = this.movementSpeedFromStat(entity.speed);
    }
    entity.hp = Math.min(entity.hp, entity.maxHp);
  }
};
