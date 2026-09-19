const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
async function setupStoryDriver(page) {
return page.evaluate(() => {
      const g = currentSurvivorRPG;
      g.interpreter.host.wait = async () => {};
      g.tick = g.update.bind(g); g.update = () => {};
      window.storyStep = async () => {
        if (g.storyDialog.resolve) g.answerStory(0);
        if (g.storyError) throw g.storyError;
        g.tick(.05); await new Promise(resolve => setTimeout(resolve, 0));
      };
      window.settleStory = async () => {
        let stable = 0;
        for (let i = 0; i < 240 && stable < 3; i++) {
          if (g.storyDialog.resolve) g.answerStory(0);
          if (g.storyError) throw g.storyError;
          if (!g.storyBusy) g.tick(.05);
          await new Promise(resolve => setTimeout(resolve, 0));
          const blocked = new Set(g.storyOutdoorPlan().blocked);
          const pendingAutorun = g.storyRenderer.activeEvents(g.story).some(({event, pageIndex, page}) =>
            page.trigger === 3 && !g.erasedStoryEvents.has(event.id) && !blocked.has(event.id) && !g.autoruns.has(`${event.id}:${pageIndex}`));
          stable = !g.storyBusy && !g.storyDialog.resolve && !pendingAutorun ? stable + 1 : 0;
        }
        if (stable < 3) throw Error('Story autoruns did not settle');
      };
      window.storyWalk = async (tx, ty) => {
        const width = g.storyRenderer.map.width, height = g.storyRenderer.map.height;
        const start = [Math.floor(g.trainer.x / 32), Math.floor(g.trainer.y / 32)];
        const queue = [start], previous = new Map([[start.join(','), null]]);
        for (let i = 0; i < queue.length; i++) {
          const point = queue[i]; if (point[0] === tx && point[1] === ty) break;
          for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
            const next = [point[0] + dx, point[1] + dy], key = next.join(',');
            if (next[0] < 0 || next[1] < 0 || next[0] >= width || next[1] >= height || previous.has(key)) continue;
            if (!SurvivorRPG.MovementSystem.canStand(g.map, next[0] * 32 + 16, next[1] * 32 + 16, 10)) continue;
            previous.set(key, point); queue.push(next);
          }
        }
        let destination = [tx, ty];
        if (!previous.has(`${tx},${ty}`)) {
          destination = [[tx, ty-1], [tx-1, ty], [tx+1, ty], [tx, ty+1]].find(point => previous.has(point.join(',')));
          if (!destination) throw Error(`No walkable path to ${tx},${ty} on ${g.story.mapId}`);
        }
        const points = []; let cursor = destination;
        while (cursor) { points.unshift(cursor); cursor = previous.get(cursor.join(',')); }
        const map = g.storyRenderer.map;
        for (const [x, y] of points) {
          for (let step = 0; step < 200; step++) {
            const dx = x * 32 + 16 - g.trainer.x, dy = y * 32 + 16 - g.trainer.y;
            if (Math.hypot(dx, dy) < 6) break;
            g.input.joystickVector = Math.abs(dx) > Math.abs(dy) ? {x: Math.sign(dx), y: 0} : {x: 0, y: Math.sign(dy)};
            await storyStep();
            if (g.storyRenderer.map !== map) { g.input.joystickVector = {x: 0, y: 0}; return; }
            if (step === 199) throw Error(`Movement stalled at ${x},${y}`);
          }
        }
        g.input.joystickVector = {x: Math.sign(tx - destination[0]), y: Math.sign(ty - destination[1])};
        for (let i = 0; i < 20; i++) await storyStep();
        g.input.joystickVector = {x: 0, y: 0};
      };
    });
}
async function opening(afterOpening) {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const baseUrl = process.env.STORY_TEST_URL || 'http://127.0.0.1:8787/';
    await page.goto(baseUrl + '?mode=story');
    await page.waitForFunction(() => window.currentSurvivorRPG?.interpreter && !window.currentSurvivorRPG.storyBusy && window.currentSurvivorRPG.story?.mapId === 2);
    await setupStoryDriver(page);
    assert.equal(await page.evaluate(() => currentSurvivorRPG.story.mapId), 2);
    assert.equal(await page.evaluate(() => currentSurvivorRPG.map.name), '태초마을');
    assert.equal(await page.evaluate(() => currentSurvivorRPG.storyDialog.resolve), null);
    await page.evaluate(() => settleStory());
    await page.evaluate(async () => {
      const g = currentSurvivorRPG;
      const plan = g.storyOutdoorPlan();
      if (![5, 6, 7, 8, 11, 12, 13, 14].every(id => plan.blocked.includes(id))) throw Error('Pallet indoor entrances are not blocked');
      const oak = g.storyProxyNpcs.find(npc => npc.id === 'oak-starter');
      if (!oak) throw Error('Outdoor Oak proxy is missing');
      g.trainer.x = (oak.x + .5) * 32;
      g.trainer.y = (oak.y + 1.5) * 32;
      g.input.joystickVector = {x: 0, y: 0};
      g.tick(.05);
      if (g.nearbyNpc?.id !== 'oak-starter') throw Error('Oak is not interactable from the adjacent outdoor tile');
    });
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('z');
    await page.evaluate(async () => { for (let i = 0; i < 120; i++) await storyStep(); });
    await page.keyboard.up('z');
    await page.keyboard.up('ArrowUp');
    assert.equal(await page.evaluate(() => currentSurvivorRPG.partyPokemon[0]?.speciesId), 'bulbasaur');
    assert.equal(await page.evaluate(() => currentSurvivorRPG.story.switches[60]), true);
    assert.equal(await page.evaluate(() => currentSurvivorRPG.story.switches[347]), true);
    assert.equal(await page.evaluate(() => currentSurvivorRPG.story.mapId), 2);
    await page.screenshot({path: path.join(__dirname, 'screenshots/story-starter.png')});
    const saved = await page.evaluate(() => currentSurvivorRPG.saveGame(true));
    assert.equal(saved, true);
    await page.reload(); await page.waitForFunction(() => currentSurvivorRPG?.storyRenderer && !currentSurvivorRPG.storyBusy);
    assert.equal(await page.evaluate(() => currentSurvivorRPG.partyPokemon[0]?.speciesId), 'bulbasaur');
    assert.deepEqual(errors, []);
    console.log('PASS: outdoor Pallet start, outdoor Oak starter, indoor entrances blocked and story reload');
    if (afterOpening) { await setupStoryDriver(page); await afterOpening(page); }
  } finally { await browser.close(); }
}
module.exports = opening;
if (require.main === module) opening().catch(error => { console.error(error); process.exitCode = 1; });
