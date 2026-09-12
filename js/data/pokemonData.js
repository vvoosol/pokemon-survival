window.SurvivorRPG = window.SurvivorRPG || {};

(function definePokemonData() {
  const learnsetMoveMap = {
    TACKLE: "tackle",
    QUICKATTACK: "quickAttack",
    BITE: "bite",
    HYPERFANG: "hyperFang",
    GUST: "gust",
    WINGATTACK: "wingAttack",
    VINEWHIP: "vineWhip",
    RAZORLEAF: "razorLeaf",
    SEEDBOMB: "seedBomb",
    BUGBITE: "bugBite",
    ABSORB: "absorb",
    ACID: "acid",
    MEGADRAIN: "megaDrain",
    GIGADRAIN: "gigaDrain",
    THUNDERSHOCK: "thunderShock",
    ELECTROBALL: "electroBall",
    SPARK: "spark",
    THUNDERBOLT: "thunderbolt",
    EMBER: "ember",
    FLAMEBURST: "flameBurst",
    FLAMETHROWER: "flamethrower",
    WATERGUN: "waterGun",
    BUBBLE: "bubble",
    BUBBLEBEAM: "bubbleBeam",
    MUDSHOT: "mudShot",
    BODYSLAM: "bodySlam",
    LOWKICK: "lowKick",
    KARATECHOP: "karateChop",
    LOWSWEEP: "lowSweep",
    REVENGE: "revenge",
    ROCKTHROW: "rockThrow",
    MAGNITUDE: "magnitude",
    BULLDOZE: "bulldoze",
    CONFUSION: "confusion",
    PSYBEAM: "psybeam",
    PSYCHIC: "psychic"
  };

  const defaultSpecies = {
    frameSize: 64,
    scale: 1.05,
    radius: 22,
    movementSpeed: 112,
    aggroRadius: 220,
    attackRange: 52,
    attackCooldown: 1.7,
    behavior: "melee",
    catchRate: 190,
    growthRate: "medium",
    source: "Pokemon Anil V4.13/PBS/pokemon.txt"
  };

  const raw = {
    bulbasaur: s("BULBASAUR", "이상해씨", ["grass", "poison"], [45, 49, 49, 45, 65, 65], 5, "parabolic", 45, 64, "bulbasaur", 190, 28, 1.35, [1, "TACKLE", 6, "VINEWHIP", 12, "RAZORLEAF", 13, "ACID", 18, "SEEDBOMB"], [{ method: "level", level: 16, target: "ivysaur" }]),
    ivysaur: s("IVYSAUR", "이상해풀", ["grass", "poison"], [60, 62, 63, 60, 80, 80], 16, "parabolic", 45, 142, "ivysaur", 198, 30, 1.3, [1, "TACKLE", 1, "VINEWHIP", 12, "RAZORLEAF", 20, "SEEDBOMB", 23, "ACID", 25, "MEGADRAIN", 36, "GIGADRAIN"], [{ method: "level", level: 32, target: "venusaur" }]),
    venusaur: s("VENUSAUR", "이상해꽃", ["grass", "poison"], [80, 82, 83, 80, 100, 100], 32, "parabolic", 45, 263, "venusaur", 186, 34, 1.35, [1, "TACKLE", 1, "VINEWHIP", 12, "RAZORLEAF", 20, "SEEDBOMB", 36, "GIGADRAIN", 39, "ACID"]),

    rattata: s("RATTATA", "꼬렛", ["normal"], [30, 56, 35, 72, 25, 35], 3, "medium", 255, 51, "rattata", 132, 22, 1.05, [1, "TACKLE", 4, "QUICKATTACK", 10, "BITE", 16, "HYPERFANG"], [{ method: "level", level: 20, target: "raticate" }]),
    raticate: s("RATICATE", "레트라", ["normal"], [65, 100, 60, 110, 50, 70], 20, "medium", 127, 145, "raticate", 170, 26, 1.12, [1, "TACKLE", 4, "QUICKATTACK", 10, "BITE", 16, "HYPERFANG"]),

    pidgey: s("PIDGEY", "구구", ["normal", "flying"], [40, 50, 40, 56, 45, 35], 3, "parabolic", 255, 50, "pidgey", 136, 22, 1.05, [1, "TACKLE", 9, "GUST", 13, "QUICKATTACK", 33, "WINGATTACK"], [{ method: "level", level: 18, target: "pidgeotto" }]),
    pidgeotto: s("PIDGEOTTO", "피죤", ["normal", "flying"], [63, 83, 55, 81, 75, 50], 18, "parabolic", 120, 122, "pidgeotto", 158, 25, 1.1, [1, "TACKLE", 9, "GUST", 13, "QUICKATTACK", 37, "WINGATTACK"], [{ method: "level", level: 36, target: "pidgeot" }]),
    pidgeot: s("PIDGEOT", "피죤투", ["normal", "flying"], [83, 95, 75, 100, 105, 70], 36, "parabolic", 45, 240, "pidgeot", 178, 28, 1.16, [1, "TACKLE", 9, "GUST", 13, "QUICKATTACK", 38, "WINGATTACK"]),

    caterpie: s("CATERPIE", "캐터피", ["bug"], [45, 40, 35, 45, 20, 20], 3, "medium", 255, 39, "caterpie", 92, 21, 1.0, [1, "TACKLE"], [{ method: "level", level: 9, target: "metapod" }]),
    metapod: s("METAPOD", "단데기", ["bug"], [50, 60, 55, 30, 25, 25], 9, "medium", 120, 72, "metapod", 76, 22, 1.0, [9, "BUGBITE"], [{ method: "level", level: 16, target: "butterfree" }]),
    butterfree: s("BUTTERFREE", "버터플", ["bug", "flying"], [60, 45, 50, 90, 100, 100], 16, "medium", 45, 198, "butterfree", 142, 27, 1.12, [1, "GUST", 1, "TACKLE", 1, "BUGBITE", 8, "CONFUSION", 16, "PSYBEAM"]),

    pikachu: s("PIKACHU", "피카츄", ["electric"], [35, 55, 30, 90, 50, 40], 5, "medium", 190, 112, "pikachu", 168, 22, 1.08, [1, "THUNDERSHOCK", 1, "QUICKATTACK", 1, "TACKLE", 12, "ELECTROBALL", 20, "SPARK", 36, "THUNDERBOLT"], [{ method: "level", level: 26, target: "raichu" }]),
    raichu: s("RAICHU", "라이츄", ["electric"], [60, 90, 55, 110, 90, 80], 26, "medium", 75, 243, "raichu", 188, 26, 1.14, [1, "THUNDERSHOCK", 1, "QUICKATTACK", 1, "SPARK", 5, "THUNDERBOLT"]),

    oddish: s("ODDISH", "뚜벅쵸", ["grass", "poison"], [45, 50, 55, 30, 75, 65], 4, "parabolic", 255, 64, "oddish", 102, 21, 1.0, [1, "ABSORB", 4, "ACID", 12, "MEGADRAIN", 20, "GIGADRAIN"], [{ method: "level", level: 21, target: "gloom" }]),
    gloom: s("GLOOM", "냄새꼬", ["grass", "poison"], [60, 65, 70, 40, 85, 75], 21, "parabolic", 120, 138, "gloom", 96, 24, 1.08, [1, "ABSORB", 1, "ACID", 12, "MEGADRAIN", 20, "GIGADRAIN"], [{ method: "level", level: 34, target: "vileplume" }]),
    vileplume: s("VILEPLUME", "라플레시아", ["grass", "poison"], [75, 80, 85, 50, 110, 95], 34, "parabolic", 45, 245, "vileplume", 92, 28, 1.15, [1, "ABSORB", 1, "ACID", 1, "MEGADRAIN", 1, "GIGADRAIN"]),

    vulpix: s("VULPIX", "식스테일", ["fire"], [38, 41, 40, 65, 60, 65], 5, "medium", 190, 60, "vulpix", 132, 22, 1.04, [1, "EMBER", 8, "QUICKATTACK", 23, "FLAMEBURST", 32, "FLAMETHROWER"], [{ method: "level", level: 32, target: "ninetales" }]),
    ninetales: s("NINETALES", "나인테일", ["fire"], [73, 76, 75, 100, 100, 100], 32, "medium", 75, 177, "ninetales", 164, 27, 1.14, [1, "EMBER", 1, "QUICKATTACK", 1, "FLAMETHROWER"]),

    poliwag: s("POLIWAG", "발챙이", ["water"], [55, 60, 40, 75, 55, 50], 4, "parabolic", 255, 60, "poliwag", 124, 21, 1.0, [1, "WATERGUN", 1, "TACKLE", 7, "BUBBLE", 12, "MUDSHOT", 18, "BUBBLEBEAM", 30, "BODYSLAM"], [{ method: "level", level: 25, target: "poliwhirl" }]),
    poliwhirl: s("POLIWHIRL", "슈륙챙이", ["water"], [65, 80, 65, 80, 65, 55], 25, "parabolic", 120, 135, "poliwhirl", 136, 24, 1.08, [1, "WATERGUN", 1, "MUDSHOT", 1, "BUBBLE", 18, "BUBBLEBEAM", 32, "BODYSLAM"], [{ method: "level", level: 36, target: "poliwrath" }]),
    poliwrath: s("POLIWRATH", "강챙이", ["water", "fighting"], [90, 95, 95, 70, 70, 90], 36, "parabolic", 45, 255, "poliwrath", 142, 28, 1.15, [1, "WATERGUN", 1, "BUBBLEBEAM", 1, "BODYSLAM", 36, "LOWSWEEP"]),

    machop: s("MACHOP", "알통몬", ["fighting"], [70, 80, 50, 35, 35, 35], 5, "parabolic", 180, 61, "machop", 108, 23, 1.04, [1, "LOWKICK", 8, "REVENGE", 10, "KARATECHOP", 12, "LOWSWEEP"], [{ method: "level", level: 28, target: "machoke" }]),
    machoke: s("MACHOKE", "근육몬", ["fighting"], [80, 100, 70, 45, 50, 60], 28, "parabolic", 90, 142, "machoke", 116, 26, 1.12, [1, "LOWKICK", 1, "REVENGE", 1, "KARATECHOP", 12, "LOWSWEEP"], [{ method: "level", level: 42, target: "machamp" }]),
    machamp: s("MACHAMP", "괴력몬", ["fighting"], [90, 130, 80, 55, 65, 85], 42, "parabolic", 45, 253, "machamp", 126, 30, 1.2, [1, "LOWKICK", 1, "REVENGE", 1, "KARATECHOP", 12, "LOWSWEEP"]),

    geodude: s("GEODUDE", "꼬마돌", ["rock", "ground"], [50, 80, 100, 20, 30, 30], 5, "parabolic", 255, 60, "geodude", 82, 23, 1.05, [1, "TACKLE", 12, "BULLDOZE", 15, "MAGNITUDE", 16, "ROCKTHROW"], [{ method: "level", level: 25, target: "graveler" }]),
    graveler: s("GRAVELER", "데구리", ["rock", "ground"], [80, 95, 115, 35, 45, 45], 25, "parabolic", 120, 137, "graveler", 86, 27, 1.12, [1, "TACKLE", 12, "BULLDOZE", 15, "MAGNITUDE", 16, "ROCKTHROW"], [{ method: "level", level: 42, target: "golem" }]),
    golem: s("GOLEM", "딱구리", ["rock", "ground"], [110, 120, 130, 45, 55, 65], 42, "parabolic", 45, 248, "golem", 98, 31, 1.2, [1, "TACKLE", 12, "BULLDOZE", 15, "MAGNITUDE", 16, "ROCKTHROW"]),

    abra: s("ABRA", "캐이시", ["psychic"], [25, 20, 15, 90, 105, 55], 5, "parabolic", 200, 62, "abra", 150, 22, 1.05, [8, "CONFUSION", 12, "PSYBEAM"], [{ method: "level", level: 16, target: "kadabra" }]),
    kadabra: s("KADABRA", "윤겔라", ["psychic"], [40, 35, 30, 105, 120, 70], 16, "parabolic", 100, 140, "kadabra", 164, 25, 1.1, [1, "CONFUSION", 5, "PSYBEAM", 35, "PSYCHIC"], [{ method: "level", level: 42, target: "alakazam" }]),
    alakazam: s("ALAKAZAM", "후딘", ["psychic"], [55, 50, 45, 120, 135, 95], 42, "parabolic", 50, 250, "alakazam", 178, 27, 1.14, [1, "CONFUSION", 5, "PSYBEAM", 35, "PSYCHIC"])
  };

  Object.values(raw).forEach((species) => {
    const merged = { ...defaultSpecies, ...species };
    Object.assign(species, merged);
    const stats = calculateNativeStats(species, species.level);
    Object.assign(species, {
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      attack: stats.attack,
      defense: stats.defense,
      specialAttack: stats.specialAttack,
      specialDefense: stats.specialDefense,
      speed: stats.speed,
      playerMove: firstDamagingMove(species, species.level) || "tackle",
      wildMove: firstDamagingMove(species, species.level) || "wildBite"
    });
  });

  function s(sourceId, name, types, baseStatsArray, level, growthRate, catchRate, baseExp, spriteId, movementSpeed, radius, scale, sourceLearnset, evolutions = []) {
    const [hp, attack, defense, speed, specialAttack, specialDefense] = baseStatsArray;
    return {
      id: spriteId,
      speciesId: spriteId,
      sourceId,
      name,
      types,
      baseStats: { hp, attack, defense, specialAttack, specialDefense, speed },
      level,
      growthRate,
      catchRate,
      baseExp,
      expReward: Math.max(10, Math.round(baseExp / 4)),
      sprite: `assets/pokemon/${spriteId}.png`,
      movementSpeed,
      radius,
      scale,
      learnset: parseLearnset(sourceLearnset),
      evolutions
    };
  }

  function parseLearnset(entries) {
    const learnset = [];
    for (let i = 0; i < entries.length; i += 2) {
      const level = entries[i];
      const sourceMoveId = entries[i + 1];
      const moveId = learnsetMoveMap[sourceMoveId] || sourceMoveId;
      learnset.push({ level, sourceMoveId, moveId });
    }
    return learnset;
  }

  function firstDamagingMove(species, level) {
    const moves = species.learnset
      .filter((entry) => entry.level <= level && learnsetMoveMap[entry.sourceMoveId])
      .map((entry) => entry.moveId);
    return moves[moves.length - 1] || null;
  }

  function calculateNativeStats(species, level) {
    const base = species.baseStats;
    return {
      maxHp: Math.floor((2 * base.hp * level) / 100) + level + 10,
      attack: Math.floor((2 * base.attack * level) / 100) + 5,
      defense: Math.floor((2 * base.defense * level) / 100) + 5,
      specialAttack: Math.floor((2 * base.specialAttack * level) / 100) + 5,
      specialDefense: Math.floor((2 * base.specialDefense * level) / 100) + 5,
      speed: Math.floor((2 * base.speed * level) / 100) + 5
    };
  }

  window.SurvivorRPG.LearnsetMoveMap = learnsetMoveMap;
  window.SurvivorRPG.PokemonData = raw;
})();
