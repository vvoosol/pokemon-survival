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
const expansion = {};
const roster = require('./expansion-roster.cjs');
const available = new Set([...Object.keys(R.PokemonData), ...roster.map(row => row[1].toLowerCase())]);
const growthNames = { Medium:'medium', Fast:'fast', Slow:'slow', Parabolic:'parabolic', Erratic:'erratic', Fluctuating:'fluctuating' };
for (const [dexNo, sourceId, name, level] of roster) {
  const native = species[sourceId], id = sourceId.toLowerCase();
  if (!native) throw Error('Missing species ' + sourceId);
  const [hp,attack,defense,speed,specialAttack,specialDefense] = native.BaseStats.split(',').map(Number);
  const evolutions = [], rawEvos = (native.Evolutions || '').split(',');
  for (let i = 0; i < rawEvos.length; i += 3) {
    const target = rawEvos[i].toLowerCase();
    if (!available.has(target)) continue;
    evolutions.push({ target, method:'level', level:rawEvos[i+1] === 'Level' ? Number(rawEvos[i+2]) : 28,
      sourceMethod:rawEvos[i+1], sourceParameter:rawEvos[i+2] });
  }
  const learnset = [], entries = native.Moves.split(',');
  for (let i = 0; i < entries.length; i += 2) {
    const moveId = sourceToId[entries[i+1]];
    if (moveId) learnset.push({level:Number(entries[i]),sourceMoveId:entries[i+1],moveId});
  }
  // Species whose early native moves are all status moves receive a basic real-time attack.
  if (!learnset.some(m => m.level <= level)) learnset.unshift({level:1,sourceMoveId:'TACKLE',moveId:'tackle',adapted:true});
  const attackMove = learnset.filter(m => m.level <= level).at(-1).moveId;
  const images = [['Graphics/Characters/Followers','assets/pokemon','sprite'],
    ['Graphics/Pokemon/Icons','assets/pokemon-icons','icon'],['Graphics/Pokemon/Front','assets/pokemon-front','frontSprite']];
  const paths = {};
  for (const [from,to,key] of images) {
    const src = path.join(source,from,sourceId+'.png');
    if (!fs.existsSync(src)) throw Error('Missing original image ' + src);
    paths[key] = to+'/'+id+'.png'; fs.copyFileSync(src,path.join(root,paths[key]));
  }
  expansion[id] = {id,speciesId:id,sourceId,name,dexNo,generation:Number(native.Generation),level,
    types:native.Types.toLowerCase().split(','),baseStats:{hp,attack,defense,speed,specialAttack,specialDefense},
    growthRate:growthNames[native.GrowthRate],catchRate:Number(native.CatchRate),baseExp:Number(native.BaseExp),
    expReward:Math.max(10,Math.round(Number(native.BaseExp)/4)),...paths,frameSize:64,scale:1.1,radius:22,
    movementSpeed:112,aggroRadius:220,attackRange:52,attackCooldown:1.7,behavior:'melee',
    hp:Math.floor(2*hp*level/100)+level+10,maxHp:Math.floor(2*hp*level/100)+level+10,
    attack:Math.floor(2*attack*level/100)+5,defense:Math.floor(2*defense*level/100)+5,
    specialAttack:Math.floor(2*specialAttack*level/100)+5,specialDefense:Math.floor(2*specialDefense*level/100)+5,
    speed:Math.floor(2*speed*level/100)+5,learnset,evolutions,playerMove:attackMove,wildMove:attackMove,
    abilities:(native.Abilities || '').split(',').filter(Boolean),hiddenAbilities:(native.HiddenAbilities || '').split(',').filter(Boolean),
    source:'Pokemon Anil V4.13/PBS/pokemon.txt',sourcePokedex:native.Pokedex,
    pokedex:name+' · '+native.Generation+'세대',
    unavailableEvolutions:rawEvos.filter((value,i) => i%3 === 0 && value && !available.has(value.toLowerCase()))};
}
Object.assign(R.PokemonData,expansion);
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
  + 'Object.assign(window.SurvivorRPG.PokemonData, '+JSON.stringify(expansion,null,2)+');\n'
  + 'Object.assign(window.SurvivorRPG.MoveData, '+JSON.stringify(added,null,2)+');\n'
  + 'window.SurvivorRPG.TMCompatibility = '+JSON.stringify(compatibility,null,2)+';\n'
  + 'window.SurvivorRPG.MegaForms = '+JSON.stringify(megaForms,null,2)+';\n';
fs.writeFileSync(path.join(root,'js/data/battleRewardData.js'),text);
const typeNames = {normal:'노말',fire:'불꽃',water:'물',electric:'전기',grass:'풀',ice:'얼음',fighting:'격투',poison:'독',ground:'땅',flying:'비행',psychic:'에스퍼',bug:'벌레',rock:'바위',ghost:'고스트',dragon:'드래곤',dark:'악',steel:'강철',fairy:'페어리'};
const lines = ['# 추가 포켓몬 60종','', '타입별 대표 포켓몬을 선정한 목록이며, 통계에 근거한 인기 순위는 아닙니다.',
  '타입과 종족값은 Anil 원본 기준입니다. 본가와 다른 타입도 원본대로 유지합니다.',
  '표의 레벨은 야생 출현 시작 레벨이며, 진화 레벨과는 별개입니다.',
  '모든 종은 해당 레벨대 사냥터에서 포획하거나 포함된 진화 계열을 통해 얻을 수 있습니다.',''];
for(const generation of [2,3]) {
  lines.push('## '+generation+'세대 (30종)','','| 번호 | 포켓몬 | 타입 | 출현 레벨 |','| --- | --- | --- | --- |');
  for(const p of Object.values(expansion).filter(p=>p.generation===generation).sort((a,b)=>a.dexNo-b.dexNo))
    lines.push('| '+p.dexNo+' | '+p.name+' | '+p.types.map(t=>typeNames[t]).join(' / ')+' | '+p.level+' |');
  lines.push('');
}
lines.push('## 진화 범위','','2·3세대 추가 목록 및 기존 1세대 안에서 연결되는 진화만 활성화합니다.',
  '미수록 후속 세대 진화형이 있는 종은 최종 진화형으로 오인해 메가진화를 제공하지 않습니다.',
  '친밀도·아이템 등 레벨 외 조건은 현재 게임에 맞춰 Lv.28 진화로 변환합니다.');
fs.writeFileSync(path.join(root,'POKEMON_ROSTER.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({newMoves:Object.keys(added).length,tmSpecies:Object.keys(compatibility).length,megaForms:Object.keys(megaForms),starters:['bulbasaur','charmander','squirtle'].map(id=>[id,compatibility[id].length])}));
