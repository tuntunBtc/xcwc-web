// Review regressions in an isolated browser; no real accounts, codes or backend writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8815';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:700},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[],writes=[],assetErrors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url())});
  page.on('response',r=>{if(r.url().includes('/assets/')&&!r.ok())assetErrors.push(r.url())});
  await page.route('**/api/**',r=>r.fulfill({json:[]}));
  fs.mkdirSync('output/wardrobe-felt/review',{recursive:true});
  await page.goto(base+'/?page=profile');await page.waitForFunction(()=>!!window.xcwcGuest);
  await page.evaluate(()=>{
   for(const [id,name] of [['a','湖小叽'],['b','小团子']])window.xcwcGuest.adopt({id:id.repeat(32),cityName:'杭州',cityCode:'hangzhou',active:true},name);
   window.xcwcGuest.select('a'.repeat(32));const state=window.xcwcGuest.read();state.balance=22;localStorage.setItem('xcwc.guest.v1',JSON.stringify(state));
  });
  await page.reload();const frame=page.frameLocator('iframe'),wardrobe=frame.locator('.account-wardrobe-felt'),skin=id=>wardrobe.locator('[data-skin="'+id+'"]');
  await frame.locator('.account-profile-felt [data-go=wardrobe]').click();await wardrobe.locator('#account-bird').waitFor();
  await page.screenshot({path:'output/wardrobe-felt/review/after-390.png'});
  await frame.locator('.phone>main').evaluate(e=>{e.scrollTop=e.scrollHeight});assert.equal(await wardrobe.locator('.local-experience-note').evaluate(e=>{const r=e.getBoundingClientRect(),main=e.closest('main').getBoundingClientRect();return r.bottom<=main.bottom+.5}),true,'notice reachable on 700px phone');await frame.locator('.phone>main').evaluate(e=>{e.scrollTop=0});
  // Seed points for this isolated interaction run, then inject deterministic host failures.
  await page.evaluate(()=>{const state=window.xcwcGuest.read();state.balance=100;localStorage.setItem('xcwc.guest.v1',JSON.stringify(state))});await page.goto(base+'/?page=wardrobe');
  await wardrobe.locator('#account-bird').waitFor();
  await page.evaluate(()=>{
   const original=window.xcwcGuestOperation;window.wardrobeTest={failRedeem:true,redeemCalls:0,holdRedeem:false};
   window.xcwcGuestOperation=async(op,args,...rest)=>{
    if(op==='redeem'){
     window.wardrobeTest.redeemCalls++;
     if(window.wardrobeTest.failRedeem){window.wardrobeTest.failRedeem=false;throw Error('测试：本机存储写入失败')}
     if(window.wardrobeTest.holdRedeem)await new Promise(resolve=>{window.wardrobeTest.resume=resolve});
    }
    return original(op,args,...rest);
   };
  });
  const confirm=wardrobe.locator('[data-account-action=confirm-redeem]'),dialog=wardrobe.locator('.wardrobe-dialog');
  await skin('lake_glow').press('Enter');await dialog.locator('[data-account-action=cancel-redeem]').waitFor({state:'visible'});
  await confirm.press('Enter');await dialog.locator('.wardrobe-error:not([hidden])').waitFor();
  assert.match(await dialog.locator('[role=alert]').innerText(),/本机存储写入失败/);assert.equal(await confirm.evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.evaluate(()=>window.xcwcGuest.snapshot().wallet.balance),100);
  await page.screenshot({path:'output/wardrobe-felt/review/redeem-error-390.png'});
  await confirm.press('Enter');await skin('lake_glow').filter({hasText:'穿戴'}).waitFor();
  assert.equal(await skin('lake_glow').evaluate(e=>e===document.activeElement),true,'keyboard redemption focuses wear');
  assert.equal(await page.evaluate(()=>window.xcwcGuest.snapshot().wallet.balance),70);
  await page.setViewportSize({width:390,height:520});await skin('lake_glow').focus();
  const scroll=await frame.locator('.phone>main').evaluate(e=>e.scrollTop);assert(scroll>0);
  await skin('lake_glow').press('Enter');await wardrobe.locator('.wardrobe-actor.aura-lake').waitFor();
  assert.equal(await wardrobe.locator('.wardrobe-hero').evaluate(e=>e===document.activeElement),true,'keyboard equip focuses preview');
  assert.match(await wardrobe.locator('.wardrobe-hero').getAttribute('aria-label'),/湖蓝光晕/);
  assert.equal(await frame.locator('.phone>main').evaluate(e=>e.scrollTop),scroll,'equip keeps scroll position');
  await skin('').tap();await wardrobe.locator('.wardrobe-actor:not(.aura-lake)').waitFor();
  assert.equal(await wardrobe.locator('.wardrobe-hero').evaluate(e=>e===document.activeElement),false,'touch does not force preview focus');
  await page.setViewportSize({width:390,height:700});
  await page.evaluate(()=>{window.wardrobeTest.holdRedeem=true});
  await skin('sunset_glow').click();await confirm.click();
  await page.waitForFunction(()=>typeof window.wardrobeTest.resume==='function');
  assert.equal(await wardrobe.getAttribute('aria-busy'),'true');assert.equal(await confirm.isDisabled(),true);
  assert.equal(await wardrobe.locator('#account-bird').isDisabled(),true);
  await confirm.press('Escape');assert.equal(await dialog.getAttribute('open'),'','pending save cannot be dismissed');
  await confirm.dispatchEvent('click');assert.equal(await page.evaluate(()=>window.wardrobeTest.redeemCalls),3,'busy handler ignores duplicate dispatch');
  await page.evaluate(()=>window.wardrobeTest.resume());await skin('sunset_glow').filter({hasText:'穿戴'}).waitFor();
  assert.equal(await page.evaluate(()=>window.xcwcGuest.snapshot().wallet.balance),0);
  assert.equal(await page.evaluate(()=>window.xcwcGuest.ledger().filter(x=>x.operation==='REDEEM').length),2);
  await skin('lake_glow').tap();await wardrobe.locator('.wardrobe-actor.aura-lake').waitFor();
  await frame.locator('.bottom [data-go=home]').press('Enter');await frame.locator('#xcwc-nest .actor.aura-lake').waitFor({state:'attached'});
  await frame.locator('#xcwc-nest [data-action=dress]').press('Enter');await wardrobe.locator('.wardrobe-actor.aura-lake').waitFor();
  // Different bird remains original and its later outfit doesn't affect the first.
  await wardrobe.locator('#account-bird').selectOption('b'.repeat(32));await wardrobe.locator('.wardrobe-actor:not(.aura-lake)').waitFor();
  await skin('sunset_glow').click();await wardrobe.locator('.wardrobe-actor.aura-sunset').waitFor();
  await page.reload();await wardrobe.locator('.wardrobe-actor.aura-sunset').waitFor();
  // A narrow phone must scroll to every control and keep the common nav visible.
  for(const [width,height] of [[320,568],[390,700],[390,844],[430,932],[1024,768]]){
   await page.setViewportSize({width,height});
   assert.equal(await frame.locator('html').evaluate(e=>e.scrollWidth>innerWidth),false);
   assert.equal(await wardrobe.evaluate(e=>e.scrollWidth>e.clientWidth),false);
   await frame.locator('.phone>main').evaluate(e=>{e.scrollTop=e.scrollHeight});
   assert.equal(await wardrobe.locator('.local-experience-note').evaluate(e=>{const r=e.getBoundingClientRect(),m=e.closest('main').getBoundingClientRect();return r.bottom<=m.bottom+.5}),true,'notice reachable');
   assert.equal(Math.round(await frame.locator('.bottom').evaluate(e=>e.getBoundingClientRect().bottom)),height);
   for(const h of await wardrobe.locator('button:not(:disabled),select').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().height)))assert(h>=44,'44px interaction target');
   await frame.locator('.phone>main').evaluate(e=>{e.scrollTop=0});
   await page.screenshot({path:`output/wardrobe-felt/review/after-${width}x${height}.png`});
  }
  // Independent contexts verify actual pointer hit targets without resize artifacts.
  for(const [width,height] of [[320,568],[390,700],[430,932],[1024,768]]){
   const navContext=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600});
   try{
    const navPage=await navContext.newPage();navPage.on('pageerror',e=>errors.push(e.message));
    await navPage.route('**/api/**',r=>r.fulfill({json:[]}));await navPage.goto(base+'/?page=wardrobe');
    await navPage.waitForFunction(()=>!!window.xcwcGuest);
    await navPage.evaluate(()=>window.xcwcGuest.adopt({id:'a'.repeat(32),active:true,cityName:'杭州',cityCode:'hangzhou'},'测试小叽'));
    await navPage.reload();const navFrame=navPage.frameLocator('iframe');
    await navFrame.locator('.account-wardrobe-felt #account-bird').waitFor();
    await navFrame.locator('.bottom [data-go=home]').click();
    await navFrame.locator('#xcwc-nest [data-action=dress]').click();
    assert.equal(await navFrame.locator('.account-wardrobe-felt #account-bird').inputValue(),'a'.repeat(32));
   }finally{await navContext.close()}
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(assetErrors,[]);
  console.log(JSON.stringify({passed:true,checks:['profile wardrobe entry','dialog error and keyboard retry','keyboard focus restored','touch does not steal focus','scroll retained','pending mutation locked and Escape prevented','no duplicate redemption','nest outfit propagation and dress entry','per-bird refresh persistence','320px short phone and tall/wide layouts','44px controls','independent contexts: pointer navigation at four sizes','assets loaded and no script errors/backend writes'],screenshots:'output/wardrobe-felt/review/'},null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
