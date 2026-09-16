const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
global.window = { SurvivorRPG: {} };
for (const file of ['data/moveData.js', 'data/pokemonData.js', 'data/growthData.js', 'data/mapData.js',
  'entities/entity.js', 'entities/playerPokemon.js', 'entities/wildPokemon.js', 'systems/spawnSystem.js'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'));
const R = window.SurvivorRPG;
test('all original growth tables are monotone and reach the native level-100 totals', () => {
  for (const [rate, values] of Object.entries(R.GrowthData.tables)) {
    assert.equal(values.length, 101, rate);
    for (let level = 1; level < 100; level++) assert.ok(R.GrowthData.next(rate, level) > 0);
  }
  assert.equal(R.GrowthData.total('parabolic', 5), 135);
  assert.equal(R.GrowthData.next('parabolic', 5), 44);
  assert.equal(R.GrowthData.total('medium', 100), 1000000);
});
test('level 5 early encounters now grant a level in one or two defeats', () => {
  const spawn = new R.SpawnSystem(R.Maps.hunting_01);
  const p = new R.PlayerPokemon(R.PokemonData.bulbasaur, 0, 0);
  const reward = spawn.scaledWildData(R.PokemonData.rattata, 5).expReward;
  assert.equal(reward, 54);
  assert.equal(p.gainExp(reward).length, 1);
  assert.equal(p.level, 6); assert.equal(p.exp, 10); assert.equal(p.expToNext, 57);
});
test('legacy migration keeps level and fraction, and native saves round-trip exactly', () => {
  const p = new R.PlayerPokemon({ ...R.PokemonData.bulbasaur, level: 20, exp: 500, expToNext: 1000 }, 0, 0);
  assert.equal(p.level, 20);
  assert.equal(p.exp, Math.floor(p.expToNext / 2));
  const loaded = new R.PlayerPokemon({ ...R.PokemonData.bulbasaur, level: p.level, exp: p.exp, expToNext: p.expToNext, growthVersion: 1 }, 0, 0);
  assert.equal(loaded.exp, p.exp); assert.equal(loaded.expToNext, p.expToNext);
});
test('multi-level rewards respect the level-100 cap and reject invalid rewards', () => {
  const p = new R.PlayerPokemon(R.PokemonData.bulbasaur, 0, 0);
  assert.deepEqual(p.gainExp(NaN), []); assert.deepEqual(p.gainExp(-30), []);
  assert.equal(p.gainExp(2000000).length, 95);
  assert.equal(p.level, 100); assert.equal(p.exp, 0);
  assert.deepEqual(p.gainExp(500), []);
});
test('normal, swarm and elite zones have slower bounded respawn windows', () => {
  const spawn = new R.SpawnSystem(R.Maps.hunting_01);
  assert.ok(spawn.zones.every((z) => z.timer >= 2.5 && z.timer <= 6));
  for (const z of spawn.zones) {
    const minimum = { NORMAL: 9, SWARM: 6, ELITE: 14 }[z.spawnStyle];
    assert.equal(z.respawnMin, minimum);
    assert.ok(z.respawnMax > z.respawnMin);
  }
});
test('capped zones do not accumulate an immediate replacement wave', () => {
  const spawn = new R.SpawnSystem(R.Maps.hunting_01);
  spawn.zones = [spawn.zones[0]];
  const z = spawn.zones[0]; z.timer = 0;
  const enemies = Array.from({length: z.maxAlive}, () => ({ dead: false, spawnZoneId: z.id }));
  spawn.update(1, enemies);
  assert.ok(z.timer >= z.respawnMin);
  enemies.length = 0; spawn.update(0.01, enemies);
  assert.equal(enemies.length, 0);
});
