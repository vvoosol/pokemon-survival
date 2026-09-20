const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width:1280,height:720}, hasTouch: true});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', r => {
    const failure = r.failure()?.errorText || '';
    if (failure === 'net::ERR_ABORTED' && /\.ogg(?:$|\?)/i.test(r.url())) return;
    errors.push(r.url()+': '+failure);
  });
  page.on('response', r => {if(r.status()>=400) errors.push(r.status()+' '+r.url());});
  const screenshots = path.join(__dirname, 'screenshots'); fs.mkdirSync(screenshots, {recursive:true});
  try {
    const url = process.env.GAME_URL || pathToFileURL(path.join(__dirname,'../dist/index.html')).href+'?mode=story';
    await page.goto(url);
    await page.waitForFunction(() => currentSurvivorRPG?.storyRenderer?.map && !currentSurvivorRPG.storyBusy, {timeout:30000});
    console.log('PASS static HTML boot', url);
    await page.waitForSelector('.story-dialog:not([hidden])');
    const openingText = await page.locator('.story-dialog').innerText();
    assert.ok(openingText.includes('오박사에게 가 보자'));
    assert.equal(await page.locator('.gameboy-controls').evaluate(el => getComputedStyle(el).visibility), 'visible');
    const zBox = await page.locator('#switchActionBtn').boundingBox();
    assert.ok(zBox);
    await page.touchscreen.tap(zBox.x + zBox.width / 2, zBox.y + zBox.height / 2);
    await page.waitForFunction(() => !currentSurvivorRPG.storyDialog?.resolve);
    console.log('PASS opening dialog advances with touch Z');
    await page.evaluate(async () => {
      const g = currentSurvivorRPG; g.suspended = true;
      g.tick = g.update.bind(g); g.update = () => {};
      g.story.switches[64] = true; g.story.switches[347] = true;
      g.addStoryPokemon('BULBASAUR', 80); g.addStoryPokemon('FROAKIE', 80);
      g.awaitingStarter = false; g.interpreter.host.wait = async () => {};
      window.drain = async promise => {
        let done=false, failure; promise.then(()=>done=true,e=>{failure=e;done=true;});
        for(let i=0;i<30000&&!done;i++) {
          if(g.storyDialog.resolve) g.answerStory(0);
          g.suspended=false; g.tick(.05); g.suspended=true;
          if(i%100===0||!g.storyBattle) await new Promise(r=>setTimeout(r,0));
        }
        if(failure)throw failure;
        if(g.storyError)throw g.storyError;
        if(!done)throw Error('Battle timeout: '+g.mode);
      };
    });
    const placement = await page.evaluate(async () => {
      const g=currentSurvivorRPG, result=[];
      for(const id of [2,4,9,15,19,107,158]) {
        await g.transferStory(id,14,16);
        const doors=g.storyDoors();
        for(const npc of g.storyProxyNpcs) {
          const distance=Math.min(...doors.map(d=>Math.hypot(d.x-npc.x,d.y-npc.y)));
          if(distance>3.2)throw Error(npc.id+' is not beside a door: '+distance);
          if(!SurvivorRPG.MovementSystem.canStand(g.map,(npc.x+.5)*32,(npc.y+.5)*32,10)) throw Error(npc.id+' blocked');
          result.push([id,npc.id,npc.x,npc.y]);
        }
      }
      await g.transferStory(9,23,28);
      return result;
    });
    console.log('PASS NPC doors',JSON.stringify(placement));
    const storyFixes = await page.evaluate(async () => {
      const g=currentSurvivorRPG;
      await g.transferStory(4,52,38);g.storyBusy=false;
      const seller=g.storyProxyNpcs.find(p=>p.id==='viridian-ball-seller');
      const money=g.money,balls=g.balls.pokeBall,ask=g.askStory;
      g.askStory=async()=>0;await g.runViridianBallShop();g.askStory=ask;
      const sellerWorks=!!seller&&g.money===money-50&&g.balls.pokeBall===balls+1;
      const active=g.storyRenderer.activeEvents(g.story);
      const tree=active.find(({event,page})=>g.isCutTreeEvent(event,page));
      const treePos=g.storyPositions[tree.event.id]||tree.event;
      const treeBlocked=!SurvivorRPG.MovementSystem.canStand(g.map,(treePos.x+.5)*32,(treePos.y+.5)*32,10);
      g.story.keyItems.CUTITEM=1;await g.storyScript('pbSmashThisEvent',{mapId:4,eventId:tree.event.id});
      const treeOpened=SurvivorRPG.MovementSystem.canStand(g.map,(treePos.x+.5)*32,(treePos.y+.5)*32,10);
      return {sellerWorks,treeBlocked,treeOpened};
    });
    assert.deepEqual(storyFixes,{sellerWorks:true,treeBlocked:true,treeOpened:true});
    console.log('PASS Viridian seller and Cut tree collision',storyFixes);
    const fieldItem = await page.evaluate(async () => {
      const g=currentSurvivorRPG;
      await g.transferStory(10,11,36);g.storyBusy=false;g.mode='trainer';
      g.trainer.x=(11+.5)*32;g.trainer.y=(36+.5)*32;
      g.suspended=false;g.tick(.05);g.suspended=true;
      const target=g.map.npcs.find(n=>n.id==='field-item-20');
      if(!target)throw Error('Route 3 field item is not registered for Z interaction');
      const before=g.balls.pokeBall;
      g.input.switchPressed=true;
      g.suspended=false;g.tick(.05);g.suspended=true;
      return {registered:true,gained:g.balls.pokeBall-before,erased:g.erasedStoryEvents.has(20),stillVisible:g.map.npcs.some(n=>n.id==='field-item-20')};
    });
    assert.deepEqual(fieldItem,{registered:true,gained:1,erased:true,stillVisible:false});
    console.log('PASS field Pokeball is collected with Z',fieldItem);
    const captureRender = await page.evaluate(() => {
      const g = currentSurvivorRPG;
      const originalTransition = g.transition;
      const originalDrawCaptureSequence = g.drawCaptureSequence;
      let calls = 0;
      g.transition = {type:'capture',timer:.4,duration:1,startX:g.trainer.x,startY:g.trainer.y,endX:g.trainer.x+32,endY:g.trainer.y};
      g.drawCaptureSequence = () => { calls += 1; };
      g.draw();
      g.drawCaptureSequence = originalDrawCaptureSequence;
      g.transition = originalTransition;
      return calls;
    });
    assert.equal(captureRender,1);
    console.log('PASS story mode renders capture throw transition');
    const routeSafety = await page.evaluate(async () => {
      const g=currentSurvivorRPG;await g.transferStory(4,52,38);g.storyBusy=false;
      const active=g.storyRenderer.activeEvents(g.story);
      const missing=active.find(({event,pageIndex})=>g.unsupportedStoryTransfer(event,pageIndex));
      if(!missing)throw Error('Unsupported transfer fixture missing');
      const pos=g.storyPositions[missing.event.id]||missing.event;
      const blocked=!SurvivorRPG.MovementSystem.canStand(g.map,(pos.x+.5)*32,(pos.y+.5)*32,10);
      g.trainer.x=(52+.5)*32;g.trainer.y=(38+.5)*32;g.storyLastSafePosition={mapId:4,x:52,y:38,direction:2};
      const ask=g.askStory,notices=[];g.askStory=async text=>{notices.push(text);return 0;};
      await g.runStoryEvent(missing.event,missing.pageIndex);g.askStory=ask;
      g.suspended=false;g.tick(.05);g.suspended=true;
      return {blocked,stayed:g.story.mapId===4&&!g.storyError,
        notice:notices[0],safeX:Math.floor(g.trainer.x/32),safeY:Math.floor(g.trainer.y/32),
        functionalOnly:g.map.npcs.every(n=>n.proxy||String(n.id).startsWith('cut-')||String(n.id).startsWith('field-item-')),
        nativeHidden:g.hiddenStoryNativeEvents().size>0};
    });
    assert.deepEqual(routeSafety,{blocked:true,stayed:true,notice:'아직 구현되지 않은 지역입니다.\n직전 위치로 돌아왔습니다.',
      safeX:52,safeY:38,functionalOnly:true,nativeHidden:true});
    console.log('PASS blocked routes and filtered NPCs',routeSafety);
    const viridianWest = await page.evaluate(async () => {
      const g=currentSurvivorRPG;
      g.story.switches[69]=true;
      await g.transferStory(4,1,40,4);g.storyBusy=false;
      const exit=g.storyRenderer.activeEvents(g.story).find(({event})=>event.id===66);
      if(!exit)throw Error('Viridian west exit missing');
      await g.runStoryEvent(exit.event,exit.pageIndex);
      g.trainer.x=(47+.5)*32;g.trainer.y=(17+.5)*32;
      g.suspended=false;g.tick(.05);g.suspended=true;
      await new Promise(r=>setTimeout(r,0));
      const westEdge=g.storyRenderer.activeEvents(g.story).find(({event,pageIndex})=>
        g.unsupportedStoryTransfer(event,pageIndex)?.parameters?.[1]===35);
      if(!westEdge)throw Error('Route 22 unsafe west transition missing');
      const westPos=g.storyPositions[westEdge.event.id]||westEdge.event;
      const westEdgeBlocked=!SurvivorRPG.MovementSystem.canStand(g.map,(westPos.x+.5)*32,(westPos.y+.5)*32,10);
      g.trainer.x=(47+.5)*32;g.trainer.y=(17+.5)*32;g.storyLastSafePosition={mapId:5,x:47,y:17,direction:4};
      const ask=g.askStory,notices=[];g.askStory=async text=>{notices.push(text);return 0;};
      await g.runStoryEvent(westEdge.event,westEdge.pageIndex);g.askStory=ask;
      return {map:g.story.mapId,name:g.map.name,busy:g.storyBusy,error:g.storyError?.message,
        rivalBlocked:g.storyOutdoorPlan().blocked.includes(11),westEdgeBlocked,notice:notices[0],
        x:Math.floor(g.trainer.x/32),y:Math.floor(g.trainer.y/32)};
    });
    assert.deepEqual(viridianWest,{map:5,name:'22번도로',busy:false,error:undefined,rivalBlocked:true,westEdgeBlocked:true,
      notice:'아직 구현되지 않은 지역입니다.\n직전 위치로 돌아왔습니다.',x:47,y:17});
    console.log('PASS Viridian west exit stays responsive',viridianWest);
    await page.screenshot({path:path.join(screenshots,'outdoor-doors.png')});
    const speed = await page.evaluate(() => {
      const g=currentSurvivorRPG, t=g.trainer;
      const world={width:2000,height:2000,colliders:[]};
      t.x=t.y=500; g.input.keys=new Set(['d']); t.update(.5,g.input,g.movementSystem,world); const walk=t.x-500;
      t.x=500;g.input.keys.add('z');t.update(.5,g.input,g.movementSystem,world);const run=t.x-500;
      g.input.keys.clear();return {walk,run};
    });
    assert.ok(Math.abs(speed.run-speed.walk*2)<1e-9); console.log('PASS sprint',speed);
    const holdBox = await page.locator('#switchActionBtn').boundingBox();
    assert.ok(holdBox);
    await page.mouse.move(holdBox.x + holdBox.width / 2, holdBox.y + holdBox.height / 2);
    await page.mouse.down();
    assert.equal(await page.evaluate(() => currentSurvivorRPG.input.keys.has('z')), true);
    const touchSprint = await page.evaluate(() => {
      const g=currentSurvivorRPG, t=g.trainer;
      const world={width:2000,height:2000,colliders:[]};
      t.x=t.y=500;
      g.input.joystickVector={x:1,y:0};
      t.update(.5,g.input,g.movementSystem,world);
      const run=t.x-500;
      g.input.joystickVector={x:0,y:0};
      return run;
    });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => currentSurvivorRPG.input.keys.has('z')), false);
    assert.ok(Math.abs(touchSprint-speed.walk*2)<1e-9);
    console.log('PASS held on-screen Z enables 2x sprint',touchSprint);
    const imeZ = await page.evaluate(() => {
      const input=currentSurvivorRPG.input;
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'ㅋ',code:'KeyZ',bubbles:true}));
      const down=input.keys.has('z');
      window.dispatchEvent(new KeyboardEvent('keyup',{key:'ㅋ',code:'KeyZ',bubbles:true}));
      return {down,up:!input.keys.has('z')};
    });
    assert.deepEqual(imeZ,{down:true,up:true}); console.log('PASS physical KeyZ across IME',imeZ);
    await page.evaluate(async () => {
      const g=currentSurvivorRPG; await g.transferStory(9,23,28);g.storyBusy=false;
      window.battleResult=g.runStoryProxy(42,16);
    });
    await page.waitForFunction(()=>currentSurvivorRPG.gymArena && currentSurvivorRPG.storyDialog.resolve);
    assert.ok(await page.locator('.story-dialog').innerText().then(t=>t.includes('배틀 규칙')));
    await page.screenshot({path:path.join(screenshots,'gym-arena-rules.png')});
    await page.evaluate(()=>drain(battleResult));
    const victory=await page.evaluate(()=>({badge:currentSurvivorRPG.story.badges[0],arena:!!currentSurvivorRPG.gymArena,map:currentSurvivorRPG.story.mapId}));
    assert.deepEqual(victory,{badge:true,arena:false,map:9});console.log('PASS real gym combat and return');
    for(const view of ['pokemon','summary','bag','pokedex','settings']) {
      await page.evaluate(view=>{const g=currentSurvivorRPG;g.openMenuView(view,0);},view);
      await page.screenshot({path:path.join(screenshots,'unified-'+view+'.png')});
      const bounds=await page.locator('#screenFrame').boundingBox();assert.ok(Math.abs(bounds.width/bounds.height-16/9)<.01);
    }
    for(const viewport of [{width:1920,height:1080},{width:390,height:844}]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => {
        const r = document.getElementById('screenFrame').getBoundingClientRect();
        return Math.abs(r.width - Math.min(innerWidth, innerHeight * 16 / 9)) < 1 &&
          r.x >= -1 && r.y >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
      });
      const bounds=await page.locator('#screenFrame').boundingBox();assert.ok(Math.abs(bounds.width/bounds.height-16/9)<.01);
      assert.ok(bounds.x>=-1&&bounds.y>=-1&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1);
    }
    console.log('PASS menus and responsive frame');
    const recovery=await page.evaluate(async () => {
      const g=currentSurvivorRPG;g.menuOpen=false;g.ui.hideGameMenu();
      await g.transferStory(9,23,28); const before={money:g.money,ids:g.ownedPokemon.map(p=>p.uniqueId),badges:[...g.story.badges],items:{...g.story.keyItems}};
      g.partyPokemon.forEach(p=>{p.hp=0;p.dead=true;p.fainted=true;});g.mode='gameOver';
      await g.restartAfterDefeat();
      const npc=g.storyProxyNpcs.find(p=>p.label==='간호순');
      return {before,after:{money:g.money,ids:g.ownedPokemon.map(p=>p.uniqueId),badges:g.story.badges,items:g.story.keyItems},
        mode:g.mode,healed:g.partyPokemon.every(p=>p.hp===p.maxHp&&!p.dead),map:g.story.mapId,
        distance:Math.hypot(g.trainer.x-(npc.x+.5)*32,g.trainer.y-(npc.y+.5)*32),error:g.storyError?.message};
    });
    assert.equal(recovery.error,undefined);assert.equal(recovery.mode,'trainer');assert.equal(recovery.healed,true);
    assert.equal(recovery.map,9);assert.ok(recovery.distance<=48);assert.deepEqual(recovery.after,recovery.before);
    console.log('PASS defeat preserves progress and heals at nearby center');
    await page.reload();
    await page.waitForSelector('#resumeSelectOverlay:not([hidden])');
    await page.click('#resumeLoadBtn');
    await page.waitForFunction(()=>typeof currentSurvivorRPG!=='undefined'&&currentSurvivorRPG.storyRenderer?.map&&!currentSurvivorRPG.storyBusy);
    assert.equal(await page.evaluate(()=>currentSurvivorRPG.story.badges[0]),true);
    assert.deepEqual(errors,[]); console.log('PASS reload after recovery; no missing resources or runtime errors');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
