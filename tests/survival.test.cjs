const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
global.window = { SurvivorRPG: {} };
for (const file of ['data/moveData.js', 'data/pokemonData.js', 'data/mapData.js',
  'entities/entity.js', 'entities/playerPokemon.js', 'entities/wildPokemon.js',
  'systems/spawnSystem.js', 'systems/survivalSystem.js'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'));
const R = window.SurvivorRPG;
function game() {
  return { mode: 'pokemon', menuOpen: false, map: R.Maps.survival, enemies: [],
    activePokemon: { ...R.Maps.survival.playerStart, dead: false },
    spawnSystem: new R.SpawnSystem(R.Maps.survival) };
}
test('arena starts at center with one healer and is selectable', () => {
  const map = R.Maps.survival;
  assert.equal(map.playerStart.x, map.width / 2);
  assert.equal(map.playerStart.y, map.height / 2);
  assert.equal(map.npcs.filter((npc) => npc.type === 'HEALER').length, 1);
  assert.ok(R.HuntingAreas.find((area) => area.mapId === 'survival'));
});
test('opening wave arrives from four different sides', () => {
  const run = new R.SurvivalSystem(), g = game();
  run.update(0.01, g);
  assert.equal(g.enemies.length, 4);
  assert.ok(g.enemies[0].y < g.activePokemon.y - 400);
  assert.ok(g.enemies[1].x > g.activePokemon.x + 700);
  assert.ok(g.enemies[2].y > g.activePokemon.y + 400);
  assert.ok(g.enemies[3].x < g.activePokemon.x - 700);
  assert.ok(g.enemies.every((e) => e.survival && e.aggroRadius >= 10000));
});
test('full fifteen-minute simulation stays within cap and reaches level 50 encounters', () => {
  const run = new R.SurvivalSystem(), g = game();
  for (let sec = 0; sec < 900; sec++) {
    run.update(1, g);
    assert.ok(g.enemies.length <= 44);
    if (sec % 20 === 0) g.enemies = [];
  }
  assert.equal(run.elapsed, 900);
  assert.equal(run.difficulty().levelMax, 50);
  assert.ok(g.enemies.every((e) => e.level <= 50 && e.hp > 0));
});
test('trainer, capture, choices, menu and defeat do not count as survival time', () => {
  const run = new R.SurvivalSystem(), g = game();
  for (const mode of ['trainer', 'transition', 'levelChoice', 'moveLearn', 'gameOver']) {
    g.mode = mode; run.update(20, g);
  }
  g.mode = 'pokemon'; g.menuOpen = true; run.update(20, g);
  assert.equal(run.elapsed, 0);
  assert.equal(g.enemies.length, 0);
});
test('edge spawning never overlaps player or leaves world bounds', () => {
  for (const [x, y] of [[30, 30], [2570, 30], [30, 1870], [2570, 1870]]) {
    const run = new R.SurvivalSystem(), g = game();
    g.activePokemon = { x, y };
    for (let i = 0; i < 32; i++) run.spawn(g, run.difficulty());
    assert.ok(g.enemies.length > 0);
    for (const e of g.enemies) {
      assert.ok(e.x >= 55 && e.x <= 2545 && e.y >= 55 && e.y <= 1845);
      assert.ok(Math.hypot(e.x - x, e.y - y) > 400);
    }
  }
});
test('three-second kill cadence grows Lv.5 to approximately Lv.50 in fifteen minutes', () => {
  const run = new R.SurvivalSystem();
  const pokemon = new R.PlayerPokemon({ ...R.PokemonData.bulbasaur, level: 5, exp: 0, expToNext: 30 }, 0, 0);
  const checkpoints = [];
  for (let sec = 3; sec <= 900; sec += 3) {
    run.elapsed = sec;
    const d = run.difficulty();
    run.gainExperience(pokemon, 12 + Math.round((d.levelMin + d.levelMax) / 2) * 2);
    if (sec % 180 === 0) checkpoints.push(pokemon.level);
  }
  console.log('Growth at 3/6/9/12/15 minutes:', checkpoints);
  assert.ok(pokemon.level >= 47 && pokemon.level <= 50);
  assert.ok(Number.isFinite(pokemon.expToNext));
  assert.ok(pokemon.exp >= 0 && pokemon.exp < pokemon.expToNext);
});
test('growth cap preserves higher-level party members and legacy experience thresholds', () => {
  const run = new R.SurvivalSystem();
  const p = new R.PlayerPokemon({ ...R.PokemonData.bulbasaur, level: 55, expToNext: 1234 }, 0, 0);
  assert.deepEqual(run.gainExperience(p, 1000), []);
  assert.equal(p.level, 55);
  assert.equal(p.expToNext, 1234);
});
test('save restores elapsed time, captures, kills and healing cooldown', () => {
  const run = new R.SurvivalSystem({ elapsed: 320, kills: 75, captures: 3, healReadyAt: 337 });
  const loaded = new R.SurvivalSystem(JSON.parse(JSON.stringify(run.serialize())));
  assert.deepEqual(loaded.serialize(), run.serialize());
});
test('victory happens once, not before the deadline or after defeat', () => {
  const run = new R.SurvivalSystem(), g = game();
  let clears = 0;
  Object.assign(g, { combatSystem: { clear: () => clears++ }, ui: { hideLevelChoices() {}, hideGameMenu() {} }, assets: { play() {} } });
  run.finish(g); assert.equal(g.mode, 'pokemon');
  run.elapsed = 900; g.mode = 'gameOver'; run.finish(g); assert.equal(clears, 0);
  g.mode = 'pokemon'; run.finish(g); run.finish(g);
  assert.equal(g.mode, 'survivalClear'); assert.equal(clears, 1);
  assert.equal(run.status, 'cleared'); assert.equal(g.enemies.length, 0);
});
