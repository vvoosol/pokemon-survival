// Continuous progression from the native opening. Never seed progress flags.
const assert = require('node:assert/strict');
require('./story-opening-browser.cjs')(async page => {
  await page.evaluate(async () => {
    const g = currentSurvivorRPG;
    // Let the production battle/choice logic progress while the walker waits.
    const step = window.storyStep;
    window.storyStep = async () => {
      await step();
      if (g.storyBattle) {
        const vector = g.input.joystickVector; g.input.joystickVector = {x: 0, y: 0};
        for (let i = 0; i < 20000 && g.storyBattle; i++) {
          if (g.mode === 'levelChoice') g.selectLevelChoice(0);
          if (g.mode === 'moveLearn') g.selectMoveLearnChoice(4);
          await step();
        }
        if (g.storyBattle) throw Error(`Battle stalled: ${g.mode}`);
        g.input.joystickVector = vector;
      }
    };
    await storyWalk(12, 21);
    for (let i = 0; i < 2000 && (g.storyBusy || g.story.mapId !== 2); i++) await storyStep();
    if (g.story.mapId !== 2) throw Error(`Lab exit stalled: ${g.story.mapId}, ${g.mode}, pos=${g.trainer.x / 32},${g.trainer.y / 32}, vars=${JSON.stringify(g.story.variables)}, frame=${JSON.stringify(g.story.eventCheckpoint)}`);
    await storyWalk(21, 0);
    for (let i = 0; i < 1000 && (g.storyBusy || g.story.mapId !== 3); i++) await storyStep();
    if (g.story.mapId !== 3) throw Error(`Route 1 exit stalled: ${g.story.mapId}, ${g.mode}`);
    console.log('Route 1 entered');
  });
  assert.equal(await page.evaluate(() => currentSurvivorRPG.storyError?.message), undefined);
  console.log('PASS: continuous opening, starter, rival event, Pallet and Route 1');
}).catch(error => { console.error(error); process.exitCode = 1; });
