// Isolated local browser checks; fictional birds and points, no backend writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8815';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url())});await page.route('**/api/**',r=>r.fulfill({json:[]}));
 fs.mkdirSync('output/wardrobe-felt',{recursive:true});await page.goto(base+'/?page=wardrobe');await page.waitForFunction(()=>!!window.xcwcGuest);
 const frame=page.frameLocator('iframe'),wardrobe=frame.locator('.account-wardrobe-felt'),button=(skin)=>wardrobe.locator('[data-skin="'+skin+'"]');
 await wardrobe.locator('.wardrobe-empty').waitFor();assert.equal(await button('lake_glow').isDisabled(),true);await page.screenshot({path:'output/wardrobe-felt/empty-390.png'});
 await page.evaluate(()=>{for(const [id,name] of [['a','湖小叽'],['b','小团子']])window.xcwcGuest.adopt({id:id.repeat(32),cityName:'杭州',cityCode:'hangzhou',active:true},name);window.xcwcGuest.select('a'.repeat(32));const value=window.xcwcGuest.read();value.balance=22;localStorage.setItem('xcwc.guest.v1',JSON.stringify(value))});
 await page.reload();await wardrobe.locator('#account-bird').waitFor();assert.equal(await wardrobe.locator('#account-bird').inputValue(),'a'.repeat(32));assert.equal(await button('lake_glow').isDisabled(),true);
 await page.screenshot({path:'output/wardrobe-felt/wardrobe-390.png'});
 // Supply deterministic test points directly in this isolated context only.
 await page.evaluate(()=>{const value=window.xcwcGuest.read();value.balance=100;localStorage.setItem('xcwc.guest.v1',JSON.stringify(value))});await page.reload();await button('lake_glow').filter({hasText:'兑换'}).waitFor();
 await button('lake_glow').click();await wardrobe.locator('.wardrobe-dialog[open]').waitFor();await wardrobe.locator('[data-account-action=cancel-redeem]').click();assert.equal(await page.evaluate(()=>window.xcwcGuest.snapshot().wallet.balance),100);
 await button('lake_glow').click();await wardrobe.locator('[data-account-action=confirm-redeem]').dblclick();await button('lake_glow').filter({hasText:'穿戴'}).waitFor();assert.equal(await page.evaluate(()=>window.xcwcGuest.snapshot().wallet.balance),70);assert.equal(await page.evaluate(()=>window.xcwcGuest.ledger().filter(x=>x.operation==='REDEEM').length),1);
 await button('lake_glow').click();await wardrobe.locator('.wardrobe-actor.aura-lake').waitFor();assert.equal(await button('lake_glow').isDisabled(),true);assert.equal(await page.evaluate(()=>window.xcwcGuest.snapshot().wallet.balance),70);
 await wardrobe.locator('#account-bird').selectOption('b'.repeat(32));await wardrobe.locator('.wardrobe-actor:not(.aura-lake)').waitFor();assert.equal(await button('lake_glow').innerText(),'穿戴');assert.equal(await page.evaluate(()=>window.xcwcGuest.read().currentId),'b'.repeat(32));
 await button('sunset_glow').click();await wardrobe.locator('[data-account-action=confirm-redeem]').click();await button('sunset_glow').filter({hasText:'穿戴'}).waitFor();await button('sunset_glow').click();await wardrobe.locator('.wardrobe-actor.aura-sunset').waitFor();assert.equal(await page.evaluate(()=>window.xcwcGuest.snapshot().wallet.balance),0);
 await page.reload();await wardrobe.locator('.wardrobe-actor.aura-sunset').waitFor();assert.equal(await wardrobe.locator('#account-bird').inputValue(),'b'.repeat(32));
 await wardrobe.locator('#account-bird').selectOption('a'.repeat(32));await wardrobe.locator('.wardrobe-actor.aura-lake').waitFor();await page.screenshot({path:'output/wardrobe-felt/lake-390.png'});
 await button('').click();await wardrobe.locator('.wardrobe-actor:not(.aura-lake)').waitFor();assert.equal(await button('').isDisabled(),true);assert.equal(await page.evaluate(()=>window.xcwcGuest.wardrobe().outfits.find(x=>x.birdId==='b'.repeat(32)).skinId),'sunset_glow');
 for(const width of [320,390,430,1024]){await page.setViewportSize({width,height:844});assert.equal(await wardrobe.evaluate(e=>e.scrollWidth>e.clientWidth),false,'wardrobe overflow '+width);assert.equal(await frame.locator('html').evaluate(e=>e.scrollWidth>innerWidth),false,'frame overflow '+width);assert.equal(await frame.locator('.bottom button').count(),4);await page.screenshot({path:`output/wardrobe-felt/wardrobe-${width}-owned.png`})}
 // Errors leave the selection unchanged and allow retry.
 await page.evaluate(()=>{const original=window.xcwcGuestOperation;window.xcwcGuestOperation=(op,a,...rest)=>op==='equip'?Promise.reject(Error('测试保存失败')):original(op,a,...rest)});
 await page.setViewportSize({width:390,height:844});await button('lake_glow').click();await page.waitForTimeout(250);assert.equal(await button('lake_glow').isDisabled(),false);assert.equal(await page.evaluate(()=>window.xcwcGuest.wardrobe().outfits.find(x=>x.birdId==='a'.repeat(32)).skinId),null);
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(JSON.stringify({passed:true,checks:['empty state','insufficient points','cancel redemption','double click debits once','shared unlock','per-bird wear','switch persisted','reload restoration','restore original','save error retry','320/390/430/1024 widths','four nav items','no backend writes or script errors'],screenshots:'output/wardrobe-felt/'},null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
