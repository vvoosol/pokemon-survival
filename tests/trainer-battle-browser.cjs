const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const durationMs = Math.max(5_000, Number(process.argv[2] || process.env.STABILITY_MS || 30_000));
const sampleMs = Math.max(1_000, Math.min(30_000, Number(process.env.STABILITY_SAMPLE_MS || 10_000)));
const gameUrl = process.argv[3] || process.env.GAME_URL || 'http://127.0.0.1:8787/?mode=battle';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });

  try {
    await page.goto(gameUrl);
    await page.waitForFunction(() => window.currentSurvivorRPG?.trainer || window.__bootError);
    assert.equal(await page.evaluate(() => window.__bootError), undefined);

    const started = await page.evaluate(() => {
      const g = window.currentSurvivorRPG;
      g.debug = true;
      return window.startTrainerBattleDebug(6, 'strong');
    });
    assert.equal(started, true);
    await page.waitForFunction(() => currentSurvivorRPG.trainerBattle?.playerActive.length === 6
      && currentSurvivorRPG.trainerBattle?.opponentActive.length === 6);

    const initial = await page.evaluate(() => {
      const g = currentSurvivorRPG;
      const engine = g.trainerBattle;
      for (const actor of [...engine.playerParty, ...engine.opponentParty]) {
        actor.maxHp = 1_000_000_000;
        actor.hp = actor.maxHp;
        actor.dead = false;
        actor.fainted = false;
      }
      window.__trainerQaFrames = 0;
      window.__trainerQaRunning = true;
      const countFrame = () => {
        if (!window.__trainerQaRunning) return;
        window.__trainerQaFrames += 1;
        requestAnimationFrame(countFrame);
      };
      requestAnimationFrame(countFrame);
      return {
        playerActive: engine.playerActive.length,
        opponentActive: engine.opponentActive.length,
        profile: engine.aiProfile?.name || engine.aiProfileName || 'strong',
        saveBlocked: g.saveGame(true) === false,
        switchHidden: document.getElementById('switchActionBtn').hidden,
        ballHidden: document.querySelector('.ball-counter').hidden,
        partyText: document.getElementById('partyActionBtn').textContent,
        menuText: document.getElementById('menuActionBtn').textContent
      };
    });
    assert.equal(initial.playerActive, 6);
    assert.equal(initial.opponentActive, 6);
    assert.equal(initial.saveBlocked, true);
    assert.equal(initial.switchHidden, true);
    assert.equal(initial.ballHidden, true);
    assert.equal(initial.partyText, '교체');
    assert.equal(initial.menuText, 'PAUSE');

    const samples = [];
    let previousFrames = 0;
    let previousTime = Date.now();
    const sampleCount = Math.ceil(durationMs / sampleMs);
    for (let i = 0; i < sampleCount; i++) {
      const delay = Math.min(sampleMs, durationMs - i * sampleMs);
      if (delay > 0) await page.waitForTimeout(delay);
      const now = Date.now();
      const snapshot = await page.evaluate(() => {
        const g = currentSurvivorRPG;
        const c = g.combatSystem;
        return {
          frames: window.__trainerQaFrames,
          phase: g.trainerBattle?.phase,
          playerActive: g.trainerBattle?.playerActive.length,
          opponentActive: g.trainerBattle?.opponentActive.length,
          projectiles: c.projectiles.length,
          telegraphs: c.telegraphs.length,
          meleeSwings: c.meleeSwings.length,
          impacts: c.impacts.length,
          heapMb: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null
        };
      });
      snapshot.fps = (snapshot.frames - previousFrames) * 1000 / Math.max(1, now - previousTime);
      previousFrames = snapshot.frames;
      previousTime = now;
      samples.push(snapshot);
      console.log(`STABILITY ${i + 1}/${sampleCount}: fps=${snapshot.fps.toFixed(1)} heapMB=${snapshot.heapMb == null ? 'n/a' : snapshot.heapMb.toFixed(1)} projectiles=${snapshot.projectiles} telegraphs=${snapshot.telegraphs} melee=${snapshot.meleeSwings} impacts=${snapshot.impacts}`);
      assert.equal(snapshot.phase, 'active');
      assert.equal(snapshot.playerActive, 6);
      assert.equal(snapshot.opponentActive, 6);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const mobile = await page.evaluate(() => {
      const g = currentSurvivorRPG;
      const visible = id => {
        const el = document.getElementById(id);
        const rect = el?.getBoundingClientRect();
        return !!el && !el.hidden && rect.width > 0 && rect.height > 0;
      };
      return {
        width: innerWidth,
        height: innerHeight,
        playerActive: g.trainerBattle?.playerActive.length,
        opponentActive: g.trainerBattle?.opponentActive.length,
        partyVisible: visible('partyActionBtn'),
        menuVisible: visible('menuActionBtn'),
        ballHidden: document.querySelector('.ball-counter').hidden,
        switchHidden: document.getElementById('switchActionBtn').hidden
      };
    });
    assert.deepEqual([mobile.width, mobile.height], [390, 844]);
    assert.equal(mobile.playerActive, 6);
    assert.equal(mobile.opponentActive, 6);
    assert.equal(mobile.partyVisible, true);
    assert.equal(mobile.menuVisible, true);
    assert.equal(mobile.ballHidden, true);
    assert.equal(mobile.switchHidden, true);

    await page.evaluate(() => { window.__trainerQaRunning = false; });
    assert.deepEqual(errors, []);
    const fpsValues = samples.map(sample => sample.fps);
    const heapValues = samples.map(sample => sample.heapMb).filter(Number.isFinite);
    console.log('PASS: 6v6 strong trainer battle, save blocked, trainer controls, mobile viewport');
    console.log(JSON.stringify({
      durationMs,
      fpsMin: Math.min(...fpsValues),
      fpsAverage: fpsValues.reduce((sum, value) => sum + value, 0) / fpsValues.length,
      heapStartMb: heapValues.length ? heapValues[0] : null,
      heapEndMb: heapValues.length ? heapValues.at(-1) : null,
      maxProjectiles: Math.max(...samples.map(sample => sample.projectiles)),
      maxTelegraphs: Math.max(...samples.map(sample => sample.telegraphs)),
      maxMeleeSwings: Math.max(...samples.map(sample => sample.meleeSwings)),
      maxImpacts: Math.max(...samples.map(sample => sample.impacts))
    }));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
