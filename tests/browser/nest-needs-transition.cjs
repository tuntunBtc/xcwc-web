// Local disposable guest records only. Reminder timers are controlled; audio runs in real time.
// The fixture edits below prepare threshold/reordering states, never production or user data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-nest-browser-check/node_modules/playwright');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8997';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Explicit local preview required');
const out=path.resolve(process.env.XCWC_TRANSITION_REPORT_DIR||'output/nest-upgrade-fixes-20261105/transitions');
const engines=(process.env.XCWC_TRANSITION_ENGINES||'chromium,webkit').split(',');
const cases=(process.env.XCWC_TRANSITION_CASES||'natural-food,reorder,company,interruptions').split(',');
if(engines.some(name=>!['chromium','webkit'].includes(name))||cases.some(name=>!['natural-food','reorder','company','interruptions'].includes(name)))throw Error('Unknown engine or case');
fs.mkdirSync(out,{recursive:true});
const epoch=Date.parse('2026-11-05T02:00:00+08:00');
const birdA={id:'1234567890abcdef1234567890abcdef',active:true,typeId:'huangying',typeName:'小黄莺',cityCode:'hangzhou',cityName:'杭州'};
const birdB={...birdA,id:'abcdef1234567890abcdef1234567890'};
const report={base,passed:false,scope:'Local guest fixtures, real native original-sound ended events, controlled JS reminder timers. No build, publication or production API calls.',cases:[]};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(browser,engine,name){
 const r={engine,name,passed:false,checks:[],errors:[],forbidden:[],snapshots:{}};report.cases.push(r);
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN'}),page=await context.newPage();
 page.setDefaultTimeout(12000);page.on('pageerror',error=>r.errors.push(error.message));
 await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(request.method()!=='GET'||url.pathname.startsWith('/api/')||(!['data:','blob:','about:'].includes(url.protocol)&&url.origin!==base)){if(!url.pathname.startsWith('/api/'))r.forbidden.push({method:request.method(),url:request.url()});return route.abort()}return route.continue()});
 const nest=()=>page.frameLocator('iframe').locator('#xcwc-nest'),image=()=>nest().locator('#bird img'),audio=()=>nest().locator('audio'),canvas=()=>nest().locator('canvas');
 const snap=()=>nest().evaluate(host=>{const q=s=>host.shadowRoot.querySelector(s),a=q('audio');return{time:Date.now(),performance:performance.now(),birdName:q('#name').textContent,needs:[...host.shadowRoot.querySelectorAll('[data-need]')].filter(node=>!node.hidden).map(node=>node.dataset.need),current:host.shadowRoot.querySelector('[data-need].is-current')?.dataset.need||null,hunger:q('#hunger').textContent,water:q('#water').textContent,mood:q('#mood').textContent,emotion:q('#bird img').dataset.emotion,poster:q('#bird img').dataset.idlePoster,canvas:!q('canvas').hidden,audioPaused:a.paused,audioTime:a.currentTime,duration:Number.isFinite(a.duration)?a.duration:null,loop:a.loop,ended:+(a.dataset.testEnded||0),trace:JSON.parse(a.dataset.testTrace||'[]')}});
 const tick=async ms=>{await page.clock.runFor(ms);await sleep(70)};
 const mark=text=>{r.checks.push(text);console.log('PASS',engine,name,text)};
 async function waitState(predicate,message,timeout=6000){const until=Date.now()+timeout;let state;do{state=await snap();if(predicate(state))return state;await sleep(50)}while(Date.now()<until);throw Error(message+': '+JSON.stringify(state))}
 async function start(){
  await nest().locator('.idle-play').waitFor({state:'visible'});
  if((await snap()).audioPaused)await nest().locator('.idle-play').tap();
  await canvas().waitFor({state:'visible'});const state=await snap();assert.equal(state.audioPaused,false);assert.equal(state.loop,false);return state;
 }
 async function installTrace(){await audio().evaluate(a=>{
  for(const type of ['play','pause','ended'])a.addEventListener(type,()=>{const trace=JSON.parse(a.dataset.testTrace||'[]');trace.push({type,time:performance.now(),audioTime:a.currentTime});a.dataset.testTrace=JSON.stringify(trace);if(type==='ended')a.dataset.testEnded=String(+(a.dataset.testEnded||0)+1)});
 })}
 async function setVisible(visible){await page.frameLocator('iframe').locator('body').evaluate((body,visible)=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>!visible});document.dispatchEvent(new Event('visibilitychange'))},visible)}
 async function seed(){
  await page.clock.install({time:new Date(epoch)});await page.clock.pauseAt(new Date(epoch));
  await page.goto(base+'/?page=home');await page.waitForFunction(()=>!!window.xcwcGuest);
  await page.evaluate(({a,b,name})=>{
   xcwcGuest.adopt(a,'循环伙伴');if(name==='interruptions')xcwcGuest.adopt(b,'新伙伴');xcwcGuest.select(a.id);
   if(name==='natural-food')return;
   const state=xcwcGuest.read(),now=Date.now(),bird=state.birds.find(row=>row.id===a.id);
   Object.assign(bird,{hunger:name==='reorder'?5:60,water:name==='reorder'?20:10,mood:name==='company'?50:70,settledAt:now,moodSettledAt:name==='company'?now-25000:now+60000,lastCompanionAt:name==='company'?now-175000:now,cryEpisodeShown:false,lastCryAt:null});
   if(name==='interruptions')bird.hunger=10;
   localStorage.setItem('xcwc.guest.v1',JSON.stringify(state));
  },{a:birdA,b:birdB,name});
  if(name==='natural-food')await page.clock.setSystemTime(new Date(epoch+115000));
  await page.reload();await image().evaluate(im=>im.decode());await nest().locator('.idle-play').waitFor({state:'visible'});await installTrace();
 }
 try{
  await seed();r.snapshots.before=await snap();
  const beforeBalance=await page.evaluate(()=>xcwcGuest.read().balance);
  r.snapshots.started=await start();
  if(name!=='interruptions'){
   if(name==='reorder'){
    assert.equal(r.snapshots.before.current,'food');
    await page.evaluate(id=>{const state=xcwcGuest.read(),bird=state.birds.find(row=>row.id===id);Object.assign(bird,{hunger:25,water:5,settledAt:Date.now()});localStorage.setItem('xcwc.guest.v1',JSON.stringify(state))},birdA.id);
    await tick(5100);await waitState(state=>state.hunger==='25%'&&state.water==='5%','the next bootstrap must expose the reordered real meters');
   }else{
    assert(!r.snapshots.before.needs.includes(name==='natural-food'?'food':'company'));
    await page.clock.resume();
    await waitState(state=>state.needs.includes(name==='natural-food'?'food':'company'),'natural decay must expose the newly real need',5800);
    // Pause JS after the bootstrap. Native media time must still reach its own end.
    const now=await page.evaluate(()=>Date.now());await page.clock.pauseAt(new Date(now+40));
   }
   r.snapshots.changed=await snap();
   assert.equal(r.snapshots.changed.canvas,true,'a passive need change must not hide an in-progress clip');
   assert.equal(r.snapshots.changed.audioPaused,false,'a passive need change must not pause original sound');
   assert.equal(r.snapshots.changed.ended,0,'the changed-state assertion must occur before the real ended event');
   assert(r.snapshots.changed.audioTime>=r.snapshots.started.audioTime,'passive state updates must not restart sound at zero');
   if(name==='natural-food'){assert.equal(r.snapshots.changed.hunger,'20%');assert.equal(r.snapshots.changed.water,'0%')}
   if(name==='company')assert.equal(r.snapshots.changed.mood,'40%');
   mark('passive need addition or ordering updates real state while the current sound and canvas keep playing');
   await audio().evaluate(a=>new Promise(resolve=>{if(a.ended)return resolve();a.addEventListener('ended',()=>resolve(),{once:true})}));
   await image().evaluate(im=>im.decode());await sleep(30);r.snapshots.ended=await snap();
   assert.equal(r.snapshots.ended.ended,1);assert.equal(r.snapshots.ended.canvas,false);assert.equal(r.snapshots.ended.audioPaused,true);assert.equal(r.snapshots.ended.poster,'false');assert(r.snapshots.ended.audioTime>=r.snapshots.ended.duration-.05,'the clip must reach the original sound duration');assert(r.snapshots.ended.needs.includes(r.snapshots.ended.current));
   assert.equal(r.snapshots.ended.trace.filter(event=>event.type==='pause'&&event.audioTime<r.snapshots.ended.duration-.05).length,0,'no pause/reset is allowed before native completion');
   mark('exactly one native ended event finishes the whole original-sound cycle before returning to a true reminder');
   await tick(4800);assert.equal((await snap()).canvas,false,'decoded reminder must remain visible for nearly five seconds');
   await tick(300);await canvas().waitFor({state:'visible'});r.snapshots.next=await snap();assert.equal(r.snapshots.next.ended,1);assert.equal(r.snapshots.next.loop,false);assert.equal(r.snapshots.next.audioPaused,false);assert(r.snapshots.next.audioTime<1,'the following full clip begins at zero after the reminder');
   assert.equal(await page.evaluate(()=>xcwcGuest.read().balance),beforeBalance,'visual cycles must not award points');
   mark('the following decoded reminder lasts five seconds and starts a fresh whole clip without extra rewards');
   await page.screenshot({path:path.join(out,engine+'-'+name+'.png')});
  }else{
   await nest().locator('.dock [data-action=feed]').tap();await nest().locator('#sheet[open]').waitFor();let state=await snap();assert.equal(state.canvas,false);assert.equal(state.audioPaused,true);assert.equal(state.ended,0);
   await nest().locator('[data-action=do-feed]').tap();await nest().locator('#bird img[data-emotion=happy]').waitFor();await image().evaluate(im=>im.decode());await tick(50);state=await snap();assert.equal(state.canvas,false);assert.equal(state.audioPaused,true);await tick(2800);assert.equal((await snap()).emotion,'happy');await tick(300);assert.notEqual((await snap()).emotion,'happy');
   mark('intentional feeding stops motion immediately and keeps the complete three-second happy response');
   await start();await setVisible(false);state=await snap();assert.equal(state.canvas,false);assert.equal(state.audioPaused,true);await tick(7000);assert.equal((await snap()).canvas,false);await setVisible(true);await tick(100);await image().evaluate(im=>im.decode());await tick(4800);assert.equal((await snap()).canvas,false);await tick(300);await canvas().waitFor({state:'visible'});
   mark('background stops the current clip and foreground waits through a fresh reminder');
   const oldAudio=await audio().elementHandle();
   await nest().locator('[data-action=switch]').first().tap();await nest().locator('.bird-choice').filter({hasText:'新伙伴'}).tap();await nest().locator('#name').filter({hasText:'新伙伴'}).waitFor();await tick(100);state=await snap();assert.equal(state.birdName,'新伙伴');assert.deepEqual(state.needs,[]);assert.equal(state.loop,true);
   await oldAudio.evaluate(a=>a.dispatchEvent(new Event('ended')));await tick(7000);state=await snap();assert.equal(state.birdName,'新伙伴');assert.deepEqual(state.needs,[]);assert.equal(state.loop,true);assert.equal(await audio().count(),1);
   mark('switching birds discards the old need cycle and ignores its stale ended callback');
   await page.frameLocator('iframe').locator('.bottom [data-go=profile]').tap();await page.frameLocator('iframe').locator('#xcwc-account-page').waitFor();assert.equal(await audio().count(),0);assert(await oldAudio.evaluate(a=>a.paused&&!a.isConnected));await oldAudio.evaluate(a=>a.dispatchEvent(new Event('ended')));await tick(7000);assert.equal(await nest().count(),0);assert.equal(await audio().count(),0);
   mark('route exit removes sound and old callbacks cannot recreate a nest player');
  }
  assert.deepEqual(r.errors,[]);assert.deepEqual(r.forbidden,[]);r.passed=true;
 }catch(error){r.error=error.stack;r.state=await snap().catch(()=>null);console.error('FAIL',engine,name,error.stack,JSON.stringify(r.state));await page.screenshot({path:path.join(out,engine+'-'+name+'-failed.png')}).catch(()=>{})}
 finally{await context.close()}
}
(async()=>{
 for(const engineName of engines){const engine={chromium,webkit}[engineName],bundled=engine.executablePath(),browser=await engine.launch({headless:true,executablePath:fs.existsSync(bundled)?bundled:engineName==='chromium'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined});try{for(const name of cases)await run(browser,engineName,name)}finally{await browser.close()}}
 report.passed=report.cases.length===engines.length*cases.length&&report.cases.every(row=>row.passed);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');console.log(JSON.stringify({passed:report.passed,cases:report.cases.map(row=>({engine:row.engine,name:row.name,passed:row.passed})),report:path.join(out,'report.json')}));if(!report.passed)process.exitCode=1;
})().catch(error=>{report.error=error.stack;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');console.error(error);process.exitCode=1});
