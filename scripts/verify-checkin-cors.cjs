// Reproduce production's missing static CORS header using an actual HTTP response.
// Browser routing/fulfill can bypass CORS enforcement, so use a local proxy.
const http=require('node:http'),assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8791';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
(async()=>{
 let missing=false;
 const proxy=http.createServer((req,res)=>{
  if(missing&&req.url==='/assets/checkin/lake.jpg'){res.writeHead(404).end('Not found');return;}
  http.get(base+req.url,response=>{const headers={...response.headers};if(req.url.startsWith('/assets/'))delete headers['access-control-allow-origin'];res.writeHead(response.statusCode,headers);response.pipe(res);}).on('error',()=>res.writeHead(502).end());
 });
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 const engine=process.env.XCWC_BROWSER==='webkit'?webkit:chromium;
 let browser;
 try{
  browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:'+proxy.address().port;
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.xcwcGuest);
  await page.evaluate(()=>window.xcwcGuest.adopt({id:'a'.repeat(32),cityCode:'hangzhou',cityName:'杭州',typeId:'hy',skinId:'default',active:true},'测试小鸟'));
  await page.goto(url+'/?page=photo',{waitUntil:'domcontentloaded'});
  const frame=page.frameLocator('iframe');
  // No CORS headers: same-origin host reads still produce an exportable canvas.
  await frame.locator('.bird-card[aria-pressed=true]').waitFor();
  await frame.locator('#ck-file').setInputFiles('src/checkin-assets/lake.jpg');
  await frame.locator('#ck-generate:not([disabled])').waitFor({state:'attached'});
  assert.match(await frame.locator('#ck-preview').evaluate(c=>c.toDataURL('image/jpeg')),/^data:image\/jpeg/);
  await frame.locator('#ck-generate').click();await frame.locator('#ck-albumCount').filter({hasText:'1'}).waitFor();
  // The bridge must reject paths outside its fixed public asset keys.
  const code=await frame.locator('#ck-file').evaluate(()=>new Promise((resolve,reject)=>{
   const id='invalid-asset-probe',timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('asset probe timed out'));},5000);
   function receive(event){if(event.source!==window.parent||event.data?.id!==id||event.data.channel!=='xcwc-checkin-result')return;clearTimeout(timer);window.removeEventListener('message',receive);resolve(event.data.value?.code)}
   window.addEventListener('message',receive);window.parent.postMessage({channel:'xcwc-checkin',id,operation:'canvasAsset',args:{key:'../../api/private'}},'*');
  }));assert.equal(code,'INVALID_ASSET');
  missing=true;await page.reload({waitUntil:'domcontentloaded'});
  await frame.locator('.section-desc').filter({hasText:'合照素材暂时无法加载'}).waitFor({state:'attached'});
  await frame.locator('#ck-file').setInputFiles('src/checkin-assets/lake.jpg');
  await frame.locator('#ck-toast').filter({hasText:'合照素材加载失败'}).waitFor({state:'attached'});
  assert(!/照片没能打开/.test(await frame.locator('#ck-toast').textContent()));
  assert(await frame.locator('#ck-generate').isDisabled());
  assert.deepEqual(errors,[],'asset failure must be handled without unhandled rejection');
  console.log('PASS '+engine.name()+': no-CORS canvas/save succeeds; private asset key rejected; actual 404 is reported as asset failure; no unhandled rejection');
 }finally{if(browser)await browser.close();await new Promise(resolve=>proxy.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
