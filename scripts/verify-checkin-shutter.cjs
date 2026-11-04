// Exercise the real audio graph and collection flow in isolated mobile browsers.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8797';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
(async()=>{
 for(const engine of (process.env.XCWC_BROWSER==='webkit'?[webkit]:[chromium,...(fs.existsSync(webkit.executablePath())?[webkit]:[])])){
  const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  try{
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   await context.addInitScript(()=>{
    window.__audioContexts=[];window.__audioStarts=0;window.__audioBuffers=[];
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    window.AudioContext=class extends Audio{
     constructor(options){super(options);window.__audioContexts.push(this)}
     decodeAudioData(data,success,failure){return super.decodeAudioData(data,buffer=>{window.__audioBuffers.push({channels:buffer.numberOfChannels,bytes:buffer.length*4,duration:buffer.duration});success(buffer)},failure)}
     createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source);source.start=(...args)=>{window.__audioStarts++;return start(...args)};return source}
    };
   });
   const page=await context.newPage(),errors=[],audioRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.resourceType()==='media'||/\.(mp3|wav|ogg|m4a)(\?|$)/.test(r.url()))audioRequests.push(r.url())});
   await page.route('**/api/**',r=>r.fulfill({json:[]}));await page.goto(base);await page.waitForFunction(()=>!!window.xcwcGuest);
   await page.evaluate(()=>window.xcwcGuest.adopt({id:'a'.repeat(32),cityCode:'hangzhou',cityName:'杭州',typeId:'hy',skinId:'default',active:true},'快门测试'));
   await page.goto(base+'/?page=photo');const frame=page.frameLocator('iframe');await frame.locator('.bird-card[aria-pressed=true]').waitFor();
   const child=page.frames().find(f=>f.parentFrame());
   assert.equal(await child.evaluate(()=>window.__audioContexts.length),0,'no AudioContext at load');
   await frame.locator('#ck-generate').evaluate(e=>e.click());assert.equal(await child.evaluate(()=>window.__audioContexts.length),0,'invalid click is silent');
   await frame.locator('#ck-file').setInputFiles('src/checkin-assets/lake.jpg');await frame.locator('#ck-generate:not([disabled])').waitFor();
   assert.equal(await child.evaluate(()=>window.__audioContexts.length),0,'upload does not allocate audio');
   await frame.locator('#ck-generate').click();await frame.locator('#ck-generate').evaluate(e=>e.click());
   const viewer=page.locator('#xcwc-checkin-save');await viewer.waitFor({state:'visible'});
   await child.waitForFunction(()=>window.__audioStarts===1&&window.__audioContexts[0].state==='suspended');
   const graph=await child.evaluate(()=>({contexts:window.__audioContexts.length,starts:window.__audioStarts,buffers:window.__audioBuffers}));assert.equal(graph.contexts,1);assert.equal(graph.starts,1);assert.equal(graph.buffers.length,1);assert.equal(graph.buffers[0].channels,1);assert(graph.buffers[0].duration<=.55);assert(graph.buffers[0].bytes<=110000);
   await viewer.locator('[data-save-close]').click();await frame.locator('#ck-location').fill('第二次快门');await frame.locator('#ck-generate').click();await viewer.waitFor({state:'visible'});
   await child.waitForFunction(()=>window.__audioStarts===2&&window.__audioContexts[0].state==='suspended');assert.equal(await child.evaluate(()=>window.__audioBuffers.length),1,'reuse the small buffer');assert.equal(await child.evaluate(()=>window.__audioContexts.length),1,'reuse the context');
   await viewer.locator('[data-save-close]').click();await frame.locator('.checkin-page .back').click();await child.waitForFunction(()=>window.__audioContexts[0].state==='closed');
   assert.equal((await page.evaluate(()=>xcwcLocalAlbum.run('history',{}))).total,2);assert.deepEqual(audioRequests,[]);assert.deepEqual(errors,[]);
   console.log(JSON.stringify({engine:engine.name(),passed:true,checks:['lazy audio','invalid and busy clicks silent','real short shutter graph plays twice','one reused context and buffer','idle suspend and route cleanup','collection succeeds','no audio downloads or page errors'],buffer:graph.buffers[0]}));
  }finally{await browser.close()}
 }
})().catch(e=>{console.error(e);process.exit(1)});
