// Profile-only felt regression, isolated guest storage and fictional entities.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8797';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url())});
  await page.route('**/api/**',route=>route.fulfill({json:[]}));
  fs.mkdirSync('output/profile-felt',{recursive:true});
  await page.goto(base+'/?page=profile');await page.waitForFunction(()=>!!window.xcwcGuest);
  const frame=page.frameLocator('iframe'),profile=frame.locator('#xcwc-account-page.account-profile-felt');
  await profile.locator('[data-account-action=clear-cache]').waitFor();
  assert.match(await profile.innerText(),/等待第一位小伙伴/);assert.match(await profile.locator('.profile-points').innerText(),/0/);
  await page.screenshot({path:'output/profile-felt/empty-390.png',fullPage:true});
  // Public-looking but fictional entities; no real code or server mutation.
  await page.evaluate(()=>{
   for(const [id,name] of [['a','软软小黄莺'],['b','毛绒小伙伴']])window.xcwcGuest.adopt({id:id.repeat(32),cityCode:'hangzhou',cityName:'杭州',typeId:'hy',skinId:'default',active:true},name);
   window.xcwcGuest.care('b'.repeat(32),'greet');localStorage.setItem('profile-test-unrelated','keep');
  });
  await page.reload();await profile.locator('.profile-card-copy strong').filter({hasText:'毛绒小伙伴'}).waitFor();
  assert.equal(await profile.locator('.profile-points strong').innerText(),'7');assert.match(await profile.locator('[data-go=flock]').innerText(),/2 只伙伴/);
  assert.equal(await frame.locator('.bottom button').count(),4);assert.match((await frame.locator('.bottom button').allTextContents()).join(''),/小窝.*城市.*商城.*我的/);
  assert.equal(await frame.locator('.bottom button.active').getAttribute('data-go'),'profile');
  assert.equal(await profile.locator('.account-cloud-section').isVisible(),false);assert.equal(await profile.locator('[data-account-action=account]').isVisible(),false);assert.equal(await profile.locator('[data-account-action=logout]').isVisible(),false);
  const badge=await profile.locator('.local-experience-note').innerText();
  await profile.locator('.profile-points').click();await profile.locator('[data-wallet-content] strong').filter({hasText:'7 叽分'}).waitFor();
  assert.equal(await profile.locator('.local-experience-note').innerText(),badge);assert.match(await profile.locator('[data-wallet-content]').innerText(),/初见礼/);
  // Retained navigation and sub-page controls.
  await profile.locator('[data-go=wardrobe]').click();await frame.locator('#account-bird').waitFor();assert.equal(await frame.locator('.account-profile-felt').count(),0);assert.equal(await frame.locator('#account-bird option').count(),2);
  await frame.locator('.bottom [data-go=profile]').click();await profile.locator('[data-go=flock]').click();await frame.locator('[data-account-action=select]').first().waitFor();assert.equal(await frame.locator('[data-account-action=select]').count(),2);
  await frame.locator('[data-account-action=select]').first().click();await frame.locator('#xcwc-nest #name').filter({hasText:'软软小黄莺'}).waitFor();
  await frame.locator('.bottom [data-go=profile]').click();await profile.locator('.profile-card-copy strong').filter({hasText:'软软小黄莺'}).waitFor();
  await page.reload();await profile.locator('.profile-card-copy strong').filter({hasText:'软软小黄莺'}).waitFor();
  async function fit(width,label){
   await page.setViewportSize({width,height:844});
   assert.equal(await frame.locator('html').evaluate(e=>e.scrollWidth>innerWidth),false,`frame overflow ${label} ${width}`);
   assert.equal(await profile.evaluate(e=>e.scrollWidth>e.clientWidth),false,`profile overflow ${label} ${width}`);
   for(const selector of ['.profile-points','.account-menu button']){
    for(const height of await profile.locator(selector).evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>n.getBoundingClientRect().height)))assert(height>=44,`touch size ${selector}`);
   }
  }
  for(const width of [320,390,430,1024]){await fit(width,'normal');await page.screenshot({path:`output/profile-felt/profile-${width}.png`,fullPage:true});}
  // Long cached names must not expand the card. User input still has its own six-char rule.
  await page.evaluate(()=>{const value=JSON.parse(localStorage.getItem('xcwc.guest.v1'));value.birds.find(b=>b.id===value.currentId).name='非常长的缓存昵称测试ABCDEFGHIJKLMNOPQRSTUVWXYZ';localStorage.setItem('xcwc.guest.v1',JSON.stringify(value))});
  await page.reload();await profile.locator('.profile-card-copy strong').filter({hasText:'非常长的缓存昵称测试'}).waitFor();for(const width of [320,390])await fit(width,'long name');
  await page.screenshot({path:'output/profile-felt/long-name-390.png',fullPage:true});
  // Cancel is read-only, including the complete guest record.
  const before=await page.evaluate(()=>localStorage.getItem('xcwc.guest.v1'));
  await profile.locator('[data-account-action=clear-cache]').click();await profile.locator('.account-cache-dialog[open]').waitFor();assert.match(await profile.locator('.account-cache-dialog').innerText(),/无法恢复/);
  await page.screenshot({path:'output/profile-felt/reset-dialog-390.png',fullPage:true});
  await profile.locator('[data-account-action=cancel-cache]').click();assert.equal(await page.evaluate(()=>localStorage.getItem('xcwc.guest.v1')),before);
  await profile.locator('[data-account-action=clear-cache]').click();const reload=page.waitForEvent('domcontentloaded');await profile.locator('[data-account-action=confirm-cache]').click();await reload;
  await profile.locator('[data-account-action=clear-cache]').waitFor();assert.equal((await page.evaluate(()=>window.xcwcGuest.snapshot())).birds.length,0);assert.equal((await page.evaluate(()=>window.xcwcGuest.snapshot())).wallet.balance,0);assert.equal(await page.evaluate(()=>localStorage.getItem('profile-test-unrelated')),'keep');
  // Corrupt records keep the error visible and preserve access to the explicit reset flow.
  await page.evaluate(()=>localStorage.setItem('xcwc.guest.v1','not-json'));await page.reload();await profile.locator('[data-account-action=clear-cache]').waitFor();assert.match(await profile.innerText(),/账号数据暂不可用/);
  await page.screenshot({path:'output/profile-felt/corrupt-390.png',fullPage:true});
  await profile.locator('[data-account-action=clear-cache]').click();await profile.locator('[data-account-action=cancel-cache]').click();assert.equal(await page.evaluate(()=>localStorage.getItem('xcwc.guest.v1')),'not-json');
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log(JSON.stringify({passed:true,checks:['empty profile','dynamic bird name/balance/count','four navigation items','wardrobe/flock/select controls','wallet preserves local notice','320/390/430/1024 widths','long cached name','cache reset cancel preserves record','cache reset confirm clears guest state and reloads','unrelated storage preserved','corrupt record retains reset entry','no backend writes or script errors'],screenshots:'output/profile-felt/'},null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
