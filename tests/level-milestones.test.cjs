const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
global.window = {SurvivorRPG: {}, setTimeout: fn => fn()};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8'));
const R = window.SurvivorRPG;

function fixture() {
  const seen = {choices: [], growth: [], evolution: [], sounds: []};
  const g = Object.assign(Object.create(R.Game.prototype), {
    mode: 'pokemon', levelUpQueue: [], progressNotices: [], progressNotice: null,
    player: {name: 'A', level: 20, equippedMoves: []},
    assets: {play: id => seen.sounds.push(id)},
    statSystem: {applyNativeStatGrowth: p => seen.growth.push(p.name)},
    upgradeSystem: {createChoices: () => [{id: 1}, {id: 2}, {id: 3}]},
    nextMoveForLevel: () => null,
    checkEvolution: e => seen.evolution.push(e.toLevel), saveGame() {},
    ui: {hideLevelChoices() {}, hideMoveLearning() {}, hideGameMenu() {},
      showLevelChoices: (e, choices) => seen.choices.push([e.pokemon.name, e.toLevel, choices.length])}
  });
  return {g, seen};
}

test('every level grows, but only 5-level milestones show three choices', () => {
  const {g, seen} = fixture();
  for (let level = 6; level <= 20; level++) {
    g.enqueueLevelUp({pokemon: g.player, fromLevel: level - 1, toLevel: level});
    if (g.mode === 'levelChoice') g.openNextLevelChoice();
  }
  assert.deepEqual(seen.choices, [['A', 10, 3], ['A', 15, 3], ['A', 20, 3]]);
  assert.equal(seen.growth.length, 15);
  assert.ok(seen.evolution.includes(16), 'ordinary evolution still checked on non-milestones');
  assert.equal(g.mode, 'pokemon');
  assert.equal(g.progressNotice.text, '레벨 업! A Lv.5 → Lv.6');
  assert.equal(g.progressNotices.length, 14);
});

test('multi-member multi-level events retain their own levels and milestone choices', () => {
  const {g, seen} = fixture();
  const b = {name: 'B', level: 12};
  for (const [p, from, to] of [[g.player, 9, 10], [b, 8, 9], [b, 9, 10], [b, 10, 11]])
    g.enqueueLevelUp({pokemon: p, fromLevel: from, toLevel: to});
  g.openNextLevelChoice();
  assert.equal(g.currentLevelEvent.pokemon, b);
  g.openNextLevelChoice();
  assert.equal(g.mode, 'pokemon');
  assert.deepEqual(seen.choices, [['A', 10, 3], ['B', 10, 3]]);
  const texts = [g.progressNotice.text, ...g.progressNotices.map(n => n.text)];
  assert.deepEqual(texts, ['레벨 업! A Lv.9 → Lv.10', '레벨 업! B Lv.8 → Lv.9',
    '레벨 업! B Lv.9 → Lv.10', '레벨 업! B Lv.10 → Lv.11']);
});

test('elite bonus choices are not suppressed or mistaken for a level-up', () => {
  const {g, seen} = fixture();
  g.enqueueLevelUp({pokemon: g.player, toLevel: 12, rewardOnly: true, forcedRarity: 'hero'});
  assert.equal(g.mode, 'levelChoice');
  assert.equal(g.upgradeSystem.forceRarityNext, 'hero');
  assert.equal(seen.choices.length, 1);
  assert.equal(seen.growth.length, 0);
  assert.equal(seen.evolution.length, 0);
  assert.equal(g.progressNotice, null);
});

test('learning notices queue after level notices, persist through menus, and end cleanly', () => {
  const {g, seen} = fixture();
  R.MoveData = {testMove: {name: 'Test move', category: 'physical', power: 40}};
  g.player.addMove = id => g.player.equippedMoves.push({moveId: id});
  g.enqueueLevelUp({pokemon: g.player, fromLevel: 5, toLevel: 6});
  assert.equal(g.queueMoveLearning(g.player, 'testMove', {}), false);
  assert.equal(g.progressNotices[0].kind, 'move');
  g.menuOpen = true; g.updateProgressNotices(10);
  assert.equal(g.progressNotice.kind, 'level');
  g.menuOpen = false; g.updateProgressNotices(3);
  assert.equal(g.progressNotice.text, 'A은(는) Test move을 배웠다!');
  g.updateProgressNotices(4);
  assert.equal(g.progressNotice, null);
  assert.deepEqual(seen.sounds, ['level']);
});
