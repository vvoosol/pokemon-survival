window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.PlayerPokemon = class PlayerPokemon extends window.SurvivorRPG.Entity {
  constructor(data, x, y) {
    super(data, x, y);
    this.uniqueId = data.uniqueId || `${data.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    this.speciesId = data.speciesId || data.id;
    this.nickname = data.nickname || "";
    this.nativeStats = {
      maxHp: data.nativeStats?.maxHp ?? data.maxHp,
      attack: data.nativeStats?.attack ?? data.attack,
      defense: data.nativeStats?.defense ?? data.defense,
      specialAttack: data.nativeStats?.specialAttack ?? data.specialAttack,
      specialDefense: data.nativeStats?.specialDefense ?? data.specialDefense,
      speed: data.nativeStats?.speed ?? data.speed
    };
    this.growthBonuses = {
      maxHpPct: data.growthBonuses?.maxHpPct || 0,
      attackPct: data.growthBonuses?.attackPct || 0,
      defensePct: data.growthBonuses?.defensePct || 0,
      specialAttackPct: data.growthBonuses?.specialAttackPct || 0,
      specialDefensePct: data.growthBonuses?.specialDefensePct || 0,
      speedPct: data.growthBonuses?.speedPct || 0
    };
    this.maxHp = this.nativeStats.maxHp;
    this.hp = data.currentHp ?? data.hp ?? this.maxHp;
    this.exp = data.exp || 0;
    this.expToNext = data.expToNext || 30;
    this.equippedMoves = this.normalizeMoveSlots(data.equippedMoves || [data.playerMove || "tackle"], data.moveUpgradeLevels);
    this.moveId = this.equippedMoves[0]?.moveId || "tackle";
    this.moveUpgradeLevels = this.moveUpgradeMap();
    this.attackCooldown = this.equippedMoves[0]?.cooldownRemaining || 0;
    this.attackAnim = 0;
    this.lastMoveVector = { x: 0, y: 1 };
    this.inField = false;
    this.fainted = this.hp <= 0;
    this.participationData = data.participationData || {};
    this.abilityId = data.abilityId || data.ability || data.abilities?.[0] || null;
    this.ability = this.abilityId;
    this.baseTypes = data.baseTypes ? [...data.baseTypes] : [...(data.types || this.types || [])];
    this.teraType = data.teraType || null;
    this.hasTerastallized = data.hasTerastallized || !!this.teraType;
    this.evolutionData = data.evolutionData || null;
    this.spriteKey = data.id;
  }

  normalizeMoveSlots(moves, moveUpgradeLevels = {}) {
    return moves.slice(0, 4).map((move) => {
      const moveId = typeof move === "string" ? move : move.moveId;
      return {
        moveId,
        upgradeLevel: typeof move === "string" ? (moveUpgradeLevels?.[moveId] || 0) : (move.upgradeLevel || 0),
        cooldownRemaining: typeof move === "string" ? 0 : (move.cooldownRemaining || 0)
      };
    });
  }

  moveUpgradeMap() {
    return Object.fromEntries(this.equippedMoves.map((move) => [move.moveId, move.upgradeLevel || 0]));
  }

  syncMoveState() {
    this.moveUpgradeLevels = this.moveUpgradeMap();
    this.moveId = this.equippedMoves[0]?.moveId || this.moveId || "tackle";
    this.attackCooldown = this.equippedMoves[0]?.cooldownRemaining || 0;
  }

  knowsMove(moveId) {
    return this.equippedMoves.some((move) => move.moveId === moveId);
  }

  addMove(moveId) {
    if (this.knowsMove(moveId) || this.equippedMoves.length >= 4) return false;
    this.equippedMoves.push({ moveId, upgradeLevel: 0, cooldownRemaining: 0 });
    this.syncMoveState();
    return true;
  }

  replaceMove(index, moveId) {
    if (index < 0 || index >= this.equippedMoves.length || this.knowsMove(moveId)) return false;
    this.equippedMoves[index] = { moveId, upgradeLevel: 0, cooldownRemaining: 0 };
    this.syncMoveState();
    return true;
  }

  declineMove(moveId) {
    this.declinedMoves = this.declinedMoves || {};
    this.declinedMoves[moveId] = true;
  }

  gainExp(amount) {
    if (this.fainted) return [];
    this.exp += amount;
    const levelEvents = [];
    while (this.exp >= this.expToNext) {
      this.exp -= this.expToNext;
      const fromLevel = this.level;
      this.level += 1;
      this.expToNext = Math.floor(this.expToNext * 1.35 + 8);
      levelEvents.push({ fromLevel, toLevel: this.level });
    }
    return levelEvents;
  }

  takeDamage(amount, knockbackX = 0, knockbackY = 0) {
    super.takeDamage(amount, knockbackX, knockbackY);
    this.fainted = this.dead;
  }

  reviveAtCurrentHp() {
    this.dead = this.hp <= 0;
    this.fainted = this.dead;
  }

  update(dt, input, movementSystem, world) {
    const vector = input.movementVector();
    movementSystem.move(this, vector.x, vector.y, dt, world);
    if (Math.hypot(vector.x, vector.y) > 0.1) {
      this.lastMoveVector = { x: vector.x, y: vector.y };
    }
    this.equippedMoves.forEach((move) => {
      move.cooldownRemaining = Math.max(0, move.cooldownRemaining - dt);
    });
    this.syncMoveState();
    this.attackAnim = Math.max(0, this.attackAnim - dt);
    this.updateBase(dt);
  }
};
