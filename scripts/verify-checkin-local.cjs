// Isolated local browser data: slow initialization, real cross-tab writes, retry and reset.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8791';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
(async()=>{
 for(const engine of [chromium,...(fs.existsSync(webkit.executablePath())?[webkit]:[])]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  try{
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.xcwcGuest);
   await page.evaluate(()=>window.xcwcGuest.adopt({id:'a'.repeat(32),cityCode:'hangzhou',cityName:'杭州',typeId:'hy',skinId:'default',active:true},'测试小鸟'));
   let release;const gate=new Promise(resolve=>{release=resolve});
   await page.route('**/api/checkin-catalog',async route=>{await gate;await route.fulfill({json:[]})});
   await page.goto(base+'/?page=photo',{waitUntil:'domcontentloaded'});
   const red=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=200;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,200,200);return c.toDataURL().split(',')[1]});
   const frame=page.frameLocator('iframe');await frame.locator('#ck-file').setInputFiles({name:'red.png',mimeType:'image/png',buffer:Buffer.from(red,'base64')});
   await frame.locator('#ck-toast').filter({hasText:'照片就位'}).waitFor({state:'attached'});release();
   await frame.locator('#ck-generate:not([disabled])').waitFor({state:'attached'});
   const pixel=await frame.locator('#ck-preview').evaluate(c=>[...c.getContext('2d').getImageData(100,100,1,1).data]);assert.deepEqual(pixel,[255,0,0,255]);
   await frame.locator('#ck-generate').click();await frame.locator('#ck-albumCount').filter({hasText:'1'}).waitFor();
   const saved=await page.evaluate(async()=>{const h=await xcwcLocalAlbum.run('history',{}),blob=await xcwcLocalAlbum.run('original',{id:h.items[0].id});const url=URL.createObjectURL(blob),im=new Image();try{im.src=url;await im.decode();return {width:im.width,height:im.height}}finally{URL.revokeObjectURL(url)}});assert.deepEqual(saved,{width:200,height:200});
   await page.evaluate(()=>xcwcLocalAlbum.clear());
   // Seed 29 valid records; two tabs then compete for the final slot.
   await page.evaluate(async red=>{const bytes=Uint8Array.from(atob(red),c=>c.charCodeAt(0)).buffer;const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('xcwc.guest.album.v1',1);q.onsuccess=()=>resolve(q.result);q.onerror=reject});try{await new Promise((resolve,reject)=>{const tx=db.transaction('works','readwrite');for(let i=0;i<29;i++){const id=('seed'+i).padStart(32,'0');tx.objectStore('works').add({id,metadata:{requestId:id,birdIds:['a'.repeat(32)],styleId:'natural',label:'seed'},original:bytes,image:bytes,originalType:'image/png',imageType:'image/png',createdAt:new Date().toISOString(),reward:0});}tx.oncomplete=resolve;tx.onabort=reject;});}finally{db.close()}},red);
   const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(base,{waitUntil:'domcontentloaded'});await second.waitForFunction(()=>!!window.xcwcLocalAlbum);
   const create=(target,id,label='test')=>target.evaluate(async({id,label,red})=>{const bytes=Uint8Array.from(atob(red),c=>c.charCodeAt(0));return xcwcLocalAlbum.run('create',{metadata:{requestId:id,birdIds:['a'.repeat(32)],styleId:'natural',label},original:new Blob([bytes],{type:'image/png'}),image:new Blob([bytes],{type:'image/png'})})},{id,label,red});
   const ids=['1'.repeat(32),'2'.repeat(32)];const outcomes=await Promise.allSettled([create(page,ids[0]),create(second,ids[1])]);
   assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);const failure=outcomes.find(r=>r.status==='rejected');assert.match(failure.reason.message,/30 张/);
   assert.equal((await page.evaluate(()=>xcwcLocalAlbum.run('history',{}))).total,30);
   const winner=outcomes.findIndex(r=>r.status==='fulfilled');const replay=await create(page,ids[winner]);assert.equal(replay.id,ids[winner]);
   await assert.rejects(create(second,ids[winner],'different'),/同一请求编号/);
   await page.evaluate(()=>xcwcLocalAlbum.clear());
   const same=await Promise.all([create(page,'3'.repeat(32)),create(second,'3'.repeat(32))]);assert.equal(same[0].id,same[1].id);assert.equal(same[0].reward,same[1].reward);assert.equal((await page.evaluate(()=>xcwcLocalAlbum.run('history',{}))).total,1);
   // Clearing while hashing must cancel the old write, without resurrecting photos.
   const reset=await page.evaluate(async red=>{
    const previous=xcwcDigestBlob;let release,started;const gate=new Promise(r=>{release=r}),entered=new Promise(r=>{started=r});let first=true;
    window.xcwcDigestBlob=async blob=>{if(first){first=false;started();await gate}return previous(blob)};
    const bytes=Uint8Array.from(atob(red),c=>c.charCodeAt(0));
    const saving=xcwcLocalAlbum.run('create',{metadata:{requestId:'4'.repeat(32),birdIds:['a'.repeat(32)],styleId:'natural',label:'reset'},original:new Blob([bytes],{type:'image/png'}),image:new Blob([bytes],{type:'image/png'})}).then(()=>({ok:true}),e=>({ok:false,message:e.message}));
    await entered;await xcwcLocalAlbum.clear();release();try{return {result:await saving,total:(await xcwcLocalAlbum.run('history',{})).total}}finally{window.xcwcDigestBlob=previous}
   },red);assert.equal(reset.result.ok,false);assert.match(reset.result.message,/正在清除/);assert.equal(reset.total,0);
   assert.deepEqual(errors,[]);console.log('PASS '+engine.name()+': early photo preserved, saved pixels, cross-tab 30 limit, full-album replay/conflict, concurrent same request, reset during save');
  }finally{await browser.close()}
 }
})().catch(error=>{console.error(error);process.exitCode=1});
