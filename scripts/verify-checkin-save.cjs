// Isolated browser storage; no real bird code, account or remote API is used.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8797';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:[]}));
  await page.goto(base);await page.waitForFunction(()=>!!window.xcwcGuest);
  await page.evaluate(()=>window.xcwcGuest.adopt({id:'a'.repeat(32),cityCode:'hangzhou',cityName:'杭州',typeId:'hy',skinId:'default',active:true},'测试小鸟'));
  await page.goto(base+'/?page=photo');const frame=page.frameLocator('iframe');
  const red=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=200;c.getContext('2d').fillRect(0,0,200,200);return c.toDataURL().split(',')[1]});
  await frame.locator('#ck-file').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(red,'base64')});
  await frame.locator('#ck-generate:not([disabled])').waitFor();
  let automaticDownloads=0;page.on('download',()=>automaticDownloads++);
  const dialog=page.locator('#xcwc-checkin-save');
  async function checkImage(width,height){
   await dialog.waitFor({state:'visible'});
   const image=dialog.locator('img');await image.evaluate(im=>im.decode());
   assert.deepEqual(await image.evaluate(im=>[im.naturalWidth,im.naturalHeight]),[width,height]);
   assert.equal(await image.evaluate(im=>getComputedStyle(im).userSelect),'auto');
   assert.match(await dialog.innerText(),/长按/);
   assert.equal(automaticDownloads,0,'opening the image must not download a file');
  }
  await frame.locator('#ck-download').click();await checkImage(1000,1010);
  const first=await dialog.locator('img').getAttribute('src');
  await dialog.locator('button').click();await dialog.waitFor({state:'hidden'});
  assert.equal(await dialog.locator('img').getAttribute('src'),null);
  assert(await page.evaluate(async url=>{try{await fetch(url);return false}catch{return true}},first),'closed image URL is revoked');
  await frame.locator('#ck-generate').click();await frame.locator('#ck-albumCount').filter({hasText:'1'}).waitFor();
  await frame.locator('.memory').first().click();await frame.locator('.viewer-download').click();await checkImage(1000,1010);
  await dialog.locator('button').click();
  await frame.locator('.viewer-original').click();await checkImage(200,200);
  const download=page.waitForEvent('download');await dialog.locator('a').click();const file=await download;assert(file.suggestedFilename().endsWith('.jpg'));
  await dialog.locator('button').click();
  await frame.locator('#ck-preview').evaluate(async canvas=>{const image=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));parent.postMessage({channel:'xcwc-checkin',id:'png-save-check',operation:'download',args:{image}},'*');});
  await dialog.waitFor({state:'visible'});assert.match(await dialog.locator('a').getAttribute('download'),/\.png$/);
  for(const width of [320,390]){await page.setViewportSize({width,height:844});assert(await dialog.evaluate(d=>d.getBoundingClientRect().width<=innerWidth));}
  await page.screenshot({path:'output/checkin-save-mobile.png',fullPage:true});
  await dialog.locator('button').click();assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:['preview image','saved composition','original photo dimensions','no automatic download','download fallback and extension','close revokes image URL','320/390px layout','no page errors'],limitations:['Native long-press photo menus require a real phone check.']},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
