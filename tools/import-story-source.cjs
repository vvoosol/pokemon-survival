const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const marshal = require('./ruby-marshal.cjs');

// This exports data only. Ruby event scripts are never executed or silently skipped.
function importStorySource(source, destination) {
  source = path.resolve(source);
  destination = path.resolve(destination);
  const relative = path.relative(source, destination);
  if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative)))
    throw new Error('Output must be outside the original Anil directory.');
  const data = path.join(source, 'Data');
  const hashes = {};
  const read = name => {
    const file = path.join(source, name);
    hashes[name] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    return marshal.read(file);
  };
  const system = read('Data/System.rxdata');
  const mapInfos = read('Data/MapInfos.rxdata');
  const tilesets = read('Data/Tilesets.rxdata');
  const commonEvents = read('Data/CommonEvents.rxdata');
  const maps = fs.readdirSync(data).filter(name => /^Map\d+\.rxdata$/.test(name)).sort().map(name => {
    const id = Number(name.match(/\d+/)[0]);
    return {id, name: mapInfos[id]?.name, ...read(`Data/${name}`)};
  });
  const commandCounts = {}, scriptHeads = {}, gyms = [], transfers = [];
  let pages = 0, events = 0;
  for (const map of maps) for (const event of Object.values(map.events)) {
    events++;
    for (const [pageIndex, page] of event.pages.entries()) {
      pages++;
      for (const [commandIndex, command] of page.list.entries()) {
        const {code, parameters: args} = command;
        commandCounts[code] = (commandCounts[code] || 0) + 1;
        if (code === 355) {
          const head = String(args[0]).match(/^[\w$.:!?]+/)?.[0] || '(expression)';
          scriptHeads[head] = (scriptHeads[head] || 0) + 1;
        }
        if (code === 201) transfers.push({map: map.id, event: event.id, page: pageIndex, command: commandIndex, parameters: args});
        const badge = code === 355 && String(args[0]).match(/^\$player\.badges\[([012])\]\s*=\s*true$/);
        if (badge) gyms.push({
          order: Number(badge[1]) + 1, map: map.id, event: event.id, page: pageIndex,
          graphic: page.graphic, condition: page.condition,
          battleBranches: page.list.filter(c => c.code === 111 && c.parameters[0] === 12 && /TrainerBattle\.start/.test(c.parameters[1])).map(c => c.parameters[1]),
          rewardScripts: page.list.slice(commandIndex).filter(c => c.code === 355 || c.code === 655).map(c => c.parameters[0]),
          flagCommands: page.list.slice(commandIndex).filter(c => c.code === 121 || c.code === 122),
          commands: page.list
        });
      }
    }
  }
  gyms.sort((a, b) => a.order - b.order);
  const report = {
    formatVersion: 1,
    status: 'source-extraction-only',
    executableStory: false,
    start: {map: system.start_map_id, x: system.start_x, y: system.start_y},
    totals: {maps: maps.length, events, pages, scriptBlocks: commandCounts[355] || 0},
    commandCounts, scriptHeads, gyms, transfers, hashes
  };
  // Parse all binary inputs before writing any export, so unsupported types fail visibly.
  const texts = {};
  for (const name of ['metadata', 'map_metadata', 'map_connections', 'encounters', 'trainers', 'trainer_types', 'items']) {
    const key = `PBS/${name}.txt`, bytes = fs.readFileSync(path.join(source, key));
    hashes[key] = crypto.createHash('sha256').update(bytes).digest('hex');
    texts[name] = bytes;
  }
  fs.mkdirSync(path.join(destination, 'maps'), {recursive: true});
  fs.mkdirSync(path.join(destination, 'PBS'), {recursive: true});
  const write = (name, value) => fs.writeFileSync(path.join(destination, name), JSON.stringify(value));
  for (const map of maps) write(`maps/${map.id}.json`, map);
  write('system.json', system);
  write('map-info.json', mapInfos);
  write('tilesets.json', tilesets);
  write('common-events.json', commonEvents);
  for (const [name, bytes] of Object.entries(texts)) fs.writeFileSync(path.join(destination, 'PBS', `${name}.txt`), bytes);
  write('audit.json', report);
  return report;
}

if (require.main === module) {
  const source = process.argv[2];
  if (!source) throw new Error('Usage: node tools/import-story-source.cjs <Anil folder> [output folder]');
  const output = process.argv[3] || path.join(__dirname, '../build/anil-story-source');
  const report = importStorySource(source, output);
  console.log(JSON.stringify({output, ...report.totals, start: report.start,
    gyms: report.gyms.map(g => ({order: g.order, map: g.map, event: g.event, branches: g.battleBranches}))}, null, 2));
}
module.exports = {importStorySource};
