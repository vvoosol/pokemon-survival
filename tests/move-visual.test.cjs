const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

global.window = { SurvivorRPG: {} };
for (const file of ['data/moveData.js', 'data/moveVisualAdapter.js'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'));

const { MoveData, MoveVisualAdapter } = window.SurvivorRPG;

test('undersized ranged move visuals are normalized without changing hitbox widths', () => {
  const smallMoves = ['bubble', 'ember', 'thunderShock', 'waterGun', 'mudShot',
    'confusion', 'rockThrow', 'electroBall', 'gust'];
  const originalWidths = Object.fromEntries(smallMoves.map((id) => [id, MoveData[id].width]));

  for (const id of smallMoves) {
    assert.equal(MoveVisualAdapter.getDrawSize(MoveData[id], MoveData[id].width), 44, id);
    assert.equal(MoveData[id].width, originalWidths[id], id);
  }
  assert.equal(MoveVisualAdapter.getDrawSize(MoveData.waterPulse, MoveData.waterPulse.width), 64);
  assert.equal(MoveVisualAdapter.getDrawSize(MoveData.razorLeaf, MoveData.razorLeaf.width), 64);
});

test('small area-flight and impact animation frames also remain readable', () => {
  assert.equal(MoveVisualAdapter.getDrawSize(MoveData.seedBomb, 24), 44);
  assert.equal(MoveVisualAdapter.getDrawSize(MoveData.seedBomb, 36, true), 44);
  assert.equal(MoveVisualAdapter.getDrawSize(MoveData.seedBomb, 72, true), 72);
});

test('imported story projectile visuals do not inherit their compact combat hitbox width', () => {
  const imported = {
    ...MoveData.waterPulse,
    id: 'story_test_projectile',
    width: 48,
    adaptation: 'Imported story move'
  };
  assert.equal(MoveVisualAdapter.getDrawSize(imported, imported.width), 64);
  assert.equal(imported.width, 48);

  const explicit = {...imported, visualSize: 72};
  assert.equal(MoveVisualAdapter.getDrawSize(explicit, explicit.width), 72);
});
