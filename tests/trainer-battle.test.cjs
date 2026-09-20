const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = {SurvivorRPG: {
  MoveData: {
    tackle: {power: 40, type: 'normal', behavior: 'MELEE', range: 68},
    thunderbolt: {power: 90, type: 'electric', behavior: 'PROJECTILE', range: 180},
    vine_whip: {power: 45, type: 'grass', behavior: 'MELEE_ARC', range: 74},
    water_gun: {power: 40, type: 'water', behavior: 'PROJECTILE', range: 150}
  },
  DataAdapter: {
    typeMultiplier(type, types) {
      if (type === 'electric' && types.includes('water')) return 2;
      if (type === 'electric' && types.includes('ground')) return 0;
      if (type === 'grass' && types.includes('ground')) return 2;
      if (type === 'water' && types.includes('fire')) return 2;
      return 1;
    }
  }
}};

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/systems/trainerBattleSystem.js'), 'utf8'));
const R = window.SurvivorRPG;
let nextId = 1;

function pokemon(name, options = {}) {
  const maxHp = options.maxHp || 100;
  return {
    uniqueId: `${name}-${nextId++}`,
    name,
    hp: options.hp ?? maxHp,
    maxHp,
    dead: false,
    fainted: false,
    inField: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 10,
    movementSpeed: 120,
    types: options.types || ['normal'],
    equippedMoves: (options.moves || ['tackle']).map(moveId => ({moveId, upgradeLevel: 0, cooldownRemaining: 0})),
    update(dt, input, movement, map) {
      const vector = input.movementVector?.() || {x: 0, y: 0};
      movement.move(this, vector.x, vector.y, dt, map);
    },
    updateBase() {}
  };
}

function makeGame(playerParty) {
  const consumed = {switch: 0, ball: 0};
  const input = {
    movementVector: () => ({x: 0, y: 0}),
    consumeSwitch: () => { consumed.switch += 1; return false; },
    consumeBall: () => { consumed.ball += 1; return false; },
    consumeMenu: () => false,
    consumeParty: () => false,
    consumeLeader: () => false,
    consumeTactical: () => false
  };
  return {
    partyPokemon: playerParty,
    partyBattle: {clear() {}},
    input,
    consumed,
    map: {width: 1024, height: 768, colliders: []},
    movementSystem: {
      move(entity, x, y, dt) {
        entity.x += x * (entity.movementSpeed || 120) * dt;
        entity.y += y * (entity.movementSpeed || 120) * dt;
      }
    },
    combatSystem: {
      isActing: () => false,
      enemyAttack: () => 0,
      update() {}
    },
    camera: {follow() {}},
    resetMoveCooldowns(p) {
      for (const move of p.equippedMoves || []) if (typeof move !== 'string') move.cooldownRemaining = 0;
    },
    spawnSwitchFlash() {},
    message() {},
    askStory: async () => 0,
    mode: 'pokemon',
    activePokemon: null,
    player: playerParty[0] || null,
    selectedPokemon: playerParty[0] || null,
    selectedPartyIndex: 0,
    enemies: []
  };
}

function makeEngine(activeCount = 1, playerOptions = [], opponentOptions = [], profile = 'normal') {
  const players = Array.from({length: 6}, (_, i) => pokemon(`P${i + 1}`, playerOptions[i] || {}));
  const opponents = Array.from({length: 6}, (_, i) => pokemon(`O${i + 1}`, opponentOptions[i] || {}));
  const game = makeGame(players);
  const engine = new R.TrainerBattleEngine(game, {
    playerParty: players,
    opponentParty: opponents,
    maxActiveCount: activeCount,
    opponentMaxActiveCount: activeCount,
    switchCooldown: 3,
    aiProfile: profile
  });
  return {game, engine, players, opponents};
}

test('1v1, 2v2, 3v3 and 6v6 deploy the requested active slots', () => {
  for (const count of [1, 2, 3, 6]) {
    const {engine} = makeEngine(count);
    assert.equal(engine.begin(), true);
    assert.equal(engine.playerActive.length, count);
    assert.equal(engine.opponentActive.length, count);
    assert.equal(engine.leader, engine.playerActive[0]);
  }
});

test('fainted active slots auto-fill from reserves in party order and transfer leader control', () => {
  const {engine, players} = makeEngine(2);
  engine.begin();
  players[0].hp = 0; players[0].dead = true;
  engine.cleanupAndRefill();
  assert.deepEqual(engine.playerActive, [players[1], players[2]]);
  assert.equal(engine.leader, players[1]);
  assert.equal(players[2].inField, true);
});

test('leader cycle ignores fainted actives', () => {
  const {engine, players} = makeEngine(3);
  engine.begin();
  players[1].hp = 0; players[1].dead = true;
  assert.equal(engine.cycleLeader(), true);
  assert.equal(engine.leader, players[2]);
});

test('manual reserve switch preserves slot, transfers leader and enforces cooldown', () => {
  const {engine, players} = makeEngine(2);
  engine.begin();
  const x = players[0].x, y = players[0].y;
  assert.equal(engine.manualSwitch(players[0], players[2]), true);
  assert.equal(engine.playerActive[0], players[2]);
  assert.equal(engine.leader, players[2]);
  assert.equal(players[2].x, x);
  assert.equal(players[2].y, y);
  assert.equal(engine.manualSwitch(players[1], players[0]), false);
  assert.ok(engine.playerSwitchCooldown > 0);
});

test('opponent AI prefers a beneficial reserve switch when low HP and type matchup improves', () => {
  const playerOptions = [{types: ['ground']}];
  const opponentOptions = [
    {hp: 10, maxHp: 100, moves: ['thunderbolt']},
    {moves: ['vine_whip']}
  ];
  const {engine, players, opponents} = makeEngine(1, playerOptions, opponentOptions, 'strong');
  engine.begin();
  opponents[0].aiTarget = players[0];
  engine.trainerAI.considerSwitch(engine.opponentActive, engine.playerActive);
  assert.equal(engine.opponentActive[0], opponents[1]);
  assert.ok(engine.trainerAI.switchCooldown > 0);
});

test('target score favors super-effective electric target over immune ground target', () => {
  const {engine, opponents} = makeEngine(1, [], [{moves: ['thunderbolt']}]);
  const attacker = opponents[0];
  const water = pokemon('Water', {types: ['water']});
  const ground = pokemon('Ground', {types: ['ground']});
  water.x = ground.x = 200; water.y = ground.y = 200;
  attacker.x = 300; attacker.y = 200;
  assert.ok(engine.trainerAI.targetScore(attacker, water) > engine.trainerAI.targetScore(attacker, ground));
});

test('role inference is move-behavior based and formation offsets remain distinct', () => {
  const {engine} = makeEngine(1);
  const melee = pokemon('Melee', {moves: ['tackle']});
  const ranged = pokemon('Ranged', {moves: ['thunderbolt']});
  assert.equal(engine.pokemonAI.inferRole(melee).role, 'MELEE');
  assert.equal(engine.pokemonAI.inferRole(ranged).role, 'RANGED');
  const offsets = Array.from({length: 6}, (_, i) => engine.pokemonAI.formationOffset(i, 6, 1));
  assert.equal(new Set(offsets.map(p => `${p.x},${p.y}`)).size, 6);
});

test('trainer battle consumes disabled Z and capture inputs', () => {
  const {game, engine} = makeEngine(1);
  engine.begin();
  engine.update(0.016);
  assert.equal(game.consumed.switch, 1);
  assert.equal(game.consumed.ball, 1);
});

test('growth modal modes are not overwritten by leader synchronization', () => {
  const {game, engine} = makeEngine(1);
  game.mode = 'levelChoice';
  engine.begin();
  assert.equal(game.mode, 'levelChoice');
  game.mode = 'moveLearn';
  engine.syncLeader();
  assert.equal(game.mode, 'moveLearn');
});
