const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8787/?mode=story');
    await page.waitForFunction(() => window.currentSurvivorRPG?.storyData
      && window.SurvivorRPG?.MoveVisualAdapter?.bounds?.size);

    const result = await page.evaluate(() => {
      const game = window.currentSurvivorRPG;
      const adapter = window.SurvivorRPG.MoveVisualAdapter;
      const measure = (moveId) => {
        const move = window.SurvivorRPG.MoveData[moveId];
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 160;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        adapter.draw(ctx, game.assets, move, 80, 80, move.width, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
        for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
          if (!pixels[(y * canvas.width + x) * 4 + 3]) continue;
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
        return {
          moveId,
          hitboxWidth: move.width,
          drawSize: adapter.getDrawSize(move, move.width),
          renderedWidth: right - left + 1,
          renderedHeight: bottom - top + 1
        };
      };
      return [measure('story_aircutter'), measure('story_shockwave')];
    });

    for (const projectile of result) {
      assert.equal(projectile.hitboxWidth, 48);
      assert.equal(projectile.drawSize, 64);
      assert.ok(Math.max(projectile.renderedWidth, projectile.renderedHeight) >= 60,
        `${projectile.moveId} rendered too small: ${JSON.stringify(projectile)}`);
    }
    console.log('PASS: story projectile hitboxes stay 48px while visuals render at the stable 64px floor');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
