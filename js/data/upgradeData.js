window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.UpgradeData = {
  rarityWeights: {
    common: 70,
    rare: 20,
    hero: 8,
    legendary: 2
  },
  stage2EnabledRarities: ["common", "rare"],
  commonChoices: [
    {
      id: "max_hp_common",
      rarity: "common",
      title: "튼튼한 체력",
      summary: "최대 HP +10%",
      description: "최대 HP가 늘어나고 현재 HP도 증가분만큼 회복됩니다.",
      statBonuses: { maxHpPct: 0.10 }
    },
    {
      id: "attack_common",
      rarity: "common",
      title: "강한 공격",
      summary: "Attack +8% / Sp. Atk +8%",
      description: "물리와 특수 공격력이 함께 올라갑니다.",
      statBonuses: { attackPct: 0.08, specialAttackPct: 0.08 }
    },
    {
      id: "defense_common",
      rarity: "common",
      title: "단단한 방어",
      summary: "Defense +8% / Sp. Def +8%",
      description: "받는 피해를 줄이는 방어 능력이 올라갑니다.",
      statBonuses: { defensePct: 0.08, specialDefensePct: 0.08 }
    },
    {
      id: "speed_common",
      rarity: "common",
      title: "빠른 움직임",
      summary: "Speed +6%",
      description: "Speed가 올라가 자동 공격 쿨다운이 더 짧아집니다.",
      statBonuses: { speedPct: 0.06 }
    }
  ],
  moveUpgrades: {
    tackle: [
      {
        level: 1,
        title: "몸통박치기 I",
        summary: "넓은 충격",
        description: "몸통박치기의 사거리와 폭이 넓어집니다."
      },
      {
        level: 2,
        title: "몸통박치기 II",
        summary: "충격파",
        description: "공격 직후 전방에 약한 추가 충격파가 발생합니다."
      },
      {
        level: 3,
        title: "몸통박치기 III",
        summary: "속공",
        description: "몸통박치기 자체의 기본 쿨다운이 20% 짧아집니다."
      },
      {
        level: 4,
        title: "몸통박치기 IV",
        summary: "삼중 충격",
        description: "전방과 좌우 방향까지 넓은 충격 범위가 생깁니다."
      }
    ]
  }
};
