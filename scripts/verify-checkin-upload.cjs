// Isolated browser-local fixture; no API writes or real photos.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8787';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
(async()=>{
 for(const engine of (process.env.XCWC_BROWSER==='webkit'?[webkit]:[chromium,...(fs.existsSync(webkit.executablePath())?[webkit]:[])])){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[],decoderRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/vendor/heic-to-'))decoderRequests.push(r.url());});
 await page.addInitScript(()=>{HTMLImageElement.prototype.decode=()=>Promise.reject(Error('decode unavailable'));});
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.xcwcGuest);
 await page.evaluate(()=>window.xcwcGuest.adopt({id:'a'.repeat(32),cityCode:'hangzhou',cityName:'杭州',typeId:'hy',skinId:'default',active:true},'测试小鸟'));
 await page.goto(base+'/?page=photo',{waitUntil:'domcontentloaded'});
 const frame=page.frameLocator('iframe');await frame.locator('.bird-card[aria-pressed=true]').waitFor();
 const file=frame.locator('#ck-file');
 // Native chooser activation is also checked; setInputFiles alone bypasses it.
 const chooser=page.waitForEvent('filechooser');await frame.locator('#ck-dropzone').click();await (await chooser).setFiles([]);
 async function setFile(payload){await file.setInputFiles(payload);await file.evaluate(el=>new Promise((resolve,reject)=>{const deadline=Date.now()+30000;function poll(){if(!el.value)return resolve();if(Date.now()>deadline)return reject(Error('upload did not settle'));setTimeout(poll,20)}poll()}));}const jpg=fs.readFileSync('src/checkin-assets/lake.jpg');
 // The payload is JPEG to test MIME gating, not a claim of native HEIC decoding.
 for(const [name,mimeType] of [['photo.JPG','image/jpeg'],['IMG_001.HEIC','image/heic'],['IMG_002.heif','image/heif'],['IMG_003.JPG',''],['IMG_004.HEIC','application/octet-stream']]){
 await setFile({name,mimeType,buffer:jpg});
 await frame.locator('#ck-toast').filter({hasText:'照片就位'}).waitFor({state:'attached'});assert(await frame.locator('#ck-generate').isEnabled());
 assert.equal(await file.inputValue(),'');
 }
 assert.equal(decoderRequests.length,0,'normal photos never load the HEIC decoder');
 const heic=fs.readFileSync('tests/fixtures/example.heic');
 // Emulate an iPhone container with no native HEIC decoding: fail the first
 // blob and data URL attempts, then let the real converted JPEG load normally.
 await file.evaluate(()=>{const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');window.__originalImageSrc=descriptor;let attempts=2;Object.defineProperty(HTMLImageElement.prototype,'src',{...descriptor,set(value){descriptor.set.call(this,attempts>0&&/^(blob:|data:)/.test(value)?(attempts--,'data:image/jpeg;base64,broken'):value);}});});
 await setFile({name:'iPhone-photo.HEIC',mimeType:'image/heic',buffer:heic});
 await frame.locator('#ck-toast').filter({hasText:'照片就位'}).waitFor({state:'attached'});assert(await frame.locator('#ck-generate').isEnabled());
 await file.evaluate(()=>Object.defineProperty(HTMLImageElement.prototype,'src',window.__originalImageSrc));assert(decoderRequests.length>0,'failed native HEIC decoding loads the local converter');
 // Test the actual local decoder even if this engine supports native HEIC.
 const conversion=await file.evaluate(async(el,{base64,source})=>{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const blob=await new Function('blob',source+';return convertCheckinHeic(blob);')(new Blob([bytes],{type:'image/heic'}));const url=URL.createObjectURL(blob);try{const im=new Image();const loaded=new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=reject;});im.src=url;await loaded;return{type:blob.type,size:blob.size,width:im.naturalWidth,height:im.naturalHeight};}finally{URL.revokeObjectURL(url);}},{base64:heic.toString('base64'),source:fs.readFileSync('src/checkin-photo.js','utf8').replaceAll('__XCWC_ASSET_ORIGIN__',base)});
 assert.equal(conversion.type,'image/jpeg');assert(conversion.size>1000);assert.equal(conversion.width,1280);assert.equal(conversion.height,854);
 await setFile({name:'camera-export',mimeType:'application/octet-stream',buffer:heic});await frame.locator('#ck-toast').filter({hasText:'照片就位'}).waitFor({state:'attached'});
 // Force the blob URL failure path while preserving real FileReader/image loading.
 await frame.locator('#ck-file').evaluate(()=>{window.__createObjectURL=URL.createObjectURL;URL.createObjectURL=()=> 'blob:invalid-photo';});
 await setFile({name:'fallback.jpg',mimeType:'image/jpeg',buffer:jpg});
 await frame.locator('#ck-toast').filter({hasText:'照片就位'}).waitFor({state:'attached'});assert.match(await frame.locator('#ck-uploadThumb').getAttribute('src'),/^data:image\/jpeg/);
 await frame.locator('#ck-file').evaluate(()=>{URL.createObjectURL=window.__createObjectURL;});
 await setFile({name:'broken.heic',mimeType:'image/heic',buffer:Buffer.from('invalid')});
 await frame.locator('#ck-toast').filter({hasText:'照片没能打开'}).waitFor({state:'attached'});assert.equal(await file.inputValue(),'');
 assert(await frame.locator('#ck-generate').isEnabled(),'failed replacement keeps previous photo');
 await setFile({name:'truncated.HEIC',mimeType:'image/heic',buffer:heic.subarray(0,200)});await frame.locator('#ck-toast').filter({hasText:'照片没能打开'}).waitFor({state:'attached'});assert(await frame.locator('#ck-generate').isEnabled());
 await setFile({name:'wrong.txt',mimeType:'text/plain',buffer:Buffer.from('text')});
 await frame.locator('#ck-toast').filter({hasText:'请选择'}).waitFor({state:'attached'});assert.equal(await file.inputValue(),'');
 await setFile({name:'retry.jpg',mimeType:'image/jpeg',buffer:jpg});await frame.locator('#ck-toast').filter({hasText:'照片就位'}).waitFor({state:'attached'});
 // Save a real camera-format photo through the UI, not only the decoder helper.
 await setFile({name:'saved-camera.heic',mimeType:'image/heic',buffer:heic});await frame.locator('#ck-toast').filter({hasText:'照片就位'}).waitFor({state:'attached'});
 await frame.locator('#ck-generate').click();try{await frame.locator('#ck-albumCount').filter({hasText:'1'}).waitFor();}catch(error){console.error('SAVE DIAGNOSTICS',await frame.locator('#ck-toast').textContent(),await frame.locator('.section-desc').textContent(),errors);throw error;}
 await page.reload({waitUntil:'domcontentloaded'});await frame.locator('#ck-albumCount').filter({hasText:'1'}).waitFor();
 await frame.locator('.memory').first().click();await frame.locator('#ck-viewer[open]').waitFor();const viewerBox=await frame.locator('#ck-viewer').boundingBox();assert(viewerBox&&viewerBox.y>=0&&viewerBox.y+viewerBox.height<=844,'album dialog stays within mobile viewport');assert(await frame.locator('#ck-viewerImage').evaluate(im=>im.complete&&im.naturalWidth>0));await frame.locator('#ck-viewer .close').click();
 assert.deepEqual(errors,[]);console.log('PASS '+engine.name()+': native chooser, real HEIC local decode, header sniffing, lazy decoder, MIME variants, FileReader fallback, corrupt file, retry, save/reload');
 }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1});
