const maps = [2,3,4,9,15,19,158];
for (const id of maps) {
  const map = require(`../assets/story/maps/${id}.json`);
  console.log(`\nMAP ${id} ${map.name}`);
  for (const event of Object.values(map.events)) {
    const texts = event.pages.flatMap(page => page.list.filter(c => c.code === 101 || c.code === 401 || c.code === 102)
      .map(c => (c.code === 101 || c.code === 401) ? c.parameters[0] : `CHOICE: ${c.parameters[0].join(' / ')}`));
    if (texts.length) console.log(JSON.stringify({id:event.id,name:event.name,x:event.x,y:event.y,texts}));
  }
}
