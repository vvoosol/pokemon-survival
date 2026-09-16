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
    const adapter = window.SurvivorRPG.DataAdapter;
    const pool = adapter.getCompatibleTMMoves(player.speciesId)
      .filter(moveId => !player.knowsMove?.(moveId))
      .filter(moveId => { const move = adapter.getMoveData(moveId); return move && move.category !== 'status' && move.power > 0; })
      .filter(moveId => !used.has('hero_tm_' + moveId));
    if (!pool.length) return null;
    const moveId = pool[Math.floor(Math.random() * pool.length)];
    const move = adapter.getMoveData(moveId);
    return { id: 'hero_tm_' + moveId, rarity: 'hero', type: 'learnTmMove', moveId,
      title: '기술머신: ' + move.name,
      summary: `${adapter.getTypeData(move.type).name} · ${move.category === 'physical' ? '물리' : '특수'} · 위력 ${move.power}`,
      description: '호환 기술머신 기술을 배웁니다. 기술이 4개라면 하나를 교체합니다. 새 기술은 강화 +0입니다.' };
  }

  makeLegendaryChoice(player, used) {
    const R = window.SurvivorRPG, candidates = [];
    if (!player.hasTerastallized && !player.teraType && !used.has('legendary_tera')) {
      const typeId = this.randomTeraType(player), typeName = R.DataAdapter.getTypeData(typeId).name;
      candidates.push({ id: 'legendary_tera_' + typeId, groupId: 'legendary_tera', rarity: 'legendary',
        type: 'teraType', teraType: typeId, title: '테라스탈: ' + typeName,
        summary: typeName + ' 단일 타입 · 자속 1.8배',
        description: '전투 타입이 영구적으로 바뀝니다. 이 타입의 기술만 자속 1.8배를 받으며 기존 타입의 자속은 사라집니다.' });
    }
    if (!player.megaFormId && !used.has('legendary_evolution')) {
      const evolutions = R.DataAdapter.getEvolutionData(player.speciesId).filter(e => R.PokemonData[e.target]);
      if (evolutions.length) {
        const next = evolutions[Math.floor(Math.random() * evolutions.length)], target = R.PokemonData[next.target];
        candidates.push({ id: 'early_' + next.target, groupId: 'legendary_evolution', rarity: 'legendary',
          type: 'earlyEvolution', targetSpeciesId: next.target, title: '조기 진화: ' + target.name,
          summary: '진화 레벨을 기다리지 않고 한 단계 진화',
          description: '레벨·기술·강화는 유지하고 종족 능력치와 모습을 진화형으로 바꿉니다. 테라 타입도 유지됩니다.' });
      } else {
        const forms = R.EvolutionSystem.megaOptions(player.speciesId);
        const form = forms[Math.floor(Math.random() * forms.length)];
        if (form) candidates.push({ id: 'mega_' + player.speciesId + '_' + form.id, groupId: 'legendary_evolution',
          rarity: 'legendary', type: 'megaEvolution', megaFormId: form.id, title: '메가진화: ' + form.name,
          summary: form.adapted ? '능력치 강화형 · HP 외 종족값 20% 증가' : 'Anil 원본 메가폼으로 진화',
          description: form.adapted ? '원본 메가폼이 없는 종입니다. 기존 외형을 유지하고 능력치를 한 번 강화합니다.'
            : '원본 메가폼의 모습·타입·종족값을 적용합니다. 특성·기술·강화·레벨은 유지합니다.' });
      }
    }
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
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
    if (choice.type === "teraType") {
      if (player.hasTerastallized || !window.SurvivorRPG.DataAdapter.getAllTypes().includes(choice.teraType)) return false;
      player.teraType = choice.teraType;
      player.hasTerastallized = true;
      player.types = [choice.teraType];
      return true;
    }
    return false;
  }

  genericMoveUpgrade(moveId, level) {
    const move = window.SurvivorRPG.MoveData[moveId];
    if (!move || level < 1 || level > 4) return null;
    const summaries = {
      1: "사거리 +20% · 폭 +30%",
      2: "60% 위력의 추가 공격",
      3: "기본 쿨타임 -20%",
      4: "좌우 공격 줄 추가"
    };
    return {
      level,
      title: `${move.name} ${level}`,
      summary: summaries[level],
      description: `${move.name}의 ${level}단계 강화입니다. 이전 단계의 강화 효과도 유지됩니다.`
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
