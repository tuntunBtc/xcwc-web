// Real host-only lifecycle probes in disposable browser contexts. No manual cart seeding.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8814';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
const rounds=Number(process.env.XCWC_CART_STRESS_ROUNDS||4);
if(!Number.isInteger(rounds)||rounds<1||rounds>30)throw Error('Stress rounds must be 1–30');
const report={base,status:'running',scope:'Disposable browser contexts against local preview; no production data or services',engines:[]};
const reportPath=path.resolve(__dirname,'../output/shop-fixes/cart-lifecycle.json');
function saveReport(){fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n','utf8')}
let serial=0;
const request=(page,operation,id,requestId='lifecycle-'+(++serial))=>page.frameLocator('iframe').locator('body').evaluate((el,{operation,id,requestId})=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('cart host probe timed out: '+operation));},12000);
 function receive(event){const message=event.data;if(event.source!==window.parent||message?.channel!=='xcwc-shop-data-result'||message.id!==requestId)return;clearTimeout(timer);window.removeEventListener('message',receive);resolve(message)}
 window.addEventListener('message',receive);window.parent.postMessage({channel:'xcwc-shop-data',id:requestId,operation,args:{id}},'*');
}),{operation,id,requestId});
async function read(page){const result=await request(page,'cart-read');assert.equal(result.ok,true,JSON.stringify(result));return result.value.ids}
async function setup(browser,freezeNotices=false,legacySeed=null){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
 if(freezeNotices)await context.addInitScript(()=>{
  if(window.parent===window){const stop=event=>{if(window.__freezeLifecycleNotices)event.stopImmediatePropagation()};for(const type of['storage','focus','pageshow','xcwc-session-change'])window.addEventListener(type,stop,true);document.addEventListener('visibilitychange',stop,true)}
  else window.addEventListener('message',event=>{if(event.data?.channel==='xcwc-shop-cart-change')event.stopImmediatePropagation()},true);
 });
 const pages=[await context.newPage(),await context.newPage()];
 for(const page of pages){if(page===pages[0]&&legacySeed)await page.addInitScript(ids=>{if(window.parent===window)localStorage.setItem('xcwc.shop.cart.v1:%40anonymous',JSON.stringify(ids))},legacySeed);page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/?page=shop',{waitUntil:'domcontentloaded'});await page.frameLocator('iframe').locator('#xcwc-shop .add:not([disabled])').first().waitFor({state:'attached'});await read(page);if(freezeNotices)await page.evaluate(()=>{window.__freezeLifecycleNotices=true})}
 return {context,pages,errors};
}
async function hold(page){
 await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('xcwc.shop.coordination.v1',1);q.onsuccess=()=>resolve(q.result);q.onerror=reject});
  window.__lifecycleDb=db;window.__lifecycleRelease=false;const tx=db.transaction('mutex','readwrite');
  const keep=()=>{tx.objectStore('mutex').get('lifecycle-lock').onsuccess=()=>{if(!window.__lifecycleRelease)keep()}};keep();
 });
}
async function observe(page){
 await page.evaluate(()=>{
  window.__lifecycleCartQueued=0;window.__lifecycleResetQueued=0;window.__lifecycleAbortSeen=0;
  const original=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);if(this.name==='xcwc.shop.coordination.v1'&&args[1]==='readwrite'){const stack=new Error().stack||'';if(stack.includes('resetCart'))window.__lifecycleResetQueued++;else if(stack.includes('cartOperation'))window.__lifecycleCartQueued++;}return tx};
  const abort=AbortController.prototype.abort;AbortController.prototype.abort=function(...args){window.__lifecycleAbortSeen++;return abort.apply(this,args)};
 });
}
async function release(page){await page.evaluate(()=>{window.__lifecycleRelease=true})}
async function stored(page,key){return page.evaluate(async key=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('xcwc.shop.coordination.v1',1);q.onsuccess=()=>resolve(q.result);q.onerror=reject});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('mutex','readonly'),q=tx.objectStore('mutex').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=reject})}finally{db.close()}},key)}
(async()=>{
 for(const engine of[chromium,...(fs.existsSync(webkit.executablePath())?[webkit]:[])]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  try{
   for(let round=0;round<rounds;round++){
    const {context,pages:[a,b],errors}=await setup(browser);
    try{
     assert.deepEqual(await read(a),[]);assert.deepEqual(await read(b),[]);
     const seed=Array.from({length:99},(_,i)=>'seed-'+i);
     for(let start=0;start<99;start+=20){const results=await Promise.all(seed.slice(start,start+20).map((id,j)=>request(j%2?a:b,'cart-add',id)));results.forEach(result=>assert.equal(result.ok,true,JSON.stringify(result)))}
     for(const page of[a,b])assert.deepEqual((await read(page)).sort(),[...seed].sort(),'all 99 successful host seeds must remain');
     const last=await Promise.all([request(a,'cart-add','last-slot-a'),request(b,'cart-add','last-slot-b')]);
     assert.equal(last.filter(r=>r.ok).length,1,JSON.stringify(last));assert.equal(last.find(r=>!r.ok).value.code,'CART_FULL');
     const snapshots=await Promise.all([read(a),read(b)]);assert.equal(snapshots[0].length,100);assert.deepEqual(snapshots[0],snapshots[1]);assert(seed.every(id=>snapshots[0].includes(id)));assert.deepEqual(errors,[]);
    }finally{await context.close()}
   }
   for(const scenario of['reset-existing','reset-empty','cancel','session']){
    const {context,pages:[a,b],errors}=await setup(browser,true);
    try{
     if(scenario!=='reset-empty'){const seed=await request(a,'cart-add','preserved');assert.equal(seed.ok,true)}
     await read(a);await read(b);await hold(a);await observe(a);await observe(b);
     const id='lifecycle-'+scenario,pending=request(b,'cart-add','queued-before-action',id);
     // Explicitly wait until the real host has created a blocked transaction;
     // a timeout/sleep alone could act before the request reaches the parent.
     await b.waitForFunction(()=>window.__lifecycleCartQueued>0,null,{timeout:8000});
     if(scenario.startsWith('reset')){
      const resetting=a.evaluate(()=>window.xcwcResetLocalData());await a.waitForFunction(()=>window.__lifecycleResetQueued>0,null,{timeout:8000});
      await release(a);const [result,resetResult]=await Promise.all([pending,resetting]);assert.equal(resetResult.cleared,true);
      // An operation ordered before reset may commit, then reset removes it;
      // a later old-epoch operation must be rejected. Neither may resurrect it.
      assert(result.ok||result.value.code==='CART_CANCELLED',JSON.stringify(result));
      for(const page of[a,b])assert.equal(await page.evaluate(()=>localStorage.getItem('xcwc.shop.cart.v1:%40anonymous')),null,'reset must also remove the legacy cart mirror');
      const stale=await request(b,'cart-add','stale-page-must-not-write');assert.equal(stale.ok,false,JSON.stringify(stale));assert.equal(stale.value.code,'CART_CANCELLED');
      assert.deepEqual(await read(a),[]);assert.deepEqual(await read(b),[]);
      const retry=await request(b,'cart-add','fresh-after-reset');assert.equal(retry.ok,true,JSON.stringify(retry));assert.deepEqual(await read(a),['fresh-after-reset']);
     }else if(scenario==='cancel'){
      await b.frameLocator('iframe').locator('body').evaluate((el,id)=>window.parent.postMessage({channel:'xcwc-shop-data',id,operation:'cancel'},'*'),id);
      await b.waitForFunction(()=>window.__lifecycleAbortSeen>0,null,{timeout:8000});await release(a);
      const result=await pending;assert.equal(result.ok,false);assert.equal(result.value.code,'CART_CANCELLED');assert.deepEqual(await read(a),['preserved']);
     }else{
      await b.evaluate(()=>window.XcwcSession.write({token:'b'.repeat(64),username:'review_user',expiresAt:new Date(Date.now()+3600000).toISOString()}));
      await release(a);const result=await pending;assert.equal(result.ok,false,JSON.stringify(result));assert.equal(result.value.code,'SESSION_CHANGED');
      assert.deepEqual(await stored(a,'xcwc.shop.cart.v1:%40anonymous'),['preserved']);assert.deepEqual(await read(b),[]);
     }
     assert.deepEqual(errors,[]);
    }finally{await context.close()}
   }
   const migration=await setup(browser,true,['hangzhou-xihu','hangzhou-xihu','removed-bird']);
   try{
    const [a,b]=migration.pages,key='xcwc.shop.cart.v1:%40anonymous';
    assert.deepEqual(await read(a),['hangzhou-xihu','removed-bird']);assert.deepEqual(await read(b),['hangzhou-xihu','removed-bird']);
    assert.deepEqual(await stored(a,key),['hangzhou-xihu','removed-bird']);
    const reset=await a.evaluate(()=>window.xcwcResetLocalData());assert.equal(reset.cleared,true);
    for(const page of[a,b])assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),null);
    // Freeze refresh notices so no empty canonical row is recreated before this
    // assertion. The next read must reject legacy migration on the durable epoch.
    assert.equal(await stored(a,key),undefined);
    await b.evaluate(key=>localStorage.setItem(key,JSON.stringify(['hangzhou-xihu','hangzhou-xihu','removed-bird'])),key);
    assert.deepEqual(await read(a),[]);assert.deepEqual(await read(b),[]);
    const epoch=await request(a,'cart-read');assert.notEqual(epoch.value.resetEpoch,'initial');
    assert.deepEqual(migration.errors,[]);
   }finally{await migration.context.close()}
   report.engines.push({engine:engine.name(),stressRounds:rounds,successfulSeedAdds:rounds*99,checks:{fullSeedSetRetained:true,oneFinalSlotWinner:true,resetExistingMirror:true,resetInitiallyAbsentMirror:true,physicalLegacyMirrorRemoved:true,staleEpochRejected:true,retryAfterRefresh:true,queuedCancellation:true,sessionSwitchIsolation:true,legacyFirstLoadDeduplicates:true,legacyUnknownIdPreserved:true,legacyMirrorNotReimportedAfterReset:true,noPageErrors:true}});
   console.log('PASS '+engine.name()+': '+rounds+' rounds of real host 99 seeds / 100 limit, reset existing/absent mirror, stale epoch/retry, queued cancellation/session switch, legacy migration and no post-reset reimport');
  }finally{await browser.close()}
 }
 report.status='passed';saveReport();
})().catch(error=>{report.status='failed';report.error=error.message;saveReport();console.error(error);process.exitCode=1});
