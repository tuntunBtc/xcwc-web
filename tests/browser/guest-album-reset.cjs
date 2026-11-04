// Native IndexedDB two-tab regression. Start a built local preview before running.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8840';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Disposable local browser context only');
(async()=>{
 const results=[];
 for(const engine of [chromium,...(fs.existsSync(webkit.executablePath())?[webkit]:[])]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  try{
   const context=await browser.newContext(),a=await context.newPage(),b=await context.newPage();
   await Promise.all([a.goto(base+'/?page=profile'),b.goto(base+'/?page=profile')]);
   await a.evaluate(async()=>{
    // Exercise the local storage model directly; this fixture never writes a cloud entity.
    const id='a'.repeat(32);window.xcwcGuest.adopt({id,active:true,cityCode:'hangzhou',typeName:'小黄莺'},'测试鸟');
    let release;const gate=new Promise(resolve=>release=resolve);window.releaseAuditPhoto=release;
    window.xcwcDigestBlob=async()=>{await gate;return '0'.repeat(64)};
    const canvas=document.createElement('canvas');canvas.width=canvas.height=8;
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
    window.auditPhoto=window.xcwcLocalAlbum.run('create',{metadata:{requestId:'a'.repeat(32),birdIds:[id],styleId:'natural',label:'测试'},original:blob,image:blob}).then(value=>({ok:true,value}),error=>({ok:false,error:error.message}));
   });
   await b.evaluate(()=>window.xcwcResetLocalData());
   const result=await a.evaluate(async()=>{window.releaseAuditPhoto();return {saved:await window.auditPhoto,state:window.xcwcGuest.snapshot(),album:await window.xcwcLocalAlbum.run('history',{})}});
   assert.equal(result.saved.ok,false);assert.match(result.saved.error,/已清除/);
   assert.equal(result.state.birds.length,0);assert.equal(result.state.wallet.balance,0);assert.equal(result.album.total,0);
   // A later new experience may still save a new work; the epoch is not a permanent block.
   const recovered=await a.evaluate(async()=>{const id='b'.repeat(32);window.xcwcGuest.adopt({id,active:true,cityCode:'hangzhou',typeName:'小黄莺'},'新伙伴');const blob=new Blob(['new-photo'],{type:'image/jpeg'});return window.xcwcLocalAlbum.run('create',{metadata:{requestId:'b'.repeat(32),birdIds:[id],styleId:'natural',label:'新的开始'},original:blob,image:blob})});
   assert.equal(recovered.reward,1);
   results.push({engine:engine.name(),passed:true,stalePhotoRejected:true,remainingBirds:result.state.birds.length,remainingPoints:result.state.wallet.balance,remainingWorks:result.album.total,newPhotoAfterReset:recovered.status});
  }finally{await browser.close()}
 }
 const output=path.resolve(__dirname,'../../output/full-audit/browser');fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'album-reset-tabs.json'),JSON.stringify({passed:true,results},null,2)+'\n','utf8');
 console.log(JSON.stringify({passed:true,results}));
})().catch(error=>{console.error(error);process.exitCode=1});
