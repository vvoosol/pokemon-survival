const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

global.window = {SurvivorRPG: {}};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/systems/captureSystem.js'), 'utf8'));

const CaptureSystem = window.SurvivorRPG.CaptureSystem;

function previousChance(wildPokemon, ball) {
  const hpRatio = Math.max(0.01, Math.min(1, wildPokemon.hp / wildPokemon.maxHp));
  const catchRate = Math.max(1, wildPokemon.data.catchRate || 120);
  const ballModifier = ball.catchModifier || 1;
  const speciesFactor = catchRate / 255;
  const hpFactor = 0.22 + (1 - hpRatio) * 0.68;
  return Math.max(0.03, Math.min(0.95, speciesFactor * ballModifier * hpFactor + (wildPokemon.captureFailures || 0) * .06));
}

test('capture chance is 1.5x the previous calculation', () => {
  const system = new CaptureSystem();
  const target = {hp: 45, maxHp: 100, data: {catchRate: 120}, captureFailures: 1};
  const ball = {catchModifier: 1};
  assert.equal(system.calculateCaptureChance(target, ball), previousChance(target, ball) * 1.5);
});

test('boosted capture chance is capped at 100%', () => {
  const system = new CaptureSystem();
  const target = {hp: 1, maxHp: 100, data: {catchRate: 255}, captureFailures: 10};
  assert.equal(system.calculateCaptureChance(target, {catchModifier: 2}), 1);
});
