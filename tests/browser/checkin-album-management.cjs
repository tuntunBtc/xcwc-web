// Native IndexedDB regression on a fully intercepted origin; no server or user data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),read=file=>fs.readFileSync(path.join(root,'src',file),'utf8');
const guest=read('wardrobe-catalog.mjs').replaceAll('export ','')+'\n'+read('guest-store.mjs').replace(/^import .*;\n/,'').replaceAll('export ','')+'\nwindow.xcwcGuest=createGuestStore(localStorage);';
(async()=>{
 for(const engine of [chromium,...(fs.existsSync(webkit.executablePath())?[webkit]:[])]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  try{
   const context=await browser.newContext(),page=await context.newPage();
   await context.route('https://xcwc-audit.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated album test</title>'}));
   await page.goto('https://xcwc-audit.test/');await page.addScriptTag({content:guest});
   await page.evaluate(()=>{window.xcwcDigestBlob=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');xcwcGuest.adopt({id:'a'.repeat(32),active:true,cityCode:'hangzhou',typeName:'小黄莺'},'测试鸟')});
   await page.addScriptTag({content:read('guest-album.js')});
   const result=await page.evaluate(async()=>{
    const blob=new Blob(['same-photo'],{type:'image/jpeg'}),submit=n=>({metadata:{requestId:String(n).padStart(32,'0'),birdIds:['a'.repeat(32)],styleId:'natural',label:'照片 '+n},original:blob,image:blob});
    for(let n=1;n<=30;n++)await xcwcLocalAlbum.run('create',submit(n));
    const before=localStorage.getItem('xcwc.guest.v1'),balance=xcwcGuest.snapshot().wallet.balance;
    let full=false;try{await xcwcLocalAlbum.run('create',submit(31))}catch(error){full=error.code==='ALBUM_FULL'}
    const first=await xcwcLocalAlbum.run('delete',{id:String(1).padStart(32,'0'),epoch:'initial'});
    const countAfterDelete=(await xcwcLocalAlbum.run('history',{})).total;
    let originalMissing=false;try{await xcwcLocalAlbum.run('original',{id:first.id})}catch{originalMissing=true}
    const repeat=await xcwcLocalAlbum.run('delete',{id:first.id,epoch:'initial'});
    const localUnchanged=before===localStorage.getItem('xcwc.guest.v1');
    const replacement=await xcwcLocalAlbum.run('create',submit(31));
    localStorage.setItem('xcwc.local.reset.v1','done:new');
    let staleRejected=false;try{await xcwcLocalAlbum.run('delete',{id:String(2).padStart(32,'0'),epoch:'initial'})}catch{staleRejected=true}
    return {full,first,repeat,countAfterDelete,originalMissing,localUnchanged,replacementReward:replacement.reward,balance,finalBalance:xcwcGuest.snapshot().wallet.balance,finalTotal:(await xcwcLocalAlbum.run('history',{})).total,staleRejected};
   });
   assert.equal(result.full,true);assert.equal(result.first.deleted,true);assert.equal(result.repeat.deleted,false);
   assert.equal(result.countAfterDelete,29);assert.equal(result.originalMissing,true);assert.equal(result.localUnchanged,true);
   assert.equal(result.replacementReward,0);assert.equal(result.finalBalance,result.balance);assert.equal(result.finalTotal,30);assert.equal(result.staleRejected,true);
   // A pre-existing v1 row migrates without losing bytes and can be managed independently.
   // Use a fresh context for the v1 database so existing v2 connections cannot interfere.
   const oldContext=await browser.newContext();await oldContext.route('https://xcwc-legacy.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}));
   const old=await oldContext.newPage();await old.goto('https://xcwc-legacy.test/');await old.addScriptTag({content:guest});
   await old.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('xcwc.guest.album.v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('works',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=reject});await new Promise((resolve,reject)=>{const tx=db.transaction('works','readwrite');tx.objectStore('works').put({id:'legacy-photo-12345678',metadata:{birdIds:['a'.repeat(32)],styleId:'natural',label:'旧合照'},createdAt:new Date().toISOString(),reward:1,original:new TextEncoder().encode('old-original').buffer,image:new TextEncoder().encode('old-image').buffer,originalType:'image/jpeg',imageType:'image/jpeg'});tx.oncomplete=resolve;tx.onerror=reject});db.close()});
   await old.addScriptTag({content:read('guest-album.js')});const migrated=await old.evaluate(async()=>({count:(await xcwcLocalAlbum.run('history',{})).total,bytes:await (await xcwcLocalAlbum.run('original',{id:'legacy-photo-12345678'})).text(),removed:await xcwcLocalAlbum.run('delete',{id:'legacy-photo-12345678'})}));
   assert.equal(migrated.count,1);assert.equal(migrated.bytes,'old-original');assert.equal(migrated.removed.deleted,true);
   console.log('PASS '+engine.name()+': 30-photo capacity, confirmed-target deletion, originals removed, assets/points/dedupe preserved, stale reset denied, v1 migration retained');
  }finally{await browser.close()}
 }
})().catch(error=>{console.error(error);process.exitCode=1});
