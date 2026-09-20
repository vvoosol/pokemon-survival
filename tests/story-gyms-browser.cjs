const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const finishStoryBoot = async () => {
    await page.waitForFunction(() => window.currentSurvivorRPG || !document.getElementById('resumeSelectOverlay')?.hidden);
    if (!await page.evaluate(() => !!window.currentSurvivorRPG)) await page.locator('#resumeLoadBtn').click();
    await page.waitForFunction(() => window.currentSurvivorRPG?.storyRenderer && !window.currentSurvivorRPG.storyBusy);
  };
  try {
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8787/?mode=story&debug=1');
    await finishStoryBoot();
    // Isolated gym scenario. Overlevelled party shortens battles, but damage, AI,
    // participants, trainer roster, source events and rewards use production code.
    // This does not claim to test the overworld journey between the gyms.
    await page.evaluate(() => {
      const g = currentSurvivorRPG; g.suspended = true;
      g.story = SurvivorRPG.StoryState.create({map: 42, x: 14, y: 12});
      g.story.switches[64] = true; g.story.switches[347] = true;
      g.ownedPokemon = []; g.partyPokemon = []; g.reservePokemon = []; g.selectedPokemon = null;
      for (const species of ['BULBASAUR', 'CHARMANDER', 'SQUIRTLE', 'PIKACHU']) g.addStoryPokemon(species, 80);
      g.awaitingStarter = false; g.store.write(g.serializeRun());
      localStorage.setItem('scientistRpgSave', 'battle-mode-sentinel');
    });
    await page.reload();
    await finishStoryBoot();
    const setup = () => page.evaluate(() => {
      const g = currentSurvivorRPG; g.tick = g.update.bind(g); g.update = () => {};
      g.interpreter.host.wait = async () => {};
      window.drainStory = async promise => {
        let done = false, failure; promise.then(() => { done = true; }, e => { failure = e; done = true; });
        for (let i = 0; i < 100000 && !done; i++) {
          if (g.storyError) throw g.storyError;
          if (g.storyDialog.resolve) g.answerStory(0);
          g.tick(.05);
          if (i % 50 === 0 || !g.storyBattle) await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (failure) throw failure;
        if (!done) throw Error(`Story timed out: ${g.mode}, enemy=${g.enemies[0]?.hp}, player=${g.activePokemon?.hp}`);
        if (g.storyError) throw g.storyError;
      };
    });
    await setup();
    for (const [order, map, eventId, x, y] of [[1, 42, 16, 14, 12], [2, 57, 11, 17, 10], [3, 56, 7, 10, 7]]) {
      const result = await page.evaluate(async ({order, map, eventId, x, y}) => {
        const g = currentSurvivorRPG;
        g.storyBusy = true; await g.transferStory(map, x, y, 8); g.storyBusy = false;
        if (order > 1) { g.setBattleFormation(order === 2 ? 'single' : 'double'); g.menuOpen = false; g.ui.hideGameMenu(); }
        const event = g.storyRenderer.map.events[eventId];
        await drainStory(g.runStoryEvent(event, SurvivorRPG.StoryState.pageIndex(event, g.story, map)));
        const before = JSON.stringify(g.story.keyItems);
        await drainStory(g.runStoryEvent(event, SurvivorRPG.StoryState.pageIndex(event, g.story, map)));
        if (before !== JSON.stringify(g.story.keyItems)) throw Error('Duplicate rewards');
        g.setBattleFormation(['single', 'double', 'triple'][order - 1]);
        g.menuOpen = false; g.ui.hideGameMenu();
        if (!g.activePokemon) g.startDeploy();
        for (let i = 0; i < 30; i++) { g.tick(.05); await Promise.resolve(); }
        return {badges: g.story.badges, rewards: g.story.gymRewards, inventory: g.story.keyItems,
          members: g.partyBattle.members.length, items: g.items, formation: g.battleFormation, error: g.storyError?.message};
      }, {order, map, eventId, x, y});
      assert.equal(result.error, undefined); assert.equal(result.badges[order - 1], true);
      assert.equal(result.rewards.length, order); assert.equal(result.members, order - 1);
      assert.equal(result.inventory[['TM39', 'TM51', 'TM73'][order - 1]], 1);
      assert.equal(result.items.expShare, true);
      console.log(`PASS: native gym ${order}, real combat, source rewards, ${order} active Pokemon`);
    }
    const debugGym = await page.evaluate(async () => {
      const g = currentSurvivorRPG;
      g.debug = true;
      const snapshot = () => JSON.stringify({
        badges: g.story.badges,
        rewards: g.story.gymRewards,
        keyItems: g.story.keyItems,
        switches: g.story.switches,
        money: g.money,
        earned: g.runStats.earned
      });
      const before = snapshot();
      const counts = [];
      for (const order of [1, 2, 3]) {
        if (!g.startGymTrainerBattleDebug(order, 'strong')) throw Error(`Gym ${order} debug helper did not start`);
        for (let i = 0; i < 200 && !g.storyBattle?.engine; i++) {
          if (g.storyDialog.resolve) g.answerStory(0);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        const battle = g.storyBattle;
        if (!battle?.engine) throw Error(`Gym ${order} debug engine did not initialize`);
        counts.push([order, battle.engine.playerActive.length, battle.engine.opponentActive.length]);
        battle.finish(false);
        await Promise.resolve();
      }
      return { counts, unchanged: before === snapshot(), storyBattle: !!g.storyBattle };
    });
    assert.deepEqual(debugGym.counts, [[1, 1, 1], [2, 1, 1], [3, 2, 2]]);
    assert.equal(debugGym.unchanged, true);
    assert.equal(debugGym.storyBattle, false);
    console.log('PASS: Gym1/2/3 debug helpers use pre-unlock active counts and do not modify progress/rewards');
    const before = await page.evaluate(async () => {
      const g = currentSurvivorRPG;
      g.menuOpen = false;
      const leader = g.partyPokemon[0], reserve = g.partyPokemon[3];
      const original = g.partyPokemon.map(p => p.exp);
      g.awardParticipantExp({participants: new Set([leader.uniqueId]), expReward: 10});
      const on = g.partyPokemon.map((p, i) => p.exp - original[i]);
      g.toggleExpShare(); g.menuOpen = false; g.ui.hideGameMenu();
      const old = reserve.exp;
      g.awardParticipantExp({participants: new Set([leader.uniqueId]), expReward: 10});
      if (reserve.exp !== old) throw Error('Disabled EXP Share awarded reserve EXP');
      const frame = {mapId: 56, eventId: 7};
      await g.storyCommand({code: 202, parameters: [7, 0, 11, 6, 4]}, frame);
      await g.storyCommand({code: 116, parameters: []}, {mapId: 56, eventId: 4});
      if (!g.saveGame(true)) throw Error('Story save failed');
      return {story: structuredClone(g.story), on, inventory: {...g.items}};
    });
    assert.deepEqual(before.on, [10, 7, 7, 7]);
    assert.equal(before.story.keyItems.ROCKSMASHITEM, 1); assert.equal(before.story.keyItems.LIGHTBALL, 1);
    await page.reload();
    await finishStoryBoot();
    const after = await page.evaluate(() => {
      const g = currentSurvivorRPG; g.update = () => {};
      return {story: g.story, positions: g.storyPositions, erased: [...g.erasedStoryEvents], items: g.items,
        formation: g.battleFormation, battleSave: localStorage.getItem('scientistRpgSave')};
    });
    for (const key of ['badges', 'selfSwitches', 'keyItems', 'gymRewards', 'expShareEnabled', 'activeCount', 'mapEvents'])
      assert.deepEqual(after.story[key], before.story[key], key);
    assert.deepEqual(after.positions, before.story.mapEvents.positions);
    assert.deepEqual(after.erased, before.story.mapEvents.erased);
    assert.equal(after.items.expShareEnabled, false); assert.equal(after.formation, 'triple');
    assert.equal(after.battleSave, 'battle-mode-sentinel');
    await page.screenshot({path: path.join(__dirname, 'screenshots/story-three-gyms.png')});
    assert.deepEqual(errors, []);
    console.log('PASS: 70% reserve EXP, OFF, badges/items/self switches/moved+erased events/unlocks/formation reload; Battle save preserved');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
