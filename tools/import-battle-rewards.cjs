const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = process.argv[2];
if (!source) throw Error('Pass the extracted Pokemon Anil V4.13 directory.');
function pbs(name) {
  const result = {}; let section;
  for (const raw of fs.readFileSync(path.join(source, 'PBS', name + '.txt'), 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) { section = result[line.slice(1, -1)] = {}; continue; }
    const eq = line.indexOf('=');
    if (section && eq > 0) section[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return result;
}
const context = { window: { SurvivorRPG: {} } }; vm.createContext(context);
for (const file of ['moveData', 'pokemonData']) vm.runInContext(fs.readFileSync(path.join(root, 'js/data', file + '.js'), 'utf8'), context);
const R = context.window.SurvivorRPG;
const species = pbs('pokemon'), moves = pbs('moves'), items = pbs('items'), forms = pbs('pokemon_forms');
const names = {
  ENERGYBALL:'에너지볼', SLUDGEBOMB:'오물폭탄', SOLARBEAM:'솔라빔', ICEBEAM:'냉동빔', BLIZZARD:'눈보라',
  SURF:'파도타기', HYDROPUMP:'하이드로펌프', WATERFALL:'폭포오르기', SCALD:'열탕', SHADOWBALL:'섀도볼',
  DRAGONPULSE:'용의파동', DRAGONCLAW:'드래곤클로', DARKPULSE:'악의파동', FOCUSBLAST:'기합구슬',
  THUNDER:'번개', FIREBLAST:'불대문자', OVERHEAT:'오버히트', FLAMECHARGE:'니트로차지',
  ROCKSLIDE:'스톤샤워', STONEEDGE:'스톤에지', EARTHQUAKE:'지진', EARTHPOWER:'대지의힘', DIG:'구멍파기',
  AERIALACE:'제비반환', ACROBATICS:'애크러뱃', AIRSLASH:'에어슬래시', DAZZLINGGLEAM:'매지컬샤인',
  FLASHCANNON:'러스터캐논', STEELWING:'강철날개', XSCISSOR:'시저크로스', UTURN:'유턴', PSYSHOCK:'사이코쇼크',
  FIREPUNCH:'불꽃펀치', ICEPUNCH:'냉동펀치', THUNDERPUNCH:'번개펀치', BRICKBREAK:'깨트리기',
  DRAINPUNCH:'드레인펀치', TRAILBLAZE:'개척하기', VENOSHOCK:'베놈쇼크', ICYWIND:'얼다바람',
  SNARL:'바크아웃', BULLETSEED:'기관총', MAGICALLEAF:'매지컬리프', HYPERBEAM:'파괴광선',
  GIGAIMPACT:'기가임팩트', FACADE:'객기', SWIFT:'스피드스타', THIEF:'도둑질', ROCKTOMB:'암석봉인'
};
const beams = new Set(['ICEBEAM','SOLARBEAM','HYPERBEAM']);
const areas = new Set(['EARTHQUAKE','EARTHPOWER','ROCKSLIDE','STONEEDGE','BLIZZARD','THUNDER']);
const melee = new Set(['WATERFALL','DRAGONCLAW','DIG','AERIALACE','ACROBATICS','STEELWING','XSCISSOR','UTURN',
  'FIREPUNCH','ICEPUNCH','THUNDERPUNCH','BRICKBREAK','DRAINPUNCH','TRAILBLAZE','GIGAIMPACT','FACADE','THIEF','FLAMECHARGE']);
const tmItems = Object.fromEntries(Object.entries(items).filter(([, item]) => item.FieldUse === 'TM' && item.Move).map(([id, item]) => [item.Move, id]));
const sourceToId = Object.fromEntries(Object.values(R.MoveData).filter(m => m.id !== 'wildBite').map(m => [m.sourceId, m.id]));
const added = {};
for (const [sourceId, name] of Object.entries(names)) {
  const m = moves[sourceId];
  if (!tmItems[sourceId] || !m || Number(m.Power) <= 0 || m.Category === 'Status' || sourceToId[sourceId]) continue;
  const id = 'tm_' + sourceId.toLowerCase(); sourceToId[sourceId] = id;
  const behavior = beams.has(sourceId) ? 'BEAM' : areas.has(sourceId) ? 'AREA_TARGET' : melee.has(sourceId) ? 'MELEE_FRONT' : 'PROJECTILE';
  added[id] = { id, sourceId, name, type:m.Type.toLowerCase(), category:m.Category.toLowerCase(), power:Number(m.Power),
    baseCooldown:Math.round(Math.max(3, Number(m.Power) / 17) * 10) / 10, behavior,
    range:behavior === 'MELEE_FRONT' ? 120 : 300, width:behavior === 'AREA_TARGET' ? 128 : behavior === 'MELEE_FRONT' ? 100 : 64,
    projectileSpeed:480, piercing:true, castTime:behavior === 'BEAM' ? 0.7 : 0.55,
    sourceTM:tmItems[sourceId], adaptation:'Real-time damage/telegraph; secondary turn-based effects not simulated.' };
}
const compatibility = {};
const megaForms = {};
for (const [id, local] of Object.entries(R.PokemonData)) {
  const native = species[local.sourceId];
  const tutor = new Set((native?.TutorMoves || '').split(','));
  compatibility[id] = Object.keys(tmItems).filter(move => tutor.has(move) && sourceToId[move]).map(move => sourceToId[move]);
  for (const [key, form] of Object.entries(forms)) {
    if (!key.startsWith(local.sourceId + ',') || !form.MegaStone) continue;
    const formNo = key.split(',')[1], file = local.sourceId + '_' + formNo + '.png';
    const front = path.join(source,'Graphics/Pokemon/Front', file);
    if (!fs.existsSync(front)) continue;
    const formId = id + '_mega_' + formNo;
    fs.copyFileSync(front, path.join(root,'assets/pokemon-front',formId+'.png'));
    const stats = (form.BaseStats || native.BaseStats).split(',').map(Number);
    const [hp,attack,defense,speed,specialAttack,specialDefense] = stats;
    megaForms[formId] = { id:formId, speciesId:id, name:'메가' + local.name + (form.FormName.endsWith(' X') ? ' X' : form.FormName.endsWith(' Y') ? ' Y' : ''),
      baseStats:{hp,attack,defense,speed,specialAttack,specialDefense}, types:(form.Types || native.Types).toLowerCase().split(','),
      sprite:'assets/pokemon-front/'+formId+'.png', sourceForm:key };
  }
}
const text = '// Generated from Anil PBS/items.txt, pokemon.txt, moves.txt and pokemon_forms.txt.\n'
  + 'window.SurvivorRPG = window.SurvivorRPG || {};\n'
  + 'Object.assign(window.SurvivorRPG.MoveData, '+JSON.stringify(added,null,2)+');\n'
  + 'window.SurvivorRPG.TMCompatibility = '+JSON.stringify(compatibility,null,2)+';\n'
  + 'window.SurvivorRPG.MegaForms = '+JSON.stringify(megaForms,null,2)+';\n';
fs.writeFileSync(path.join(root,'js/data/battleRewardData.js'),text);
console.log(JSON.stringify({newMoves:Object.keys(added).length,tmSpecies:Object.keys(compatibility).length,megaForms:Object.keys(megaForms),starters:['bulbasaur','charmander','squirtle'].map(id=>[id,compatibility[id].length])}));
