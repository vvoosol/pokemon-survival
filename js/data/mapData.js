window.SurvivorRPG = window.SurvivorRPG || {};

(function defineMapData() {
  window.SurvivorRPG.NpcSprites = {
    PROFESSOR: { key: "npc-oak", src: "assets/npcs/oak.png" },
    HUNTING_GUIDE: { key: "npc-brock", src: "assets/npcs/brock.png" },
    RETURN_GUIDE: { key: "npc-brock", src: "assets/npcs/brock.png" },
    HEALER: { key: "npc-nurse", src: "assets/npcs/enfermera.png" },
    SHOP: { key: "npc-clerk", src: "assets/npcs/tendero.png" }
  };
  const tileSources = {
    grassA: { sx: 0, sy: 0, sw: 32, sh: 32 },
    grassB: { sx: 32, sy: 0, sw: 32, sh: 32 },
    path: { sx: 96, sy: 64, sw: 32, sh: 32 },
    tallGrass: { sx: 0, sy: 0, sw: 32, sh: 32 },
    darkGrass: { sx: 96, sy: 192, sw: 32, sh: 32 },
    tree: { sx: 128, sy: 0, sw: 32, sh: 32 },
    flower: { sx: 160, sy: 64, sw: 32, sh: 32 },
    rock: { sx: 96, sy: 96, sw: 32, sh: 32 },
    sign: { sx: 224, sy: 160, sw: 32, sh: 32 }
  };

  const commonMap = {
    tileSize: 32,
    tileset: "assets/tilesets/exterior1.png",
    tileSources
  };

  const maps = {
    survival: {
      ...commonMap, id: "survival", name: "15분 서바이벌", width: 2600, height: 1900,
      playerStart: { x: 1300, y: 950 }, levelRange: [3, 50],
      grassPatches: [], spawnZones: [],
      paths: [{ x: 1248, y: 256, width: 96, height: 768 }],
      npcs: [
        { id: "survival_healer", type: "HEALER", name: "야전 치료소", x: 1300, y: 300 },
        { id: "survival_return", type: "RETURN_GUIDE", name: "도전 중단 · 허브", x: 250, y: 950 }
      ],
      decorations: [
        { type: "sign", x: 1240, y: 320 }, { type: "flower", x: 1350, y: 320 },
        { type: "tree", x: 1140, y: 220 }, { type: "tree", x: 1190, y: 220 },
        { type: "tree", x: 1410, y: 220 }, { type: "rock", x: 2100, y: 1450 }
      ]
    },
    hub: {
      ...commonMap,
      id: "hub",
      name: "샌드박스 허브",
      width: 1600,
      height: 1100,
      playerStart: { x: 800, y: 620 },
      grassPatches: [],
      spawnZones: [],
      paths: [
        { x: 448, y: 704, width: 704, height: 96 },
        { x: 736, y: 384, width: 128, height: 416 },
        { x: 480, y: 480, width: 640, height: 96 }
      ],
      npcs: [
        { id: "oak", type: "PROFESSOR", name: "오박사", x: 800, y: 790 },
        { id: "guide", type: "HUNTING_GUIDE", name: "웅이 · 사냥터", x: 760, y: 440, dialogue: "어느 사냥터로 이동하시겠습니까?" },
        { id: "healer", type: "HEALER", name: "간호사 · 치료", x: 560, y: 520, dialogue: "포켓몬을 치료하시겠습니까?" },
        { id: "shop", type: "SHOP", name: "상점 점원", x: 1040, y: 520, dialogue: "필요한 도구가 있나요?" }
      ],
      decorations: [
        { type: "sign", x: 736, y: 500 }, { type: "flower", x: 688, y: 520 }, { type: "flower", x: 912, y: 520 },
        { type: "tree", x: 360, y: 300 }, { type: "tree", x: 410, y: 300 }, { type: "tree", x: 460, y: 300 },
        { type: "tree", x: 1120, y: 300 }, { type: "tree", x: 1170, y: 300 }, { type: "tree", x: 1220, y: 300 },
        { type: "rock", x: 500, y: 700 }, { type: "rock", x: 1080, y: 700 }
      ]
    },
    hunting_01: huntingMap("hunting_01", "Lv.1~10 초보 초원", [2, 10], [
      zone("h1_grass_a", 430, 300, 470, 260, [2, 5], "NORMAL", [["rattata", 44], ["pidgey", 30], ["caterpie", 32]]),
      zone("h1_forest_b", 1030, 300, 470, 280, [4, 8], "NORMAL", [["pidgey", 30], ["oddish", 24], ["pikachu", 8], ["caterpie", 22]]),
      zone("h1_water_c", 500, 880, 430, 290, [5, 9], "SWARM", [["poliwag", 36], ["oddish", 22], ["pidgey", 12]]),
      zone("h1_rare_d", 1150, 900, 420, 300, [7, 10], "ELITE", [["abra", 18], ["pikachu", 14], ["geodude", 12]])
    ]),
    hunting_02: huntingMap("hunting_02", "Lv.11~20 깊은 길", [11, 20], [
      zone("h2_grass_a", 420, 300, 480, 270, [11, 14], "NORMAL", [["vulpix", 26], ["machop", 22], ["geodude", 22], ["raticate", 16]]),
      zone("h2_forest_b", 1030, 300, 480, 280, [13, 17], "SWARM", [["oddish", 28], ["gloom", 12], ["pidgeotto", 20], ["butterfree", 12]]),
      zone("h2_rock_c", 490, 880, 460, 300, [15, 19], "NORMAL", [["geodude", 40], ["graveler", 12], ["machop", 24]]),
      zone("h2_rare_d", 1160, 900, 430, 310, [17, 20], "ELITE", [["kadabra", 12], ["pikachu", 18], ["poliwhirl", 18], ["vulpix", 18]])
    ]),
    hunting_04: huntingMap("hunting_04", "Lv.31~40 진화의 숲", [31, 40], [
      zone("h4_grass",430,300,470,280,[31,35],"NORMAL",[["venusaur",12],["pidgeot",12]]),
      zone("h4_water",1030,300,470,280,[34,38],"NORMAL",[["blastoise",12],["poliwrath",12]]),
      zone("h4_rock",490,880,460,300,[36,40],"ELITE",[["charizard",10],["golem",10]])
    ]),
    hunting_05: huntingMap("hunting_05", "Lv.41~50 최종 진화 지대", [41, 50], [
      zone("h5_grass",430,300,470,280,[41,45],"NORMAL",[["venusaur",12],["alakazam",12]]),
      zone("h5_water",1030,300,470,280,[44,48],"NORMAL",[["blastoise",12],["poliwrath",12]]),
      zone("h5_rock",490,880,460,300,[48,50],"ELITE",[["charizard",10],["machamp",10]])
    ]),
    hunting_03: huntingMap("hunting_03", "Lv.21~30 고급 사냥터", [21, 30], [
      zone("h3_grass_a", 420, 300, 480, 280, [21, 24], "NORMAL", [["ivysaur", 18], ["pidgeotto", 26], ["raticate", 24], ["gloom", 22]]),
      zone("h3_water_b", 1030, 300, 480, 280, [23, 27], "NORMAL", [["poliwhirl", 34], ["poliwrath", 8], ["gloom", 18]]),
      zone("h3_rock_c", 490, 880, 460, 310, [25, 29], "SWARM", [["graveler", 34], ["machoke", 18], ["geodude", 16]]),
      zone("h3_elite_d", 1160, 900, 430, 310, [27, 30], "ELITE", [["alakazam", 8], ["machamp", 8], ["golem", 8], ["ninetales", 12], ["raichu", 12]])
    ])
  };

  function huntingMap(id, name, levelRange, spawnZones) {
    return {
      ...commonMap,
      id,
      name,
      width: 2500,
      height: 1600,
      levelRange,
      playerStart: { x: 420, y: 520 },
      returnPoint: { x: 390, y: 615, width: 84, height: 84 },
      paths: [
        { x: 320, y: 576, width: 416, height: 96 },
        { x: 384, y: 576, width: 96, height: 320 }
      ],
      npcs: [{ id: `${id}_return`, type: "RETURN_GUIDE", name: "허브 귀환", x: 380, y: 610, dialogue: "마을로 돌아가시겠습니까?" }],
      grassPatches: spawnZones.map((item) => ({ x: item.x, y: item.y, width: item.width, height: item.height, style: item.spawnStyle })),
      spawnZones,
      decorations: [
        { type: "tree", x: 160, y: 210 }, { type: "tree", x: 210, y: 210 }, { type: "tree", x: 260, y: 210 },
        { type: "tree", x: 2040, y: 250 }, { type: "tree", x: 2090, y: 250 }, { type: "tree", x: 2140, y: 250 },
        { type: "rock", x: 780, y: 760 }, { type: "rock", x: 815, y: 792 }, { type: "rock", x: 1760, y: 760 },
        { type: "flower", x: 620, y: 710 }, { type: "flower", x: 660, y: 710 }, { type: "sign", x: 360, y: 620 }
      ]
    };
  }

  function zone(id, x, y, width, height, levelRange, spawnStyle, table) {
    return {
      id,
      areaId: id.split("_").slice(0, 2).join("_"),
      x,
      y,
      width,
      height,
      levelMin: levelRange[0],
      levelMax: levelRange[1],
      spawnStyle,
      maxAlive: spawnStyle === "ELITE" ? 2 : 4,
      respawnMin: spawnStyle === "SWARM" ? 6 : spawnStyle === "ELITE" ? 14 : 9,
      respawnMax: spawnStyle === "SWARM" ? 10 : spawnStyle === "ELITE" ? 22 : 15,
      spawnTable: table.map(([speciesId, weight]) => ({ speciesId, pokemon: speciesId, weight }))
    };
  }

  // Add the imported roster by encounter level without speeding up the spawn clocks.
  for (const species of Object.values(window.SurvivorRPG.PokemonData)) {
    if (![2,3].includes(species.generation)) continue;
    const tier = Math.max(1,Math.min(5,Math.ceil(species.level / 10)));
    const map = maps['hunting_0' + tier];
    const eligible = map.spawnZones.filter(zone => zone.levelMax >= species.level);
    const affinity = species.types.includes('water') ? 'water' : species.types.some(t => ['rock','ground','steel'].includes(t)) ? 'rock' : 'grass';
    const target = eligible.find(zone => zone.id.includes(affinity)) || eligible.at(-1);
    target.spawnTable.push({speciesId:species.id,pokemon:species.id,weight:species.evolutions.length ? 12 : 7,minLevel:species.level});
  }
  window.SurvivorRPG.Maps = maps;
  window.SurvivorRPG.HuntingAreas = [
    { id: "survival", name: "15분 서바이벌", recommendedLevelMin: 5, recommendedLevelMax: 50, mapId: "survival" },
    { id: "hunting_01", name: "초보 초원", recommendedLevelMin: 1, recommendedLevelMax: 10, mapId: "hunting_01" },
    { id: "hunting_02", name: "깊은 길", recommendedLevelMin: 11, recommendedLevelMax: 20, mapId: "hunting_02" },
    { id: "hunting_03", name: "고급 사냥터", recommendedLevelMin: 21, recommendedLevelMax: 30, mapId: "hunting_03" },
    { id: "hunting_04", name: "진화의 숲", recommendedLevelMin: 31, recommendedLevelMax: 40, mapId: "hunting_04" },
    { id: "hunting_05", name: "최종 진화 지대", recommendedLevelMin: 41, recommendedLevelMax: 50, mapId: "hunting_05" }
  ];
  window.SurvivorRPG.MapData = maps.hub;
})();
