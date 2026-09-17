const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:720}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});
  const shot=name=>page.screenshot({path:path.join(__dirname,'screenshots',name+'.png')});
  try {
    await page.goto('http://127.0.0.1:8787/');
    await page.waitForFunction(()=>window.currentSurvivorRPG?.trainer || window.__bootError);
    assert.equal(await page.evaluate(()=>window.__bootError),undefined);
    await page.evaluate(()=>{currentSurvivorRPG.update=()=>{};});
    const blank=await page.evaluate(()=>{
      const R=SurvivorRPG,g=currentSurvivorRPG, canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const ctx=canvas.getContext('2d',{willReadFrequently:true}), missing=[];
      for(const species of Object.values(R.PokemonData).filter(s=>s.generation)) {
        const p=g.createPartyPokemon(species,128,128,{level:species.level});
        for(const direction of ['up','down','left','right']) {
          ctx.clearRect(0,0,256,256);p.direction=direction;p.draw(ctx,{x:0,y:0},g.assets);
          if(!ctx.getImageData(0,0,256,256).data.some((v,i)=>i%4===3 && v))missing.push(species.id+direction);
        }
      }
      for(const form of Object.values(R.MegaForms)) {
        const p=g.createPartyPokemon(R.PokemonData[form.speciesId],128,128,{level:50});
        if(!R.EvolutionSystem.applyMega(p,form.id,g.statSystem))continue;
        ctx.clearRect(0,0,256,256);p.draw(ctx,{x:0,y:0},g.assets);
        if(!ctx.getImageData(0,0,256,256).data.some((v,i)=>i%4===3 && v))missing.push(form.id);
      }
      return missing;
    });
    assert.deepEqual(blank,[]);
    console.log('PASS: 60 original followers in four directions and every eligible native mega render nonblank');
    const rarityColors=await page.evaluate(()=>{
      const g=currentSurvivorRPG,p=g.player,u=g.upgradeSystem;
      const choices=[u.makeCommonChoice(new Set()),u.makeRareChoice(p,new Set()),u.makeHeroChoice(p,new Set()),u.makeLegendaryChoice(p,new Set())];
      g.ui.showLevelChoices({pokemon:p,toLevel:5},choices,()=>{});
      return [...document.querySelectorAll('.choice-card')].map(card=>({text:getComputedStyle(card).color,border:getComputedStyle(card).borderTopColor}));
    });
    assert.deepEqual(rarityColors.map(c=>c.text),['rgb(255, 255, 255)','rgb(255, 228, 92)','rgb(215, 161, 255)','rgb(255, 119, 119)']);
    assert.equal(rarityColors[3].border,'rgb(255, 69, 69)');
    await page.evaluate(()=>{
      const g=currentSurvivorRPG,R=SurvivorRPG,p=g.player;
      g.mode='levelChoice';g.modeBeforeLevelUp='trainer';g.currentLevelEvent={pokemon:p,toLevel:p.level};g.choiceLocked=false;
      const u=g.upgradeSystem;
      g.currentChoices=[u.makeHeroChoice(p,new Set()),u.makeLegendaryChoice(p,new Set(['legendary_evolution'])),u.makeLegendaryChoice(p,new Set(['legendary_tera']))];
      g.ui.showLevelChoices(g.currentLevelEvent,g.currentChoices,i=>g.selectLevelChoice(i));
    });
    await shot('rewards-desktop');
    for(const [name,width,height] of [['phone-landscape',844,390],['phone-portrait',390,844]]) {
      await page.setViewportSize({width,height});await page.waitForTimeout(120);
      await shot('rewards-'+name);
      const failures=await page.locator('.choice-card').evaluateAll(cards=>cards.flatMap(card=>{
        const b=card.getBoundingClientRect();
        return [...card.querySelectorAll('strong,span')].filter(el=>{
          const r=el.getBoundingClientRect();return r.left<b.left || r.right>b.right+1 || r.bottom>b.bottom+1;
        }).map(el=>el.textContent);
      }));
      assert.deepEqual(failures,[]);
    }
    await page.setViewportSize({width:1280,height:720});
    await page.locator('.choice-card').nth(1).click();
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(()=>currentSurvivorRPG.player.hasTerastallized));
    await page.evaluate(()=>{
      const g=currentSurvivorRPG,p=g.player;
      g.mode='levelChoice';g.choiceLocked=false;g.currentLevelEvent={pokemon:p,toLevel:p.level};
      g.currentChoices=[g.upgradeSystem.makeLegendaryChoice(p,new Set(['legendary_tera']))];
      g.ui.showLevelChoices(g.currentLevelEvent,g.currentChoices,i=>g.selectLevelChoice(i));
    });
    await page.locator('.choice-card').click();await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>currentSurvivorRPG.player.speciesId),'ivysaur');
    await page.evaluate(()=>{
      const g=currentSurvivorRPG,p=g.player;
      p.equippedMoves=p.normalizeMoveSlots(['tackle','vineWhip','razorLeaf','seedBomb']);
      g.mode='levelChoice';g.choiceLocked=false;g.currentLevelEvent={pokemon:p,toLevel:p.level};
      g.currentChoices=[g.upgradeSystem.makeHeroChoice(p,new Set())];
      window.testTM=g.currentChoices[0].moveId;
      g.ui.showLevelChoices(g.currentLevelEvent,g.currentChoices,i=>g.selectLevelChoice(i));
    });
    await page.locator('.choice-card').click();
    assert.equal(await page.evaluate(()=>currentSurvivorRPG.mode),'moveLearn');
    await page.locator('.choice-card').nth(0).click();
    assert.equal(await page.evaluate(()=>currentSurvivorRPG.player.equippedMoves[0].moveId),await page.evaluate(()=>testTM));
    assert.notEqual(await page.evaluate(()=>currentSurvivorRPG.mode),'moveLearn');
    console.log('PASS: actual tera / early evolution clicks and four-slot TM replacement return to play');
    await page.evaluate(()=>{
      const g=currentSurvivorRPG,R=SurvivorRPG;
      const p=g.createPartyPokemon(R.PokemonData.swampert,800,620,{level:50});
      g.player=g.selectedPokemon=p;g.partyPokemon=[p];g.ownedPokemon=[p];
      g.mode='levelChoice';g.choiceLocked=false;g.currentLevelEvent={pokemon:p,toLevel:p.level};
      g.currentChoices=[g.upgradeSystem.makeLegendaryChoice(p,new Set(['legendary_tera']))];
      g.ui.showLevelChoices(g.currentLevelEvent,g.currentChoices,i=>g.selectLevelChoice(i));
    });
    await page.locator('.choice-card').click();await page.waitForTimeout(250);
    assert.ok(await page.evaluate(()=>currentSurvivorRPG.player.megaFormId));
    await page.evaluate(()=>{const g=currentSurvivorRPG;g.player.hp=Math.floor(g.player.maxHp*.75);g.mode='trainer';g.menuOpen=true;g.openMenuView('summary');});
    await shot('rewards-mega-summary');
    await page.evaluate(()=>{const g=currentSurvivorRPG;g.saveGame();g.loadGame();});
    assert.ok(await page.evaluate(()=>currentSurvivorRPG.ownedPokemon[0].megaFormId));
    await page.evaluate(()=>{const g=currentSurvivorRPG;g.menuOpen=true;g.openMenuView('areaSelect');});
    assert.equal(await page.locator('[data-area]').count(),6);
    await shot('expanded-hunting-menu');
    const menuBounds=await page.locator('[data-area]').evaluateAll(buttons=>buttons.map(b=>({name:b.textContent.trim(),top:b.getBoundingClientRect().top,bottom:b.getBoundingClientRect().bottom})));
    assert.ok(menuBounds.every(b=>b.top>=0 && b.bottom<=720),JSON.stringify(menuBounds));
    await page.locator('[data-area="hunting_05"]').click();
    assert.equal(await page.evaluate(()=>currentSurvivorRPG.map.id),'hunting_05');
    assert.deepEqual(errors,[]);
    console.log('PASS: mega summary/save, six area options and travel, no page or asset errors');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
