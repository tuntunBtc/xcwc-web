// Isolated browser-local fixture; no API writes or real photos.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8787';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
(async()=>{
 for(const engine of [chromium,...(fs.existsSync(webkit.executablePath())?[webkit]:[])]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{HTMLImageElement.prototype.decode=()=>Promise.reject(Error('decode unavailable'));});
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.xcwcGuest);
 await page.evaluate(()=>window.xcwcGuest.adopt({id:'a'.repeat(32),cityCode:'hangzhou',cityName:'杭州',typeId:'hy',skinId:'default',active:true},'测试小鸟'));
 await page.goto(base+'/?page=photo',{waitUntil:'domcontentloaded'});
 const frame=page.frameLocator('iframe');await frame.locator('.bird-card[aria-pressed=true]').waitFor();
 const file=frame.locator('#ck-file');async function setFile(payload){await file.setInputFiles(payload);await file.evaluate(el=>new Promise((resolve,reject)=>{const deadline=Date.now()+10000;function poll(){if(!el.value)return resolve();if(Date.now()>deadline)return reject(Error('upload did not settle'));setTimeout(poll,20)}poll()}));}const jpg=fs.readFileSync('src/checkin-assets/lake.jpg');
 // The payload is JPEG to test MIME gating, not a claim of native HEIC decoding.
 for(const [name,mimeType] of [['photo.JPG','image/jpeg'],['IMG_001.HEIC','image/heic'],['IMG_002.heif','image/heif'],['IMG_003.JPG',''],['IMG_004.HEIC','application/octet-stream']]){
 await setFile({name,mimeType,buffer:jpg});
 await frame.locator('#ck-toast').filter({hasText:'照片就位'}).waitFor({state:'attached'});assert(await frame.locator('#ck-generate').isEnabled());
 assert.equal(await file.inputValue(),'');
 }
 // Force the blob URL failure path while preserving real FileReader/image loading.
 await frame.locator('#ck-file').evaluate(()=>{window.__createObjectURL=URL.createObjectURL;URL.createObjectURL=()=> 'blob:invalid-photo';});
 await setFile({name:'fallback.jpg',mimeType:'image/jpeg',buffer:jpg});
 await frame.locator('#ck-toast').filter({hasText:'照片就位'}).waitFor({state:'attached'});assert.match(await frame.locator('#ck-uploadThumb').getAttribute('src'),/^data:image\/jpeg/);
 await frame.locator('#ck-file').evaluate(()=>{URL.createObjectURL=window.__createObjectURL;});
 await setFile({name:'broken.heic',mimeType:'image/heic',buffer:Buffer.from('invalid')});
 await frame.locator('#ck-toast').filter({hasText:'照片没能打开'}).waitFor({state:'attached'});assert.equal(await file.inputValue(),'');
 assert(await frame.locator('#ck-generate').isEnabled(),'failed replacement keeps previous photo');
 await setFile({name:'wrong.txt',mimeType:'text/plain',buffer:Buffer.from('text')});
 await frame.locator('#ck-toast').filter({hasText:'请选择'}).waitFor({state:'attached'});assert.equal(await file.inputValue(),'');
 await setFile({name:'retry.jpg',mimeType:'image/jpeg',buffer:jpg});await frame.locator('#ck-toast').filter({hasText:'照片就位'}).waitFor({state:'attached'});
 await frame.locator('#ck-generate').click();await frame.locator('#ck-albumCount').filter({hasText:'1'}).waitFor();
 await page.reload({waitUntil:'domcontentloaded'});await frame.locator('#ck-albumCount').filter({hasText:'1'}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS '+engine.name()+': MIME variants, no decode(), FileReader fallback, corrupt file, retry, local save/reload');
 }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1});
