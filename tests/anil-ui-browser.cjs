const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:720}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(r.url()); });
  const dir = path.join(__dirname,'screenshots'); fs.mkdirSync(dir,{recursive:true});
  const snapshot = name => page.screenshot({path:path.join(dir, name+'.png')});
  try {
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8787/?mode=battle');
    await page.waitForFunction(() => window.currentSurvivorRPG?.trainer || window.__bootError);
    assert.equal(await page.evaluate(() => window.__bootError),undefined);
    await page.evaluate(() => { const g=currentSurvivorRPG; g.testTick=g.update.bind(g); g.update=()=>{}; g.messageTimer=0; g.toggleMenu(); g.ui.update(g); });
    await snapshot('anil-pause');
    await page.locator('[data-view="pokemon"]').click();
    assert.equal(await page.locator('.anil-party-empty').count(),5);
    await snapshot('anil-party-one');
    await page.locator('[data-summary="0"]').click();
    assert.equal(await page.locator('.anil-move-row').count(),4);
    await snapshot('anil-summary-moves');
    for (const tab of ['info','stats','moves']) {
      await page.locator(`[data-page="${tab}"]`).click();
      await snapshot('anil-summary-'+tab);
    }
    await page.evaluate(() => {
      const g=currentSurvivorRPG;
      for (const id of ['charmander','squirtle','pikachu','pidgey','rattata']) {
        const p=g.createPartyPokemon(SurvivorRPG.PokemonData[id],800,620);
        g.partyPokemon.push(p); g.ownedPokemon.push(p);
      }
      g.partyPokemon[2].takeDamage(9999);
      g.openMenuView('pokemon');
    });
    await snapshot('anil-party-six');
    await page.locator('[data-summary="1"]').click();
    await page.locator('[data-down]').click();
    assert.equal(await page.evaluate(() => currentSurvivorRPG.partyPokemon[2].id),'charmander');
    await page.locator('[data-action="back"]').click();
    for (const [name,width,height] of [['mobile',844,390],['portrait',390,844]]) {
      await page.setViewportSize({width,height});
      for (const view of ['main','pokemon','summary']) {
        await page.evaluate(view => currentSurvivorRPG.openMenuView(view),view);
        await snapshot(`anil-${view}-${name}`);
        assert.ok(await page.evaluate(() => {
          const frame=document.querySelector('.screen-frame').getBoundingClientRect();
          const menu=document.querySelector('.menu-window').getBoundingClientRect();
          return Math.abs(frame.width/frame.height-16/9)<.001 && menu.top>=frame.top-1 && menu.bottom<=frame.bottom+1;
        }));
      }
    }
    await page.setViewportSize({width:1280,height:720});
    // Exercise real game-over button in an isolated context, including survival defeat.
    for (const survival of [false,true]) {
      await page.evaluate(survival => {
        const g=currentSurvivorRPG; g.reset(); if(survival)g.travelToArea('survival');else g.startDeploy();
        g.saveGame(); g.menuOpen=false;g.ui.hideGameMenu();g.activePokemon.takeDamage(99999);g.handleActiveFainted();g.ui.update(g);
      },survival);
      await page.locator('#restartBtn').click();
      assert.deepEqual(await page.evaluate(() => {
        const g=currentSurvivorRPG;g.ui.update(g);return [g.awaitingStarter,g.partyPokemon.length,g.ownedPokemon.length,g.currentMapId,localStorage.getItem('scientistRpgSave')];
      }),[true,0,0,'hub',null]);
      assert.ok(await page.evaluate(() => getComputedStyle(document.querySelector('.menu-window')).backgroundImage.includes('pause/bgTop.png')));
      await page.evaluate(() => { const g=currentSurvivorRPG;g.toggleMenu();g.backMenu();g.startDeploy();g.saveGame(); });
      assert.deepEqual(await page.evaluate(() => [currentSurvivorRPG.menuOpen,currentSurvivorRPG.mode,localStorage.getItem('scientistRpgSave')]),[true,'trainer',null]);
      await snapshot('anil-starter-after-defeat');
      await page.locator('[data-starter="squirtle"]').click();
      await page.locator('[data-change]').click();
      assert.deepEqual(await page.evaluate(() => {const g=currentSurvivorRPG;return [g.awaitingStarter,g.menuOpen,g.partyPokemon[0].id,g.partyPokemon.length,g.player.hp===g.player.maxHp];}),[false,false,'squirtle',1,true]);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: native menus, 6 party slots, summary tabs/reorder, mobile ratio, normal/survival defeat starter flow');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
