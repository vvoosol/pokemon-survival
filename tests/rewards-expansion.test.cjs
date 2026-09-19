const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.window = {SurvivorRPG:{},setTimeout:fn => fn()};
for (const file of ['data/moveData','data/pokemonData','data/battleRewardData','data/growthData','data/anilAdapter',
  'data/upgradeData','data/mapData','entities/entity','entities/playerPokemon','entities/wildPokemon',
  'systems/statSystem','systems/evolutionSystem','systems/upgradeSystem','systems/spawnSystem','systems/survivalSystem','story/storyCombat','systems/combatSystem','game'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'));
const R = window.SurvivorRPG, stats = new R.StatSystem(), upgrades = new R.UpgradeSystem(stats);
const game = Object.assign(Object.create(R.Game.prototype),{statSystem:stats,trainer:{x:0,y:0},pokedex:{},message(){}});
const make = (id,level=30) => game.createPartyPokemon(R.PokemonData[id],0,0,{level});

test('exactly 30 original species from each added generation, covering every type', () => {
  assert.equal(Object.keys(R.PokemonData).length,186);
  for (const gen of [2,3,4,5,6]) {
    const list = Object.values(R.PokemonData).filter(p=>p.generation===gen);
    assert.equal(list.length,30);
    assert.equal(new Set(list.flatMap(p=>p.types)).size,18);
    for (const p of list) {
      assert.ok(R.GrowthData.tables[p.growthRate],p.id);
      for (const file of [p.sprite,p.icon,p.frontSprite]) assert.ok(fs.existsSync(path.join(__dirname,'..',file)),file);
      assert.ok(p.learnset.length,p.id);
      assert.ok(p.learnset.every(e=>R.MoveData[e.moveId]));
      assert.ok(p.evolutions.every(e=>R.PokemonData[e.target] && e.method==='level'));
      assert.ok(make(p.id).equippedMoves.length);
    }
  }
  assert.deepEqual(R.DataAdapter.validate(),[]);
});

test('all 150 species are reachable in hunting tables with valid levels and survive capture/save reconstruction', () => {
  const found = new Set();
  for (const map of Object.values(R.Maps)) for (const zone of map.spawnZones) {
    for (const entry of zone.spawnTable) {
      assert.ok(R.PokemonData[entry.speciesId]);
      if (entry.minLevel) assert.ok(entry.minLevel<=zone.levelMax);
      found.add(entry.speciesId);
    }
  }
  for (const p of Object.values(R.PokemonData).filter(p=>p.generation)) {
    assert.ok(found.has(p.id),p.id);
    const owned = make(p.id,p.level);
    const restored = game.deserializePokemon(game.serializePokemon(owned));
    assert.equal(restored.speciesId,p.id); assert.equal(restored.hp,owned.hp);
    assert.deepEqual(restored.equippedMoves,owned.equippedMoves);
  }
});

test('story grass encounters use a broad randomized level pool instead of the native fixed species list', () => {
  const renderer = {
    map:{id:1,width:1,height:1},
    tileset:{terrain_tags:{values:{1:2}},passages:{values:{}},priorities:{values:{}}},
    tileAt(){return 1;}
  };
  const zones = R.StorySpawnSystem.zones(renderer,{Land:[{species:'RATTATA',minLevel:5,maxLevel:10,weight:100}]},false);
  assert.equal(zones.length,1);
  const table = zones[0].spawnTable;
  assert.ok(table.length>20);
  assert.ok(table.some(entry=>entry.speciesId==='froakie'));
  assert.ok(table.some(entry=>entry.speciesId==='snivy'));
  assert.ok(table.some(entry=>entry.speciesId==='turtwig'));
  assert.ok(table.every(entry=>entry.weight===1 && entry.minLevel>=5 && entry.maxLevel===10));
});

test('hero choices are only unknown compatible TM moves, no ability or tera choices', () => {
  for (const species of Object.values(R.PokemonData)) {
    const p=make(species.id), used=new Set();
    for (let i=0;i<100;i++) {
      const c=upgrades.makeHeroChoice(p,used); if(!c) break;
      assert.equal(c.type,'learnTmMove'); assert.equal(c.rarity,'hero');
      assert.ok(R.TMCompatibility[p.speciesId].includes(c.moveId));
      assert.ok(!p.knowsMove(c.moveId)); used.add(c.id);
    }
    p.equippedMoves=R.TMCompatibility[p.speciesId].map(moveId=>({moveId}));
    assert.equal(upgrades.makeHeroChoice(p,new Set()),null);
  }
  assert.ok(!R.TMCompatibility.charmander.includes('scratch'));
  assert.ok(R.TMCompatibility.squirtle.includes('tm_icebeam'));
});

test('survival introduces every added species in a valid level band', () => {
  const survival=new R.SurvivalSystem(), seen=new Set();
  for(let t=0;t<900;t+=10) {
    survival.elapsed=t;
    const d=survival.difficulty();
    for(const id of d.pool) {
      const species=R.PokemonData[id];assert.ok(species);
      if(species.generation) {assert.ok(species.level<=d.levelMax);seen.add(id);}
    }
  }
  assert.equal(seen.size,150);
});

test('legendary yields tera and one-step early evolution; terminal species yield mega, never ability changes', () => {
  for (const id of ['bulbasaur','chikorita','bagon']) {
    const p=make(id,5), seen=new Set();
    for(let i=0;i<150;i++) seen.add(upgrades.makeLegendaryChoice(p,new Set()).type);
    assert.deepEqual([...seen].sort(),['earlyEvolution','teraType']);
    const choice=upgrades.makeLegendaryChoice(p,new Set(['legendary_tera']));
    const slots=JSON.stringify(p.equippedMoves), uid=p.uniqueId;
    upgrades.applyChoice(p,{type:'teraType',teraType:'water'});
    game.performEvolution(p,choice.targetSpeciesId,'EARLY_LEGENDARY');
    assert.equal(p.level,5);assert.equal(p.uniqueId,uid); assert.equal(JSON.stringify(p.equippedMoves),slots);
    assert.deepEqual(p.types,['water']);
  }
  const p=make('charizard');
  assert.equal(upgrades.makeLegendaryChoice(p,new Set(['legendary_tera'])).type,'megaEvolution');
  assert.equal(upgrades.makeLegendaryChoice(p,new Set(['legendary_tera','legendary_evolution'])),null);
});

test('terastallization replaces defense type and all previous STAB, and cannot repeat', () => {
  const p=make('charizard'), target=make('rattata');
  assert.equal(stats.calculateDamageBreakdown(p,target,R.MoveData.ember).stab,1.5);
  assert.ok(upgrades.applyChoice(p,{type:'teraType',teraType:'water'}));
  assert.deepEqual(stats.activeTypes(p),['water']);
  assert.equal(stats.calculateDamageBreakdown(p,target,R.MoveData.ember).stab,1);
  assert.equal(stats.calculateDamageBreakdown(p,target,R.MoveData.waterGun).stab,1.8);
  assert.equal(stats.calculateDamageBreakdown(target,p,R.MoveData.thunderShock).type,2);
  assert.equal(stats.calculateDamageBreakdown(target,p,R.MoveData.rockThrow).type,1);
  assert.equal(upgrades.applyChoice(p,{type:'teraType',teraType:'grass'}),false);
  assert.deepEqual(game.deserializePokemon(game.serializePokemon(p)).types,['water']);
});

test('native and adapted megas persist without stacking, preserving ability, HP, moves and tera on save and level gain', () => {
  for(const id of ['charizard','swampert','ampharos','metagross','umbreon']) {
    const p=make(id,50), form=R.EvolutionSystem.megaOptions(id)[0], ability=p.abilityId;
    upgrades.applyChoice(p,{type:'teraType',teraType:'ice'});
    assert.ok(R.EvolutionSystem.applyMega(p,form.id,stats));
    assert.equal(p.abilityId,ability); assert.deepEqual(p.types,['ice']);
    assert.equal(R.EvolutionSystem.applyMega(p,form.id,stats),false);
    p.hp=Math.floor(p.maxHp*.73);
    const loaded=game.deserializePokemon(game.serializePokemon(p));
    for (const key of ['hp','maxHp','attack','specialAttack','megaFormId','abilityId']) assert.equal(loaded[key],p[key],id+key);
    assert.deepEqual(loaded.equippedMoves,p.equippedMoves);
    loaded.level++; stats.applyNativeStatsForLevel(loaded);
    assert.equal(loaded.nativeStats.attack,stats.calculateNativeStats({...R.PokemonData[id],baseStats:form.baseStats},51).attack);
    assert.deepEqual(loaded.types,['ice']);
  }
  assert.deepEqual(R.EvolutionSystem.megaOptions('bagon'),[]);
  assert.deepEqual(R.EvolutionSystem.megaOptions('togetic'),[]);
});

test('every added TM attack has a cast delay, single lane and real damage collision', () => {
  for (const move of Object.values(R.MoveData).filter(m=>m.sourceTM)) {
    const p=make('charizard'), enemy=make('rattata');
    p.x=0;p.y=0;p.inField=true;enemy.x=move.behavior==='MELEE_FRONT'?45:120;enemy.y=0;enemy.hp=enemy.maxHp=10000;
    enemy.takeDamage=function(n){this.hp-=n;};
    const combat=new R.CombatSystem({calculateDamageBreakdown:()=>({finalDamage:10,type:1})},{play(){}});
    const cast=combat.createCast(p,enemy,move);
    assert.ok(cast.timer>=.5,move.id);assert.equal(cast.hitboxes.length,1,move.id);
    combat.telegraphs.push(cast);
    combat.update(.1,p,[enemy],false);assert.equal(enemy.hp,10000,move.id);
    for(let i=0;i<200;i++)combat.update(.01,p,[enemy],false);
    assert.equal(enemy.hp,9990,move.id);
  }
});

test('rarity weights unchanged and exhausted pools return three valid distinct choices', () => {
  assert.deepEqual(R.UpgradeData.rarityWeights,{common:70,rare:20,hero:8,legendary:2});
  const p=make('umbreon'); p.hasTerastallized=true; p.megaFormId='adapted';
  p.equippedMoves=R.TMCompatibility.umbreon.map(moveId=>({moveId,upgradeLevel:4}));
  upgrades.rollRarity=()=> 'legendary';
  const choices=upgrades.createChoices(p);
  assert.equal(choices.length,3);assert.equal(new Set(choices.map(c=>c.id)).size,3);
  assert.ok(choices.every(c=>c.rarity==='common'));
});
