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
    const attackStat = move.category === "physical" ? attacker.attack : attacker.specialAttack;
    const defenseStat = move.category === "physical" ? defender.defense : defender.specialDefense;
    const base = (((2 * attacker.level / 5 + 2) * move.power * attackStat / Math.max(1, defenseStat)) / 50) + 2;
    const variance = 0.9 + Math.random() * 0.15;
    return Math.max(1, Math.floor(base * variance));
  }

  applyNativeStatGrowth(entity) {
    if (!entity.nativeStats) return;
    const beforeMaxHp = entity.maxHp;
    entity.nativeStats.maxHp += 5;
    entity.nativeStats.attack += 3;
    entity.nativeStats.defense += 2;
    entity.nativeStats.specialAttack += 3;
    entity.nativeStats.specialDefense += 2;
    entity.nativeStats.speed += 3;
    this.recalculateStats(entity);
    entity.hp = Math.min(entity.maxHp, entity.hp + Math.max(0, entity.maxHp - beforeMaxHp));
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
    entity.hp = Math.min(entity.hp, entity.maxHp);
  }
};
