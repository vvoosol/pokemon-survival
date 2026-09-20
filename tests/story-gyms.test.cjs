const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
global.window = {SurvivorRPG: {}};
for (const name of ['story/storyState', 'story/eventInterpreter', 'game', 'story/storyGame', 'story/storyTravel', 'systems/partyBattleSystem'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'));
const R = window.SurvivorRPG;
const gyms = [[42, 16], [57, 11], [56, 7]];
const data = require('../assets/story/battle-data.json');
const source = id => require(`../assets/story/maps/${id}.json`);
function game() {
  const g = Object.create(R.StoryGame.prototype);
  Object.assign(g, {story: R.StoryState.create(), storyData: data, items: {}, balls: {}, partyBattle: new R.PartyBattleSystem(),
    partyPokemon: [{uniqueId: 'starter', hp: 20, maxHp: 20, equippedMoves: []}], mode: 'trainer',
    storyPositions: {}, storySourcePositions: {}, storySourceMaps: new Map(), storySourceErased: new Set(),
    erasedStoryEvents: new Set(), proxyContext: null, storyBusy: false, storyError: null, storyBattle: null,
    trainer: {x: 48, y: 48, direction: 'up'},
    storyDialog: {text: {textContent: ''}}, ui: {showGameMenu() {}}, notifyProgress() {}, message() {}, askStory: async () => 0});
  g.interpreter = new R.StoryEventInterpreter(g.story, {...g.storyHost(), wait: async () => {}});
  g.battles = []; g.won = true;
  // Branch tests substitute only the battle outcome, not the source event or its rewards.
  R.StoryTrainerBattle = class {
    constructor(host, trainer) { this.g = host; this.trainer = trainer; }
    async start() { this.g.battles.push(this.trainer); this.g.storyBattle = null; return this.g.won; }
  };
  return g;
}
function sourceProxy(g, visibleMapId, sourceMapId) {
  g.story.mapId = visibleMapId;
  g.storyRenderer = {map: source(visibleMapId)};
  g.storySourceMaps.set(sourceMapId, source(sourceMapId));
  g.loadStorySourceMap = async id => {
    const map = source(id);
    g.storySourceMaps.set(id, map);
    return map;
  };
}
async function run(g, mapId, eventId) {
  g.story.mapId = mapId; g.storyRenderer = {map: source(mapId)};
  const event = g.storyRenderer.map.events[eventId];
  await g.runStoryEvent(event, R.StoryState.pageIndex(event, g.story, mapId));
  if (g.storyError) throw g.storyError;
}
for (const [classic, radical, version] of [[true, false, 0], [false, false, 1], [false, true, 2], [true, true, 2]]) {
  test(`native gyms preserve party branch ${classic}/${radical}, original rewards and unlock order`, async () => {
    const g = game(); g.story.switches[64] = classic; g.story.switches[666] = radical; g.story.switches[347] = true;
    for (const [index, [map, event]] of gyms.entries()) {
      assert.equal(g.setBattleFormation(index === 0 ? 'double' : 'triple'), false);
      await run(g, map, event);
      const order = index + 1;
      assert.equal(g.battles.length, order);
      const selected = g.battles[index];
      assert.equal(selected, data.trainers[`${selected.type}|${selected.name}|${version}`]);
      assert.equal(g.story.badges[index], true); assert.equal(g.story.switches[184 + index], true);
      assert.deepEqual(g.story.gymRewards, Array.from({length: order}, (_, i) => i + 1));
      assert.equal(g.story.keyItems[['TM39', 'TM51', 'TM73'][index]], 1);
      assert.equal(g.items.expShare, true); assert.equal(g.items.doubleBattle, order >= 2); assert.equal(g.items.tripleBattle, order >= 3);
      const inventory = {...g.story.keyItems};
      await run(g, map, event);
      assert.deepEqual(g.story.keyItems, inventory); assert.equal(g.battles.length, order);
      R.StoryState.validate(g.story);
    }
    for (const item of ['ROCKSMASH_key', 'ROCKSMASHITEM', 'LIGHTBALL', 'ACapsula', 'AECapsula', 'DCapsula', 'DECapsula', 'SCapsula', 'VCapsula'])
      assert.equal(g.story.keyItems[item], 1, item);
    for (const [map, ids] of [[42, [3, 4]], [57, [4, 5, 6]], [56, [4, 5, 6]]])
      for (const id of ids) assert.equal(g.story.selfSwitches[`${map}:${id}:A`], true);
    g.toggleExpShare(); assert.equal(g.story.expShareEnabled, false); assert.equal(g.items.expShareEnabled, false);
    g.setBattleFormation('triple'); assert.equal(g.story.activeCount, 3); assert.equal(g.partyBattle.capacity(g), 3);
  });
}
test('a defeat at any gym cannot award a badge, item, clear switch or unlock', async () => {
  for (let losing = 0; losing < gyms.length; losing++) {
    const g = game();
    for (let i = 0; i < losing; i++) await run(g, ...gyms[i]);
    const before = structuredClone(g.story.keyItems);
    g.won = false; await run(g, ...gyms[losing]);
    assert.equal(g.story.badges[losing], false); assert.equal(g.story.switches[184 + losing], undefined);
    assert.equal(g.story.gymRewards.length, losing); assert.deepEqual(g.story.keyItems, before);
  }
});
test('Light Ball follows native switch 347 and story shop cannot bypass gym unlocks', async () => {
  const g = game();
  for (const id of ['expShare', 'doubleBattle', 'tripleBattle']) assert.equal(g.buyItem(id), false);
  for (const gym of gyms) await run(g, ...gym);
  assert.equal(g.story.keyItems.LIGHTBALL, undefined);
});
test('native Joy common event heals and records the recovery point; decline preserves HP', async () => {
  for (const answer of [0, 1]) {
    const g = game(); g.storyRenderer = {map: source(42)}; g.story.mapId = 42;
    g.partyPokemon[0].hp = 1; g.partyPokemon[0].dead = true;
    g.interpreter.host.commonEvent = id => require('../assets/story/common-events.json')[id];
    g.interpreter.host.choices = () => answer;
    const event = {id: 16, pages: [{list: [{code: 117, parameters: [13], indent: 0}]}]};
    await g.interpreter.run(42, event, 0);
    assert.equal(g.partyPokemon[0].hp, answer ? 1 : 20);
    assert.equal(g.partyPokemon[0].dead, !!answer);
    assert.deepEqual(g.story.healingSpot, {mapId: 42, x: 1, y: 1, direction: 8});
  }
});

test('outdoor Joy proxy heals while keeping the player on the exterior map', async () => {
  const g = game();
  sourceProxy(g, 4, 31);
  g.partyPokemon[0].hp = 1;
  g.partyPokemon[0].dead = true;
  g.interpreter.host.commonEvent = id => require('../assets/story/common-events.json')[id];
  await g.runStoryProxy(31, 6, undefined, {choicePrompt: '포켓몬을 치료할까요?'});
  if (g.storyError) throw g.storyError;
  assert.equal(g.story.mapId, 4);
  assert.equal(g.partyPokemon[0].hp, 20);
  assert.equal(g.partyPokemon[0].dead, false);
  assert.deepEqual(g.story.healingSpot, {mapId: 4, x: 1, y: 1, direction: 8});
});

test('outdoor gym proxy executes the original leader event without entering the gym', async () => {
  const g = game();
  sourceProxy(g, 9, 42);
  g.story.switches[347] = true;
  await g.runStoryProxy(42, 16, undefined, {intro: '브록: 승부를 시작하자!'});
  if (g.storyError) throw g.storyError;
  assert.equal(g.story.mapId, 9);
  assert.equal(g.story.badges[0], true);
  assert.equal(g.story.switches[184], true);
  assert.equal(g.story.keyItems.TM39, 1);
  assert.deepEqual(g.story.gymRewards, [1]);
});

test('outdoor gym route stays exterior and preserves progression through the third badge', async () => {
  const g = game();
  g.story.switches[347] = true;
  const route = [[9, 42, 16], [15, 57, 11], [19, 56, 7]];
  for (const [index, [visibleMap, sourceMap, eventId]] of route.entries()) {
    sourceProxy(g, visibleMap, sourceMap);
    await g.runStoryProxy(sourceMap, eventId, undefined, {intro: '체육관 승부를 시작하자!'});
    if (g.storyError) throw g.storyError;
    assert.equal(g.story.mapId, visibleMap);
    assert.equal(g.story.badges[index], true);
    assert.deepEqual(g.story.gymRewards, Array.from({length: index + 1}, (_, i) => i + 1));
  }
  assert.equal(g.items.expShare, true);
  assert.equal(g.items.doubleBattle, true);
  assert.equal(g.items.tripleBattle, true);
});

test('fresh outdoor starter sets the native progression flags', async () => {
  const g = game();
  g.partyPokemon = [];
  g.story.switches = {};
  g.story.variables = {};
  g.addStoryPokemon = id => { g.partyPokemon.push({speciesId: id.toLowerCase()}); };
  g.askStory = async () => 0;
  await g.chooseOutdoorStarter();
  assert.equal(g.partyPokemon[0].speciesId, 'bulbasaur');
  assert.equal(g.story.switches[60], true);
  assert.equal(g.story.switches[347], true);
  assert.equal(g.story.variables[56], 0);
  assert.equal(g.story.variables[55], 4);
});

test('fresh story locks Pallet exits until a starter is received and gives a clear objective', async () => {
  const g = game();
  g.partyPokemon = [];
  g.story.mapId = 2;
  assert.equal(g.story.reachedViridian, false);
  assert.match(g.storyObjective(), /오박사/);
  for (const id of [1, 44, 45, 46]) assert.equal(g.isLockedPalletExit({id}), true);
  assert.equal(g.isLockedPalletExit({id: 5}), false);
  g.addStoryPokemon = id => { g.partyPokemon.push({speciesId: id.toLowerCase()}); };
  g.askStory = async () => 0;
  await g.chooseOutdoorStarter();
  assert.equal(g.isLockedPalletExit({id: 1}), false);
  assert.match(g.storyObjective(), /1번도로.*상록시티/);
});

test('first Viridian arrival becomes the healing checkpoint and shows the next route', async () => {
  const g = game();
  g.story.mapId = 3;
  g.story.reachedViridian = false;
  g.storyRenderer = {
    map: null,
    tileset: {passages: {values: [0]}, priorities: {values: [0]}},
    load: async () => ({id: 4, name: 'Ciudad Verde', width: 1, height: 1, data: {z: 1}, events: {}}),
    tileAt: () => 0
  };
  g.storyData = {encounters: {4: {}}};
  g.camera = {world: null, width: 640, height: 480, x: 0, y: 0, clamp() {}};
  g.combatSystem = {world: null, clear() {}};
  g.spawnSystem = {setMap() {}};
  g.partyBattle = {clear() {}};
  g.autoruns = new Set(); g.erasedStoryEvents = new Set();
  g.prepareStoryProxies = async () => {}; g.placeStoryNpcsAtDoors = () => {};
  const messages = []; g.message = text => messages.push(text);
  const originalSpawnSystem = R.StorySpawnSystem;
  R.StorySpawnSystem = {zones: () => []};
  try { await g.transferStory(4, 1, 1, 2); } finally { R.StorySpawnSystem = originalSpawnSystem; }
  assert.equal(g.story.reachedViridian, true);
  assert.deepEqual(g.story.healingSpot, {mapId: 4, x: 52, y: 38, direction: 2});
  assert.equal(g.storyAutoSavePending, true);
  assert.match(messages.at(-1), /상록시티.*2번도로.*상록숲/);
});

test('old saves infer Viridian progress and Poké Ball-shaped field pickups award Poké Balls', () => {
  const g = game();
  delete g.story.reachedViridian;
  g.story.mapId = 9;
  g.normalizeStoryMilestones();
  assert.equal(g.story.reachedViridian, true);
  assert.equal(g.storyMapName('Ruta 2 Norte'), '2번도로 북쪽');
  assert.equal(g.storyMapName('Bosque Verde'), '상록숲');
  let received;
  g.receiveStoryItem = (id, amount) => (received = {id, amount});
  g.storyRenderer = {map: source(9)};
  g.receiveFieldItem('TM94', 2, {mapId: 9, eventId: 23, pageIndex: 0});
  assert.deepEqual(received, {id: 'POKEBALL', amount: 2});
});

test('Poké Ball-shaped field events are collected before unsupported native commands run', async () => {
  const g = game();
  g.story.mapId = 9;
  g.storyRenderer = {map: source(9)};
  g.storyPositions = {};
  g.receiveStoryItem = (id, amount) => {
    assert.equal(id, 'POKEBALL');
    assert.equal(amount, 1);
    g.balls.pokeBall = (g.balls.pokeBall || 0) + amount;
  };
  let message = '';
  g.message = text => { message = text; };
  const event = {
    id: 999,
    pages: [{
      graphic: {character_name: 'objeto'},
      list: [{code: 999, parameters: [], indent: 0}, {code: 0, parameters: [], indent: 0}]
    }]
  };
  await g.runStoryEvent(event, 0);
  assert.equal(g.storyError, null);
  assert.equal(g.balls.pokeBall, 1);
  assert.equal(g.erasedStoryEvents.has(999), true);
  assert.deepEqual(g.story.mapEvents.erased, [999]);
  assert.match(message, /몬스터볼/);
});

test('defeat returns to Oak before Viridian and to the Viridian checkpoint afterwards', async () => {
  const originalMovement = R.MovementSystem;
  R.MovementSystem = {safePosition: (_map, x, y) => ({x, y})};
  try {
    for (const reachedViridian of [false, true]) {
      const g = game();
      g.mode = 'gameOver'; g.story.reachedViridian = reachedViridian;
      if (reachedViridian) g.story.healingSpot = {mapId: 4, x: 52, y: 38, direction: 2};
      g.combatSystem = {clear() {}}; g.partyBattle = {clear() {}};
      g.captureSystem = {lockedTarget: null};
      g.ui = {hideLevelChoices() {}, hideGameMenu() {}};
      g.camera = {follow() {}}; g.map = {};
      g.trainer.radius = 10;
      g.storyProxyNpcs = [];
      g.nearestStoryCenter = async () => ({mapId: 4, npcId: 'viridian-joy', x: 52, y: 38});
      let destination, healed = false, saved = false, message = '';
      g.transferStory = async (mapId, x, y) => {
        destination = {mapId, x, y};
        g.story.mapId = mapId;
        g.storyProxyNpcs = reachedViridian ? [{id: 'viridian-joy', x: 52, y: 37}] : [{id: 'oak-starter', x: 27, y: 30}];
      };
      g.healParty = () => { healed = true; };
      g.saveGame = () => { saved = true; };
      g.message = text => { message = text; };
      assert.equal(await g.restartAfterDefeat(), true);
      assert.deepEqual(destination, reachedViridian ? {mapId: 4, x: 52, y: 38} : {mapId: 2, x: 27, y: 31});
      assert.equal(healed, true); assert.equal(saved, true); assert.equal(g.mode, 'trainer');
      assert.match(message, reachedViridian ? /간호순/ : /오박사/);
      if (!reachedViridian) assert.equal(g.story.healingSpot, undefined);
    }
  } finally { R.MovementSystem = originalMovement; }
});

test('outdoor story plans block the configured indoor entrances and localize map names', () => {
  const g = Object.create(R.StoryGame.prototype);
  g.story = {mapId: 2};
  assert.deepEqual(g.storyOutdoorPlan(2).blocked, [5, 6, 7, 8, 11, 12, 13, 14]);
  assert.deepEqual(g.storyOutdoorPlan(5).blocked, [11]);
  assert.deepEqual(g.storyOutdoorPlan(9).blocked, [35, 36, 37]);
  assert.deepEqual(g.storyOutdoorPlan(15).blocked, [68, 69, 70, 71, 72]);
  assert.deepEqual(g.storyOutdoorPlan(19).blocked, [24, 33, 34, 35, 36]);
  assert.equal(g.storyMapName('Pueblo Paleta'), '태초마을');
  assert.equal(g.storyMapName('Ruta 22'), '22번도로');
  assert.equal(g.storyMapName('Ciudad Plateada'), '회색시티');
  assert.equal(g.storyMapName('Ciudad Celeste'), '블루시티');
  assert.equal(g.storyMapName('Ciudad Carmín'), '갈색시티');
});
test('209 routes execute once, 202 changes positions/directions and 116 erases current event', async () => {
  const g = game(), frame = {mapId: 42, eventId: 16}; g.storyRenderer = {map: source(42)};
  const before = g.storyPosition(0, frame);
  const move = {code: 3, parameters: []};
  await g.storyCommand({code: 209, parameters: [0, {list: [move, {code: 19, parameters: []}]}]}, frame);
  await g.storyCommand({code: 509, parameters: [move]}, frame);
  assert.deepEqual(g.storyPosition(0, frame), {x: before.x + 1, y: before.y, direction: 8});
  await g.storyCommand({code: 202, parameters: [0, 0, 6, 7, 4]}, frame);
  assert.deepEqual(g.storyPosition(0, frame), {x: 6, y: 7, direction: 4});
  await g.storyCommand({code: 116, parameters: []}, frame); assert.equal(g.erasedStoryEvents.has(16), true);
});
test('malformed event positions and healing destinations are rejected before loading', () => {
  for (const extra of [{mapEvents: {mapId: 1, positions: {'2': {x: null, y: 1}}, erased: []}},
    {mapEvents: {mapId: 1, positions: {}, erased: ['2']}}, {healingSpot: {mapId: -1, x: 1, y: 1}}])
    assert.throws(() => R.StoryState.validate({...R.StoryState.create(), ...extra}));
});

test('outdoor fan club voucher and bike shop exchange stay on exterior maps', async () => {
  const g = game();
  sourceProxy(g, 19, 63);
  await g.runStoryProxy(63, 9, undefined, {choicePrompt: '팬클럽 회장의 이야기를 들어볼까요?'});
  if (g.storyError) throw g.storyError;
  assert.equal(g.story.mapId, 19);
  assert.equal(g.story.switches[84], true);
  assert.equal(g.story.keyItems.BONOBICI, 1);
  assert.equal(g.story.selfSwitches['63:9:A'], true);

  sourceProxy(g, 15, 60);
  await g.runStoryProxy(60, 6, undefined, {intro: '자전거 상점 주인: 자전거 교환권을 확인해 볼게.'});
  if (g.storyError) throw g.storyError;
  assert.equal(g.story.mapId, 15);
  assert.equal(g.story.keyItems.BONOBICI, 0);
  assert.equal(g.story.keyItems.BICYCLE, 1);
  assert.equal(g.story.selfSwitches['60:6:A'], true);
});

test('outdoor Bill proxy completes the machine scene and gives the ship ticket', async () => {
  const g = game();
  sourceProxy(g, 158, 62);
  await g.runBillProxy({choicePrompt: '빌을 도와 장치를 작동할까요?'});
  if (g.storyError) throw g.storyError;
  assert.equal(g.story.mapId, 158);
  assert.equal(g.story.switches[81], true);

  await g.runBillProxy({choicePrompt: '빌을 도와 장치를 작동할까요?'});
  if (g.storyError) throw g.storyError;
  assert.equal(g.story.mapId, 158);
  assert.equal(g.story.switches[82], true);
  assert.equal(g.story.switches[83], true);
  assert.equal(g.story.keyItems.TICKETBARCO, 1);
});

test('story text localizes representative exterior dialogue through the third gym route', () => {
  const g = Object.create(R.StoryGame.prototype);
  g.story = {playerName: 'Red', variables: {}};
  const samples = [
    ['¡La tecnología de hoy en día es increíble!\nUna pena que nos la perdamos porque internet no llega bien hasta <b>Pueblo Paleta</b>.', '요즘 기술은 정말 대단해!\n다만 태초마을은 인터넷이 잘 안 들어와서 아쉽지.'],
    ['<b>Norte:</b> Ciudad Verde\\n<b>Sur:</b> Pueblo Paleta', '<b>북쪽:</b> 상록시티\\n<b>남쪽:</b> 태초마을'],
    ['<b>Ciudad Plateada</b>, una ciudad de roca grisácea.', '<b>회색시티</b> — 회색 바위의 도시'],
    ['<b>Ciudad Celeste</b>, ¡el azul del agua nos rodea!', '<b>블루시티</b> — 푸른 물빛이 도시를 감싸는 곳'],
    ['<b>Ciudad Carmín</b>, sus tonos rojizos evocan la puesta de sol.', '<b>갈색시티</b> — 붉은 노을빛이 떠오르는 항구도시'],
    ['\\c[3]<b>???:</b>\\c[0] ¡Ah! Esto... eh... ¿qué quieres?\nT-tengo mucho en lo que pensar ahora mismo.',
      '\\c[3]<b>???:</b>\\c[0] 아! 저기... 무슨 일이야?\n지-지금 생각할 게 너무 많아서...'],
    ['\\c[1]<b>\\v[12]:</b>\\c[0] ¡Hombre, \\PN! ¿Al final has conseguido tu primera medalla?\n¡Me dejas muy sorprendido!',
      '\\c[1]<b>\\v[12]:</b>\\c[0] 오, \\PN! 드디어 첫 번째 배지를 얻었구나?\n제법인데! 놀랐어.']
  ];
  for (const [sourceText, korean] of samples) assert.equal(g.translateStoryText(sourceText), korean);
  const splitLineSamples = [
    ['¡La tecnología de hoy en día es increíble!', '요즘 기술은 정말 대단해!'],
    ['Una pena que nos la perdamos porque internet no llega bien hasta <b>Pueblo Paleta</b>.', '다만 태초마을은 인터넷이 잘 안 들어와서 아쉽지.'],
    ['¿Vas a enfrentarte al líder <b>Brock</b>? Sus Pokémon de tipo Roca son muy defensivos.', '브록에게 도전할 거니? 바위타입 포켓몬은 방어가 단단해.'],
    ['Al norte de la ciudad vive un famoso Pokémaniaco llamado <b>Bill</b>.', '도시 북쪽에는 빌이라는 유명한 포켓몬 마니아가 살고 있어.'],
    ['Hemos cortado la salida de <b>Ciudad Celeste</b> hasta que terminemos una operación contra el <b>Team Rocket</b>.', '로켓단 관련 작전이 끝날 때까지 블루시티 출구를 통제하고 있습니다.'],
    ['¡Disculpa las molestias!', '불편을 드려 죄송합니다!']
  ];
  for (const [sourceText, korean] of splitLineSamples) assert.equal(g.translateStoryText(sourceText), korean);
  assert.equal(g.translateStoryText('Centro Pokémon · Team Rocket · Ticket Barco'), '포켓몬센터 · 로켓단 · 승선권');
  assert.equal(g.translateStoryText('<b>Oeste:</b> Monte Plateado · <b>Este:</b> Ruta 23'), '<b>서쪽:</b> 은빛산 · <b>동쪽:</b> 23번도로');
});
