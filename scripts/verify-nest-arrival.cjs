// HISTORICAL: forced arrival was superseded on 2026-11-05. Current acceptance: tests/browser/nest-needs-cycle.cjs and page-resource-preparation.cjs.
// Local-only UI contract: public metadata is synthetic; no real API writes or user cache.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-nest-browser-check/node_modules/playwright');
const base=process.env.XCWC_PREVIEW_URL,out=path.resolve(process.env.XCWC_NEST_REPORT_DIR||'output/nest-arrival-20261105');
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base||''))throw Error('Explicit local preview required');
fs.mkdirSync(out,{recursive:true});const fixture={id:'1234567890abcdef1234567890abcdef',birdCode:'HZ-HY-1000000000001',active:true,typeId:'huangying',typeName:'小黄莺',cityCode:'hangzhou',cityName:'杭州'},url=base+'/register.html?birdCode='+fixture.birdCode;
const report={base,passed:false,cases:[]},delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const modes=(process.env.XCWC_ARRIVAL_MODES||'first,needy,cry,touch,background,reduced,image-failure,audio-failure,failed-adoption').split(',');
async function run(browser,engine,mode){
 const r={engine,mode,passed:false,checks:[],errors:[],api:[]};report.cases.push(r);let publicReads=0;
 const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:mode==='reduced'?'reduce':'no-preference'}),p=await c.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>r.errors.push(e.message));
 await c.addInitScript(()=>{if(window!==top)return;let handler;window.__arrivalOps=[];Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,get:()=>handler,set(fn){handler=async function(op,args,...rest){window.__arrivalOps.push({op,action:args?.action});return fn.call(this,op,args,...rest)}}})});
 await c.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/')){
  r.api.push({method:route.request().method(),path:u.pathname});
  if(u.pathname==='/api/birds/by-code/'+fixture.birdCode&&route.request().method()==='GET'){
   publicReads++;if(mode==='failed-adoption'&&publicReads>1)return route.fulfill({status:503,json:{code:'TEST_UNAVAILABLE',message:'隔离领取失败'}});
   return route.fulfill({status:200,json:fixture});
  }return route.abort();
 }if(u.origin!==base&&!['about:','data:','blob:'].includes(u.protocol))return route.abort();
 if(mode==='image-failure'&&u.pathname.includes('/idle/')&&u.pathname.endsWith('.webp'))return route.fulfill({status:404,body:'missing image'});
 if(mode==='audio-failure'&&u.pathname.includes('/idle/')&&u.pathname.endsWith('.m4a'))return route.fulfill({status:404,body:'missing audio'});
 return route.continue()});
 const frame=()=>p.frameLocator('iframe'),nest=()=>frame().locator('#xcwc-nest'),audio=()=>nest().locator('audio'),image=()=>nest().locator('#bird img');
 const tick=async ms=>{await p.clock.runFor(ms);await delay(30)};
 const mark=s=>{r.checks.push(s);console.log('PASS',engine,mode,s)};
 async function enter(){
  await p.goto(url);const confirm=frame().locator('#xcwc-adopt [data-action=confirm]');await confirm.filter({hasText:mode==='first'||mode==='failed-adoption'?'孵化并领养':'回小窝'}).waitFor();await confirm.tap();
  if(mode==='failed-adoption')return;
  await nest().locator('#bird').waitFor();await tick(25);
 }
 async function arrival(){await nest().locator('.actor.is-arrival').waitFor();await nest().locator('.idle-play').waitFor();}
 async function playing(){await arrival();await nest().locator('.idle-play[aria-busy=false]').waitFor();await delay(100);if(await audio().evaluate(a=>a.paused))await nest().locator('.idle-play').tap();await nest().locator('canvas').waitFor({state:'visible'});const state=await audio().evaluate(a=>({paused:a.paused,muted:a.muted,loop:a.loop}));assert(!state.paused&&!state.muted&&!state.loop,JSON.stringify(state));}
 async function ended(){await audio().evaluate(a=>{a.currentTime=a.duration-.08});await nest().locator('.actor.is-arrival').waitFor({state:'hidden'});await tick(50);}
 try{
  await p.clock.install({time:new Date('2026-11-05T10:00:00+08:00')});await p.clock.pauseAt(new Date('2026-11-05T10:00:01+08:00'));
  if(!['first','failed-adoption'].includes(mode)){
   await p.goto(base+'/?page=home');await p.waitForFunction(()=>window.xcwcGuest);
   await p.evaluate(({fixture,mode})=>{xcwcGuest.adopt(fixture,'入口验收');const s=xcwcGuest.read(),b=s.birds[0],now=Date.now();Object.assign(b,{hunger:mode==='cry'?100:0,water:mode==='cry'?100:0,mood:mode==='cry'?20:40,settledAt:now,moodSettledAt:now,lastCompanionAt:now-300000,lastMoodGainAt:null,lastCryAt:null,cryEpisodeShown:false});localStorage.setItem('xcwc.guest.v1',JSON.stringify(s))},{fixture,mode});
  }
  await enter();
  if(mode==='failed-adoption'){
   await frame().locator('#xcwc-adopt [data-role=service-notice][data-kind=error]').waitFor();assert.equal((await p.evaluate(()=>xcwcGuest.read())).birds.length,0);assert.equal(await nest().count(),0);mark('unconfirmed adoption cannot navigate or queue the welcome animation');
  }else if(mode==='reduced'){
   await tick(200);assert.equal(await nest().locator('.actor.is-arrival').count(),0);assert(await nest().locator('canvas').isHidden());assert.notEqual(await image().getAttribute('data-emotion'),'happy');mark('reduced motion restores true care state without an automatic welcome');
  }else if(['image-failure','audio-failure'].includes(mode)){
   for(let i=0;i<100&&await nest().locator('.actor.is-arrival').count();i++){await tick(50);await delay(20)}
   assert.equal(await nest().locator('.actor.is-arrival').count(),0);assert.notEqual(await image().getAttribute('data-emotion'),'happy');assert(await audio().evaluate(a=>a.paused));mark('failed welcome media restores real needs without a silent or stuck intro');
  }else{
   await playing();mark('confirmed adoption-page entry plays a one-shot welcome with original audio');
   assert.equal(await image().getAttribute('data-emotion'),'happy');
   if(mode==='first'){
    const s=await p.evaluate(()=>xcwcGuest.read());assert.equal(s.balance,5);assert.equal(s.birds.length,1);assert.equal(s.birds[0].hunger,60);assert.equal(s.birds[0].water,60);
    await delay(1000);await tick(50);await p.screenshot({path:path.join(out,engine+'-first-welcome.png')});
    await nest().locator('.actor.is-arrival').waitFor({state:'hidden'});assert(await audio().evaluate(a=>a.loop));assert.equal((await p.evaluate(()=>xcwcGuest.read())).balance,5);mark('welcome finishes after real playback and grants no extra rewards');
    await p.goBack();await frame().locator('#xcwc-adopt [data-action=confirm]').filter({hasText:'回小窝'}).waitFor();
    await p.evaluate(()=>{const original=window.xcwcGuestOperation;let hold=true;window.xcwcGuestOperation=async function(op,...args){if(op==='bootstrap'&&hold){hold=false;await new Promise(resolve=>{window.__releaseArrivalBootstrap=resolve})}return original.call(this,op,...args)}});
    await frame().locator('#xcwc-adopt [data-action=confirm]').tap();await nest().locator('#bird').waitFor();await delay(150);await tick(200);
    assert(await nest().locator('canvas').isHidden());assert(await audio().evaluate(a=>a.paused));assert.equal(await nest().locator('.actor.is-arrival').count(),0);
    await p.evaluate(()=>window.__releaseArrivalBootstrap());await playing();await nest().locator('.arrival-skip').tap();mark('cached healthy birds wait for the matching fresh bootstrap before a new one-shot arrival');
   }else if(mode==='needy'){
    assert.equal(await nest().locator('#hunger').innerText(),'0%');assert.equal(await nest().locator('#water').innerText(),'0%');assert.equal(await nest().locator('#mood').innerText(),'40%');
    await ended();assert.notEqual(await image().getAttribute('data-emotion'),'happy');mark('existing bird welcomes first, then restores latest real hunger/thirst without resetting values');
   }else if(mode==='cry'){
    assert.equal((await p.evaluate(()=>window.__arrivalOps)).filter(v=>v.op==='care'&&v.action==='enter').length,0);assert.equal((await p.evaluate(()=>xcwcGuest.read())).birds[0].cryEpisodeShown,false);
    await nest().locator('.arrival-skip').tap();await nest().locator('#bird img[data-emotion=crying]').waitFor();assert((await p.evaluate(()=>xcwcGuest.read())).birds[0].cryEpisodeShown);mark('reunion cry is deferred until welcome completion/skip and not consumed underneath it');
   }else if(mode==='touch'){
    await nest().locator('.dock [data-action=touch]').tap();await tick(100);assert.equal(await nest().locator('.actor.is-arrival').count(),0);await image().evaluate(im=>im.decode());await tick(2200);assert.equal(await nest().locator('.actor.is-arrival').count(),0);mark('care interaction interrupts welcome and does not revive it');
   }else if(mode==='background'){
    await frame().locator('body').evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});assert.equal(await nest().locator('.actor.is-arrival').count(),0);assert(await audio().evaluate(a=>a.paused));
    await frame().locator('body').evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))});await tick(100);assert.equal(await nest().locator('.actor.is-arrival').count(),0);mark('background consumes the intro and pauses sound; foreground does not replay it');
   }
   await p.reload();await nest().locator('#bird').waitFor();await tick(50);assert.equal(await nest().locator('.actor.is-arrival').count(),0);mark('ordinary refresh never replays the adoption arrival');
   await frame().locator('.bottom [data-go=profile]').tap();await frame().locator('#xcwc-account-page').waitFor();await frame().locator('.bottom [data-go=home]').tap();await nest().locator('#bird').waitFor();assert.equal(await nest().locator('.actor.is-arrival').count(),0);mark('returning from another page does not create an arrival');
  }
  assert.deepEqual(r.errors,[]);assert(r.api.every(q=>q.method==='GET'));r.passed=true;
 }catch(e){r.error=e.stack;console.error(engine,mode,e.stack);await p.screenshot({path:path.join(out,engine+'-'+mode+'-failure.png')}).catch(()=>{})}finally{await c.close()}
}
(async()=>{try{for(const [name,engine]of Object.entries({chromium,webkit})){const bin=engine.executablePath(),b=await engine.launch({headless:true,executablePath:fs.existsSync(bin)?bin:name==='chromium'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined});try{for(const mode of modes)await run(b,name,mode)}finally{await b.close()}}report.passed=report.cases.length===modes.length*2&&report.cases.every(r=>r.passed)}catch(e){report.error=e.stack}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json')}));if(!report.passed)process.exitCode=1}})();
