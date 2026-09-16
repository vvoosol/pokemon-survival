window.SurvivorRPG = window.SurvivorRPG || {};

(function defineAnilAdapter() {
  const typeNames = {
    normal: "노말", fire: "불꽃", water: "물", electric: "전기", grass: "풀", ice: "얼음",
    fighting: "격투", poison: "독", ground: "땅", flying: "비행", psychic: "에스퍼",
    bug: "벌레", rock: "바위", ghost: "고스트", dragon: "드래곤", dark: "악", steel: "강철", fairy: "페어리"
  };
  const allTypes = Object.keys(typeNames);

  const defenseProfile = {
    normal: { weaknesses: ["fighting"], immunities: ["ghost"] },
    fire: { weaknesses: ["ground", "rock", "water"], resistances: ["bug", "steel", "fire", "grass", "ice", "fairy"] },
    water: { weaknesses: ["grass", "electric"], resistances: ["steel", "fire", "water", "ice"] },
    electric: { weaknesses: ["ground"], resistances: ["flying", "steel", "electric"] },
    grass: { weaknesses: ["flying", "poison", "bug", "fire", "ice"], resistances: ["ground", "water", "grass", "electric"] },
    ice: { weaknesses: ["fighting", "rock", "steel", "fire"], resistances: ["ice"] },
    fighting: { weaknesses: ["flying", "psychic", "fairy"], resistances: ["rock", "bug", "dark"] },
    poison: { weaknesses: ["ground", "psychic"], resistances: ["fighting", "poison", "bug", "grass", "fairy"] },
    ground: { weaknesses: ["water", "grass", "ice"], resistances: ["poison", "rock"], immunities: ["electric"] },
    flying: { weaknesses: ["rock", "electric", "ice"], resistances: ["fighting", "bug", "grass"], immunities: ["ground"] },
    psychic: { weaknesses: ["bug", "ghost", "dark"], resistances: ["fighting", "psychic"] },
    bug: { weaknesses: ["flying", "rock", "fire"], resistances: ["fighting", "ground", "grass"] },
    rock: { weaknesses: ["fighting", "ground", "steel", "water", "grass"], resistances: ["normal", "flying", "poison", "fire"] },
    ghost: { weaknesses: ["ghost", "dark"], resistances: ["poison", "bug"], immunities: ["normal", "fighting"] },
    dragon: { weaknesses: ["ice", "dragon", "fairy"], resistances: ["fire", "water", "grass", "electric"] },
    dark: { weaknesses: ["fighting", "bug", "fairy"], resistances: ["ghost", "dark"], immunities: ["psychic"] },
    steel: { weaknesses: ["fighting", "ground", "fire"], resistances: ["normal", "flying", "rock", "bug", "steel", "grass", "psychic", "ice", "dragon", "fairy"], immunities: ["poison"] },
    fairy: { weaknesses: ["poison", "steel"], resistances: ["fighting", "bug", "dark"], immunities: ["dragon"] }
  };

  const abilities = {
    OVERGROW: { id: "OVERGROW", name: "심록", status: "SUPPORTED", description: "HP가 1/3 이하일 때 풀 타입 기술 위력이 1.5배가 됩니다." },
    BLAZE: { id: "BLAZE", name: "맹화", status: "SUPPORTED", description: "HP가 1/3 이하일 때 불꽃 타입 기술 위력이 1.5배가 됩니다." },
    TORRENT: { id: "TORRENT", name: "급류", status: "SUPPORTED", description: "HP가 1/3 이하일 때 물 타입 기술 위력이 1.5배가 됩니다." },
    STATIC: { id: "STATIC", name: "정전기", status: "PENDING", description: "접촉 공격을 받은 상대를 마비시킬 수 있습니다." },
    RUNAWAY: { id: "RUNAWAY", name: "도주", status: "PENDING", description: "야생 포켓몬에게서 반드시 도망칠 수 있습니다." },
    GUTS: { id: "GUTS", name: "근성", status: "PENDING", description: "상태 이상일 때 공격이 강해집니다." },
    HUSTLE: { id: "HUSTLE", name: "의욕", status: "ADAPTED", description: "물리 기술 위력이 1.25배가 됩니다." },
    KEENEYE: { id: "KEENEYE", name: "날카로운눈", status: "PENDING", description: "명중률이 떨어지지 않습니다." },
    TANGLEDFEET: { id: "TANGLEDFEET", name: "갈지자걸음", status: "PENDING", description: "혼란 상태에서 회피율이 오릅니다." },
    BIGPECKS: { id: "BIGPECKS", name: "부풀린가슴", status: "PENDING", description: "방어가 떨어지지 않습니다." },
    SHIELDDUST: { id: "SHIELDDUST", name: "인분", status: "PENDING", description: "기술의 추가 효과를 받지 않습니다." },
    COMPOUNDEYES: { id: "COMPOUNDEYES", name: "복안", status: "PENDING", description: "명중률이 올라갑니다." },
    CHLOROPHYLL: { id: "CHLOROPHYLL", name: "엽록소", status: "ADAPTED", description: "햇살이 강할 때 스피드가 올라갑니다." },
    STENCH: { id: "STENCH", name: "악취", status: "PENDING", description: "상대를 풀죽게 만들 수 있습니다." },
    EFFECTSPORE: { id: "EFFECTSPORE", name: "포자", status: "PENDING", description: "접촉한 상대에게 상태 이상을 줄 수 있습니다." },
    FLASHFIRE: { id: "FLASHFIRE", name: "타오르는불꽃", status: "SUPPORTED", description: "불꽃 타입 공격을 무효화하고 이후 불꽃 기술 위력이 1.5배가 됩니다." },
    DROUGHT: { id: "DROUGHT", name: "가뭄", status: "PENDING", description: "등장 시 햇살을 강하게 만듭니다." },
    WATERABSORB: { id: "WATERABSORB", name: "저수", status: "SUPPORTED", description: "물 타입 공격을 무효화하고 최대 HP의 1/4만큼 회복합니다." },
    SWIFTSWIM: { id: "SWIFTSWIM", name: "쓱쓱", status: "ADAPTED", description: "비가 올 때 스피드가 올라갑니다." },
    NOGUARD: { id: "NOGUARD", name: "노가드", status: "PENDING", description: "서로의 공격이 반드시 명중합니다." },
    STEADFAST: { id: "STEADFAST", name: "불굴의마음", status: "ADAPTED", description: "풀죽을 때 스피드가 올라갑니다." },
    ROCKHEAD: { id: "ROCKHEAD", name: "돌머리", status: "PENDING", description: "반동 피해를 받지 않습니다." },
    STURDY: { id: "STURDY", name: "옹골참", status: "SUPPORTED", description: "HP가 가득 찬 상태라면 한 번에 쓰러지지 않습니다." },
    SANDVEIL: { id: "SANDVEIL", name: "모래숨기", status: "ADAPTED", description: "모래바람에서 회피율이 올라갑니다." },
    SYNCHRONIZE: { id: "SYNCHRONIZE", name: "싱크로", status: "PENDING", description: "받은 상태 이상을 상대에게도 옮길 수 있습니다." },
    INNERFOCUS: { id: "INNERFOCUS", name: "정신력", status: "PENDING", description: "풀죽지 않습니다." },
    MAGICGUARD: { id: "MAGICGUARD", name: "매직가드", status: "ADAPTED", description: "공격 외의 피해를 받지 않습니다." },
    LIGHTNINGROD: { id: "LIGHTNINGROD", name: "피뢰침", status: "SUPPORTED", description: "전기 공격을 무효화하고 특수공격이 올라갑니다." }
  };

  const speciesAbilities = {
    charmander: { abilities: ["BLAZE"], hiddenAbilities: ["SOLARPOWER"], dexNo: 4, pokedex: "꼬리 끝의 불꽃으로 몸의 상태를 알 수 있다." },
    charmeleon: { abilities: ["BLAZE"], hiddenAbilities: ["SOLARPOWER"], dexNo: 5, pokedex: "날카로운 발톱과 뜨거운 불꽃으로 싸운다." },
    charizard: { abilities: ["BLAZE"], hiddenAbilities: ["SOLARPOWER"], dexNo: 6, pokedex: "하늘을 날며 강력한 불꽃을 내뿜는다." },
    squirtle: { abilities: ["TORRENT"], hiddenAbilities: ["RAINDISH"], dexNo: 7, pokedex: "등껍질로 몸을 지키고 물을 뿜어 공격한다." },
    wartortle: { abilities: ["TORRENT"], hiddenAbilities: ["RAINDISH"], dexNo: 8, pokedex: "풍성한 꼬리와 귀를 움직이며 헤엄친다." },
    blastoise: { abilities: ["TORRENT"], hiddenAbilities: ["RAINDISH"], dexNo: 9, pokedex: "등의 포신에서 강력한 물줄기를 발사한다." },
    bulbasaur: { abilities: ["OVERGROW"], hiddenAbilities: ["CHLOROPHYLL"], dexNo: 1, pokedex: "태어났을 때부터 등에 이상한 씨앗이 심어져 있으며 몸과 함께 자란다." },
    ivysaur: { abilities: ["OVERGROW"], hiddenAbilities: ["CHLOROPHYLL"], dexNo: 2, pokedex: "등의 꽃봉오리가 커지면 두 발로 서기 힘들어진다." },
    venusaur: { abilities: ["OVERGROW"], hiddenAbilities: ["CHLOROPHYLL"], dexNo: 3, pokedex: "등의 꽃은 태양 에너지를 받아 큰 꽃잎을 펼친다." },
    rattata: { abilities: ["RUNAWAY", "GUTS"], hiddenAbilities: ["HUSTLE"], dexNo: 19, pokedex: "무엇이든 갉아먹으며 어디에나 둥지를 튼다." },
    raticate: { abilities: ["RUNAWAY", "GUTS"], hiddenAbilities: ["HUSTLE"], dexNo: 20, pokedex: "튼튼한 앞니는 계속 자라서 단단한 것도 갉아낸다." },
    pidgey: { abilities: ["KEENEYE", "TANGLEDFEET"], hiddenAbilities: ["BIGPECKS"], dexNo: 16, pokedex: "숲과 풀밭에 많이 사는 온순한 새 포켓몬이다." },
    pidgeotto: { abilities: ["KEENEYE", "TANGLEDFEET"], hiddenAbilities: ["BIGPECKS"], dexNo: 17, pokedex: "넓은 영역을 자신의 구역으로 삼고 날카롭게 순찰한다." },
    pidgeot: { abilities: ["KEENEYE", "TANGLEDFEET"], hiddenAbilities: ["NOGUARD"], dexNo: 18, pokedex: "아름다운 날개로 하늘을 빠르게 날아간다." },
    caterpie: { abilities: ["SHIELDDUST"], hiddenAbilities: ["RUNAWAY"], dexNo: 10, pokedex: "초록색 피부와 더듬이가 특징인 벌레 포켓몬이다." },
    metapod: { abilities: ["SHEDSKIN"], hiddenAbilities: [], dexNo: 11, pokedex: "단단한 껍질 안에서 진화를 준비한다." },
    butterfree: { abilities: ["COMPOUNDEYES"], hiddenAbilities: ["TINTEDLENS"], dexNo: 12, pokedex: "날개에서 독가루를 흩뿌리며 꽃의 꿀을 찾아다닌다." },
    pikachu: { abilities: ["STATIC"], hiddenAbilities: ["LIGHTNINGROD"], dexNo: 25, pokedex: "볼에 전기를 모아 위협을 느끼면 방전한다." },
    raichu: { abilities: ["STATIC"], hiddenAbilities: ["LIGHTNINGROD"], dexNo: 26, pokedex: "긴 꼬리로 전기를 땅에 흘려보내 몸을 지킨다." },
    oddish: { abilities: ["CHLOROPHYLL"], hiddenAbilities: ["RUNAWAY"], dexNo: 43, pokedex: "낮에는 땅속에 숨어 있다가 밤에 돌아다닌다." },
    gloom: { abilities: ["CHLOROPHYLL"], hiddenAbilities: ["STENCH"], dexNo: 44, pokedex: "입에서 달콤하지만 강한 냄새가 나는 꿀을 흘린다." },
    vileplume: { abilities: ["CHLOROPHYLL"], hiddenAbilities: ["EFFECTSPORE"], dexNo: 45, pokedex: "큰 꽃잎을 흔들어 꽃가루를 퍼뜨린다." },
    vulpix: { abilities: ["FLASHFIRE"], hiddenAbilities: ["DROUGHT"], dexNo: 37, pokedex: "태어날 때 꼬리는 하나지만 자라며 아름답게 갈라진다." },
    ninetales: { abilities: ["FLASHFIRE"], hiddenAbilities: ["DROUGHT"], dexNo: 38, pokedex: "아홉 개의 꼬리에는 신비한 힘이 깃들어 있다." },
    poliwag: { abilities: ["WATERABSORB"], hiddenAbilities: ["SWIFTSWIM"], dexNo: 60, pokedex: "소용돌이 무늬의 배가 비쳐 보이는 물 포켓몬이다." },
    poliwhirl: { abilities: ["WATERABSORB"], hiddenAbilities: ["SWIFTSWIM"], dexNo: 61, pokedex: "소용돌이 무늬를 흔들어 상대를 어지럽게 한다." },
    poliwrath: { abilities: ["WATERABSORB"], hiddenAbilities: ["SWIFTSWIM"], dexNo: 62, pokedex: "단련된 근육으로 먼 거리를 헤엄친다." },
    machop: { abilities: ["GUTS", "NOGUARD"], hiddenAbilities: ["STEADFAST"], dexNo: 66, pokedex: "작지만 힘이 세고 여러 격투 기술을 익힌다." },
    machoke: { abilities: ["GUTS", "NOGUARD"], hiddenAbilities: ["STEADFAST"], dexNo: 67, pokedex: "강한 힘을 제어하기 위해 허리띠를 찬다." },
    machamp: { abilities: ["GUTS", "NOGUARD"], hiddenAbilities: ["STEADFAST"], dexNo: 68, pokedex: "네 팔로 강력한 펀치를 연속으로 날린다." },
    geodude: { abilities: ["ROCKHEAD", "STURDY"], hiddenAbilities: ["SANDVEIL"], dexNo: 74, pokedex: "산길에 돌처럼 숨어 있어 밟기 쉽다." },
    graveler: { abilities: ["ROCKHEAD", "STURDY"], hiddenAbilities: ["SANDVEIL"], dexNo: 75, pokedex: "비탈길을 굴러 내려가며 장애물을 부순다." },
    golem: { abilities: ["ROCKHEAD", "STURDY"], hiddenAbilities: ["SANDVEIL"], dexNo: 76, pokedex: "단단한 껍질을 가진 거대한 바위 포켓몬이다." },
    abra: { abilities: ["SYNCHRONIZE", "INNERFOCUS"], hiddenAbilities: ["MAGICGUARD"], dexNo: 63, pokedex: "잠을 자면서도 초능력으로 위험을 감지한다." },
    kadabra: { abilities: ["SYNCHRONIZE", "INNERFOCUS"], hiddenAbilities: ["MAGICGUARD"], dexNo: 64, pokedex: "강한 사이코 파워로 주변에 이상 현상을 일으킨다." },
    alakazam: { abilities: ["SYNCHRONIZE", "INNERFOCUS"], hiddenAbilities: ["MAGICGUARD"], dexNo: 65, pokedex: "높은 지능과 강력한 초능력을 지녔다." }
  };

  const tmLearnsets = {
    bulbasaur: ["energyBall", "gigaDrain", "sludgeBomb", "solarBeam"],
    pikachu: ["thunderbolt", "electroBall", "spark", "quickAttack"],
    geodude: ["rockThrow", "bulldoze", "magnitude", "bodySlam"],
    abra: ["confusion", "psybeam", "psychic"],
    machop: ["lowKick", "karateChop", "lowSweep", "revenge"],
    poliwag: ["waterGun", "bubble", "bubbleBeam", "bodySlam"]
  };

  const tmFallbackByFamily = {
    ivysaur: "bulbasaur",
    venusaur: "bulbasaur",
    raichu: "pikachu",
    graveler: "geodude",
    golem: "geodude",
    kadabra: "abra",
    alakazam: "abra",
    machoke: "machop",
    machamp: "machop",
    poliwhirl: "poliwag",
    poliwrath: "poliwag"
  };

  Object.entries(speciesAbilities).forEach(([speciesId, meta]) => {
    const species = window.SurvivorRPG.PokemonData[speciesId];
    if (!species) return;
    species.abilities = meta.abilities;
    species.hiddenAbilities = meta.hiddenAbilities;
    species.dexNo = meta.dexNo;
    species.pokedex = meta.pokedex;
    species.icon = `assets/pokemon-icons/${speciesId}.png`;
    species.tmLearnset = tmLearnsets[speciesId] || [];
  });

  function typeMultiplier(attackType, defenderTypes) {
    return (defenderTypes || []).reduce((total, defenseType) => {
      const profile = defenseProfile[defenseType];
      if (!profile) return total;
      if (profile.immunities?.includes(attackType)) return total * 0;
      if (profile.weaknesses?.includes(attackType)) return total * 2;
      if (profile.resistances?.includes(attackType)) return total * 0.5;
      return total;
    }, 1);
  }

  window.SurvivorRPG.DataAdapter = {
    sourcePaths: {
      species: "Pokemon Anil V4.13/PBS/pokemon.txt",
      moves: "Pokemon Anil V4.13/PBS/moves.txt",
      abilities: "Pokemon Anil V4.13/PBS/abilities.txt",
      types: "Pokemon Anil V4.13/PBS/types.txt",
      ui: "Pokemon Anil V4.13/Graphics/Pictures/DP Pause Menu"
    },
    getSpeciesData: (speciesId) => window.SurvivorRPG.PokemonData[speciesId] || null,
    getMoveData: (moveId) => window.SurvivorRPG.MoveData[moveId] || null,
    getAbilityData: (abilityId) => abilities[abilityId] || { id: abilityId, name: abilityId || "-", status: "PENDING", description: "아직 실시간 전투 효과가 연결되지 않았습니다." },
    getEvolutionData: (speciesId) => window.SurvivorRPG.PokemonData[speciesId]?.evolutions || [],
    getLearnset: (speciesId) => window.SurvivorRPG.PokemonData[speciesId]?.learnset || [],
    getTMLearnset: (speciesId) => {
      if (window.SurvivorRPG.TMCompatibility) return [...(window.SurvivorRPG.TMCompatibility[speciesId] || [])];
      const species = window.SurvivorRPG.PokemonData[speciesId];
      if (species?.tmLearnset?.length) return species.tmLearnset;
      const fallback = tmFallbackByFamily[speciesId];
      return fallback ? (window.SurvivorRPG.PokemonData[fallback]?.tmLearnset || []) : [];
    },
    getCompatibleTMMoves(speciesId) {
      return this.getTMLearnset(speciesId);
    },
    getHiddenAbilities: (speciesId) => window.SurvivorRPG.PokemonData[speciesId]?.hiddenAbilities || [],
    getAllTypes: () => [...allTypes],
    getActiveTypes: (entity) => entity?.teraType ? [entity.teraType] : [...(entity?.types || [])],
    getPokedexEntry: (speciesId) => {
      const species = window.SurvivorRPG.PokemonData[speciesId];
      return species ? { number: species.dexNo || 0, name: species.name, text: species.pokedex || "" } : null;
    },
    getPokemonSprite: (speciesId) => window.SurvivorRPG.PokemonData[speciesId]?.sprite || "",
    getPokemonIcon: (speciesId) => window.SurvivorRPG.PokemonData[speciesId]?.icon || window.SurvivorRPG.PokemonData[speciesId]?.sprite || "",
    getTypeData: (typeId) => ({ id: typeId, name: typeNames[typeId] || typeId, ...(defenseProfile[typeId] || {}) }),
    typeMultiplier,
    validate() {
      const warnings = [];
      Object.values(window.SurvivorRPG.PokemonData).forEach((species) => {
        species.learnset.forEach((entry) => {
          if (!window.SurvivorRPG.MoveData[entry.moveId]) warnings.push(`Missing move ${entry.moveId} in ${species.id}`);
        });
        species.evolutions?.forEach((evolution) => {
          if (!window.SurvivorRPG.PokemonData[evolution.target]) warnings.push(`Missing evolution target ${evolution.target} in ${species.id}`);
        });
      });
      window.SurvivorRPG.DataWarnings = warnings;
      return warnings;
    }
  };

  window.SurvivorRPG.AbilityRuntime = {
    damageModifier(attacker, defender, move, context) {
      let multiplier = 1;
      const abilityId = attacker.abilityId || attacker.ability;
      if (abilityId === "OVERGROW" && move.type === "grass" && attacker.hp <= attacker.maxHp / 3) multiplier *= 1.5;
      if (abilityId === "BLAZE" && move.type === "fire" && attacker.hp <= attacker.maxHp / 3) multiplier *= 1.5;
      if (abilityId === "TORRENT" && move.type === "water" && attacker.hp <= attacker.maxHp / 3) multiplier *= 1.5;
      if (abilityId === "HUSTLE" && move.category === "physical") multiplier *= 1.25;
      if (abilityId === "FLASHFIRE" && move.type === "fire" && attacker.flashFireCharged) multiplier *= 1.5;
      return { multiplier, label: multiplier !== 1 ? abilityId : "-" };
    },
    beforeDamage(defender, move) {
      const abilityId = defender.abilityId || defender.ability;
      if (abilityId === "WATERABSORB" && move.type === "water") {
        defender.hp = Math.min(defender.maxHp, defender.hp + Math.max(1, Math.floor(defender.maxHp / 4)));
        return { immune: true, label: "저수" };
      }
      if (abilityId === "FLASHFIRE" && move.type === "fire") {
        defender.flashFireCharged = true;
        return { immune: true, label: "타오르는불꽃" };
      }
      if (abilityId === "LIGHTNINGROD" && move.type === "electric") {
        defender.specialAttack = Math.round(defender.specialAttack * 1.08);
        return { immune: true, label: "피뢰침" };
      }
      return { immune: false, label: "-" };
    }
  };

  window.SurvivorRPG.DataAdapter.validate();
})();
