const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
global.window={SurvivorRPG:{}};
const storage=new Map();
global.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
for(const match of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script src="(js\/[^"]+)"/g)) {
  if(match[1]!=='js/main.js')vm.runInThisContext(fs.readFileSync(path.join(root,match[1]),'utf8'));
}
const R=window.SurvivorRPG;
const world={width:600,height:400,colliders:[{x:200,y:100,width:60,height:200}]};
const actor=(x,y)=>({x,y,radius:8,movementSpeed:100,speed:20,hp:100,dead:false,equippedMoves:[],lastMoveVector:{x:1,y:0},takeDamage(n){this.hp-=n;}});
const combat=()=>new R.CombatSystem({calculateMoveCooldown:()=>3,calculateDamageBreakdown:()=>({finalDamage:10,type:1})},{play(){}});

test('fast movement cannot tunnel through scenery and diagonal movement slides along it',()=>{
  const p=actor(100,160),movement=new R.MovementSystem();
  movement.move(p,1,0,3,world);
  assert.ok(p.x<=192&&p.x>180);
  movement.move(p,1,1,0.5,world);
  assert.ok(p.x<=192&&p.y>190);
  const safe=R.MovementSystem.safePosition(world,230,180,22);
  assert.ok(safe&&R.MovementSystem.canStand(world,safe.x,safe.y,22));
});

test('every map has connected NPC approaches and accessible encounter zones',()=>{
  for(const map of Object.values(R.Maps)) {
    const step=32,cols=Math.floor(map.width/step),rows=Math.floor(map.height/step);
    const nodes=[];
    for(let y=1;y<rows;y++)for(let x=1;x<cols;x++)if(R.MovementSystem.canStand(map,x*step,y*step,22))nodes.push([x,y]);
    const start=nodes.reduce((best,p)=>Math.hypot(p[0]*step-map.playerStart.x,p[1]*step-map.playerStart.y)<Math.hypot(best[0]*step-map.playerStart.x,best[1]*step-map.playerStart.y)?p:best);
    const allowed=new Set(nodes.map(p=>p.join(','))),seen=new Set([start.join(',')]),queue=[start];
    for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const [x,y]=queue[i],next=[x+dx,y+dy],key=next.join(',');
      if(allowed.has(key)&&!seen.has(key)&&R.MovementSystem.canStand(map,(x+dx/2)*step,(y+dy/2)*step,22)){seen.add(key);queue.push(next);}
    }
    for(const npc of map.npcs||[])assert.ok(queue.some(([x,y])=>Math.hypot(x*step-npc.x,y*step-npc.y)<=72),`${map.id}: ${npc.name}`);
    for(const zone of map.spawnZones||[])assert.ok(queue.some(([x,y])=>x*step>zone.x+44&&x*step<zone.x+zone.width-44&&y*step>zone.y+44&&y*step<zone.y+zone.height-44),`${map.id}: ${zone.id}`);
  }
});

test('enemy steering goes around a blocking rock without entering it',()=>{
  const p=actor(100,200),movement=new R.MovementSystem();
  for(let i=0;i<1000&&Math.hypot(p.x-400,p.y-200)>15;i++) {
    movement.moveToward(p,400,200,.02,world);
    assert.ok(R.MovementSystem.canStand(world,p.x,p.y,p.radius));
  }
  assert.ok(Math.hypot(p.x-400,p.y-200)<15);
});

test('grass has a hard cap of four and slows the timer 2.5x with two occupants',()=>{
  const spawn=new R.SpawnSystem(R.Maps.hunting_01);
  spawn.zones=[{...spawn.zones[0],maxAlive:99,timer:10}];
  const z=spawn.zones[0],enemies=[{spawnZoneId:z.id},{spawnZoneId:z.id}];
  spawn.update(2.5,enemies);assert.equal(z.timer,9);
  enemies.pop();spawn.update(2.5,enemies);assert.equal(z.timer,6.5);
  spawn.spawnOne=()=>({spawnZoneId:z.id});
  for(let i=0;i<20;i++){z.timer=0;spawn.update(1,enemies);}
  assert.equal(enemies.length,4);
});

test('actual spawns stay outside scenery on every hunting map',()=>{
  for(const map of Object.values(R.Maps)) {
    const spawn=new R.SpawnSystem(map);
    for(const zone of spawn.zones)for(let i=0;i<20;i++) {
      const enemy=spawn.spawnOne(zone);
      assert.ok(enemy,`${map.id}/${zone.id} has room`);
      assert.ok(R.MovementSystem.canStand(map,enemy.x,enemy.y,enemy.radius));
    }
  }
});

test('projectiles and beams cannot damage a target behind scenery',()=>{
  for(const id of ['ember','rockThrow','flamethrower']) {
    const c=combat();c.world=world;
    const p=actor(140,180),target=actor(300,180);
    c.release(c.createCast(p,target,R.MoveData[id],0),p,[target]);
    for(let i=0;i<200;i++)c.update(0.01,p,[target],false);
    assert.equal(target.hp,100,id);
  }
});

test('charger locks its aim, waits 0.9 seconds, then can be dodged',()=>{
  const c=combat();c.world={width:1000,height:1000,colliders:[]};
  const enemy=new R.WildPokemon({...R.PokemonData.rattata,level:5},300,300,'test');
  const p=actor(430,300);c.enemyAttack(enemy,p);
  assert.equal(enemy.aiType,'charger');assert.equal(c.telegraphs[0].windup,0.9);
  for(let i=0;i<70;i++)c.update(.01,p,[enemy],false);
  assert.equal(enemy.x,300);assert.equal(p.hp,100);
  p.y=420;
  for(let i=0;i<70;i++)c.update(.01,p,[enemy],false);
  assert.ok(enemy.x>400);assert.equal(p.hp,100);
});

test('ranged enemies retreat while on cooldown and recover after casting',()=>{
  const c=combat(),movement=new R.MovementSystem();
  const enemy=new R.WildPokemon({...R.PokemonData.charmander,level:12,aiType:'ranged'},300,200,'test');
  const p=actor(330,200);enemy.attackCooldown=1;
  enemy.update(.1,p,movement,c,{width:800,height:800});assert.ok(enemy.x<300);
  enemy.recovery=1;const before=enemy.x;
  enemy.update(.1,p,movement,c,{width:800,height:800});assert.equal(enemy.x,before);
});

function report() {
  return {version:4,money:150,balls:{pokeBall:10},partyIds:['a'],reserveIds:[],selectedId:'a',trainer:{x:100,y:100,direction:'down'},
    ownedPokemon:[{speciesId:'bulbasaur',uniqueId:'a',level:5,hp:20,exp:0,equippedMoves:[{moveId:'tackle',cooldownRemaining:0,upgradeLevel:0}]}]};
}
test('save store recovers the previous valid checkpoint from a corrupted primary',()=>{
  storage.clear();R.SaveStore.write(report());const newer=report();newer.money=200;R.SaveStore.write(newer);
  localStorage.setItem(R.SaveStore.key,'{broken');
  const loaded=R.SaveStore.read();assert.equal(loaded.recovered,true);assert.equal(loaded.data.money,150);
});
test('invalid imports are rejected before changing storage',()=>{
  for(const change of [d=>d.trainer.x=NaN,d=>d.selectedId='missing',d=>d.ownedPokemon[0].baseTypes=['unknown'],d=>d.ownedPokemon[0].equippedMoves[0].cooldownRemaining=-1,d=>d.money=-1,d=>d.ownedPokemon[0].nickname='<img>']) {
    const bad=report();change(bad);assert.throws(()=>R.SaveStore.validate(bad));
  }
});
test('blocked browser storage does not prevent starting a session',()=>{
  const previous=localStorage.getItem;
  try {
    localStorage.getItem=()=>{throw Error('Storage blocked');};
    assert.equal(R.SaveStore.read(),null);
    assert.deepEqual(R.SaveStore.readJournal().dex,{});
  } finally {localStorage.getItem=previous;}
});
test('survival restores incomplete elites but never duplicates earned milestones',()=>{
  const survival=new R.SurvivalSystem({elapsed:400,milestones:['first','mixed'],rewardedElites:['first']});
  assert.deepEqual(survival.milestones,['first']);
  const spawned=[],game={mode:'pokemon',activePokemon:{dead:false},enemies:[]};
  survival.spawn=(g,d,id)=>{if(id)spawned.push(id);return {};};survival.spawnTimer=10;
  survival.update(.1,game);survival.update(.1,game);
  assert.deepEqual(spawned,['mixed']);assert.equal(survival.phase(),'혼합 공격');
});
test('survival has a slower recovery interval after a milestone',()=>{
  const survival=new R.SurvivalSystem({elapsed:220,milestones:['first'],rewardedElites:['first']});
  survival.spawn=()=>({});survival.spawnIndex=1;
  survival.update(.01,{mode:'pokemon',activePokemon:{dead:false},enemies:[]});
  assert.equal(survival.spawnTimer,survival.difficulty().interval*3);
});
