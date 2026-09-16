const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // An isolated context never reads or changes the player's browser save.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(response.url()); });
  const out = path.join(__dirname, 'screenshots');
  fs.mkdirSync(out, { recursive: true });
  try {
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8787/');
    await page.waitForFunction(() => window.currentSurvivorRPG?.trainer || window.__bootError);
    assert.equal(await page.evaluate(() => window.__bootError), undefined);
    await page.evaluate(() => document.fonts.ready);
    const assets = await page.evaluate(() => {
      const adapter = SurvivorRPG.MoveVisualAdapter;
      const missing = [];
      for (const [file, flight, hit] of Object.values(adapter.sheets)) {
        for (const frame of new Set([...flight, ...hit])) {
          if (!adapter.bounds.has(file + ':' + frame)) missing.push(file + ':' + frame);
        }
      }
      // Every mapped move must produce visible pixels without a generated fallback.
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      for (const move of Object.values(SurvivorRPG.MoveData)) {
        ctx.clearRect(0, 0, 96, 96);
        adapter.draw(ctx, currentSurvivorRPG.assets, move, 48, 48, 64, 0);
        if (!ctx.getImageData(0, 0, 96, 96).data.some((n, i) => i % 4 === 3 && n > 0)) missing.push(move.id);
      }
      return { missing, bounds: adapter.bounds.size };
    });
    assert.deepEqual(assets.missing, []);
    console.log('Asset frames:', assets.bounds);
    await page.evaluate(() => {
      const g = currentSurvivorRPG, R = SurvivorRPG;
      g.startDeploy();
      const p = g.activePokemon;
      p.equippedMoves = p.normalizeMoveSlots(['ember', 'waterGun', 'razorLeaf', 'seedBomb']);
      const enemy = new R.WildPokemon({ ...g.spawnSystem.scaledWildData(R.PokemonData.rattata, 5),
        hp: 1000, maxHp: 1000 }, p.x + 140, p.y, 'test');
      enemy.update = () => {};
      g.enemies = [enemy];
      g.combatSystem.clear();
    });
    await page.waitForFunction(() => currentSurvivorRPG.combatSystem.projectiles.length > 0);
    await page.waitForFunction(() => currentSurvivorRPG.enemies[0].hp < 1000);
    assert.ok(await page.evaluate(() => {
      const g = currentSurvivorRPG;
      return g.activePokemon.equippedMoves.every((s) => Number.isFinite(s.cooldownRemaining) && s.cooldownRemaining > 0)
        && Number.isFinite(g.enemies[0].hp);
    }));
    // Start a hostile cast, then change player through the actual keyboard input path.
    await page.evaluate(() => {
      const g = currentSurvivorRPG, R = SurvivorRPG;
      const next = g.createPartyPokemon(R.PokemonData.pikachu, g.player.x, g.player.y, {});
      g.partyPokemon.push(next); g.ownedPokemon.push(next);
      g.combatSystem.clear();
      const enemy = g.enemies[0];
      enemy.x = g.player.x + 80; enemy.y = g.player.y;
      g.combatSystem.telegraphs.push(g.combatSystem.createCast(enemy, g.player, R.MoveData.ember, 0, 'enemy', 0.42));
    });
    await page.keyboard.press('x');
    await page.waitForFunction(() => currentSurvivorRPG.activePokemon?.id === 'pikachu');
    await page.waitForFunction(() => currentSurvivorRPG.activePokemon.hp < currentSurvivorRPG.activePokemon.maxHp);
    console.log('PASS: live update loop, independent cooldowns, keyboard switch and incoming damage');
    await page.evaluate(() => {
      const g = currentSurvivorRPG, R = SurvivorRPG;
      g.reset();
      g.update = () => {};
      g.startDeploy();
      g.switchFlash = null; g.messageTimer = 0;
      const p = g.activePokemon;
      p.x = g.camera.x + 570; p.y = g.camera.y + 355;
      p.equippedMoves = ['ember', 'waterGun', 'razorLeaf', 'seedBomb'].map((moveId, i) =>
        ({ moveId, upgradeLevel: 0, cooldownRemaining: i * 0.5 + 0.3 }));
      g.enemies = ['vulpix', 'poliwag', 'pikachu', 'oddish'].map((id, i) => {
        const angle = [-0.75, 0.6, 2.7, -2.4][i];
        return new R.WildPokemon(g.spawnSystem.scaledWildData(R.PokemonData[id], 5),
          p.x + Math.cos(angle) * 180, p.y + Math.sin(angle) * 180, 'test');
      });
      g.combatSystem.clear();
      p.equippedMoves.forEach((slot, i) => {
        const cast = g.combatSystem.createCast(p, g.enemies[i], R.MoveData[slot.moveId]);
        g.combatSystem.release(cast, p, g.enemies);
      });
      g.combatSystem.updateProjectiles(0.13, p, g.enemies);
      g.draw(); g.ui.update(g);
    });
    for (const [name, width, height] of [['desktop', 1280, 720], ['wide', 1920, 1080],
      ['mobile-landscape', 844, 390], ['mobile-portrait', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(() => {
        const r = document.querySelector('.screen-frame').getBoundingClientRect();
        return Math.abs(r.width - Math.min(innerWidth, innerHeight * 16 / 9)) < 1;
      });
      const layout = await page.evaluate(() => {
        const frame = document.querySelector('.screen-frame').getBoundingClientRect();
        const hud = document.querySelector('.move-hud').getBoundingClientRect();
        return { ratio: frame.width / frame.height, x: frame.x, y: frame.y,
          frameRight: frame.right, frameBottom: frame.bottom,
          hudInside: hud.left >= frame.left && hud.right <= frame.right && hud.bottom <= frame.bottom,
          truncated: [...document.querySelectorAll('.move-label')].filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent) };
      });
      assert.ok(Math.abs(layout.ratio - 16 / 9) < 0.001);
      assert.ok(layout.x >= -1 && layout.y >= -1 && layout.hudInside);
      assert.deepEqual(layout.truncated, []);
      await page.screenshot({ path: path.join(out, name + '.png') });
      console.log(name, JSON.stringify(layout));
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    for (const moveId of ['vineWhip', 'razorLeaf']) {
      await page.evaluate((moveId) => {
        const g = currentSurvivorRPG, p = g.activePokemon;
        g.combatSystem.clear();
        const target = g.enemies[0]; target.x = p.x + 260; target.y = p.y;
        g.enemies = [target];
        p.equippedMoves = p.normalizeMoveSlots([{ moveId, cooldownRemaining: 2 }]);
        const cast = g.combatSystem.createCast(p, target, SurvivorRPG.MoveData[moveId]);
        g.combatSystem.release(cast, p, []);
      }, moveId);
      let previousX = 0;
      for (const [stage, dt] of [['early', 0.12], ['late', 0.24]]) {
        const shot = await page.evaluate((dt) => {
          const g = currentSurvivorRPG;
          g.combatSystem.updateProjectiles(dt, g.activePokemon, []);
          g.draw(); g.ui.update(g);
          const shot = g.combatSystem.projectiles[0];
          return { x: shot.x, diameter: shot.radius * 2, beam: shot.beam };
        }, dt);
        assert.ok(shot.x > previousX); previousX = shot.x;
        assert.equal(shot.beam, false);
        assert.equal(shot.diameter, moveId === 'vineWhip' ? 96 : 64);
        await page.screenshot({ path: path.join(out, moveId + '-' + stage + '.png') });
      }
    }
    console.log('PASS: large Vine Whip/Razor Leaf projectiles visibly travel across frames');
    await page.evaluate(() => {
      const g = currentSurvivorRPG, p = g.activePokemon;
      g.combatSystem.clear();
      const enemy = g.enemies[0];
      enemy.x = p.x + 70; enemy.y = p.y;
      enemy.hp = enemy.maxHp = 1000;
      g.enemies = [enemy];
      p.equippedMoves = p.normalizeMoveSlots([{ moveId: 'tackle', cooldownRemaining: 2 }]);
      g.combatSystem.telegraphs.push(g.combatSystem.createCast(p, enemy, SurvivorRPG.MoveData.tackle));
    });
    for (const [name, dt, shouldHit] of [['tackle-prepare', 0.45, false], ['tackle-release', 0.17, false],
      ['tackle-lunge', 0.07, false], ['tackle-impact', 0.07, true]]) {
      const state = await page.evaluate((dt) => {
        const g = currentSurvivorRPG;
        g.combatSystem.update(dt, g.activePokemon, g.enemies, false);
        g.draw(); g.ui.update(g);
        return { hp: g.enemies[0].hp, pose: g.combatSystem.poseFor(g.activePokemon) };
      }, dt);
      assert.equal(state.hp < 1000, shouldHit);
      if (name === 'tackle-prepare') assert.ok(state.pose.offset < 0);
      if (name === 'tackle-lunge') assert.ok(state.pose.offset > 0);
      await page.screenshot({ path: path.join(out, name + '.png') });
    }
    console.log('PASS: tackle preparation, forward motion and delayed impact in browser');
    await page.locator('#fullscreenBtn').click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    assert.ok(await page.evaluate(() => {
      const r = document.querySelector('.screen-frame').getBoundingClientRect();
      return Math.abs(r.width / r.height - 16 / 9) < 0.001;
    }));
    await page.evaluate(() => document.exitFullscreen());
    await page.evaluate(() => { const g = currentSurvivorRPG; g.startRecall(); g.toggleMenu(); g.ui.update(g); });
    assert.ok(await page.evaluate(() => currentSurvivorRPG.menuOpen));
    await page.screenshot({ path: path.join(out, 'menu.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: source sprites, desktop/mobile layout, fullscreen and no browser errors');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
