const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

global.window = {SurvivorRPG: {SpawnSystem: class {}, Game: class {}}};
for (const file of ['story/storyState', 'story/storyCombat', 'story/storyGame'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'));

const R = window.SurvivorRPG;

test('fresh stories randomize bounded wild level bands while preserving progression', () => {
  const low = R.StoryState.createWildLevelProfile(() => 0);
  const high = R.StoryState.createWildLevelProfile(() => 0.99);
  assert.deepEqual(low.opening, {min: 2, max: 5});
  assert.deepEqual(high.opening, {min: 3, max: 7});
  assert.deepEqual(low.postMisty, {min: 16, max: 25});
  assert.deepEqual(high.postMisty, {min: 18, max: 27});
  assert.notDeepEqual(low, high);
});

test('each fresh story creates a new level profile from the new run random seed', () => {
  const low = R.StoryState.create(undefined, () => 0).wildLevelProfile;
  const high = R.StoryState.create(undefined, () => 0.99).wildLevelProfile;
  assert.deepEqual(low.opening, {min: 2, max: 5});
  assert.deepEqual(high.opening, {min: 3, max: 7});
  assert.notDeepEqual(low, high);
});

test('story new game clears the run save, preserves research, and reloads story mode', () => {
  const removed = [], written = [], assigned = [];
  global.localStorage = {removeItem: key => removed.push(key)};
  global.location = {href: 'https://example.test/game?mode=battle#old', assign: href => assigned.push(href)};
  const game = Object.create(R.StoryGame.prototype);
  game.menuView = 'resetConfirm';
  game.store = {key: 'storySave', backup: 'storyBackup', writeJournal: journal => written.push(structuredClone(journal))};
  game.journal = {dex: {pikachu: {seen: true}}, awaitingStarter: true};
  assert.equal(game.resetAtProfessor(), true);
  assert.deepEqual(removed, ['storySave', 'storyBackup']);
  assert.equal(written[0].awaitingStarter, false);
  assert.equal(written[0].dex.pikachu.seen, true);
  assert.equal(new URL(assigned[0]).searchParams.get('mode'), 'story');
  assert.equal(new URL(assigned[0]).hash, '');
});

test('wild level tier follows the route and gym progression through Surge', () => {
  const state = R.StoryState.create();
  state.wildLevelProfile = {
    opening: {min: 2, max: 6}, preBrock: {min: 5, max: 11}, postBrock: {min: 10, max: 19},
    postMisty: {min: 17, max: 26}, postSurge: {min: 23, max: 30}
  };
  assert.deepEqual(R.StoryState.wildLevelRange(state, 3), {min: 2, max: 6});
  assert.deepEqual(R.StoryState.wildLevelRange(state, 8), {min: 5, max: 11});
  state.badges[0] = true; R.StoryState.unlockGym(state, 1);
  assert.deepEqual(R.StoryState.wildLevelRange(state, 10), {min: 10, max: 19});
  state.badges[1] = true; R.StoryState.unlockGym(state, 2);
  assert.deepEqual(R.StoryState.wildLevelRange(state, 18), {min: 17, max: 26});
  state.badges[2] = true; R.StoryState.unlockGym(state, 3);
  assert.deepEqual(R.StoryState.wildLevelRange(state, 20), {min: 23, max: 30});
});

test('old story saves receive one profile and keep it afterwards', () => {
  const state = R.StoryState.create();
  delete state.wildLevelProfile;
  R.StoryState.validate(state);
  const profile = R.StoryState.ensureWildLevelProfile(state);
  assert.equal(R.StoryState.ensureWildLevelProfile(state), profile);
  R.StoryState.validate(state);
});

test('story spawn tables use the progression band instead of native encounter levels', () => {
  R.PokemonData = {
    early: {id: 'early', sourceId: 'EARLY', level: 1, generation: 2},
    mid: {id: 'mid', sourceId: 'MID', level: 12, generation: 4},
    late: {id: 'late', sourceId: 'LATE', level: 28, generation: 5}
  };
  const renderer = {
    map: {id: 10, width: 1, height: 1},
    tileset: {terrain_tags: {values: {1: 2}}, passages: {values: {1: 0}}, priorities: {values: {1: 0}}},
    tileAt: () => 1
  };
  const zones = R.StorySpawnSystem.zones(renderer, {Land: [{minLevel: 2, maxLevel: 4}]}, false, {min: 10, max: 19});
  assert.equal(zones.length, 1);
  assert.deepEqual(zones[0].spawnTable.map(p => p.speciesId), ['early', 'mid']);
  assert.ok(zones[0].spawnTable.every(p => p.minLevel >= 10 && p.maxLevel === 19));
});
