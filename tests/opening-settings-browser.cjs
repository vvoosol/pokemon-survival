const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const base = process.env.GAME_BASE_URL || 'http://127.0.0.1:8794/dist/index.html';
  const screenshots = path.join(__dirname, 'screenshots');
  fs.mkdirSync(screenshots, {recursive: true});
  try {
    for (const mode of ['story', 'battle']) {
      const page = await browser.newPage({viewport: {width: 1280, height: 720}, hasTouch: true});
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
      const url = new URL(base); url.searchParams.set('mode', mode);
      await page.goto(url.href);
      await page.waitForFunction(mode => {
        const g = window.currentSurvivorRPG;
        return g && document.getElementById('bootStatus').hidden && (mode !== 'story' ||
          (g.story.mapId === 2 && !g.storyBusy && !g.storyDialog.resolve && g.map.npcs.length));
      }, mode);
      const before = await page.evaluate(mode => {
        const g = currentSurvivorRPG;
        if (mode === 'story') g.addStoryPokemon('BULBASAUR', 5);
        g.money = 4321;
        g.tick = g.update.bind(g); g.update = () => {};
        return {ids: g.ownedPokemon.map(p => p.uniqueId), map: g.currentMapId, money: g.money};
      }, mode);
      await page.keyboard.press('Enter');
      await page.evaluate(() => currentSurvivorRPG.tick(.016));
      assert.equal(await page.locator('[data-view="mart"]').count(), 0);
      assert.equal(await page.evaluate(() => SurvivorRPG.Maps.hub.npcs.some(n => n.type === 'SHOP')), false);
      assert.equal(await page.evaluate(() => SurvivorRPG.Maps.hub.objects.some(o => o.art === 'shop')), false);
      await page.locator('button[data-view="settings"]').click();
      for (const viewport of [{width:1280,height:720}, {width:1920,height:1080}, {width:390,height:844}, {width:844,height:390}]) {
        await page.setViewportSize(viewport);
        await page.waitForFunction(() => {
          const r = document.getElementById('screenFrame').getBoundingClientRect();
          return r.x >= -1 && r.y >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 &&
            Math.abs(r.width - Math.min(innerWidth, innerHeight * 16 / 9)) < 1;
        });
        for (const view of ['settings', 'pokemon', 'summary', 'bag', 'pokedex', 'report']) {
          await page.evaluate(view => currentSurvivorRPG.openMenuView(view), view);
          const result = await page.evaluate(() => {
            const g = currentSurvivorRPG; g.draw();
            const f = document.getElementById('screenFrame').getBoundingClientRect();
            const panel = document.querySelector('.menu-window').getBoundingClientRect();
            const css = getComputedStyle(document.getElementById('mainMenuOverlay'));
            const pixels = g.ctx.getImageData(0, 0, 1280, 720).data;
            let colored = 0;
            for (let i = 0; i < pixels.length; i += 64) if (Math.max(...pixels.slice(i, i+3)) > 50) colored++;
            return {inside: panel.x >= f.x-1 && panel.y >= f.y-1 && panel.right <= f.right+1 && panel.bottom <= f.bottom+1,
              ratio: f.width/f.height, backdrop: css.backgroundImage, alpha: css.backgroundColor, colored};
          });
          assert.equal(result.inside, true, `${mode} ${view} ${JSON.stringify(viewport)}`);
          assert.ok(Math.abs(result.ratio - 16/9) < .01);
          assert.equal(result.backdrop, 'none');
          assert.match(result.alpha, /0\.28/);
          assert.ok(result.colored > 1000, 'Field must remain rendered behind the panel');
        }
        await page.evaluate(() => currentSurvivorRPG.openMenuView('settings'));
        if (viewport.width === 1280 || viewport.width === 390)
          await page.screenshot({path: path.join(screenshots, `settings-${mode}-${viewport.width}.png`)});
        if (mode === 'story') {
          await page.evaluate(() => {
            const g = currentSurvivorRPG; g.menuOpen = false; g.ui.hideGameMenu();
            void g.askStory('오박사: 모험을 계속해 보렴!', ['확인']);
          });
          assert.equal(await page.evaluate(() => {
            const d = document.querySelector('.story-dialog'), r = d.getBoundingClientRect();
            const f = document.getElementById('screenFrame').getBoundingClientRect();
            return d.parentElement.id === 'screenFrame' && r.x >= f.x && r.y >= f.y && r.right <= f.right && r.bottom <= f.bottom;
          }), true);
          if (viewport.width === 390) await page.screenshot({path:path.join(screenshots,'dialog-mobile.png')});
          await page.locator('.story-dialog button').click();
          await page.evaluate(() => {currentSurvivorRPG.menuOpen = true; currentSurvivorRPG.openMenuView('settings');});
        }
      }
      // A failed save must leave the game and existing report intact.
      await page.evaluate(() => {
        const g = currentSurvivorRPG, save = g.saveGame;
        g.saveGame = () => false;
        if (g.returnToOpening() !== false) throw Error('Failed save allowed navigation');
        g.saveGame = save;
      });
      assert.ok(page.url().includes('mode='));
      await page.locator('[data-action="opening"]').tap();
      await page.waitForSelector('#modeSelectOverlay:not([hidden])');
      assert.equal(new URL(page.url()).searchParams.has('mode'), false);
      await page.locator(mode === 'story' ? '#storyModeBtn' : '#battleModeBtn').tap();
      await page.waitForSelector('#resumeSelectOverlay:not([hidden])');
      assert.match(await page.locator('#resumeSelectTitle').textContent(), /저장 기록/);
      assert.match(await page.locator('#resumeSelectMeta').textContent(), /플레이 .*위치 .*선두/);
      assert.equal(await page.evaluate(() => typeof window.startTrainerBattleDebug), 'undefined');
      await page.locator('#resumeLoadBtn').tap();
      await page.waitForFunction(() => window.currentSurvivorRPG && document.getElementById('bootStatus').hidden && !currentSurvivorRPG.storyBusy);
      const after = await page.evaluate(() => {
        const g = currentSurvivorRPG;
        return {ids:g.ownedPokemon.map(p=>p.uniqueId),map:g.currentMapId,money:g.money};
      });
      assert.deepEqual(after, before);

      await page.evaluate(() => currentSurvivorRPG.returnToOpening());
      await page.waitForSelector('#modeSelectOverlay:not([hidden])');
      await page.locator(mode === 'story' ? '#storyModeBtn' : '#battleModeBtn').tap();
      await page.waitForSelector('#resumeSelectOverlay:not([hidden])');
      await page.keyboard.press('x');
      await page.waitForSelector('#newGameConfirmOverlay:not([hidden])');
      assert.ok(await page.evaluate(mode => !!localStorage.getItem(mode === 'story' ? 'scientistRpgStorySave' : 'scientistRpgSave'), mode));
      await page.keyboard.press('x');
      await page.waitForSelector('#resumeSelectOverlay:not([hidden])');
      await page.keyboard.press('x');
      await page.waitForSelector('#newGameConfirmOverlay:not([hidden])');
      await page.locator('#newGameConfirmBtn').tap();
      await page.waitForFunction(mode => !localStorage.getItem(mode === 'story' ? 'scientistRpgStorySave' : 'scientistRpgSave'), mode);
      assert.deepEqual(errors, []);
      console.log(`PASS ${mode}: saved opening return, load/restart prompt, no mart, field backdrop and bounded menus/dialog on four viewports`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
