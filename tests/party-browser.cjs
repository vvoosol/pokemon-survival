const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // Reset/save tests run only in a fresh context, never in the user's browser.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.url()); });
  const out = path.join(__dirname, 'screenshots'); fs.mkdirSync(out, { recursive: true });
  const shot = (name) => page.screenshot({ path: path.join(out, name + '.png') });
  const tick = (seconds) => page.evaluate((seconds) => {
    const g = currentSurvivorRPG;
    for (let t = 0; t < seconds; t += 0.01) g.testTick(0.01);
    g.draw(); g.ui.update(g);
  }, seconds);
  const press = async (key) => { await page.keyboard.press(key); await tick(0.01); };
  try {
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8787/?mode=battle');
    await page.waitForFunction(() => window.currentSurvivorRPG?.trainer || window.__bootError);
    assert.equal(await page.evaluate(() => window.__bootError), undefined);
    await page.evaluate(() => {
      const g = currentSurvivorRPG;
      g.testTick = g.update.bind(g); g.update = () => {};
      g.trainer.x = 800; g.trainer.y = 730;
      g.camera.follow(g.trainer, 1);
      const extra = g.createPartyPokemon(SurvivorRPG.PokemonData.pikachu, 800, 730);
      g.ownedPokemon.push(extra); g.partyPokemon.push(extra);
      g.money = 1000;
      g.testStarterId = g.starterId;
      g.player.hp = Math.round(g.player.maxHp / 2);
      g.testHpRatio = g.player.hp / g.player.maxHp;
      g.saveGame(); g.menuOpen = false; g.ui.hideGameMenu();
    });
    await tick(0.01);
    await shot('oak-hub');
    await press('z');
    assert.equal(await page.evaluate(() => currentSurvivorRPG.menuView), 'professor');
    await page.locator('[data-professor="starterSelect"]').click();
    await shot('starter-select');
    await page.locator('[data-starter="charmander"]').click();
    await shot('starter-confirm');
    await page.locator('[data-change]').click();
    assert.ok(await page.evaluate(() => {
      const g = currentSurvivorRPG, p = g.partyPokemon[0];
      return p.speciesId === 'charmander' && p.uniqueId === g.testStarterId && g.money === 1000
        && g.partyPokemon[1].id === 'pikachu' && g.ownedPokemon.length === 2
        && Math.abs(p.hp / p.maxHp - g.testHpRatio) < 0.03 && p.equippedMoves[0].moveId === 'scratch';
    }));
    await page.locator('[data-professor="resetConfirm"]').click();
    await press('x');
    assert.ok(await page.evaluate(() => currentSurvivorRPG.ownedPokemon.length === 2 && !!localStorage.getItem('scientistRpgSave')));
    await page.locator('[data-close]').click();
    console.log('PASS: Oak Z interaction, starter replacement preserves progress, reset cancellation');

    await page.evaluate(() => { const g = currentSurvivorRPG; g.menuOpen = true; g.openMenuView('formation'); });
    assert.ok(await page.locator('[data-formation="double"]').isDisabled());
    assert.ok(await page.locator('[data-formation="triple"]').isDisabled());
    assert.equal(await page.evaluate(() => currentSurvivorRPG.setBattleFormation('triple')), false);
    await page.evaluate(() => currentSurvivorRPG.openMenuView('mart'));
    await shot('battle-shop');
    await page.locator('[data-buy="doubleBattle"]').click();
    assert.deepEqual(await page.evaluate(() => { const g = currentSurvivorRPG; return [g.money, g.battleFormation, g.items.doubleBattle]; }), [800, 'double', true]);
    assert.equal(await page.evaluate(() => currentSurvivorRPG.buyItem('doubleBattle')), false);
    await page.locator('[data-buy="tripleBattle"]').click();
    assert.deepEqual(await page.evaluate(() => { const g = currentSurvivorRPG; return [g.money, g.battleFormation, g.items.tripleBattle]; }), [500, 'triple', true]);
    await page.evaluate(() => currentSurvivorRPG.openMenuView('formation'));
    await page.locator('[data-formation="single"]').click();
    assert.equal(await page.evaluate(() => currentSurvivorRPG.battleFormation), 'single');
    await page.locator('[data-formation="double"]').click();
    await shot('battle-mode');
    await page.evaluate(() => {
      const g = currentSurvivorRPG, R = SurvivorRPG;
      const third = g.createPartyPokemon(R.PokemonData.squirtle, 800, 620);
      const fourth = g.createPartyPokemon(R.PokemonData.bulbasaur, 800, 620);
      g.partyPokemon.push(third, fourth); g.ownedPokemon.push(third, fourth);
      g.healParty(); g.menuOpen = false; g.ui.hideGameMenu();
      g.trainer.x = 800; g.trainer.y = 620; g.startDeploy();
    });
    await tick(0.19);
    assert.deepEqual(await page.evaluate(() => currentSurvivorRPG.partyBattle.members.map((p) => p.id)), ['pikachu']);
    await tick(1);
    assert.equal(await page.evaluate(() => currentSurvivorRPG.partyBattle.members.length), 1);
    await press('z');
    assert.deepEqual(await page.evaluate(() => { const g = currentSurvivorRPG; return [g.mode, g.partyBattle.members.length, g.partyPokemon.filter((p) => p.inField).length]; }), ['trainer', 0, 0]);
    await page.evaluate(() => {
      const g = currentSurvivorRPG;
      g.menuOpen = true; g.openMenuView('formation');
    });
    await page.locator('[data-formation="triple"]').click();
    await page.evaluate(() => { const g = currentSurvivorRPG; g.menuOpen = false; g.ui.hideGameMenu(); g.startDeploy(); });
    await tick(0.2);
    assert.deepEqual(await page.evaluate(() => currentSurvivorRPG.partyBattle.members.map((p) => p.id)), ['pikachu']);
    await tick(0.2);
    assert.deepEqual(await page.evaluate(() => currentSurvivorRPG.partyBattle.members.map((p) => p.id)), ['pikachu', 'squirtle']);
    assert.ok(await page.evaluate(() => currentSurvivorRPG.partyBattle.members.every((p) => p.equippedMoves.every((s) => s.cooldownRemaining > 0))));
    await tick(0.8);
    await shot('triple-field');
    await page.evaluate(() => {
      const g = currentSurvivorRPG, R = SurvivorRPG;
      g.combatSystem.clear();
      const target = new R.WildPokemon({ ...g.spawnSystem.scaledWildData(R.PokemonData.rattata, 5), hp: 10000, maxHp: 10000 }, 920, 620, 'test');
      target.update = () => {}; g.enemies = [target];
      for (const p of [g.activePokemon, ...g.partyBattle.members]) {
        p.equippedMoves = p.normalizeMoveSlots(['ember']);
      }
    });
    await tick(1.5);
    assert.equal(await page.evaluate(() => currentSurvivorRPG.enemies[0].participants.size), 3);
    assert.ok(await page.evaluate(() => {
      const g = currentSurvivorRPG;
      return [g.activePokemon, ...g.partyBattle.members].every((p) => p.equippedMoves[0].cooldownRemaining > 0);
    }));
    await shot('triple-combat');
    await press('x');
    await tick(0.5);
    assert.deepEqual(await page.evaluate(() => { const g = currentSurvivorRPG; return [g.activePokemon.id, ...g.partyBattle.members.map((p) => p.id)]; }), ['pikachu', 'squirtle', 'bulbasaur']);
    assert.equal(await page.evaluate(() => currentSurvivorRPG.partyPokemon.filter((p) => p.inField).length), 3);
    await page.evaluate(() => { const g = currentSurvivorRPG; g.partyBattle.members[0].takeDamage(9999); });
    await tick(0.5);
    assert.deepEqual(await page.evaluate(() => currentSurvivorRPG.partyBattle.members.map((p) => p.id)), ['bulbasaur', 'charmander']);
    await page.evaluate(() => currentSurvivorRPG.activePokemon.takeDamage(9999));
    await tick(0.6);
    assert.equal(await page.evaluate(() => currentSurvivorRPG.activePokemon.id), 'bulbasaur');
    assert.ok(await page.evaluate(() => {
      const g = currentSurvivorRPG;
      return new Set([g.activePokemon, ...g.partyBattle.members]).size === 2 && g.partyPokemon.filter((p) => p.inField).length === 2;
    }));
    await press('z');
    assert.equal(await page.evaluate(() => currentSurvivorRPG.partyBattle.members.length), 0);
    console.log('PASS: purchases, on/off, ordered staggered deployment, three attackers, switching and fainting');

    const persistence = await page.evaluate(() => {
      const g = currentSurvivorRPG;
      g.saveGame(); g.items.tripleBattle = false; g.battleFormation = 'single'; g.starterId = null;
      g.loadGame();
      return [g.items.doubleBattle, g.items.tripleBattle, g.battleFormation, g.partyPokemon[0].id, g.starterId === g.partyPokemon[0].uniqueId];
    });
    assert.deepEqual(persistence, [true, true, 'triple', 'charmander', true]);
    assert.ok(await page.evaluate(() => {
      const g = currentSurvivorRPG, R = SurvivorRPG;
      return [['charmander', 'charmeleon', 'charizard'], ['squirtle', 'wartortle', 'blastoise']].every(([base, mid, last]) => {
        const p = g.createPartyPokemon(R.PokemonData[base], 0, 0);
        p.level = 16; g.checkEvolution({ toLevel: 16 }, p);
        if (p.id !== mid) return false;
        p.level = 36; g.checkEvolution({ toLevel: 36 }, p);
        return p.id === last && !!g.assets.image(last);
      });
    }));
    for (const [name, width, height] of [['desktop', 1280, 720], ['mobile', 844, 390], ['portrait', 390, 844]]) {
      await page.setViewportSize({ width, height });
      for (const view of ['main', 'mart', 'formation', 'starterSelect', 'resetConfirm']) {
        await page.evaluate((view) => { const g = currentSurvivorRPG; g.menuOpen = true; g.openMenuView(view); g.draw(); g.ui.update(g); }, view);
        await shot(`${view}-${name}`);
        assert.ok(await page.evaluate(() => {
          const frame = document.querySelector('.screen-frame').getBoundingClientRect();
          const menu = document.querySelector('.menu-window').getBoundingClientRect();
          return Math.abs(frame.width / frame.height - 16 / 9) < 0.001 && menu.top >= frame.top - 1 && menu.bottom <= frame.bottom + 1;
        }), `${view}-${name}`);
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => {
      const g = currentSurvivorRPG; g.mode = 'trainer'; g.trainer.x = 800; g.trainer.y = 730;
      g.menuOpen = true; g.openMenuView('resetConfirm');
    });
    await page.locator('[data-reset]').click();
    assert.deepEqual(await page.evaluate(() => {
      const g = currentSurvivorRPG;
      return [g.menuView, g.ownedPokemon.length, g.items.doubleBattle, g.items.tripleBattle, g.battleFormation, localStorage.getItem('scientistRpgSave')];
    }), ['starterSelect', 0, false, false, 'single', null]);
    await page.locator('[data-starter="squirtle"]').click();
    await page.locator('[data-change]').click();
    assert.equal(await page.evaluate(() => currentSurvivorRPG.partyPokemon[0].id), 'squirtle');
    // Legacy saves remain single-party and infer the starter from the first owned slot.
    assert.ok(await page.evaluate(() => {
      const g = currentSurvivorRPG; g.saveGame();
      const data = JSON.parse(localStorage.getItem('scientistRpgSave'));
      delete data.starterId; delete data.battleFormation; delete data.items.doubleBattle; delete data.items.tripleBattle;
      localStorage.setItem('scientistRpgSave', JSON.stringify(data)); g.loadGame();
      return g.battleFormation === 'single' && g.starterId === g.ownedPokemon[0].uniqueId;
    }));
    assert.deepEqual(errors, []);
    console.log('PASS: save/load, legacy saves, starter evolutions, mobile menus and confirmed new game');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
