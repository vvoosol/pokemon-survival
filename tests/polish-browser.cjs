const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});
  const shot=name=>page.screenshot({path:path.join(__dirname,'screenshots',`polish-${name}.png`)});
  const boot=async()=>{
    await page.waitForFunction(()=>window.currentSurvivorRPG?.trainer);
    await page.evaluate(()=>{const g=currentSurvivorRPG;g.tick=g.update.bind(g);g.update=()=>{};g.messageTimer=0;g.draw();g.ui.update(g);});
  };
  try {
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8787/?mode=battle');await boot();
    const initial=await page.evaluate(()=>{
      const g=currentSurvivorRPG;
      return {zoom:g.worldZoom,width:g.camera.width,height:g.camera.height,money:g.money,
        x:(g.trainer.x-g.camera.x)*g.worldZoom,y:(g.trainer.y-g.camera.y)*g.worldZoom};
    });
    assert.equal(initial.zoom,1.5);assert.equal(initial.width,1280/1.5);assert.equal(initial.height,480);
    assert.equal(initial.x,640);assert.equal(initial.y,360);assert.equal(initial.money,150);
    await shot('hub');
    const capturePoint=await page.evaluate(()=>{
      const g=currentSurvivorRPG,R=SurvivorRPG;
      g.enemies=[60,110].map(offset=>new R.WildPokemon(R.PokemonData.pidgey,g.trainer.x+offset,g.trainer.y,'test'));
      g.captureTarget=g.enemies[0];g.draw();
      return {x:(g.enemies[1].x-g.camera.x)*g.worldZoom,y:(g.enemies[1].y-g.camera.y)*g.worldZoom};
    });
    await page.mouse.click(capturePoint.x,capturePoint.y);
    assert.ok(await page.evaluate(()=>currentSurvivorRPG.captureSystem.lockedTarget===currentSurvivorRPG.enemies[1]));
    await page.evaluate(()=>currentSurvivorRPG.handlePartyAction());
    assert.ok(await page.evaluate(()=>currentSurvivorRPG.captureSystem.lockedTarget===currentSurvivorRPG.enemies[0]));
    for(const map of ['hunting_01','hunting_02','hunting_03','survival']) {
      await page.evaluate(id=>{const g=currentSurvivorRPG;g.setMap(id,{clearEnemies:true,movePlayer:true});g.messageTimer=0;g.draw();g.ui.update(g);},map);
      await shot(map);
    }
    await page.evaluate(()=>{const g=currentSurvivorRPG;g.setMap('hub',{clearEnemies:true,movePlayer:true});g.openMenuView('settings');});
    await page.locator('[data-setting="music"]').fill('40');
    await page.locator('[data-setting="reducedEffects"]').check();
    assert.deepEqual(await page.evaluate(()=>[currentSurvivorRPG.assets.settings.music,currentSurvivorRPG.assets.settings.reducedEffects]),[.4,true]);
    await shot('settings');
    await page.evaluate(()=>currentSurvivorRPG.openMenuView('report'));await shot('report');
    for(const viewport of [{width:844,height:390},{width:390,height:844}]) {
      await page.setViewportSize(viewport);await page.waitForTimeout(80);
      await shot(`report-${viewport.width}`);
      const bounds=await page.locator('[data-action="back"]').boundingBox();
      assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.y+bounds.height<=viewport.height);
    }
    await page.setViewportSize({width:1280,height:720});
    const economics=await page.evaluate(()=>{
      const g=currentSurvivorRPG;g.menuOpen=false;g.ui.hideGameMenu();g.mode='trainer';
      g.enemies=[];
      for(let i=0;i<5;i++)g.awardParticipantExp({level:5,id:'rattata',x:0,y:0,expReward:1,participants:new Set()});
      const afterKills=g.money;
      const target=new SurvivorRPG.WildPokemon(SurvivorRPG.PokemonData.pidgey,g.trainer.x+60,g.trainer.y,'test');
      target.hp=1;target.setCaptureReady();g.enemies=[target];
      g.transition={target,result:{success:true}};g.finishCapture();
      const afterCapture=g.money,copy=g.messageText;
      const save=g.serializeRun(),bad=structuredClone(save);bad.trainer.x='bad';
      const accepted=g.loadGame(bad),unchanged=g.money===afterCapture;
      g.money=333;g.saveGame(true);localStorage.setItem(SurvivorRPG.SaveStore.key,'{broken');
      const recovered=g.loadGame(),restoredMoney=g.money;
      return {afterKills,afterCapture,copy,accepted,unchanged,recovered,restoredMoney};
    });
    assert.equal(economics.afterKills,225);assert.equal(economics.afterCapture,345);
    assert.match(economics.copy,/100/);assert.equal(economics.accepted,false);assert.ok(economics.unchanged);
    assert.ok(economics.recovered);assert.equal(economics.restoredMoney,345);
    // A cleared save plus persistent research must reopen starter selection after reload.
    await page.evaluate(()=>{const g=currentSurvivorRPG;g.beginStarterJourney();g.draw();g.ui.update(g);});
    await page.reload();await boot();
    assert.deepEqual(await page.evaluate(()=>{const g=currentSurvivorRPG;return [g.awaitingStarter,g.partyPokemon.length,g.menuView,g.pokedex.pidgey.caught,g.assets.settings.music];}),[true,0,'starterSelect',true,.4]);
    await page.locator('[data-starter="charmander"]').click();
    await page.locator('[data-change]').click();
    assert.equal(await page.evaluate(()=>currentSurvivorRPG.player.speciesId),'charmander');
    await page.reload();await boot();
    assert.deepEqual(await page.evaluate(()=>[currentSurvivorRPG.awaitingStarter,currentSurvivorRPG.player.speciesId]),[false,'charmander']);
    const emergency=await page.evaluate(()=>{
      const g=currentSurvivorRPG;g.trainer.x=800;g.trainer.y=730;g.money=0;g.balls.pokeBall=0;
      return [g.receiveEmergencyBalls(),g.balls.pokeBall,g.receiveEmergencyBalls()];
    });assert.deepEqual(emergency,[true,3,false]);
    const elite=await page.evaluate(()=>{
      const g=currentSurvivorRPG;g.setMap('survival',{clearEnemies:true,movePlayer:true});g.mode='pokemon';g.activePokemon=g.player;g.player.inField=true;
      const hp=g.player.maxHp,level=g.player.level;
      g.grantEliteReward({survivalElite:'first'});
      return {mode:g.mode,rarity:g.currentChoices.map(c=>c.rarity),hp:g.player.maxHp,level:g.player.level,before:[hp,level],saved:g.saveGame(true)};
    });
    assert.equal(elite.mode,'levelChoice');assert.equal(elite.rarity.length,3);assert.equal(elite.rarity[0],'hero');
    assert.deepEqual([elite.hp,elite.level],elite.before);assert.equal(elite.saved,false);
    assert.ok(await page.evaluate(()=>currentSurvivorRPG.ui.menuOverlay.hidden));
    await shot('elite-reward');
    await page.evaluate(()=>{const g=currentSurvivorRPG;g.selectLevelChoice(0);});await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>currentSurvivorRPG.mode),'pokemon');
    // Suspended tabs neither advance the survival clock nor retain movement input.
    const paused=await page.evaluate(()=>{const g=currentSurvivorRPG;g.suspended=true;const t=g.survival.elapsed;g.tick(5);g.suspended=false;return g.survival.elapsed===t;});
    assert.ok(paused);
    // All five unchanged Anil tracks can be decoded by the browser.
    const tracks=await page.evaluate(async()=>{
      return Promise.all(['hub','field','cave','survival','final'].map(name=>new Promise(resolve=>{
        const audio=new Audio(`assets/audio/${name}.ogg`);audio.onloadedmetadata=()=>resolve([name,audio.duration>0]);audio.onerror=()=>resolve([name,false]);audio.load();
      })));
    });assert.ok(tracks.every(([,ok])=>ok));
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({initial,economics,elite,tracks,errors},null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
