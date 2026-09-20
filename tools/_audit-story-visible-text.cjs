const {chromium} = require('playwright');

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  try {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('http://127.0.0.1:8787/?mode=story');
    await page.waitForFunction(() => window.currentSurvivorRPG?.storyRenderer?.map);
    const result = await page.evaluate(async () => {
      const g = currentSurvivorRPG;
      if (g.storyDialog?.resolve) g.answerStory(0);
      const ids = [...g.storyPlayableMapIds(), 29, 31, 36, 42, 43, 48, 56, 57, 60, 62, 63, 70];
      const seen = new Set();
      const candidates = [];
      const spanish = /[¿¡]|\b(?:el|la|los|las|de|del|una?|que|por|para|con|sin|pero|como|está|esto|eres|tienes|puedes|quieres|ciudad|ruta|líder|entrenador|pokémon)\b/i;
      const english = /\b(?:the|you|your|is|are|was|were|to|and|with|from|this|that|can|will|have|has|not|please|choose|continue)\b/i;
      for (const id of [...new Set(ids)]) {
        let map;
        try { map = await g.loadStorySourceMap(id); } catch { continue; }
        for (const event of Object.values(map.events || {})) {
          for (let pageIndex = 0; pageIndex < (event.pages || []).length; pageIndex++) {
            const list = event.pages[pageIndex]?.list || [];
            for (const command of list) {
              let values = [];
              if (command.code === 101 || command.code === 401) values = [command.parameters?.[0]];
              else if (command.code === 102) values = command.parameters?.[0] || [];
              for (const value of values) {
                if (typeof value !== 'string' || !value.trim()) continue;
                const translated = g.storyText(value);
                const key = `${id}:${event.id}:${pageIndex}:${value}`;
                if (seen.has(key)) continue;
                seen.add(key);
                if (spanish.test(translated) || english.test(translated)) {
                  candidates.push({mapId: id, mapName: g.storyMapName(map.name), eventId: event.id, pageIndex, raw: value, translated});
                }
              }
            }
          }
        }
      }
      return candidates;
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
