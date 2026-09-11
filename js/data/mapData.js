window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.MapData = {
  width: 2500,
  height: 1600,
  tileSize: 32,
  tileset: "assets/tilesets/exterior1.png",
  tileSources: {
    grassA: { sx: 0, sy: 0, sw: 32, sh: 32 },
    grassB: { sx: 32, sy: 0, sw: 32, sh: 32 },
    path: { sx: 96, sy: 64, sw: 32, sh: 32 },
    tallGrass: { sx: 0, sy: 0, sw: 32, sh: 32 },
    darkGrass: { sx: 96, sy: 192, sw: 32, sh: 32 },
    tree: { sx: 128, sy: 0, sw: 32, sh: 32 },
    flower: { sx: 160, sy: 64, sw: 32, sh: 32 },
    rock: { sx: 96, sy: 96, sw: 32, sh: 32 },
    sign: { sx: 224, sy: 160, sw: 32, sh: 32 }
  },
  playerStart: { x: 420, y: 520 },
  grassPatches: [
    { x: 520, y: 340, width: 540, height: 330 },
    { x: 1420, y: 300, width: 500, height: 280 },
    { x: 1150, y: 920, width: 580, height: 360 }
  ],
  spawnZones: [
    {
      id: "grass_01",
      x: 520,
      y: 340,
      width: 540,
      height: 330,
      spawnTable: [
        { pokemon: "rattata", weight: 60 },
        { pokemon: "pidgey", weight: 40 }
      ],
      maxAlive: 3,
      respawnMin: 5,
      respawnMax: 9
    },
    {
      id: "grass_02",
      x: 1420,
      y: 300,
      width: 500,
      height: 280,
      spawnTable: [
        { pokemon: "rattata", weight: 45 },
        { pokemon: "pidgey", weight: 55 }
      ],
      maxAlive: 2,
      respawnMin: 6,
      respawnMax: 10
    },
    {
      id: "grass_03",
      x: 1150,
      y: 920,
      width: 580,
      height: 360,
      spawnTable: [
        { pokemon: "rattata", weight: 70 },
        { pokemon: "pidgey", weight: 30 }
      ],
      maxAlive: 3,
      respawnMin: 5,
      respawnMax: 11
    }
  ],
  decorations: [
    { type: "tree", x: 160, y: 210 }, { type: "tree", x: 210, y: 210 },
    { type: "tree", x: 260, y: 210 }, { type: "tree", x: 2040, y: 250 },
    { type: "tree", x: 2090, y: 250 }, { type: "tree", x: 2140, y: 250 },
    { type: "rock", x: 780, y: 760 }, { type: "rock", x: 815, y: 792 },
    { type: "rock", x: 1760, y: 760 }, { type: "flower", x: 620, y: 710 },
    { type: "flower", x: 660, y: 710 }, { type: "sign", x: 360, y: 620 }
  ]
};
