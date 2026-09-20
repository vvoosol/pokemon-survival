const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8793/dist/index.html?mode=story');
    await page.waitForFunction(() => window.currentSurvivorRPG?.storyDialog?.resolve);
    await page.evaluate(() => currentSurvivorRPG.answerStory(0));
    await page.waitForFunction(() => document.getElementById('bootStatus').hidden && !currentSurvivorRPG.storyBusy);

    const route3 = await page.evaluate(async () => {
      const g = currentSurvivorRPG;
      await g.transferStory(107, 34, 9, 2);
      g.menuOpen = true;
      g.openMenuView('settings');
      document.querySelector('[data-action="worldMap"]').click();
      return {
        view: document.getElementById('mainMenuOverlay').dataset.view,
        current: document.querySelector('.story-map-stop.current')?.textContent.trim(),
        status: document.querySelector('.story-map-status strong')?.textContent.trim()
      };
    });
    assert.equal(route3.view, 'worldMap');
    assert.equal(route3.current, '3번도로');
    assert.match(route3.status, /3번도로/);

    const backView = await page.evaluate(() => {
      currentSurvivorRPG.backMenu();
      return document.getElementById('mainMenuOverlay').dataset.view;
    });
    assert.equal(backView, 'settings');

    const moon = await page.evaluate(async () => {
      const g = currentSurvivorRPG;
      await g.transferStory(11, 30, 54, 8);
      g.openMenuView('worldMap');
      return {
        current: document.querySelector('.story-map-stop.current')?.textContent.trim(),
        status: document.querySelector('.story-map-status strong')?.textContent.trim()
      };
    });
    assert.equal(moon.current, '달맞이산');
    assert.match(moon.status, /달맞이산/);
    assert.deepEqual(errors, []);
    console.log('PASS: Settings world map highlights Route 3 and Mt. Moon and returns to Settings');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
