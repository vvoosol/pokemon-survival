const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.url()); });
  const out = path.join(__dirname, 'screenshots'); fs.mkdirSync(out, { recursive: true });
  const screenshot = (name) => page.screenshot({ path: path.join(out, name + '.png') });
  const press = async (key) => {
    await page.keyboard.press(key);
    await page.evaluate(() => { const g = currentSurvivorRPG; g.testTick(0.016); g.draw(); g.ui.update(g); });
  };
  try {
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8787/?mode=battle');
    await page.waitForFunction(() => currentSurvivorRPG?.trainer || window.__bootError);
    assert.equal(await page.evaluate(() => window.__bootError), undefined);
    await page.evaluate(() => {
      const g = currentSurvivorRPG;
      g.testTick = g.update.bind(g); g.update = () => {};
      g.messageTimer = 0; g.draw();
    });
    assert.deepEqual(await page.evaluate(() => ['npc-brock', 'npc-nurse', 'npc-clerk'].map((key) => {
      const img = currentSurvivorRPG.assets.image(key); return [img.width, img.height];
    })), [[240, 256], [240, 256], [240, 256]]);
    await screenshot('npc-hub');
    // Actual Z interaction with Brock, then the area-selection button.
    await page.evaluate(() => { const g = currentSurvivorRPG; g.trainer.x = 760; g.trainer.y = 490; });
    await press('z');
    assert.equal(await page.evaluate(() => currentSurvivorRPG.menuView), 'areaSelect');
    await page.locator('[data-area="survival"]').click();
    assert.deepEqual(await page.evaluate(() => { const g = currentSurvivorRPG; return [g.mode, g.player.x, g.player.y]; }), ['pokemon', 1300, 950]);
    await page.evaluate(() => { const g = currentSurvivorRPG; for (let i = 0; i < 80; i++) g.testTick(0.05); g.ui.update(g); g.draw(); });
    await screenshot('survival-start');
    assert.ok(await page.evaluate(() => currentSurvivorRPG.enemies.length >= 4));
    await press('z');
    assert.equal(await page.evaluate(() => currentSurvivorRPG.mode), 'trainer');
    const paused = await page.evaluate(() => {
      const g = currentSurvivorRPG, before = g.survival.elapsed;
      for (let i = 0; i < 100; i++) g.testTick(0.05);
      return g.survival.elapsed === before;
    });
    assert.ok(paused);
    // Deterministic successful roll tests the real ball/input/transition path.
    await page.evaluate(() => {
      const g = currentSurvivorRPG, enemy = g.enemies[0];
      enemy.x = g.trainer.x + 70; enemy.y = g.trainer.y; enemy.hp = 1; enemy.setCaptureReady();
      g.captureSystem.tryCapture = () => ({ chance: 1, success: true });
    });
    await press('x');
    assert.equal(await page.evaluate(() => currentSurvivorRPG.transition?.type), 'capture');
    await page.evaluate(() => { const g = currentSurvivorRPG; for (let i = 0; i < 80; i++) g.testTick(0.05); });
    assert.equal(await page.evaluate(() => currentSurvivorRPG.survival.captures), 1);
    assert.equal(await page.evaluate(() => currentSurvivorRPG.ownedPokemon.length), 2);
    // Standing next to the nurse does not automatically heal; Z is required.
    await page.evaluate(() => {
      const g = currentSurvivorRPG;
      g.trainer.x = 1300; g.trainer.y = 350; g.player.hp = 1;
      g.testTick(0.05); g.camera.follow(g.trainer, 1); g.ui.update(g);
    });
    assert.equal(await page.evaluate(() => currentSurvivorRPG.player.hp), 1);
    await screenshot('survival-healer');
    await press('z');
    assert.ok(await page.evaluate(() => currentSurvivorRPG.partyPokemon.every((p) => p.hp === p.maxHp && !p.dead)));
    await page.evaluate(() => { currentSurvivorRPG.player.hp = 1; });
    await press('z');
    assert.equal(await page.evaluate(() => currentSurvivorRPG.player.hp), 1);
    // Save/load preserves progress and nurse cooldown, in this isolated browser only.
    const saved = await page.evaluate(() => {
      const g = currentSurvivorRPG;
      g.survival.elapsed = 340; g.survival.kills = 70; g.survival.healReadyAt = 355;
      const before = g.survival.serialize(); g.saveGame(); g.loadGame();
      g.menuOpen = false; g.ui.hideGameMenu(); return [before, g.survival.serialize()];
    });
    assert.deepEqual(saved[0], saved[1]);
    // Win, return, and keep the captured Pokemon.
    await page.evaluate(() => {
      const g = currentSurvivorRPG;
      g.healParty(); g.trainer.x = 1300; g.trainer.y = 950; g.startDeploy();
      g.survival.elapsed = 899.98; g.enemies = []; g.testTick(0.05); g.ui.update(g);
    });
    assert.equal(await page.evaluate(() => currentSurvivorRPG.mode), 'survivalClear');
    await screenshot('survival-clear');
    await page.locator('#survivalReturnBtn').click();
    assert.equal(await page.evaluate(() => currentSurvivorRPG.currentMapId), 'hub');
    assert.equal(await page.evaluate(() => currentSurvivorRPG.ownedPokemon.length), 2);
    // Defeat now starts a new journey with Oak, without an automatic Bulbasaur.
    await page.evaluate(() => {
      const g = currentSurvivorRPG; g.travelToArea('survival');
      g.partyPokemon.forEach((p) => { p.dead = true; p.hp = 0; });
      g.handleActiveFainted(); g.ui.update(g);
    });
    assert.equal(await page.evaluate(() => currentSurvivorRPG.survival.status), 'failed');
    await page.locator('#restartBtn').click();
    assert.equal(await page.evaluate(() => currentSurvivorRPG.ownedPokemon.length), 0);
    await page.locator('[data-starter="charmander"]').click();
    await page.locator('[data-change]').click();
    assert.equal(await page.evaluate(() => currentSurvivorRPG.partyPokemon[0].id), 'charmander');
    await page.evaluate(() => { const g = currentSurvivorRPG; g.healParty(); g.travelToArea('survival'); g.testTick(0.05); g.ui.update(g); });
    await page.setViewportSize({ width: 844, height: 390 });
    await screenshot('survival-mobile');
    assert.ok(await page.evaluate(() => {
      const hud = document.getElementById('survivalHud'), r = hud.getBoundingClientRect();
      const frame = document.querySelector('.screen-frame').getBoundingClientRect();
      return r.left >= frame.left && r.right <= frame.right && r.bottom <= frame.bottom && hud.scrollWidth <= hud.clientWidth;
    }));
    assert.deepEqual(errors, []);
    console.log('PASS: NPC sprites, survival, pause, capture, nurse, save/load, victory collection retention, defeat starter choice, mobile HUD');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
