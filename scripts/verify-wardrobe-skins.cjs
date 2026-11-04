// Real oriole outfit flow, isolated browser data and fictional birds only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8815';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
const names=['osmanthus','peach','bamboo','sakura','scholar','moon','jade','pilgrim'];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[],writes=[],assetErrors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url())});page.on('response',r=>{if(r.url().includes('/assets/')&&!r.ok())assetErrors.push(r.url())});
  await page.route('**/api/**',r=>r.fulfill({json:[]}));fs.mkdirSync('output/wardrobe-skins/screenshots',{recursive:true});
  await page.goto(base+'/?page=wardrobe');await page.waitForFunction(()=>!!window.xcwcGuest);
  await page.evaluate(()=>{for(const [id,name] of [['a','湖小叽'],['b','小团子']])window.xcwcGuest.adopt({id:id.repeat(32),cityName:'杭州',typeName:'小黄莺',active:true},name);window.xcwcGuest.select('a'.repeat(32));const s=window.xcwcGuest.read();s.balance=500;s.skins=['lake_glow'];localStorage.setItem('xcwc.guest.v1',JSON.stringify(s))});await page.reload();
  const frame=page.frameLocator('iframe'),wardrobe=frame.locator('.account-wardrobe-felt'),wear=id=>wardrobe.locator('[data-skin="'+id+'"]'),preview=id=>wardrobe.locator('[data-preview-skin="'+id+'"]');
  await wardrobe.locator('.wardrobe-outfit-card').first().waitFor();assert.equal(await wardrobe.locator('.wardrobe-outfit-card').count(),8);
  await page.screenshot({path:'output/wardrobe-skins/screenshots/wardrobe-390.png'});
  const saved=await page.evaluate(()=>JSON.stringify({balance:window.xcwcGuest.read().balance,skins:window.xcwcGuest.read().skins,outfits:window.xcwcGuest.wardrobe().outfits}));
  // Every full-body image can be tried on without owning it or changing the wallet.
  for(const name of names){
   const id='huangying_'+name;await preview(id).click();
   await wardrobe.locator('.wardrobe-actor img').evaluate(img=>img.decode());
   assert.match(await wardrobe.locator('.wardrobe-actor img').getAttribute('src'),new RegExp('/'+name+'-640.webp$'));
   assert.match(await wardrobe.locator('.wardrobe-look').innerText(),/试穿预览/);
   assert.equal(await page.evaluate(()=>JSON.stringify({balance:window.xcwcGuest.read().balance,skins:window.xcwcGuest.read().skins,outfits:window.xcwcGuest.wardrobe().outfits})),saved,'preview is read-only '+name);
   await page.screenshot({path:'output/wardrobe-skins/screenshots/preview-'+name+'.png'});
  }
  await wardrobe.locator('[data-account-action=cancel-preview]').click();assert.match(await wardrobe.locator('.wardrobe-actor img').getAttribute('src'),/idle-640.webp$/);
  let spent=0;
  for(const [i,name] of names.entries()){
   const id='huangying_'+name,price=i<4?30:70;await wear(id).click();
   const dialog=wardrobe.locator('.wardrobe-dialog[open]');assert.match(await dialog.locator('.wardrobe-confirm-copy').innerText(),new RegExp(price+' 叽分'));
   if(i===0){await dialog.locator('[data-account-action=cancel-redeem]').click();assert.equal(await page.evaluate(()=>window.xcwcGuest.snapshot().wallet.balance),500);await wear(id).click()}
   await wardrobe.locator('[data-account-action=confirm-redeem]').dblclick();await wear(id).filter({hasText:'穿戴'}).waitFor();spent+=price;
   assert.equal(await page.evaluate(()=>window.xcwcGuest.snapshot().wallet.balance),500-spent);
  }
  assert.equal(await page.evaluate(()=>window.xcwcGuest.ledger().filter(x=>x.operation==='REDEEM').length),8);
  // Previously owned auras remain usable; cancelling a try-on restores that aura.
  await wear('lake_glow').press('Enter');await wardrobe.locator('.wardrobe-actor.aura-lake').waitFor();
  await preview('huangying_peach').click();assert.equal(await wardrobe.locator('.wardrobe-actor.aura-lake').count(),0);
  await wardrobe.locator('[data-account-action=cancel-preview]').click();await wardrobe.locator('.wardrobe-actor.aura-lake').waitFor();
  await preview('huangying_pilgrim').click();await wardrobe.locator('#account-bird').selectOption('b'.repeat(32));
  await wardrobe.locator('.wardrobe-actor img[src$="idle-640.webp"]').waitFor();assert.match(await wardrobe.locator('.wardrobe-look').innerText(),/当前穿戴/);
  await wardrobe.locator('#account-bird').selectOption('a'.repeat(32));await wardrobe.locator('.wardrobe-actor.aura-lake').waitFor();
  await wear('huangying_osmanthus').click();await wear('huangying_osmanthus').filter({hasText:'使用中'}).waitFor();await wardrobe.locator('.wardrobe-actor img').evaluate(img=>img.decode());
  assert.equal(await wear('huangying_osmanthus').isDisabled(),true);
  // Persisted art is used by the nest and is retained across care/emotion changes.
  await frame.locator('.bottom [data-go=home]').press('Enter');const nest=frame.locator('#xcwc-nest');
  await nest.locator('.actor img[src$="osmanthus-640.webp"]').waitFor();
  assert.match(await nest.locator('.actor img').getAttribute('src'),/osmanthus-640.webp$/);
  await nest.locator('#bird').click();await page.waitForTimeout(150);
  assert.match(await nest.locator('.actor img').getAttribute('src'),/osmanthus-640.webp$/);
  await page.screenshot({path:'output/wardrobe-skins/screenshots/nest-osmanthus.png'});
  await nest.locator('[data-action=dress]').press('Enter');await wardrobe.locator('#account-bird').waitFor();
  await wardrobe.locator('#account-bird').selectOption('b'.repeat(32));await wear('huangying_osmanthus').filter({hasText:'穿戴'}).waitFor();assert.equal(await wear('huangying_osmanthus').innerText(),'穿戴');
  await wear('huangying_jade').click();await wear('huangying_jade').filter({hasText:'使用中'}).waitFor();await page.reload();await wardrobe.locator('#account-bird').waitFor();
  assert.equal(await wardrobe.locator('#account-bird').inputValue(),'b'.repeat(32));assert.match(await wardrobe.locator('.wardrobe-actor img').getAttribute('src'),/jade-640.webp$/);
  await wardrobe.locator('#account-bird').selectOption('a'.repeat(32));await wardrobe.locator('.wardrobe-actor img[src$="osmanthus-640.webp"]').waitFor();assert.match(await wardrobe.locator('.wardrobe-actor img').getAttribute('src'),/osmanthus-640.webp$/);
  await wear('').click();await wardrobe.locator('.wardrobe-actor img[src$="idle-640.webp"]').waitFor();assert.match(await wardrobe.locator('.wardrobe-actor img').getAttribute('src'),/idle-640.webp$/);
  assert.equal(await page.evaluate(()=>window.xcwcGuest.wardrobe().outfits.find(x=>x.birdId==='b'.repeat(32)).skinId),'huangying_jade');
  await page.setViewportSize({width:320,height:568});
  assert.equal(await wardrobe.evaluate(e=>e.scrollWidth>e.clientWidth),false);
  await frame.locator('.phone>main').evaluate(e=>{e.scrollTop=e.scrollHeight});
  assert.equal(await wardrobe.locator('.local-experience-note').evaluate(e=>e.getBoundingClientRect().bottom<=e.closest('main').getBoundingClientRect().bottom+.5),true);
  await page.screenshot({path:'output/wardrobe-skins/screenshots/wardrobe-320-bottom.png'});
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(assetErrors,[]);
  console.log(JSON.stringify({passed:true,outfits:8,checks:['eight real outfit cards','preview is read-only for all outfits','all eight redeem once','cancel and double click','shared unlock, per-bird wear','nest art and interaction retain outfit','reload and original restoration','320px overflow and bottom reachability','no backend writes, script errors or asset failures'],screenshots:'output/wardrobe-skins/screenshots/'},null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
