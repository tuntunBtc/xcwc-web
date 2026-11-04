// Non-destructive v1 -> v2 album upgrade, native IndexedDB and real image bytes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8840';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview and disposable contexts only');
(async()=>{
 const results=[];
 for(const engine of [chromium,...(fs.existsSync(webkit.executablePath())?[webkit]:[])]){
  console.log('MIGRATION',engine.name());
  const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  try{
   const context=await browser.newContext(),old=await context.newPage();
   await old.goto(base+'/__album_migration_probe__');
   const seed=await old.evaluate(async({useBlob})=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=8;canvas.getContext('2d').fillRect(0,0,8,8);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg')),buffer=await blob.arrayBuffer();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),n=>n.toString(16).padStart(2,'0')).join('');
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('xcwc.guest.album.v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('works',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
    db.onversionchange=()=>{};window.legacyAlbum=db;
    const ids=Array.from({length:23},(_,i)=>(i+1).toString(16).padStart(32,'0'));
    await new Promise((resolve,reject)=>{const tx=db.transaction('works','readwrite');ids.forEach((id,i)=>tx.objectStore('works').add({id,metadata:{requestId:id,birdIds:['a'.repeat(32)],styleId:'natural',label:'旧作品'+i},createdAt:new Date(Date.parse('2026-11-01T00:00:00Z')+i*1000).toISOString(),reward:i%2,digest,outputHash:digest,original:i===0&&useBlob?blob:buffer,image:i===0&&useBlob?blob:buffer,originalType:'image/jpeg',imageType:'image/jpeg'}));tx.oncomplete=resolve;tx.onabort=tx.onerror=event=>reject(tx.error||event.target.error||Error('Legacy fixture transaction failed'))});
    return {ids,digest,bytes:buffer.byteLength};
   },{useBlob:engine===chromium});
   const page=await context.newPage();await page.goto(base+'/?page=profile');
   const blocked=await page.evaluate(()=>window.xcwcLocalAlbum.run('history',{}).then(()=>null,error=>error.message));
   assert.match(blocked,/旧页面占用/);
   await old.evaluate(()=>window.legacyAlbum.close());
   const history=await page.evaluate(()=>window.xcwcLocalAlbum.run('history',{}));
   assert.equal(history.total,23);assert.equal(history.items.length,20);assert.equal(history.items[0].id,seed.ids.at(-1));
   const tail=await page.evaluate(cursor=>window.xcwcLocalAlbum.run('history',{cursor}),history.nextCursor);
   assert.equal(tail.items.length,3);assert.equal(tail.nextCursor,null);
   const checked=await page.evaluate(async({ids,digest})=>{
    const hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
    for(const id of [ids[0],ids[1],ids.at(-1)])for(const op of ['original','image']){const blob=await window.xcwcLocalAlbum.run(op,{id});if(blob.type!=='image/jpeg'||await hash(blob)!==digest)throw Error('Legacy image bytes changed');}
    const transaction=IDBDatabase.prototype.transaction,reads=[];
    IDBDatabase.prototype.transaction=function(names,...args){if(this.name==='xcwc.guest.album.v1')reads.push(typeof names==='string'?[names]:[...names]);return transaction.call(this,names,...args)};
    try{await window.xcwcLocalAlbum.run('history',{})}finally{IDBDatabase.prototype.transaction=transaction}
    return reads;
   },seed);
   assert(checked.length>0&&checked.every(stores=>stores.length===1&&stores[0]==='metadata'),'history must not clone the original/image store');
   const generated=await page.evaluate(async()=>{
    const id='a'.repeat(32);window.xcwcGuest.adopt({id,active:true,cityCode:'hangzhou',typeName:'小黄莺'},'迁移鸟');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=8;canvas.getContext('2d').fillStyle='#00ff00';canvas.getContext('2d').fillRect(0,0,8,8);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
    const args={metadata:{requestId:'c'.repeat(32),birdIds:[id],styleId:'natural',label:'升级后作品'},original:blob,image:blob};
    const first=await window.xcwcLocalAlbum.run('create',args),replay=await window.xcwcLocalAlbum.run('create',args);
    args.metadata={...args.metadata,requestId:'d'.repeat(32)};const duplicate=await window.xcwcLocalAlbum.run('create',args);
    return {first,replay,duplicate,history:await window.xcwcLocalAlbum.run('history',{}),balance:window.xcwcGuest.snapshot().wallet.balance};
   });
   assert.equal(generated.first.reward,1);assert.equal(generated.replay.reward,1);assert.equal(generated.duplicate.reward,0);assert.equal(generated.balance,6);assert.equal(generated.history.total,25);
   const clean=await page.evaluate(async()=>{await window.xcwcResetLocalData();return {history:await window.xcwcLocalAlbum.run('history',{}),state:window.xcwcGuest.snapshot()}});
   assert.equal(clean.history.total,0);assert.equal(clean.state.birds.length,0);assert.equal(clean.state.wallet.balance,0);
   results.push({engine:engine.name(),passed:true,legacyWorks:23,legacyBlobCovered:engine===chromium,legacyArrayBuffersCovered:true,legacyOriginalAndImageBytesPreserved:true,blockedRetryRecovered:true,historyStores:checked,sortedPagination:[20,3],replayAndDuplicateRewardPreserved:true,totalAfterCreates:generated.history.total,resetTotal:clean.history.total});
  }finally{await browser.close()}
 }
 const directory=path.resolve(__dirname,'../../output/full-audit/browser');fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(path.join(directory,'album-migration.json'),JSON.stringify({passed:true,results},null,2)+'\n','utf8');
 console.log(JSON.stringify({passed:true,results}));
})().catch(error=>{console.error(error);process.exitCode=1});
