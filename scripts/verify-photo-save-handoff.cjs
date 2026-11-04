// Secure helper routing and native share are stubbed; image bytes never leave this browser.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8797';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
  context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
  await context.addInitScript(()=>{
   // localhost is normally a secure context: emulate the production HTTP entry.
   if(location.pathname!=='/photo-save.html')Object.defineProperty(window,'isSecureContext',{value:false});
   window.__shares=[];
   Object.defineProperty(navigator,'canShare',{value:()=>true});
   Object.defineProperty(navigator,'share',{value:async data=>{
    const image=data.files[0],active=navigator.userActivation.isActive;
    window.__shares.push({type:image.type,size:image.size,active,bytes:Array.from(new Uint8Array(await image.arrayBuffer()))});
   }});
  });
  // Treat localhost HTTPS as a secure origin while serving only our local build.
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.host!==new URL(base).host)return route.abort();
   if(url.pathname.startsWith('/api/'))return route.fulfill({json:[]});
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><script src="/photo-save.js"></script>'});
   const response=await context.request.get(base+url.pathname+url.search);await route.fulfill({response});
  });
  const page=await context.newPage();await page.goto(base);
  const original=await page.evaluate(async()=>{
   localStorage.setItem('save-handoff-sentinel','preserved');
   const canvas=document.createElement('canvas');canvas.width=canvas.height=50;canvas.getContext('2d').fillRect(0,0,50,50);
   window.__testBlob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   const open=window.open.bind(window);window.__originalOpen=open;window.__openCount=0;window.open=(...args)=>{window.__openCount++;return open(...args)};
   const button=document.createElement('button');button.textContent='打开合照';button.onclick=()=>window.xcwcPhotoSave.show(window.__testBlob,{label:'山野测试',createdAt:'2026-11-03T06:26:00.000Z',note:'合照已收藏'});document.body.append(button);
   return Array.from(new Uint8Array(await window.__testBlob.arrayBuffer()));
  });
  // Opening a viewer, even during an actual user click, must not open another page/menu.
  await page.getByRole('button',{name:'打开合照',exact:true}).click();
  const dialog=page.locator('#xcwc-checkin-save');await dialog.waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__openCount),0);assert.deepEqual(await page.evaluate(()=>window.__shares),[]);assert.equal(context.pages().length,1);
  const popupEvent=context.waitForEvent('page');await dialog.locator('[data-save-share]').click();const popup=await popupEvent;
  await popup.waitForLoadState();const secureView=popup.locator('#photo-save-content > section#xcwc-checkin-save');await secureView.waitFor({state:'visible'});
  assert.equal(await popup.locator('dialog').count(),0,'the secure helper uses one inline view, not a second dialog');
  await secureView.locator('img').evaluate(image=>image.decode());
  assert.deepEqual(await secureView.locator('img').evaluate(image=>[image.naturalWidth,image.naturalHeight]),[50,50]);
  assert.match(await secureView.locator('.photo-meta').innerText(),/山野测试/);assert.equal(await secureView.locator('.photo-note').innerText(),'合照已收藏');
  assert.equal(await popup.evaluate(()=>window.opener),null);assert.equal(new URL(popup.url()).hash,'');
  assert.equal(page.url(),base+'/');assert.equal(await page.evaluate(()=>localStorage.getItem('save-handoff-sentinel')),'preserved');
  assert.deepEqual(await popup.evaluate(()=>window.__shares),[],'receiving an image does not automatically open native sharing');
  await secureView.locator('[data-save-share]').click();await popup.waitForFunction(()=>window.__shares.length===1);
  const calls=await popup.evaluate(()=>window.__shares);assert.equal(calls[0].type,'image/png');assert.equal(calls[0].size,original.length);assert(calls[0].active);assert.deepEqual(calls[0].bytes,original);
  await popup.screenshot({path:'output/checkin-native-save-mobile.png',fullPage:true});
  // A popup blocker leaves the same full-size viewer and long-press path usable.
  await page.evaluate(()=>{window.open=()=>null});
  await dialog.locator('[data-save-share]').click();await dialog.locator('[data-save-hint]').filter({hasText:'未能打开'}).waitFor();
  assert(await dialog.locator('img').isVisible());assert(await dialog.locator('[data-save-share]').isEnabled());assert.equal(await page.locator('dialog[open]').count(),1);
  // Missing opener/token cannot accept arbitrary photos.
  const unpaired=await context.newPage();await unpaired.goto(base.replace('http:','https:')+'/photo-save.html');assert.match(await unpaired.locator('#save-status').innerText(),/返回合照/);assert.equal(await unpaired.locator('#photo-save-content section').count(),0);
  // Open a paired receiver without the automatic sender, then probe its guards.
  const token='a'.repeat(32),secureOrigin=base.replace('http:','https:');
  const [guarded]=await Promise.all([context.waitForEvent('page'),page.evaluate(({url})=>{window.__guarded=window.__originalOpen(url,'_blank')},{url:secureOrigin+'/photo-save.html#'+token})]);await guarded.waitForLoadState();
  const send=async(kind)=>page.evaluate(({kind,token,origin})=>{
   const image=kind==='invalid-image'?new Blob(['not a photo'],{type:'text/plain'}):window.__testBlob;
   window.__guarded.postMessage({channel:'xcwc-photo-save-image',token:kind==='wrong-token'?'b'.repeat(32):token,image},origin);
  },{kind,token,origin:secureOrigin});
  await send('wrong-token');await send('invalid-image');
  // A sibling frame has the same origin but is not the opener: it must also be rejected.
  await page.evaluate(({token,origin})=>{
   const frame=document.createElement('iframe');document.body.append(frame);
   frame.contentWindow.eval(`parent.__guarded.postMessage({channel:'xcwc-photo-save-image',token:${JSON.stringify(token)},image:parent.__testBlob},${JSON.stringify(origin)})`);
  },{token,origin:secureOrigin});
  assert.equal(await guarded.locator('#photo-save-content section').count(),0);assert.notEqual(new URL(guarded.url()).hash,'');
  await send('valid');await guarded.locator('#photo-save-content section').waitFor({state:'visible'});assert.equal(await guarded.evaluate(()=>window.opener),null);assert.equal(new URL(guarded.url()).hash,'');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:['viewer opening does not open a page or share sheet','HTTP to HTTPS helper transfers exact PNG bytes and metadata locally','one inline helper view without a dialog','source page and local data preserved','opener detached and token removed after transfer','native share only after button click with user activation (stubbed)','unpaired page, wrong token, wrong source and invalid MIME rejected','popup blocker keeps the single-view long-press fallback','no page errors'],limitations:['OS share sheet needs iPhone/Android validation.']},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
