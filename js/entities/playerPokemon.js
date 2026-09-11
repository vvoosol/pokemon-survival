window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.PlayerPokemon = class PlayerPokemon extends window.SurvivorRPG.Entity {
  constructor(data, x, y) {
    super(data, x, y);
    this.nativeStats = {
      maxHp: data.maxHp,
      attack: data.attack,
      defense: data.defense,
      specialAttack: data.specialAttack,
      specialDefense: data.specialDefense,
      speed: data.speed
    };
    this.growthBonuses = {
      maxHpPct: 0,
      attackPct: 0,
      defensePct: 0,
      specialAttackPct: 0,
      specialDefensePct: 0,
      speedPct: 0
    };
    this.exp = 0;
    this.expToNext = 30;
    this.moveId = "tackle";
    this.equippedMoves = ["tackle"];
    this.moveUpgradeLevels = { tackle: 0 };
    this.attackCooldown = 0;
    this.attackAnim = 0;
    this.lastMoveVector = { x: 0, y: 1 };
  }

  gainExp(amount, statSystem) {
    this.exp += amount;
    const levelEvents = [];
    while (this.exp >= this.expToNext) {
      this.exp -= this.expToNext;
      const fromLevel = this.level;
      this.level += 1;
      this.expToNext = Math.floor(this.expToNext * 1.35 + 8);
      statSystem.applyNativeStatGrowth(this);
      levelEvents.push({ fromLevel, toLevel: this.level });
    }
    return levelEvents;
  }

  update(dt, input, movementSystem, world) {
    const vector = input.movementVector();
    movementSystem.move(this, vector.x, vector.y, dt, world);
    if (Math.hypot(vector.x, vector.y) > 0.1) {
      this.lastMoveVector = { x: vector.x, y: vector.y };
    }
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.attackAnim = Math.max(0, this.attackAnim - dt);
    this.updateBase(dt);
  }
};
