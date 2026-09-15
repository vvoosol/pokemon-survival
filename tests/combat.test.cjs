const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
global.window = { SurvivorRPG: {} };
for (const file of ['data/moveData.js', 'systems/combatSystem.js'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'));
const { CombatSystem, MoveData } = window.SurvivorRPG;
function entity(x = 0, y = 0) {
  return { x, y, radius: 8, hp: 100, dead: false, uniqueId: 'original', speed: 20,
    equippedMoves: [], lastMoveVector: { x: 1, y: 0 },
    takeDamage(n) { this.hp -= n; this.dead = this.hp <= 0; } };
}
function setup(id = 'ember', upgrade = 0) {
  const caster = entity(), target = entity(140, 0);
  const combat = new CombatSystem({ calculateMoveCooldown: () => 3,
    calculateDamageBreakdown: (source) => ({ finalDamage: source.damage || 10, type: 1 }) }, { play() {} });
  const cast = combat.createCast(caster, target, MoveData[id], upgrade);
  return { combat, caster, target, cast };
}
function advance(combat, player, enemies, seconds) {
  for (let t = 0; t < seconds; t += 0.01) combat.update(0.01, player, enemies, false);
}

test('ranged attacks travel before damage and expire at range', () => {
  const { combat, caster, target, cast } = setup();
  combat.release(cast, caster, [target]);
  assert.equal(target.hp, 100);
  advance(combat, caster, [target], 0.1);
  assert.equal(target.hp, 100);
  advance(combat, caster, [target], 0.4);
  assert.equal(target.hp, 90);
  assert.equal(combat.projectiles.length, 0);
});
test('a target can dodge a locked direction', () => {
  const { combat, caster, target, cast } = setup();
  combat.telegraphs.push(cast);
  target.y = 150;
  advance(combat, caster, [target], 1);
  assert.equal(target.hp, 100);
});
test('cooldown starts even when nearest target is beyond range', () => {
  const { combat, caster, target } = setup();
  target.x = 1000;
  caster.equippedMoves = [{ moveId: 'ember', cooldownRemaining: 0 }];
  combat.tryPlayerAutoAttacks(caster, [target]);
  assert.equal(combat.telegraphs.length, 1);
  assert.equal(caster.equippedMoves[0].cooldownRemaining, 3);
  advance(combat, caster, [target], 2);
  assert.equal(target.hp, 100);
});
test('swept collision cannot tunnel through a small target', () => {
  const { combat, caster, target, cast } = setup();
  target.x = 80;
  combat.release(cast, caster, [target]);
  combat.update(0.5, caster, [target], false);
  assert.equal(target.hp, 90);
});
test('non-piercing hits first intersection, independent of enemy order', () => {
  const { combat, caster, target, cast } = setup('rockThrow');
  const near = entity(65, 0);
  combat.release(cast, caster, [target, near]);
  combat.update(0.5, caster, [target, near], false);
  assert.equal(near.hp, 90);
  assert.equal(target.hp, 100);
});
test('piercing hits each enemy once', () => {
  const { combat, caster, target, cast } = setup();
  const near = entity(65, 0);
  combat.release(cast, caster, [target, near]);
  advance(combat, caster, [target, near], 1);
  assert.equal(near.hp, 90);
  assert.equal(target.hp, 90);
});
test('spread cannot triple hit the same target in one wave', () => {
  const { combat, caster, target, cast } = setup('razorLeaf');
  target.x = 45;
  combat.release(cast, caster, [target]);
  advance(combat, caster, [target], 1);
  assert.equal(target.hp, 90);
});
test('area projectile damages only at landing, using its circular footprint', () => {
  const { combat, caster, target, cast } = setup('seedBomb');
  const edge = entity(140, 65), outside = entity(140, 69), crossed = entity(30, 0);
  const enemies = [target, edge, outside, crossed];
  combat.release(cast, caster, enemies);
  advance(combat, caster, enemies, 0.1);
  assert.equal(target.hp, 100);
  advance(combat, caster, enemies, 0.5);
  assert.equal(target.hp, 90);
  assert.equal(edge.hp, 90);
  assert.equal(outside.hp, 100);
  assert.equal(crossed.hp, 100);
});
test('beam damage waits until its visible front arrives', () => {
  const { combat, caster, target, cast } = setup('vineWhip');
  combat.release(cast, caster, [target]);
  advance(combat, caster, [target], 0.05);
  assert.equal(target.hp, 100);
  advance(combat, caster, [target], 0.5);
  assert.equal(target.hp, 90);
});
test('switching cannot change source damage or participation', () => {
  const { combat, caster, target, cast } = setup();
  const replacement = entity(); replacement.damage = 80; replacement.uniqueId = 'replacement';
  combat.telegraphs.push(cast);
  advance(combat, replacement, [target], 1);
  assert.equal(target.hp, 90);
  assert.deepEqual([...target.participants], ['original']);
});
test('hostile projectiles can hit the replacement without invulnerability', () => {
  const { combat, caster, target } = setup();
  const cast = combat.createCast(caster, target, MoveData.ember, 0, 'enemy');
  combat.release(cast, target, [caster]);
  const replacement = entity(140, 0);
  advance(combat, replacement, [caster], 1);
  assert.equal(replacement.hp, 90);
  assert.equal(target.hp, 100);
});
test('protected capture sequence does not receive projectile damage', () => {
  const { combat, caster, target, cast } = setup();
  combat.release(cast, caster, [target]); target.state = 'capture_sequence';
  advance(combat, caster, [target], 1);
  assert.equal(target.hp, 100);
});
test('upgraded echo deals 60 percent, without recursive waves', () => {
  const { combat, caster, target, cast } = setup('ember', 2);
  combat.release(cast, caster, [target]);
  advance(combat, caster, [target], 2);
  assert.equal(target.hp, 84);
  assert.equal(combat.delayedAttacks.length, 0);
  assert.equal(combat.projectiles.length, 0);
});
test('dead targets award defeat only once for simultaneous shots', () => {
  const { combat, caster, target, cast } = setup('razorLeaf', 4);
  target.hp = 5;
  let defeats = 0; combat.onEnemyDefeated = () => defeats++;
  combat.release(cast, caster, [target]);
  advance(combat, caster, [target], 2);
  assert.equal(defeats, 1);
});
test('trainer mode advances existing shots; clear removes map remnants', () => {
  const { combat, caster, target, cast } = setup();
  combat.release(cast, caster, [target]);
  advance(combat, null, [target], 1);
  assert.equal(combat.projectiles.length, 0);
  combat.telegraphs.push(cast); combat.clear();
  assert.equal(combat.telegraphs.length + combat.impacts.length + combat.delayedAttacks.length, 0);
});
test('oriented rectangles use actual target radius at corners', () => {
  const { combat } = setup();
  const box = { startX: 0, startY: 0, dirX: 1, dirY: 0, length: 100, width: 40 };
  assert.equal(combat.isInHitbox(entity(104, 24), box), true);
  assert.equal(combat.isInHitbox(entity(107, 27), box), false);
});

test('tackle has a visible preparation and swing before dealing damage', () => {
  const { combat, caster, target } = setup('tackle');
  target.x = 65;
  const cast = combat.createCast(caster, target, MoveData.tackle);
  combat.telegraphs.push(cast);
  advance(combat, caster, [target], 0.4);
  assert.equal(target.hp, 100);
  assert.ok(combat.poseFor(caster).offset < 0);
  advance(combat, caster, [target], 0.21);
  assert.equal(combat.telegraphs.length, 0);
  assert.equal(target.hp, 100);
  assert.equal(combat.meleeSwings.length, 1);
  advance(combat, caster, [target], 0.05);
  assert.ok(combat.poseFor(caster).offset > 0);
  assert.equal(target.hp, 100);
  advance(combat, caster, [target], 0.1);
  assert.equal(target.hp, 90);
  advance(combat, caster, [target], 1);
  assert.equal(target.hp, 90);
  assert.equal(combat.poseFor(caster), null);
});

test('sidestepping tackle during preparation avoids damage', () => {
  const { combat, caster, target } = setup('tackle');
  target.x = 65;
  const cast = combat.createCast(caster, target, MoveData.tackle);
  combat.telegraphs.push(cast);
  advance(combat, caster, [target], 0.35);
  target.y = 100;
  advance(combat, caster, [target], 1);
  assert.equal(target.hp, 100);
  assert.deepEqual(cast.direction, { x: 1, y: 0 });
});

test('wild tackle uses the same preparation as player tackle', () => {
  const { combat, caster, target } = setup('tackle');
  caster.equippedMoves = ['tackle'];
  assert.equal(combat.enemyAttack(caster, target), combat.windupFor(MoveData.tackle));
  assert.equal(combat.telegraphs[0].windup, 0.6);
  assert.ok(combat.isActing(caster));
});

test('moving the caster does not rotate the aim or leave effects behind', () => {
  const { combat, caster, target, cast } = setup();
  combat.telegraphs.push(cast);
  caster.x = 30; caster.y = 50;
  combat.update(0.1, caster, [target], false);
  assert.deepEqual(cast.origin, { x: 30, y: 50 });
  assert.equal(cast.hitboxes[0].startX, 30);
  assert.equal(cast.hitboxes[0].startY, 50);
  assert.deepEqual(cast.direction, { x: 1, y: 0 });
});

test('fainting during the swing cancels melee damage', () => {
  const { combat, caster, target, cast } = setup('tackle');
  target.x = 65;
  combat.release(cast, caster, [target]);
  caster.dead = true;
  advance(combat, caster, [target], 1);
  assert.equal(target.hp, 100);
  assert.equal(combat.meleeSwings.length, 0);
});

test('combat visuals never paint rectangular hitboxes', () => {
  const { combat, caster, target } = setup();
  window.SurvivorRPG.MoveVisualAdapter = { getMoveAnimation: () => ({ color: '#ffffff' }), draw() {} };
  const ctx = new Proxy({}, { get: (_, key) => {
    if (key === 'fillRect' || key === 'strokeRect') return () => assert.fail('rectangular combat overlay');
    return () => {};
  }, set: () => true });
  for (const id of ['tackle', 'ember', 'vineWhip', 'seedBomb', 'bodySlam']) {
    const cast = combat.createCast(caster, target, MoveData[id]);
    combat.telegraphs.push(cast);
    combat.release(cast, caster, [target]);
    combat.resolveShapes(cast, cast.hitboxes, caster, []);
  }
  combat.drawEffects(ctx, { x: 0, y: 0 });
});
