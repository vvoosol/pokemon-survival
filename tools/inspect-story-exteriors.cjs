const man = require('../assets/story/manifest.json');

const exteriorIds = [2,3,4,5,6,7,8,9,10,12,14,15,16,17,18,19,20,22,23,24,27,69,71,72,107,155,156,158];
if (!process.argv.includes('--interiors')) for (const id of exteriorIds) {
  const entry = man.maps[id];
  if (!entry) continue;
  const map = require(`../assets/story/maps/${id}.json`);
  for (const event of Object.values(map.events || {})) {
    for (let pageIndex = 0; pageIndex < event.pages.length; pageIndex++) {
      const list = event.pages[pageIndex].list || [];
      for (const command of list) {
        if (command.code !== 201) continue;
        console.log(`${id}\t${entry.name}\tev${event.id}\t${event.x},${event.y}\tp${pageIndex}\t${command.parameters.join(',')}`);
      }
    }
  }
}

if (process.argv.includes('--interiors')) {
  const interiorIds = [28,29,30,31,32,34,36,37,38,40,41,42,43,44,45,48,49,50,51,52,53,54,56,57,60,61,62,63,70,159,217];
  for (const id of interiorIds) {
    const entry = man.maps[id];
    if (!entry) continue;
    const map = require(`../assets/story/maps/${id}.json`);
    console.log(`\n## ${id} ${entry.name}`);
    for (const event of Object.values(map.events || {})) {
      for (let pageIndex = 0; pageIndex < event.pages.length; pageIndex++) {
        const page = event.pages[pageIndex], list = page.list || [];
        if (!list.some(command => command.code !== 0)) continue;
        const text = list.filter(command => command.code === 101 || command.code === 401)
          .map(command => command.parameters[0]).join(' / ').slice(0, 180);
        const scripts = list.filter(command => command.code === 355 || command.code === 655 || command.code === 121 || command.code === 123)
          .map(command => command.code === 121 ? `switch:${command.parameters.join(',')}` : command.code === 123 ? `self:${command.parameters.join(',')}` : command.parameters[0])
          .join(' | ').slice(0, 240);
        const transfers = list.filter(command => command.code === 201).map(command => command.parameters.join(',')).join(' | ');
        console.log(`ev${event.id}@${event.x},${event.y} p${pageIndex} trig${page.trigger} gfx=${page.graphic.character_name || '-'} :: ${text} :: ${scripts}${transfers ? ` :: -> ${transfers}` : ''}`);
      }
    }
  }
}
