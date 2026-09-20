const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
global.window = {SurvivorRPG: {}};
for (const file of ['story/storyState', 'story/eventInterpreter', 'systems/saveStore'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'));
const R = window.SurvivorRPG;
const command = (code, parameters = [], indent = 0) => ({code, parameters, indent});
const event = list => ({id: 8, pages: [{condition: {}, list}]});
const fresh = () => R.StoryState.create();
const clone = data => JSON.parse(JSON.stringify(data));

test('story flags select the highest valid native event page', () => {
  const state = fresh(), source = {id: 3, pages: [{condition: {}}, {condition: {switch1_valid: true, switch1_id: 184}},
    {condition: {variable_valid: true, variable_id: 55, variable_value: 2, self_switch_valid: true, self_switch_ch: 'A'}}]};
  assert.equal(R.StoryState.pageIndex(source, state, 42), 0);
  state.switches[184] = true; assert.equal(R.StoryState.pageIndex(source, state, 42), 1);
  state.variables[55] = 2; state.selfSwitches['42:3:A'] = true;
  assert.equal(R.StoryState.pageIndex(source, state, 42), 2);
  assert.equal(R.StoryState.pageIndex(source, state, 57), 1);
});

test('original-engine switch 127 helper pages never replace real cave entrance pages', () => {
  const state = fresh(), map = require('../assets/story/maps/107.json');
  state.switches[127] = true;
  for (const eventId of [3, 4]) {
    const entrance = map.events[eventId];
    assert.ok(entrance, `missing Route 3 cave entrance event ${eventId}`);
    assert.equal(R.StoryState.pageIndex(entrance, state, 107), 0);
    assert.ok(entrance.pages[0].list.some(c => c.code === 201 && Number(c.parameters?.[1]) === 11));
  }
});

test('gym unlocks require original badge, keep order, and cannot duplicate rewards', () => {
  const state = fresh();
  assert.throws(() => R.StoryState.unlockGym(state, 1), /badge/);
  for (const n of [1, 2, 3]) {
    state.badges[n - 1] = true;
    assert.equal(R.StoryState.unlockGym(state, n), true);
    assert.equal(R.StoryState.unlockGym(state, n), false);
    assert.equal(R.StoryState.maxActive(state), n === 1 ? 1 : n);
    R.StoryState.validate(state);
  }
  assert.equal(state.keyItems.EXPSHARE, 1); assert.equal(state.expShareEnabled, true);
  state.gymRewards = [2]; assert.throws(() => R.StoryState.validate(state));
});

test('mode stores preserve legacy battle keys and reject cross-mode imports', () => {
  const memory = new Map();
  global.localStorage = {getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k)};
  const story = R.SaveStore.forMode('story'), battle = R.SaveStore.forMode('battle');
  const data = {version: 4, gameMode: 'story', story: fresh(), ownedPokemon: [], partyIds: [], reserveIds: [], money: 3000, balls: {pokeBall: 0}};
  memory.set(battle.key, 'legacy battle checkpoint'); memory.set(battle.journalKey, '{"dex":{"bulbasaur":{"caught":true}}}');
  assert.equal(battle.key, 'scientistRpgSave');
  story.write(data); story.writeJournal({dex: {squirtle: {caught: true}}});
  const migrated = story.read().data;
  assert.equal(migrated.version, 5); assert.equal(migrated.gameMode, 'story'); assert.equal(migrated.money, data.money);
  assert.equal(migrated.playTime, 0); assert.deepEqual(migrated.partyIds, []); assert.deepEqual(migrated.reserveIds, []);
  assert.equal(migrated.story.mapId, data.story.mapId); assert.deepEqual(migrated.story.gymRewards, data.story.gymRewards);
  assert.ok(battle.readJournal().dex.bulbasaur); assert.equal(battle.readJournal().dex.squirtle, undefined);
  assert.throws(() => battle.write(data), /another mode/);
  assert.throws(() => story.write({...data, gameMode: 'battle'}), /another mode/);
  data.money = 3500; story.write(data); memory.set(story.key, '{broken');
  assert.equal(story.read().recovered, true); assert.equal(story.read().data.money, 3000);
  story.remove(); assert.equal(story.read(), null);
  assert.equal(memory.get(battle.key), 'legacy battle checkpoint'); assert.ok(memory.has(battle.journalKey));
});

test('interpreter preserves dialogue order, choices, nested branches and self switches', async () => {
  const state = fresh(), lines = [];
  const source = event([
    command(101, ['first']), command(401, ['second']), command(102, [['yes', 'no'], 2]),
    command(402, [0, 'yes']), command(121, [1, 1, 0], 1),
    command(402, [1, 'no']), command(121, [2, 2, 0], 1), command(404),
    command(111, [0, 2, 0]), command(122, [55, 55, 0, 0, 2], 1),
    command(111, [1, 55, 0, 2, 0], 1), command(123, ['A', 0], 2), command(412, [], 1),
    command(411), command(121, [3, 3, 0], 1), command(412), command(0)
  ]);
  await new R.StoryEventInterpreter(state, {dialogue: text => lines.push(text), choices: () => 1}).run(29, source, 0);
  assert.deepEqual(lines, ['first\nsecond']); assert.equal(state.switches[1], undefined);
  assert.equal(state.switches[2], true); assert.equal(state.switches[3], undefined);
  assert.equal(state.variables[55], 2); assert.equal(state.selfSwitches['29:8:A'], true);
  assert.equal(state.eventCheckpoint, null);
});

test('suppressed proxy transfers preserve the visible outdoor story position', async () => {
  const state = fresh();
  state.mapId = 2; state.x = 14; state.y = 16; state.direction = 2;
  const source = event([command(201, [0, 29, 16, 12, 8, 0]), command(121, [347, 347, 0]), command(0)]);
  await new R.StoryEventInterpreter(state, {transfer: () => ({suppressed: true})}).run(29, source, 0);
  assert.equal(state.mapId, 2); assert.equal(state.x, 14); assert.equal(state.y, 16); assert.equal(state.direction, 2);
  assert.equal(state.switches[347], true);
});

test('choice cancellation follows native redirect and separate cancel branch', async () => {
  for (const cancel of [2, 5]) {
    const state = fresh();
    const source = event([command(102, [['yes', 'no'], cancel]), command(402, [0]), command(121, [1, 1, 0], 1),
      command(402, [1]), command(121, [2, 2, 0], 1), command(403), command(121, [3, 3, 0], 1), command(404)]);
    await new R.StoryEventInterpreter(state, {choices: () => -1}).run(29, source, 0);
    assert.equal(state.switches[cancel === 2 ? 2 : 3], true);
    assert.equal(Object.keys(state.switches).length, 1);
  }
});

test('unsupported Ruby stops visibly before later flags and can resume a checkpoint', async () => {
  const state = fresh(), scripts = [];
  const source = event([command(122, [7, 7, 1, 0, 1]), command(355, ['pbNative(']), command(655, [':ITEM)']), command(121, [184, 184, 0])]);
  const interpreter = new R.StoryEventInterpreter(state);
  await assert.rejects(interpreter.run(42, source, 0), /map=42, event=8, page=0/);
  assert.equal(state.switches[184], undefined); assert.equal(state.variables[7], 1);
  const restored = clone(state); R.StoryState.validate(restored);
  await new R.StoryEventInterpreter(restored, {eventPage: () => source.pages[0], script: text => scripts.push(text)}).resume();
  assert.deepEqual(scripts, ['pbNative(\n:ITEM)']); assert.equal(restored.switches[184], true);
  assert.equal(restored.variables[7], 1, 'already-applied commands must not repeat');
});

test('common event checkpoints resume child then parent without replaying the call', async () => {
  const state = fresh(), common = {list: [command(122, [7, 7, 1, 0, 1]), command(101, ['child'])]};
  const source = event([command(117, [9]), command(122, [7, 7, 1, 0, 2])]);
  await assert.rejects(new R.StoryEventInterpreter(state, {commonEvent: () => common}).run(29, source, 0));
  assert.equal(state.variables[7], 1);
  const restored = clone(state); R.StoryState.validate(restored);
  await new R.StoryEventInterpreter(restored, {commonEvent: () => common, eventPage: () => source.pages[0], dialogue() {}}).resume();
  assert.equal(restored.variables[7], 3); assert.equal(restored.eventCheckpoint, null);
});

test('original Pallet Town NPC dialogue is retained byte-for-byte', async () => {
  const map = require('../assets/story/maps/2.json'), state = fresh(), lines = [];
  const npc = Object.values(map.events).find(e => e.pages[0].list[0]?.code === 101 && e.pages[0].list.every(c => [0, 101, 401].includes(c.code)));
  assert.ok(npc);
  await new R.StoryEventInterpreter(state, {dialogue: text => lines.push(text)}).run(2, npc, 0);
  assert.equal(lines[0], npc.pages[0].list[0].parameters[0]); assert.ok(lines.length);
});
