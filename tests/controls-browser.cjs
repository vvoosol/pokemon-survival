const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
  const context=await browser.newContext({viewport:{width:1280,height:720},hasTouch:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8787/');
  await page.waitForFunction(()=>window.currentSurvivorRPG?.trainer);
  const layout=await page.evaluate(()=>{
    const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
    return {stick:rect('.touch-zone'),buttons:rect('.face-buttons'),moves:rect('.move-hud'),
      systemTransform:getComputedStyle(document.querySelector('.system-buttons')).transform};
  });
  assert.ok(layout.stick.top>400&&layout.buttons.top>400);
  assert.ok(layout.stick.bottom<=layout.moves.bottom);
  assert.match(layout.systemTransform,/^matrix\(1, 0, 0, 1,/);

  await page.evaluate(()=>{
    const g=currentSurvivorRPG;
    g.trainer.x=800;g.trainer.y=730;g.updateNearbyNpc();
  });
  await page.locator('#switchActionBtn').click({force:true});
  await page.waitForTimeout(80);
  assert.deepEqual(await page.evaluate(()=>[currentSurvivorRPG.menuOpen,currentSurvivorRPG.menuView]),[true,'professor']);
  assert.equal(await page.locator('.menu-option.is-selected').count(),1);
  await page.screenshot({path:path.join(__dirname,'screenshots','controls-lowered.png')});

  await page.locator('.menu-option.is-selected').click();
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>currentSurvivorRPG.menuView),'starterSelect');
  assert.deepEqual(errors,[]);
  console.log('PASS: lowered controls, horizontal system buttons, and one touch cannot open and select an NPC menu');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
