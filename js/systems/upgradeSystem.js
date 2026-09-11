window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.UpgradeSystem = class UpgradeSystem {
  constructor(statSystem) {
    this.statSystem = statSystem;
    this.config = window.SurvivorRPG.UpgradeData;
    this.forceRareNext = false;
    this.lastRolls = [];
  }

  createChoices(player) {
    const choices = [];
    const used = new Set();
    this.lastRolls = [];

    if (this.forceRareNext) {
      const rareChoice = this.makeRareChoice(player, used);
      if (rareChoice) {
        choices.push(rareChoice);
        used.add(rareChoice.id);
        this.lastRolls.push("rare forced");
      }
      this.forceRareNext = false;
    }

    while (choices.length < 3) {
      const rolled = this.rollRarity();
      const effective = this.effectiveRarity(rolled);
      let choice = effective === "rare"
        ? this.makeRareChoice(player, used)
        : this.makeCommonChoice(used);

      if (!choice) {
        choice = this.makeCommonChoice(used);
      }
      if (!choice) break;

      choices.push(choice);
      used.add(choice.id);
      this.lastRolls.push(`${rolled} -> ${choice.rarity}`);
    }

    return choices;
  }

  rollRarity() {
    const weights = this.config.rarityWeights;
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    let roll = Math.random() * total;
    for (const rarity of ["common", "rare", "hero", "legendary"]) {
      roll -= weights[rarity];
      if (roll <= 0) return rarity;
    }
    return "common";
  }

  effectiveRarity(rarity) {
    return this.config.stage2EnabledRarities.includes(rarity) ? rarity : "common";
  }

  makeCommonChoice(used) {
    const pool = this.config.commonChoices.filter((choice) => !used.has(choice.id));
    if (!pool.length) return null;
    return { ...pool[Math.floor(Math.random() * pool.length)] };
  }

  makeRareChoice(player, used) {
    const candidates = [];
    player.equippedMoves.forEach((slot) => {
      const moveId = typeof slot === "string" ? slot : slot.moveId;
      const upgradeLevel = typeof slot === "string" ? (player.moveUpgradeLevels[moveId] || 0) : (slot.upgradeLevel || 0);
      const upgrades = this.config.moveUpgrades[moveId] || [];
      const next = upgrades.find((upgrade) => upgrade.level === upgradeLevel + 1) || this.genericMoveUpgrade(moveId, upgradeLevel + 1);
      if (!next || next.level > 4) return;
      const id = `${moveId}_${next.level}`;
      if (used.has(id)) return;
      candidates.push({
        id,
        rarity: "rare",
        type: "moveUpgrade",
        moveId,
        upgradeLevel: next.level,
        title: next.title,
        summary: next.summary,
        description: next.description
      });
    });
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  applyChoice(player, choice) {
    if (!choice) return;
    if (choice.rarity === "common" && choice.statBonuses) {
      this.statSystem.applyGrowthBonuses(player, choice.statBonuses);
      return;
    }
    if (choice.type === "moveUpgrade") {
      const slot = player.equippedMoves.find((move) => (typeof move === "string" ? move : move.moveId) === choice.moveId);
      const current = slot ? (slot.upgradeLevel || 0) : (player.moveUpgradeLevels[choice.moveId] || 0);
      if (slot && typeof slot !== "string") {
        slot.upgradeLevel = Math.min(4, Math.max(current, choice.upgradeLevel));
        player.syncMoveState?.();
      } else {
        player.moveUpgradeLevels[choice.moveId] = Math.min(4, Math.max(current, choice.upgradeLevel));
      }
    }
  }

  genericMoveUpgrade(moveId, level) {
    const move = window.SurvivorRPG.MoveData[moveId];
    if (!move || level < 1 || level > 4) return null;
    const summaries = {
      1: "범위 증가",
      2: "추가 충격",
      3: "쿨다운 감소",
      4: "다중 판정"
    };
    return {
      level,
      title: `${move.name} ${level}`,
      summary: summaries[level],
      description: `${move.name}의 ${level}단계 공통 강화입니다.`
    };
  }

  runDistributionTest(iterations = 10000) {
    const results = { common: 0, rare: 0, hero: 0, legendary: 0, effectiveCommon: 0, effectiveRare: 0 };
    for (let i = 0; i < iterations; i += 1) {
      const rolled = this.rollRarity();
      const effective = this.effectiveRarity(rolled);
      results[rolled] += 1;
      if (effective === "rare") results.effectiveRare += 1;
      else results.effectiveCommon += 1;
    }
    return results;
  }
};
