// Disposable local birds only. Exercise real care/pet methods and trusted touch.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-nest-browser-check/node_modules/playwright');
const base=(process.env.XCWC_PREVIEW_URL||'').replace(/\/$/,''),epoch=Date.parse('2026-11-05T02:00:00+08:00');
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Explicit local preview required');
const output=path.resolve(process.env.XCWC_NEST_REPORT_DIR||path.join(__dirname,'../output/nest-current'));fs.mkdirSync(output,{recursive:true});
const slowOnly=process.env.XCWC_NEST_SLOW_ONLY==='1',engines=(process.env.XCWC_NEST_ENGINES||'chromium,webkit').split(',');if(engines.some(n=>!['chromium','webkit'].includes(n)))throw Error('Unknown browser engine');
const report={scope:slowOnly?'slow-image-only':'current-interactions-and-slow-images',engines,passed:false,base,cases:[],limitations:['Fresh mobile browser contexts and controlled clocks; native phones not verified.','No user cache, production requests or cloud writes.']};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

const out=output,fixture={id:'1234567890abcdef1234567890abcdef',active:true,typeId:'huangying',typeName:'小黄莺',cityCode:'hangzhou',cityName:'杭州'},second={...fixture,id:'abcdef1234567890abcdef1234567890'};
report.slowFeedback=[];
const realDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function realDelayAtLeast(ms){
 const started=performance.now();
 do{await realDelay(Math.max(1,Math.ceil(ms-(performance.now()-started))))}while(performance.now()-started<ms);
}
async function bounded(promise,label,ms=10000){
 let timer;
 try{return await Promise.race([promise,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Timed out: '+label)),ms)})])}
 finally{clearTimeout(timer)}
}
async function verifySlowFeedback(browser,engine,width,base){
 const results=[];
 for(const scenario of ['decoded-duration','switch-before-decode','leave-before-decode']){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',locale:'zh-CN',timezoneId:'Asia/Shanghai'});
  const page=await context.newPage(),entry={scenario,passed:false,errors:[],requestedEmotions:[],delayedRequests:[],resourceOutcomes:[]};
  results.push(entry);page.setDefaultTimeout(10000);
  page.on('pageerror',error=>entry.errors.push(error.message));
  page.on('request',request=>{const match=new URL(request.url()).pathname.match(/\/emotions\/([^/]+)\.webp$/);if(match)entry.requestedEmotions.push(match[1].replace(/\.[0-9a-f]{12}$/,''))});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/api/')){assert.equal(route.request().method(),'GET');return route.fulfill({json:[]})}
   assert(['data:','blob:','about:'].includes(url.protocol)||url.origin===base,'slow-image cases must remain local');
   return route.continue();
  });
  const target='puzzled',pattern=new RegExp('/emotions/puzzled-v2'+'(?:\\.[0-9a-f]{12})?\\.webp(?:\\?|$)');
  let intercepted=false,delivered=false,releaseNetwork,finishRelease,finishTerminal;
  const releaseGate=new Promise(resolve=>releaseNetwork=resolve),released=new Promise(resolve=>finishRelease=resolve),terminal=new Promise(resolve=>finishTerminal=resolve);
  page.on('requestfailed',request=>{if(pattern.test(request.url())){entry.resourceOutcomes.push({event:'requestfailed',error:request.failure()?.errorText});finishTerminal()}});
  page.on('requestfinished',request=>{if(pattern.test(request.url())){entry.resourceOutcomes.push({event:'requestfinished'});finishTerminal()}});
  page.on('response',response=>{if(pattern.test(response.url()))entry.resourceOutcomes.push({event:'response',status:response.status()})});
  await context.route(pattern,async route=>{
   intercepted=true;const started=performance.now();
   await realDelayAtLeast(3500);await releaseGate;
   entry.delayedRequests.push({path:new URL(route.request().url()).pathname,wallDelayMs:performance.now()-started});
   try{await route.continue()}catch(error){entry.resourceOutcomes.push({event:'release-after-cancel',message:error.message})}
   finally{delivered=true;finishRelease()}
  });
  const frame=()=>page.frameLocator('iframe'),nest=()=>frame().locator('#xcwc-nest'),image=()=>nest().locator('#bird img');
  const tick=async ms=>{await page.clock.runFor(ms);await page.evaluate(()=>0);await realDelay(20)};
  async function readyName(name){
   for(let i=0;i<400;i++){if(await nest().locator('#name').count()&&await nest().locator('#name').innerText()===name)return;await tick(10)}
   throw Error('Slow-image fixture nest did not mount: '+name);
  }
  try{
   await page.clock.install({time:new Date(epoch)});await page.clock.pauseAt(new Date(epoch+1000));
   await page.goto(base+'/?page=home',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.xcwcGuest);
   assert.equal((await page.evaluate(()=>window.xcwcGuest.read())).birds.length,0);
   await page.evaluate(({first,second})=>{window.xcwcGuest.adopt(first,'慢图甲');window.xcwcGuest.adopt(second,'慢图乙');window.xcwcGuest.select(first.id)},{first:fixture,second});
   await page.reload({waitUntil:'domcontentloaded'});await tick(50);await readyName('慢图甲');await image().evaluate(im=>im.decode());
   assert(entry.requestedEmotions.every(name=>['happy-v2','happy-192','happy-400'].includes(name)),'fresh nest preloaded inactive expression images: '+JSON.stringify(entry.requestedEmotions));
   const response=scenario==='decoded-duration'?page.waitForResponse(response=>pattern.test(response.url())):null;
   await nest().locator('[data-action=play]').click({force:true,noWaitAfter:true});
   await nest().locator('#bird img[data-emotion='+target+']').waitFor();
   for(let i=0;!intercepted&&i<100;i++)await realDelay(10);
   assert(intercepted,'the slow expression request must actually be intercepted');
   assert.equal(delivered,false);
   assert.equal(await image().evaluate(im=>im.complete&&im.naturalWidth>0),false,'expression must still be downloading');
   await image().evaluate(im=>{window.__slowDecodeOutcome={done:false};im.decode().then(()=>window.__slowDecodeOutcome={done:true,outcome:'decoded'},()=>window.__slowDecodeOutcome={done:true,outcome:'canceled-or-failed'})});
   if(scenario==='decoded-duration'){
    await tick(3000);
    assert.equal(delivered,false,'virtual time must not silently release the 3500ms real network delay');
    assert.equal(await image().getAttribute('data-emotion'),'puzzled','download time must not consume the short reaction');
    assert.equal(await image().evaluate(im=>im.complete&&im.naturalWidth>0),false);
    releaseNetwork();await released;await response;await image().evaluate(im=>im.decode());
    assert.equal(await image().getAttribute('data-emotion'),'puzzled');
    const readyAt=await page.evaluate(()=>Date.now());
    const filename=engine+'-'+width+'-slow-puzzled-decoded.png';await page.screenshot({path:path.join(out,filename),animations:'disabled'});entry.screenshot=filename;
    await tick(2999);
    assert.equal(await image().getAttribute('data-emotion'),'puzzled','decoded reaction ended before its full 3-second display');
    assert.equal(await image().evaluate(im=>im.complete&&im.naturalWidth>0),true);
    await tick(101);
    assert.equal(await image().getAttribute('data-emotion'),'happy','decoded reaction did not return to its actual state');
    entry.decodedDisplayEvidence={readyAt,stillVisibleAfterMs:2999,returnedByMs:3100,everDisplayedDecodedPuzzled:true};
   }else{
    if(scenario==='switch-before-decode'){
     await nest().locator('[data-action=switch]').first().click({force:true,noWaitAfter:true});
     await nest().locator('.bird-choice').filter({hasText:'慢图乙'}).click({force:true,noWaitAfter:true});
     await readyName('慢图乙');
    }else{
     await frame().locator('.bottom [data-go=profile]').click({force:true,noWaitAfter:true});await frame().locator('#xcwc-account-page').waitFor();
     await frame().locator('.bottom [data-go=home]').click({force:true,noWaitAfter:true});await readyName('慢图甲');
    }
    assert.equal(delivered,false,'switch/navigation must finish before the delayed resource arrives');
    assert.equal(await image().getAttribute('data-emotion'),'happy');
    releaseNetwork();await released;await bounded(terminal,'old expression network terminal '+scenario);
    for(let i=0;i<300&&!(await frame().locator('body').evaluate(()=>window.__slowDecodeOutcome?.done));i++)await realDelay(10);
    entry.originalDecode=await frame().locator('body').evaluate(()=>window.__slowDecodeOutcome);
    assert(entry.originalDecode?.done,'the original image decode must settle before checking stale callbacks');
    await tick(100);
    for(let i=0;i<5;i++){
     assert.equal(await image().getAttribute('data-emotion'),'happy','late decode restored a cleared reaction');
     assert.equal(await nest().locator('#name').innerText(),scenario==='switch-before-decode'?'慢图乙':'慢图甲');
     await tick(1000);
    }
    entry.lateResourceCleared=true;
   }
   assert(entry.delayedRequests.length>0&&entry.delayedRequests.every(request=>request.wallDelayMs>=3500),'real image request must wait at least 3500ms');
   assert(entry.requestedEmotions.every(name=>['happy-v2','happy-192','happy-400','puzzled-v2'].includes(name)),'a full expression sheet must not be preloaded');
   assert.deepEqual(entry.errors,[]);entry.passed=true;
  }finally{releaseNetwork();await context.close()}
 }
 return results;
}


async function run(browser,engine,width){
 const r={engine,width,passed:false,checks:[],images:[],taps:[],events:[],errors:[],failedResources:[],api:[]};report.cases.push(r);
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:process.env.XCWC_NEST_REDUCED_MOTION==='1'?'reduce':'no-preference',locale:'zh-CN',timezoneId:'Asia/Shanghai'}),page=await context.newPage();page.setDefaultTimeout(12000);
 page.on('pageerror',e=>r.errors.push(e.message));
 page.on('request',req=>{if(req.url().includes('/emotions/'))r.images.push(new URL(req.url()).pathname)});
 page.on('response',res=>{if(!res.ok())r.failedResources.push({url:res.url(),status:res.status()})});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/')){r.api.push({method:route.request().method(),path:u.pathname});return route.abort()}if(!['data:','blob:','about:'].includes(u.protocol)&&u.origin!==base)return route.abort();return route.continue()});
 const nest=()=>page.frameLocator('iframe').locator('#xcwc-nest'),image=()=>nest().locator('#bird img'),emotion=()=>image().getAttribute('data-emotion'),state=()=>page.evaluate(()=>xcwcGuest.read());
 const tick=async ms=>{await page.clock.runFor(ms);await page.evaluate(()=>0);await delay(20)};
 async function ready(expected){for(let i=0;i<150;i++){if(await image().count()&&await emotion()===expected){await image().evaluate(im=>im.decode());return}await tick(10)}throw Error('Expected '+expected+', got '+await emotion())}
 async function pet(){const count=Object.keys((await state()).requests).length;await nest().locator('.dock [data-action=touch]').tap();for(let n=0;n<100;n++){await tick(10);if(Object.keys((await state()).requests).length>count)return}throw Error('Pet result missing')}
 async function tap(x,y){
  const g=await image().evaluate((im,p)=>{const button=im.parentElement,rect=button.getBoundingClientRect(),style=getComputedStyle(im),w=parseFloat(style.width),h=parseFloat(style.height),s=Math.min(w/im.naturalWidth,h/im.naturalHeight),[ox,oy]=style.transformOrigin.split(' ').map(parseFloat),m=new DOMMatrix(style.transform==='none'?undefined:style.transform),x=(w-im.naturalWidth*s)/2+p.x*s,y=(h-im.naturalHeight*s)/2+p.y*s;const vx=rect.left+im.offsetLeft+ox+m.a*(x-ox)+m.c*(y-oy)+m.e,vy=rect.top+im.offsetTop+oy+m.b*(x-ox)+m.d*(y-oy)+m.f;if(!window.__reactionTaps){window.__reactionTaps=[];for(const type of ['pointerdown','click'])button.addEventListener(type,e=>window.__reactionTaps.push({type,trusted:e.isTrusted,pointerType:e.pointerType,buttonTransform:getComputedStyle(button).transform}),true)}return{source:p,x:vx,y:vy,innerWidth,innerHeight,emotion:im.dataset.emotion,imageTransform:style.transform}},{x,y});
  const box=await page.locator('iframe').boundingBox();await page.touchscreen.tap(box.x+g.x*box.width/g.innerWidth,box.y+g.y*box.height/g.innerHeight);r.taps.push(g);await tick(20);r.events.push(...await image().evaluate(()=>(window.__reactionTaps||[]).slice(-2)));
 }
 async function shot(name){await tick(40);await page.screenshot({path:path.join(output,engine+'-'+width+'-'+name+'.png'),animations:'disabled'})}
 const mark=s=>{r.checks.push(s);console.log('PASS',engine,width,s)};
 try{
  await page.clock.install({time:new Date(epoch)});await page.clock.pauseAt(new Date(epoch+1000));await page.goto(base+'/?page=home&fixture=off');await page.waitForFunction(()=>window.xcwcGuest);
  await page.evaluate(()=>xcwcGuest.adopt({id:'1234567890abcdef1234567890abcdef',active:true,typeId:'huangying',typeName:'小黄莺',cityCode:'hangzhou',cityName:'杭州'},'互动验收'));
  await page.reload();await ready('happy');await shot('happy');
  await pet();await ready('happy');const first=await state();await tick(100);await pet();await ready('happy');await tick(100);await pet();await ready('veryhappy');
  assert.match(await image().getAttribute('alt'),/很开心/);assert.equal(await nest().locator('#speech').innerText(),'好开心呀，再陪我一会儿～');assert.match(await image().getAttribute('src'),/happy-v2\.[a-f0-9]{12}\.webp$/);
  assert.equal((await state()).balance,first.balance);await shot('veryhappy');mark('third accepted pet shows very happy with current smile, with no extra points');
  await tick(1000);const requests=Object.keys((await state()).requests).length;await pet();assert(Object.keys((await state()).requests).length>requests);await ready('veryhappy');await tick(2600);assert.equal(await emotion(),'veryhappy');await tick(600);await ready('happy');mark('pet during very happy still accompanies but neither extends nor shortens four seconds');
  await pet();await ready('happy');await tick(100);await pet();await ready('happy');await tick(100);await pet();await ready('veryhappy');mark('reaction ends with cleared count; three new pets are required');
  const beforeFoot=await state();await tap(167,509);await ready('angry');assert.deepEqual(await state(),beforeFoot);await tick(2100);await ready('happy');
  const beforeRight=await state();await tap(444,514);await ready('angry');assert.deepEqual(await state(),beforeRight);await tick(2100);await ready('happy');mark('visible feet of very happy and happy still trigger two-second anger without mutation');
  await pet();await ready('happy');await tick(2100);await ready('happy');await pet();await ready('happy');await tick(100);await pet();await ready('veryhappy');
  await page.frameLocator('iframe').locator('.bottom [data-go=profile]').tap();await page.frameLocator('iframe').locator('#xcwc-account-page').waitFor();await tick(5000);await page.frameLocator('iframe').locator('.bottom [data-go=home]').tap();await ready('happy');await pet();await ready('happy');mark('leaving the nest clears the four-second reaction and its count');
  await nest().locator('[data-action=play]').tap();await tick(20);await ready('puzzled');await tick(3100);await ready('happy');mark('play retains puzzled feedback and restores the real state');
  await page.clock.setSystemTime(new Date(epoch+1000));await page.evaluate(()=>xcwcGuest.adopt({id:'abcdef1234567890abcdef1234567890',active:true,typeId:'huangying',typeName:'小黄莺',cityCode:'hangzhou',cityName:'杭州'},'陪伴验收'));
  await page.clock.setSystemTime(new Date(epoch+245000));await page.evaluate(()=>{const id='abcdef1234567890abcdef1234567890';for(const action of ['water','water','feed','feed'])xcwcGuest.care(id,action);xcwcGuest.select(id)});await page.goto(base+'/?page=home&fixture=off');await ready('unwell');
  const low=(await state()).birds.find(b=>b.id==='abcdef1234567890abcdef1234567890');assert(low.hunger>=30&&low.water>=30&&low.mood<50);assert.match(await image().getAttribute('src'),/hungry-v3\.[a-f0-9]{12}\.webp$/);assert.match(await image().getAttribute('alt'),/想你陪陪/);await shot('company');mark('low mood keeps its real need and uses clean new prone art instead of the removed picture');
  await tap(207,525);await ready('happy');await tick(2200);await ready('unwell');mark('no hidden feet on shared low-mood prone art; touch remains ordinary companionship');
  for(let i=0;i<4;i++){const b=(await state()).birds.find(b=>b.id==='abcdef1234567890abcdef1234567890');if(b.mood>=50)break;await tick(5100);await pet();await ready('happy');await tick(2200)}
  assert((await state()).birds.find(b=>b.id==='abcdef1234567890abcdef1234567890').mood>=50);await ready('happy');mark('ordinary companionship still soothes the real low mood');
  assert(!r.images.some(s=>/\/emotions\/(?:belly(?:-v1)?|unwell)(?:\.|\.webp)/.test(s)),r.images.join('\n'));
  assert(r.events.some(e=>e.type==='pointerdown'&&e.pointerType==='touch'));assert(r.events.every(e=>e.trusted&&e.buttonTransform==='none'));assert.deepEqual(r.errors,[]);assert.deepEqual(r.failedResources,[]);assert.deepEqual(r.api,[]);mark('retired belly and old low-mood images are never requested; no page or resource errors');r.passed=true;
 }catch(e){r.error=e.stack;try{await shot('failure')}catch{}}finally{await context.close()}
 console.log(JSON.stringify({engine,width,passed:r.passed,error:r.error}));
}
(async()=>{try{for(const engine of engines.map(n=>({chromium,webkit})[n])){const bundled=engine.executablePath(),browser=await engine.launch({headless:true,executablePath:fs.existsSync(bundled)?bundled:engine===chromium?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined});try{if(!slowOnly)for(const width of [390,320])await run(browser,engine.name(),width);report.slowFeedback.push({engine:engine.name(),scenarios:await verifySlowFeedback(browser,engine.name(),390,base)})}finally{await browser.close()}}report.passed=report.cases.length===(slowOnly?0:engines.length*2)&&report.cases.every(c=>c.passed)&&report.slowFeedback.length===engines.length&&report.slowFeedback.every(r=>r.scenarios.length===3&&r.scenarios.every(s=>s.passed))}catch(e){report.error=e.stack}finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');console.log(JSON.stringify({passed:report.passed,report:path.join(output,'report.json')}));if(!report.passed)process.exitCode=1}})();
