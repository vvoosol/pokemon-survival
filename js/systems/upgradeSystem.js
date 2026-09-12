window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.UpgradeSystem = class UpgradeSystem {
  constructor(statSystem) {
    this.statSystem = statSystem;
    this.config = window.SurvivorRPG.UpgradeData;
    this.forceRarityNext = null;
    this.forceRareNext = false;
    this.lastRolls = [];
    this.providers = {
      common: (player, used) => this.makeCommonChoice(used),
      rare: (player, used) => this.makeRareChoice(player, used),
      hero: (player, used) => this.makeHeroChoice(player, used),
      legendary: (player, used) => this.makeLegendaryChoice(player, used)
    };
  }

  createChoices(player) {
    const choices = [];
    const used = new Set();
    this.lastRolls = [];

    for (let index = 0; index < 3; index += 1) {
      const rolled = this.consumeForcedRarity() || this.rollRarity();
      const effective = this.effectiveRarity(rolled);
      const choice = this.makeChoiceForRarity(effective, player, used);
      if (!choice) break;
      choices.push(choice);
      used.add(choice.id);
      if (choice.groupId) used.add(choice.groupId);
      this.lastRolls.push(`${rolled} -> ${choice.rarity}`);
    }

    return choices;
  }

  consumeForcedRarity() {
    if (this.forceRareNext) {
      this.forceRareNext = false;
      return "rare";
    }
    const forced = this.forceRarityNext;
    this.forceRarityNext = null;
    return forced;
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
    const enabled = this.config.enabledRarities || this.config.stage2EnabledRarities || ["common"];
    return enabled.includes(rarity) ? rarity : "common";
  }

  makeChoiceForRarity(rarity, player, used) {
    const order = {
      legendary: ["legendary", "hero", "rare", "common"],
      hero: ["hero", "rare", "common"],
      rare: ["rare", "common"],
      common: ["common"]
    }[rarity] || ["common"];

    for (const candidateRarity of order) {
      const choice = this.providers[candidateRarity]?.(player, used);
      if (choice) return choice;
    }
    return null;
  }

  makeCommonChoice(used) {
    const pool = this.config.commonChoices.filter((choice) => !used.has(choice.id));
    if (!pool.length) return null;
    return { type: "statGrowth", ...pool[Math.floor(Math.random() * pool.length)] };
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

  makeHeroChoice(player, used) {
    const candidates = [];
    const adapter = window.SurvivorRPG.DataAdapter;
    const hiddenAbilities = adapter.getHiddenAbilities(player.speciesId)
      .filter((abilityId) => abilityId && abilityId !== player.abilityId)
      .filter((abilityId) => {
        const ability = adapter.getAbilityData(abilityId);
        return ["SUPPORTED", "ADAPTED"].includes(ability.status);
      });

    hiddenAbilities.forEach((abilityId) => {
      const ability = adapter.getAbilityData(abilityId);
      const id = `hero_hidden_${abilityId}`;
      if (used.has(id)) return;
      candidates.push({
        id,
        rarity: "hero",
        type: "hiddenAbility",
        abilityId,
        title: `Hidden Ability: ${ability.name}`,
        summary: "Ability replacement",
        description: `${player.name}'s ability changes permanently to ${ability.name}.`
      });
    });

    if (!player.hasTerastallized && !used.has("hero_tera")) {
      const typeId = this.randomTeraType(player);
      const typeName = adapter.getTypeData(typeId).name;
      candidates.push({
        id: `hero_tera_${typeId}`,
        groupId: "hero_tera",
        rarity: "hero",
        type: "teraType",
        teraType: typeId,
        title: `Tera Type: ${typeName}`,
        summary: "Active type becomes a single Tera type",
        description: `${player.name} keeps its base type, but battle typing becomes ${typeName}.`
      });
    }

    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  makeLegendaryChoice(player, used) {
    const adapter = window.SurvivorRPG.DataAdapter;
    const pool = adapter.getCompatibleTMMoves(player.speciesId)
      .filter((moveId) => !player.knowsMove?.(moveId))
      .filter((moveId) => {
        const move = adapter.getMoveData(moveId);
        return move && move.category !== "status" && move.power > 0;
      })
      .filter((moveId) => !used.has(`legendary_tm_${moveId}`));
    if (!pool.length) return null;
    const moveId = pool[Math.floor(Math.random() * pool.length)];
    const move = adapter.getMoveData(moveId);
    return {
      id: `legendary_tm_${moveId}`,
      rarity: "legendary",
      type: "learnTmMove",
      moveId,
      title: `TM: ${move.name}`,
      summary: `${move.type.toUpperCase()} ${move.category} Power ${move.power}`,
      description: `${player.name} can learn one compatible damaging TM move at +0.`
    };
  }

  randomTeraType(player) {
    const types = window.SurvivorRPG.DataAdapter.getAllTypes();
    const baseTypes = player.baseTypes || player.types || [];
    const pool = types.filter((type) => type !== player.teraType);
    const weighted = pool.concat(baseTypes.filter((type) => pool.includes(type)));
    return weighted[Math.floor(Math.random() * weighted.length)] || "normal";
  }

  applyChoice(player, choice) {
    if (!choice) return false;
    if (choice.rarity === "common" && choice.statBonuses) {
      this.statSystem.applyGrowthBonuses(player, choice.statBonuses);
      return true;
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
      return true;
    }
    if (choice.type === "hiddenAbility") {
      player.abilityId = choice.abilityId;
      player.ability = choice.abilityId;
      this.statSystem.recalculateStats(player);
      return true;
    }
    if (choice.type === "teraType") {
      player.teraType = choice.teraType;
      player.hasTerastallized = true;
      return true;
    }
    return false;
  }

  genericMoveUpgrade(moveId, level) {
    const move = window.SurvivorRPG.MoveData[moveId];
    if (!move || level < 1 || level > 4) return null;
    const summaries = {
      1: "Range up",
      2: "Extra hit",
      3: "Cooldown down",
      4: "Multi direction"
    };
    return {
      level,
      title: `${move.name} ${level}`,
      summary: summaries[level],
      description: `${move.name} receives a level ${level} universal combat upgrade.`
    };
  }

  runDistributionTest(iterations = 10000) {
    const results = { common: 0, rare: 0, hero: 0, legendary: 0 };
    for (let i = 0; i < iterations; i += 1) {
      const rolled = this.rollRarity();
      results[rolled] += 1;
    }
    return results;
  }
};
