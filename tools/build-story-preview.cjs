const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = process.argv[2];
if (!source) throw Error('Usage: node tools/build-story-preview.cjs <Anil source folder>');
const root = path.resolve(__dirname, '..');
const imported = path.join(root, 'build/anil-story-source');
const output = path.join(root, 'assets/story');
const read = name => JSON.parse(fs.readFileSync(path.join(imported, name), 'utf8'));
const tilesets = read('tilesets.json');
const speciesIds = [...fs.readFileSync(path.join(source, 'PBS/pokemon.txt'), 'utf8').matchAll(/^\[([^\]]+)\]/gm)].map(match => match[1]);
const mapIds = [...Array.from({length: 75}, (_, i) => i + 1), 104, 107, 155, 156, 158, 159, 217]
  .filter(id => fs.existsSync(path.join(imported, `maps/${id}.json`)));
const manifest = {version: 1, status: 'development-preview', maps: {}, tilesets: {}, characters: {}, pictures: {}, provenance: {}};
const copy = (relative, destination) => {
  const bytes = fs.readFileSync(path.join(source, relative));
  fs.mkdirSync(path.dirname(path.join(output, destination)), {recursive: true});
  fs.writeFileSync(path.join(output, destination), bytes);
  manifest.provenance[destination] = {source: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
  return `assets/story/${destination}`;
};
const graphic = (folder, name) => {
  if (!name) return null;
  if (/[\\/]/.test(name)) throw Error('Unexpected graphics path: ' + name);
  const dir = path.join(source, 'Graphics', folder);
  const filename = fs.readdirSync(dir).find(file => path.parse(file).name.toLowerCase() === name.toLowerCase() && /\.(png|jpg|jpeg)$/i.test(file));
  if (!filename && folder === 'Characters' && /^\d{3}$/.test(name)) {
    const species = speciesIds[Number(name) - 1];
    const relative = `Graphics/Characters/Followers/${species}.png`;
    if (species && fs.existsSync(path.join(source, relative))) return copy(relative, `Characters/${name}.png`);
  }
  if (!filename) throw Error('Missing source graphic: ' + folder + '/' + name);
  return copy(`Graphics/${folder}/${filename}`, `${folder}/${filename}`);
};
fs.mkdirSync(path.join(output, 'maps'), {recursive: true});
fs.writeFileSync(path.join(output, 'common-events.json'), JSON.stringify(read('common-events.json')));
for (const id of mapIds) {
  const map = read(`maps/${id}.json`);
  manifest.maps[id] = {name: map.name, url: `assets/story/maps/${id}.json`};
  fs.writeFileSync(path.join(output, `maps/${id}.json`), JSON.stringify(map));
  if (!manifest.tilesets[map.tileset_id]) {
    const tileset = tilesets[map.tileset_id];
    manifest.tilesets[map.tileset_id] = {...tileset, image: graphic('Tilesets', tileset.tileset_name),
      autotiles: tileset.autotile_names.map(name => graphic('Autotiles', name))};
  }
  for (const event of Object.values(map.events)) for (const page of event.pages) {
    const name = page.graphic.character_name;
    if (name && !(name in manifest.characters)) manifest.characters[name] = graphic('Characters', name);
    if ([1, 104, 217].includes(id)) for (const command of page.list) {
      if (command.code === 231 && !manifest.pictures[command.parameters[1]])
        manifest.pictures[command.parameters[1]] = graphic('Pictures', command.parameters[1]);
    }
  }
}
const helperPath = 'Data/Scripts/016_Map renderer/005_TileDrawingHelper.rb';
const helper = fs.readFileSync(path.join(source, helperPath), 'utf8');
const patterns = helper.match(/AUTOTILE_PATTERNS\s*=\s*(\[[\s\S]*?\n  \])/);
if (!patterns) throw Error('Original autotile patterns not found');
manifest.autotilePatterns = JSON.parse(patterns[1]).flat();
if (manifest.autotilePatterns.length !== 48) throw Error('Invalid autotile patterns');
manifest.provenance.autotilePatterns = {source: helperPath, sha256: crypto.createHash('sha256').update(helper).digest('hex')};
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest));
console.log(JSON.stringify({maps: mapIds.length, tilesets: Object.keys(manifest.tilesets).length,
  characters: Object.keys(manifest.characters).length, copiedFiles: Object.keys(manifest.provenance).length}));
