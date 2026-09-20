const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8787/?mode=battle');
    await page.waitForFunction(() => window.currentSurvivorRPG?.trainer);
    await page.evaluate(() => {
      const g = currentSurvivorRPG;
      g.update = () => {};
      g.reset();
      g.setMap('hunting_01', {clearEnemies: true, movePlayer: true});
      g.mode = 'pokemon'; g.activePokemon = g.player;
      g.nextMoveForLevel = () => null;
      const events = g.player.gainExp(g.player.expToNext);
      events.forEach(event => g.enqueueLevelUp({...event, pokemon: g.player}));
      g.draw(); g.ui.update(g);
    });
    assert.equal(await page.evaluate(() => currentSurvivorRPG.mode), 'pokemon');
    assert.equal(await page.locator('#levelChoiceOverlay').isVisible(), false);
    assert.match(await page.locator('#levelToast').innerText(), /Lv\.5 → Lv\.6/);
    await page.screenshot({path: path.join(__dirname, 'screenshots/level-notice-desktop.png')});
    await page.evaluate(() => {
      const g = currentSurvivorRPG;
      while (g.player.level < 10) {
        g.player.gainExp(g.player.expToNext).forEach(event => g.enqueueLevelUp({...event, pokemon: g.player}));
      }
      for (let i = 0; i < 4; i++) g.updateProgressNotices(3);
      g.ui.update(g);
    });
    assert.equal(await page.locator('#levelChoiceOverlay').isVisible(), true);
    assert.match(await page.locator('#levelToast').innerText(), /Lv\.9 → Lv\.10/);
    assert.equal(await page.locator('#choiceCards > *').count(), 3);
    await page.screenshot({path: path.join(__dirname, 'screenshots/level-milestone-desktop.png')});
    await page.evaluate(() => {
      const g = currentSurvivorRPG;
      g.openNextLevelChoice();
      g.queueMoveLearning(g.player, 'waterGun', {pokemon: g.player, toLevel: 10});
      if (g.mode === 'moveLearn') g.selectMoveLearnChoice(0);
      g.updateProgressNotices(3); g.ui.update(g);
    });
    assert.match(await page.locator('#levelToast').innerText(), /배웠다!/);
    for (const viewport of [{width: 844, height: 390}, {width: 390, height: 844}]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(100);
      const rect = await page.locator('#levelToast').boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height);
      await page.screenshot({path: path.join(__dirname, `screenshots/learn-notice-${viewport.width}.png`)});
    }
    assert.deepEqual(errors, []);
    console.log('Level milestones, learning notice queue, desktop/mobile bounds: PASS');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
