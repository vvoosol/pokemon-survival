const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = process.argv[2], root = path.resolve(__dirname, '..');
if (!source) throw Error('Pass original Anil folder');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/story/manifest.json')));
const pokemonNamesKo = JSON.parse(fs.readFileSync(path.join(root, 'assets/story/pokemon-names-ko.json')));
const customKoreanNames = {royaleon: '로열리온', cefireon: '세파이어리온'};
function sections(name) {
  const result = {}; let current;
  for (const raw of fs.readFileSync(path.join(source, 'PBS', name + '.txt'), 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const header = line.match(/^\[([^\]]+)\]/); if (header) { current = result[header[1]] = {}; continue; }
    const eq = line.indexOf('='); if (eq > 0 && current) current[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return result;
}
const species = sections('pokemon'), forms = sections('pokemon_forms'), moves = sections('moves'), items = sections('items');
const trainers = {}; let trainer, pokemon;
for (const raw of fs.readFileSync(path.join(source, 'PBS/trainers.txt'), 'utf8').split(/\r?\n/)) {
  const line = raw.replace(/#.*/, '').trim(), header = line.match(/^\[([^\]]+)\]/);
  if (header) { const [type, name, version = '0'] = header[1].split(','); trainer = trainers[`${type}|${name}|${version}`] = {type, name, version: Number(version), party: []}; pokemon = null; continue; }
  if (!trainer || !line.includes('=')) continue;
  const eq = line.indexOf('='), key = line.slice(0, eq).trim(), value = line.slice(eq + 1).trim();
  if (key === 'Pokemon') { const [id, level] = value.split(','); pokemon = {species: id, level: Number(level)}; trainer.party.push(pokemon); }
  else if (['Items', 'LoseText'].includes(key) || !pokemon) trainer[key] = value;
  else pokemon[key] = value;
}
const encounters = {}; let encounter, table;
for (const raw of fs.readFileSync(path.join(source, 'PBS/encounters.txt'), 'utf8').split(/\r?\n/)) {
  const line = raw.replace(/#.*/, '').trim(), header = line.match(/^\[([^\]]+)\]/); if (!line) continue;
  if (header) { encounter = encounters[header[1].split(',').map(Number).join(',')] = {}; table = null; continue; }
  if (!encounter) continue;
  const parts = line.split(',');
  if (!/^\d+$/.test(parts[0])) table = encounter[parts[0]] = [];
  else if (table) table.push({weight: Number(parts[0]), species: parts[1], minLevel: Number(parts[2]), maxLevel: Number(parts[3] || parts[2])});
}
const usedTrainers = new Set(), needed = new Set(['BULBASAUR', 'CHARMANDER', 'SQUIRTLE']);
for (const [id, entry] of Object.entries(manifest.maps)) {
  const map = JSON.parse(fs.readFileSync(path.join(root, entry.url), 'utf8'));
  for (const event of Object.values(map.events)) for (const page of event.pages) for (const command of page.list) {
    for (const param of command.parameters) if (typeof param === 'string') {
      for (const match of param.matchAll(/TrainerBattle\.start\(:(\w+),\s*"([^"]+)"(?:,\s*(\d+))?\)/g)) usedTrainers.add(`${match[1]}|${match[2]}|${match[3] || 0}`);
    }
  }
  for (const [kind, entries] of Object.entries(encounters[id] || {}))
    if (/^(Land|Cave)/.test(kind)) entries.forEach(entry => needed.add(entry.species));
}
const selectedTrainers = {}, unresolvedTrainers = [];
for (const key of usedTrainers) {
  if (!trainers[key]) { unresolvedTrainers.push(key); continue; }
  selectedTrainers[key] = trainers[key]; trainers[key].party.forEach(p => needed.add(p.species));
}
const context = {window: {SurvivorRPG: {}}}; vm.createContext(context);
for (const name of ['moveData', 'pokemonData', 'battleRewardData']) vm.runInContext(fs.readFileSync(path.join(root, `js/data/${name}.js`), 'utf8'), context);
const R = context.window.SurvivorRPG;
const moveIds = Object.fromEntries(Object.values(R.MoveData).map(move => [move.sourceId, move.id]));
const extraMoves = {}, extraSpecies = {};
function moveId(sourceId) {
  if (moveIds[sourceId]) return moveIds[sourceId];
  const native = moves[sourceId]; if (!native) throw Error('Missing move: ' + sourceId);
  if (native.Category === 'Status' || Number(native.Power) <= 0) return null;
  const id = `story_${sourceId.toLowerCase()}`, melee = native.Category === 'Physical' && (native.Flags || '').includes('Contact');
  extraMoves[id] = {id, sourceId, name: native.Name, type: native.Type.toLowerCase(), category: native.Category.toLowerCase(),
    power: Number(native.Power), baseCooldown: Math.max(3, Number(native.Power) / 20), behavior: melee ? 'MELEE_FRONT' : 'PROJECTILE',
    range: melee ? 110 : 270, width: melee ? 80 : 48, projectileSpeed: 420, piercing: false, castTime: .65,
    adaptation: 'Source power/type/category; one-lane real-time attack. Turn-based secondary effects pending.'};
  moveIds[sourceId] = id; return id;
}
for (const trainer of Object.values(selectedTrainers)) for (const p of trainer.party) for (const id of (p.Moves || '').split(',').filter(Boolean)) moveId(id);
const growth = {Medium: 'medium', Fast: 'fast', Slow: 'slow', Parabolic: 'parabolic', Erratic: 'erratic', Fluctuating: 'fluctuating'};
for (const sourceId of needed) {
  const evolutions = (species[sourceId]?.Evolutions || '').split(',');
  for (let i = 0; i < evolutions.length; i += 3) if (species[evolutions[i]]) needed.add(evolutions[i]);
}
for (const sourceId of needed) {
  const form = sourceId.match(/^(.+)_(\d+)$/);
  const native = species[sourceId] || (form && species[form[1]] && forms[`${form[1]},${form[2]}`]
    ? {...species[form[1]], ...forms[`${form[1]},${form[2]}`]} : null);
  if (!native) throw Error('Missing species: ' + sourceId);
  const id = sourceId.toLowerCase();
  if (R.PokemonData[id]) continue;
  const [hp, attack, defense, speed, specialAttack, specialDefense] = native.BaseStats.split(',').map(Number);
  const learnset = [], entries = (native.Moves || '').split(',');
  for (let i = 0; i < entries.length; i += 2) { const local = moveId(entries[i + 1]); if (local) learnset.push({level: Number(entries[i]), moveId: local}); }
  const paths = {};
  for (const [folder, key] of [['Characters/Followers', 'sprite'], ['Pokemon/Icons', 'icon'], ['Pokemon/Front', 'frontSprite']]) {
    const from = path.join(source, 'Graphics', folder, sourceId + '.png');
    if (!fs.existsSync(from)) throw Error('Missing species image: ' + from);
    const dest = `assets/story/pokemon/${key}/${id}.png`; fs.mkdirSync(path.dirname(path.join(root, dest)), {recursive: true});
    fs.copyFileSync(from, path.join(root, dest)); paths[key] = dest;
  }
  const level = 5, stat = value => Math.floor(2 * value * level / 100) + 5;
  const dexNo = Object.keys(species).indexOf(form ? form[1] : sourceId) + 1;
  const evos = (native.Evolutions || '').split(','), evolutions = [];
  for (let i = 0; i < evos.length; i += 3) if (needed.has(evos[i]) || R.PokemonData[evos[i]?.toLowerCase()])
    evolutions.push({target: evos[i].toLowerCase(), method: 'level', level: evos[i+1] === 'Level' ? Number(evos[i+2]) : 28, sourceMethod: evos[i+1], sourceParameter: evos[i+2]});
  extraSpecies[id] = {id, speciesId: id, sourceId, name: pokemonNamesKo[String(dexNo)] || customKoreanNames[id] || native.Name, level, generation: Number(native.Generation), dexNo,
    types: native.Types.toLowerCase().split(','), baseStats: {hp, attack, defense, speed, specialAttack, specialDefense},
    growthRate: growth[native.GrowthRate], catchRate: Number(native.CatchRate), baseExp: Number(native.BaseExp),
    hp: Math.floor(2 * hp * level / 100) + level + 10, maxHp: Math.floor(2 * hp * level / 100) + level + 10,
    attack: stat(attack), defense: stat(defense), speed: stat(speed), specialAttack: stat(specialAttack), specialDefense: stat(specialDefense),
    learnset, evolutions, abilities: native.Abilities?.split(',') || [], hiddenAbilities: native.HiddenAbilities?.split(',') || [],
    ...paths, frameSize: 64, scale: .7, radius: 10, movementSpeed: 100, aggroRadius: 200, attackRange: 90,
    attackCooldown: 3, playerMove: learnset[0]?.moveId || 'tackle', wildMove: learnset[0]?.moveId || 'tackle',
    source: 'Pokemon Anil V4.13/PBS/pokemon.txt', sourcePokedex: native.Pokedex, pokedex: native.Pokedex};
}
const data = {trainers: selectedTrainers, unresolvedTrainers, encounters: Object.fromEntries(Object.entries(encounters).filter(([id]) => manifest.maps[id])),
  pokemon: extraSpecies, moves: extraMoves, moveIds, items, trainerTypes: sections('trainer_types')};
fs.writeFileSync(path.join(root, 'assets/story/battle-data.json'), JSON.stringify(data));
console.log(JSON.stringify({trainers: Object.keys(selectedTrainers).length, unresolvedTrainers, species: needed.size, addedSpecies: Object.keys(extraSpecies).length, addedMoves: Object.keys(extraMoves).length}));
