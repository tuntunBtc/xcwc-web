// Isolated browser storage. OS share sheets are stubbed; no private image uploads.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8797';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
   window.__shareMode='unsupported';window.__shares=[];
   Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>window.__shareMode!=='unsupported'});
   Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{
    window.__shares.push({type:data.files[0].type,name:data.files[0].name,bytes:data.files[0].size,active:navigator.userActivation.isActive});
    if(window.__shareMode==='cancel')throw new DOMException('cancel','AbortError');
    if(window.__shareMode==='failure')throw new DOMException('blocked','NotAllowedError');
    if(window.__shareMode==='pending')await new Promise(resolve=>window.__finishShare=resolve);
   }});
  });
  const page=await context.newPage(),errors=[],uploads=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')uploads.push(r.url())});
  await page.route('**/api/**',r=>r.fulfill({json:[]}));
  await page.goto(base);await page.waitForFunction(()=>!!window.xcwcGuest);
  await page.evaluate(()=>window.xcwcGuest.adopt({id:'a'.repeat(32),cityCode:'hangzhou',cityName:'杭州',typeId:'hy',skinId:'default',active:true},'测试小鸟'));
  await page.goto(base+'/?page=photo');const frame=page.frameLocator('iframe');
  await frame.locator('#ck-editor').evaluate(e=>e.open=true);
  assert(await frame.locator('#ck-download').isDisabled(),'do not export the demo photo');
  await frame.locator('#ck-file').setInputFiles('src/checkin-assets/lake.jpg');
  await frame.locator('#ck-generate:not([disabled])').waitFor();
  assert.equal(await frame.locator('#ck-viewer,.viewer-original').count(),0,'old nested viewer and original button removed');
  let automaticDownloads=0;page.on('download',()=>automaticDownloads++);
  const dialog=page.locator('#xcwc-checkin-save'),close=dialog.locator('[data-save-close]'),action=dialog.locator('[data-save-share]');
  async function checkViewer(){
   await dialog.waitFor({state:'visible'});await dialog.locator('img').evaluate(im=>im.decode());
   assert.deepEqual(await dialog.locator('img').evaluate(im=>[im.naturalWidth,im.naturalHeight]),[1000,1010]);
   assert.equal(await page.locator('dialog[open]').count(),1);assert.equal(await frame.locator('dialog[open]').count(),0);
   assert.equal(await dialog.locator('img').evaluate(im=>getComputedStyle(im).userSelect),'auto');
   assert.equal(await action.count(),1);assert.equal(await dialog.locator('details').getAttribute('open'),null);
  }
  async function dismiss(){await close.click();await dialog.waitFor({state:'hidden'});assert.equal(await dialog.locator('img').getAttribute('src'),null)}
  const initial=(await page.evaluate(()=>xcwcLocalAlbum.run('history',{}))).total;
  await frame.locator('#ck-download').click();await checkViewer();assert.match(await dialog.innerText(),/预览合照/);
  assert.equal((await page.evaluate(()=>xcwcLocalAlbum.run('history',{}))).total,initial,'viewing preview does not collect a work');
  const first=await dialog.locator('img').getAttribute('src');await dismiss();
  assert(await page.evaluate(async url=>{try{await fetch(url);return false}catch{return true}},first),'closing revokes private image URL');
  await frame.locator('#ck-generate').click();await checkViewer();assert.match(await dialog.innerText(),/已收藏到打卡相册/);
  assert.equal(await page.locator('#xcwc-checkin-save').count(),1,'generation reuses the same viewer');
  await dismiss();await frame.locator('#ck-albumCount').filter({hasText:'1'}).waitFor();
  await frame.locator('.memory').first().click();await checkViewer();
  const albumBefore=await page.evaluate(async()=>({total:(await xcwcLocalAlbum.run('history',{})).total,balance:(await xcwcLocalAlbum.run('points',{})).balance}));
  // Unsupported share stays in this one viewer and shows long-press guidance.
  await action.click();assert.match(await dialog.locator('[data-save-hint]').innerText(),/长按/);assert.equal(await page.locator('dialog[open]').count(),1);
  assert.equal(automaticDownloads,0);assert.deepEqual(await page.evaluate(()=>window.__shares),[]);
  await dialog.locator('summary').click();const download=page.waitForEvent('download');await dialog.locator('a').click();assert((await download).suggestedFilename().endsWith('.jpg'));
  await dismiss();
  // Opening a photo never auto-shares. Only the explicit save click calls the OS API.
  await page.evaluate(()=>window.__shareMode='success');await frame.locator('.memory').first().click();await checkViewer();
  assert.equal((await page.evaluate(()=>window.__shares)).length,0);
  await action.click();const shared=await page.evaluate(()=>window.__shares);assert.equal(shared.length,1);assert.equal(shared[0].type,'image/jpeg');assert(shared[0].active);assert(shared[0].bytes>0);
  assert.equal(await page.locator('dialog[open]').count(),1,'save creates no second web dialog');
  await page.evaluate(()=>window.__shareMode='cancel');await action.click();assert.doesNotMatch(await dialog.locator('[data-save-hint]').innerText(),/无法打开/);
  await page.evaluate(()=>window.__shareMode='failure');await action.click();await dialog.locator('[data-save-hint]').filter({hasText:'无法打开'}).waitFor();
  await page.evaluate(()=>window.__shareMode='pending');await action.click();assert(await action.isDisabled());
  const count=(await page.evaluate(()=>window.__shares)).length;await action.evaluate(e=>e.click());assert.equal((await page.evaluate(()=>window.__shares)).length,count,'ignore duplicate saves while system menu is open');
  await page.evaluate(()=>window.__finishShare());await action.waitFor();await page.waitForFunction(()=>!document.querySelector('[data-save-share]').disabled);
  const albumAfter=await page.evaluate(async()=>({total:(await xcwcLocalAlbum.run('history',{})).total,balance:(await xcwcLocalAlbum.run('points',{})).balance}));assert.deepEqual(albumAfter,albumBefore,'saving/cancelling does not create works or award again');
  await dismiss();await frame.locator('.memory').first().click();await checkViewer();
  for(const width of [320,390,1024]){
   await page.setViewportSize({width,height:844});assert(await dialog.evaluate(d=>{const r=d.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight}));
   assert(await action.evaluate(b=>b.getBoundingClientRect().height>=48));
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/checkin-save-unified-mobile.png',fullPage:true});await dismiss();
  await frame.locator('.checkin-page .back').click();assert.equal(await page.locator('dialog[open]').count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);
  console.log(JSON.stringify({passed:true,checks:['original export button removed','one viewer for preview/generation/album','generation opens collected photo','explicit native share with user activation (stubbed)','no repeated web dialogs','cancel/failure/retry','double-save blocked','works and reward unchanged by export','download fallback','URL cleanup','320/390/1024px layout','no uploads or page errors'],limitations:['iPhone/Android native menu and long-press behavior still require real devices.']},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
