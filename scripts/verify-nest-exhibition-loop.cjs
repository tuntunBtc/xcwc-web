// Disposable local fixtures only. No production APIs, accounts or cache are used.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const buildRoot=path.resolve(process.env.XCWC_NEST_BUILD_ROOT||path.join(root,'dist'));
const reportRoot=path.resolve(process.env.XCWC_NEST_REPORT_DIR||path.join(root,'output/nest-exhibition-20261104'));
const runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid;
const out=path.join(reportRoot,runId);
const epoch=Date.parse('2026-11-04T02:00:00Z');
const bellyOnly=process.env.XCWC_NEST_BELLY_ONLY==='1';
const angryOnly=process.env.XCWC_NEST_ANGRY_ONLY==='1';
// A mobile CSS pixel spans several source pixels: use a transparent point
// beyond the one-pixel alpha boundary at x=495, which rounds into a real toe.
const angryDeltaPoints={foot:{x:198,y:528},right:{x:443,y:527},negatives:[{x:218,y:500},{x:320,y:520},{x:144,y:523},{x:502,y:522},{x:250,y:543},{x:391,y:543}]};
const fixture={id:'1234567890abcdef1234567890abcdef',active:true,typeId:'huangying',typeName:'小黄莺',cityCode:'hangzhou',cityName:'杭州',skinId:'green',skinName:'绿色'};
const second={...fixture,id:'abcdef1234567890abcdef1234567890'};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mp3':'audio/mpeg','.wav':'audio/wav','.woff2':'font/woff2'};
if(!fs.existsSync(path.join(buildRoot,'index.html')))throw Error('Missing built index.html: '+buildRoot);
fs.mkdirSync(out,{recursive:true});
const report={passed:false,buildRoot,reportDirectory:out,htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(buildRoot,'index.html'))).digest('hex'),clock:'Playwright clock in host and opaque srcdoc; real store transitions from adopt, no state patches',engines:[],regressions:[],limitations:['Synthetic birds in disposable browser contexts; no production or cloud writes.','Native iPhone/WeChat, NFC and physical audio output are not established by this browser check.']};
report.scope=angryOnly?'angry-v2 asset delta':bellyOnly?'belly special':'full exhibition loop';
if(angryOnly)report.functionalBaseline={htmlSha256:'48198d433f48f2e8423dc916f9d3cbe5bc1f35e70f3bbc4485d899c62f77c009',report:path.join(root,'output/nest-exhibition-20261104/2026-11-04T03-33-21-971Z-26851/report.json')};

const server=http.createServer((request,response)=>{
 try{
  const url=new URL(request.url,'http://127.0.0.1');
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405).end();return}
  if(url.pathname.startsWith('/api/')){response.writeHead(503,{'Content-Type':'application/json'}).end('{"code":"FIXTURE_ONLY"}');return}
  const file=path.resolve(buildRoot,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(buildRoot+path.sep)){response.writeHead(403).end();return}
  fs.readFile(file,(error,data)=>{
   if(error){response.writeHead(404).end();return}
   response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
   response.end(request.method==='HEAD'?undefined:data);
  });
 }catch{response.writeHead(400).end()}
});

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
  const target='puzzled',pattern=new RegExp('/emotions/'+target+'(?:\\.[0-9a-f]{12})?\\.webp(?:\\?|$)');
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
   assert(entry.requestedEmotions.every(name=>['happy','happy-192','happy-400'].includes(name)),'fresh nest preloaded inactive expression images');
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
   assert(entry.requestedEmotions.every(name=>['happy','happy-192','happy-400',target].includes(name)),'a full expression sheet must not be preloaded');
   assert.deepEqual(entry.errors,[]);entry.passed=true;
  }finally{releaseNetwork();await context.close()}
 }
 return results;
}

async function regressionHarness(browser,base,result,initialize){
 const context=await browser.newContext({viewport:{width:result.width||390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',locale:'zh-CN',timezoneId:'Asia/Shanghai'}),page=await context.newPage();
 page.setDefaultTimeout(10000);result.errors??=[];page.on('pageerror',error=>result.errors.push(error.message));
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  assert(['data:','blob:','about:'].includes(url.protocol)||url.origin===base,'regressions must remain local');
  if(url.pathname.startsWith('/api/')){assert.equal(route.request().method(),'GET');return route.fulfill({json:[]})}
  return route.continue();
 });
 if(initialize)await context.addInitScript(initialize);
 await page.clock.install({time:new Date(epoch)});await page.clock.pauseAt(new Date(epoch+1000));
 const frame=()=>page.frameLocator('iframe'),nest=()=>frame().locator('#xcwc-nest'),image=()=>nest().locator('#bird img');
 const tick=async ms=>{await page.clock.runFor(ms);await page.evaluate(()=>0);await realDelay(20)};
 const advance=async ms=>{for(let left=ms;left>0;){const step=Math.min(left,1000);await tick(step);left-=step}};
 const state=()=>page.evaluate(()=>window.xcwcGuest.read());
 const current=async()=>{const s=await state();return s.birds.find(b=>b.id===s.currentId)};
 async function ready(){for(let i=0;i<400;i++){if(await nest().locator('#name').count()&&await nest().locator('#name').innerText()==='边界啾')return;await tick(10)}throw Error('Regression nest did not mount')}
 async function snapshot(label){const file='chromium-regression-'+label+'.png';await page.screenshot({path:path.join(out,file),animations:'disabled'});(result.screenshots??=[]).push(file)}
 async function point(x,y){return image().evaluate((im,{x,y})=>{const r=im.getBoundingClientRect(),scale=Math.min(r.width/im.naturalWidth,r.height/im.naturalHeight);return{x:(r.width-im.naturalWidth*scale)/2+x*scale,y:(r.height-im.naturalHeight*scale)/2+y*scale}},{x,y})}
 await page.goto(base+'/?page=home',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.xcwcGuest);
 assert.equal((await state()).birds.length,0);await page.evaluate(bird=>window.xcwcGuest.adopt(bird,'边界啾'),fixture);
 await page.reload({waitUntil:'domcontentloaded'});await tick(50);await ready();
 return{context,page,frame,nest,image,tick,advance,state,current,snapshot,point};
}

async function verifyAngryAssetDelta(browser,base,engine,width){
 const result={name:'angry-v2 asset and foot coordinate delta',engine,width,passed:false,checks:[],errors:[],oldAssetRequests:[]};let c;
 const emotion=()=>c.image().getAttribute('data-emotion');
 const mark=label=>{result.checks.push(label);console.log('PASS angry-v2',engine,width,label)};
 async function foot(point,portrait=false){
  const before=await c.current(),state=await c.state();
  await c.nest().locator('#bird').click({force:true,noWaitAfter:true,position:await c.point(point.x,point.y)});await c.tick(20);assert.equal(await emotion(),'angry');
  const art=portrait?c.nest().locator('.emotion-portrait img'):c.image();await art.evaluate(im=>im.decode());assert.match(await art.getAttribute('src'),/angry-v2\.[0-9a-f]{12}\.webp/);
  const after=await c.current(),next=await c.state();assert.equal(after.mood,before.mood);assert.equal(after.lastCompanionAt,before.lastCompanionAt);assert.equal(next.balance,state.balance);assert.deepEqual(Object.keys(next.requests),Object.keys(state.requests));
 }
 async function shot(label){const file=engine+'-'+width+'-angry-v2-'+label+'.png';await c.page.screenshot({path:path.join(out,file),animations:'disabled'});(result.screenshots??=[]).push(file)}
 try{
  assert(angryDeltaPoints.foot,'Reviewed angry-v2 source foot coordinates are required');
  c=await regressionHarness(browser,base,result);
  c.page.on('request',request=>{if(/\/emotions\/angry(?:\.[0-9a-f]{12})?\.webp(?:\?|$)/.test(request.url()))result.oldAssetRequests.push(request.url())});
  await foot({x:207,y:525});await shot('default-decoded');
  await c.tick(1000);await foot(angryDeltaPoints.foot);await foot(angryDeltaPoints.right);await c.tick(1100);assert.equal(await emotion(),'happy','repeated touches on the new angry feet must not extend its 2-second reaction');
  await foot({x:207,y:525});await c.tick(2200);assert.equal(await emotion(),'happy');
  mark('default sprite decodes new art; new angry foot is hit, does not extend feedback, and another round has no minute lock');
  for(const point of angryDeltaPoints.negatives){
   await foot({x:207,y:525});const requests=Object.keys((await c.state()).requests).length;
   await c.image().evaluate(im=>im.addEventListener('click',event=>{
    const r=im.getBoundingClientRect(),scale=Math.min(r.width/im.naturalWidth,r.height/im.naturalHeight),x=(event.clientX-r.left-(r.width-im.naturalWidth*scale)/2)/scale,y=(event.clientY-r.top-(r.height-im.naturalHeight*scale)/2)/scale;
    window.__angryDeltaClick={clientX:event.clientX,clientY:event.clientY,sourceX:x,sourceY:y,sourcePixel:[Math.floor(x),Math.floor(y)],rect:{x:r.x,y:r.y,width:r.width,height:r.height}};
   },{once:true}));
   await c.nest().locator('#bird').click({force:true,noWaitAfter:true,position:await c.point(point.x,point.y)});await c.tick(20);
   (result.pointMetrics??=[]).push({requested:point,actual:await c.frame().locator('body').evaluate(()=>window.__angryDeltaClick)});
   for(let i=0;i<100&&(await emotion()!=='happy'||Object.keys((await c.state()).requests).length<=requests);i++)await c.tick(10);
   assert.equal(await emotion(),'happy','white/transparent source pixels must not count as feet: '+JSON.stringify(point));assert(Object.keys((await c.state()).requests).length>requests);
  }
  mark('opaque white abdomen, transparent margins and toe gaps never count as feet');
  await c.frame().locator('.bottom [data-go=profile]').click({force:true,noWaitAfter:true});await c.frame().locator('#xcwc-account-page').waitFor();
  let request=0;
  for(let day=0;day<3&&(await c.state()).balance<30;day++){
   if(day)await c.page.clock.setSystemTime(new Date(epoch+(day+1)*86400000));
   await c.page.evaluate(()=>{try{window.xcwcGuest.care(window.xcwcGuest.read().currentId,'greet')}catch(error){if(error.code!=='ALREADY_CLAIMED')throw error}});
   for(let n=0;n<10&&(await c.state()).balance<30;n++){await c.page.clock.setSystemTime(new Date(await c.page.evaluate(()=>Date.now())+31000));await c.page.evaluate(id=>window.xcwcGuest.pet(window.xcwcGuest.read().currentId,id),'angry_delta_reward_'+String(++request).padStart(6,'0'))}
  }
  await c.page.evaluate(()=>{const store=window.xcwcGuest,id=store.read().currentId;store.redeem('huangying_osmanthus','angry_delta_outfit_unlock');store.equip(id,'huangying_osmanthus')});
  await c.frame().locator('.bottom [data-go=home]').click({force:true,noWaitAfter:true});await c.nest().locator('#bird').waitFor();await c.tick(50);
  for(let i=0;i<100&&!/osmanthus-640/.test(await c.image().getAttribute('src'));i++)await c.tick(10);
  await c.image().evaluate(im=>im.decode());
  const source=await c.image().getAttribute('src');assert.match(source,/osmanthus-640/);
  await foot({x:218,y:500},true);assert.equal(await c.image().getAttribute('src'),source);await shot('outfit-decoded');
  await c.tick(1000);await foot({x:218,y:500},true);await c.tick(1100);assert.notEqual(await emotion(),'angry');
  await foot({x:218,y:500},true);assert.equal(await c.image().getAttribute('src'),source);await c.tick(2200);assert.notEqual(await emotion(),'angry');
  mark('outfit keeps full character while new angry portrait decodes and feet retain correct feedback timing');
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.oldAssetRequests,[]);result.passed=true;
 }catch(error){result.error=error.stack;try{result.state=await c.state();await shot('failure')}catch{}console.error('FAIL angry-v2',engine,width,error.stack)}
 finally{if(c)await c.context.close()}
 fs.writeFileSync(path.join(out,engine+'-'+width+'-angry-delta.json'),JSON.stringify(result,null,2)+'\n','utf8');return result;
}

async function verifyBellySpecial(browser,base){
 const result={name:'belly comfort, white abdomen, real feet, duration and reset rules',passed:false,checks:[],errors:[]};let c;
 const setUp=async()=>{
  c=await regressionHarness(browser,base,result);
  c.page.on('request',request=>{assert(!/\/emotions\/shy(?:\.|-)/.test(request.url()),'retired shy art must not be requested')});
 };
 async function pet(point){
  const before=Object.keys((await c.state()).requests).length;
  await c.nest().locator(point?'#bird':'.dock [data-action=touch]').click({force:true,noWaitAfter:true,...(point?{position:await c.point(point.x,point.y)}:{})});
  for(let i=0;i<100&&Object.keys((await c.state()).requests).length===before;i++)await c.tick(10);
  assert(Object.keys((await c.state()).requests).length>before,'normal touch must complete a new real pet operation');await c.tick(20);
 }
 const emotion=()=>c.image().getAttribute('data-emotion');
 async function three(){for(let i=0;i<3;i++){await pet();assert.equal(await emotion(),i===2?'belly':'happy')}}
 async function realFoot(point){
  const before=await c.current(),state=await c.state();
  await c.nest().locator('#bird').click({force:true,noWaitAfter:true,position:await c.point(point.x,point.y)});await c.tick(20);
  assert.equal(await emotion(),'angry');const after=await c.current(),next=await c.state();
  assert.equal(after.mood,before.mood);assert.equal(after.lastCompanionAt,before.lastCompanionAt);assert.equal(next.balance,state.balance);assert.deepEqual(Object.keys(next.requests),Object.keys(state.requests));
 }
 const mark=label=>{result.checks.push(label);console.log('PASS belly',label)};
 try{
  await setUp();await three();await c.image().evaluate(im=>im.decode());assert.match(await c.image().getAttribute('src'),/belly-v1\.[0-9a-f]{12}\.webp/);
  const readyAt=await c.page.evaluate(()=>Date.now());await c.snapshot('belly-real-third-pet');
  assert.equal((await c.state()).balance,6,'belly must not create an additional reward');
  for(const point of [{x:180,y:360},{x:320,y:400},{x:250,y:430}]){await pet(point);assert.equal(await emotion(),'belly','opaque white abdomen must remain a body touch')}
  await c.tick(Math.max(0,3900-(await c.page.evaluate(()=>Date.now())-readyAt)));assert.equal(await emotion(),'belly');
  await pet({x:250,y:430});await c.tick(250);assert.equal(await emotion(),'happy','belly body touches must not extend the 4-second pose');
  mark('third comfortable touch shows belly for 4 seconds; white abdomen never means feet or extends it');
  await three();await c.image().evaluate(im=>im.decode());await realFoot({x:146,y:389});await c.snapshot('belly-foot-interrupt');await c.tick(2200);
  await three();await c.image().evaluate(im=>im.decode());await realFoot({x:338,y:433});await c.tick(2200);
  mark('both belly feet interrupt with anger without changing rewards, mood or companionship; next round needs three fresh touches');
  await pet();await pet();
  await c.frame().locator('body').evaluate(()=>{window.__bellyHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__bellyHidden});document.dispatchEvent(new Event('visibilitychange'))});
  await c.tick(50);await c.frame().locator('body').evaluate(()=>{window.__bellyHidden=false;document.dispatchEvent(new Event('visibilitychange'))});await c.tick(50);
  await three();await c.tick(4200);mark('background/foreground clears the two-touch comfort sequence');
  await pet();await pet();await c.frame().locator('.bottom [data-go=profile]').click({force:true,noWaitAfter:true});await c.frame().locator('#xcwc-account-page').waitFor();
  await c.frame().locator('.bottom [data-go=home]').click({force:true,noWaitAfter:true});await c.nest().locator('#bird').waitFor();await c.tick(50);await three();await c.tick(4200);
  mark('leaving and returning clears the two-touch comfort sequence');
  await c.page.evaluate(bird=>{window.xcwcGuest.adopt(bird,'切换啾');window.xcwcGuest.select('1234567890abcdef1234567890abcdef')},second);
  await pet();await pet();
  for(const name of ['切换啾','边界啾']){await c.nest().locator('[data-action=switch]').first().click({force:true,noWaitAfter:true});await c.nest().locator('.bird-choice').filter({hasText:name}).click({force:true,noWaitAfter:true});await c.tick(50)}
  await three();await c.tick(4200);mark('switching birds clears the earlier bird comfort count');
  await c.context.close();c=null;await setUp();await c.advance(60000);
  assert((await c.current()).water<30);for(let i=0;i<3;i++){await pet();assert.equal(await emotion(),'happy')}
  mark('low hydration prevents belly even after three new successful touches');
  for(let i=0;i<2;i++){await c.nest().locator('.dock [data-action=water]').click({force:true,noWaitAfter:true});await c.tick(50)}
  await c.advance(60000);assert((await c.current()).hunger<30);assert((await c.current()).water>=30);
  for(let i=0;i<3;i++){await pet();assert.equal(await emotion(),'happy')}mark('low food prevents belly while water and mood are sufficient');
  await c.context.close();c=null;await setUp();await c.advance(180000);
  for(const action of ['feed','feed','water','water']){
   if(action==='feed'){await c.nest().locator('.dock [data-action=feed]').click({force:true,noWaitAfter:true});await c.nest().locator('[data-action=do-feed]').click({force:true,noWaitAfter:true})}
   else await c.nest().locator('.dock [data-action=water]').click({force:true,noWaitAfter:true});await c.tick(40);
  }
  const lowMood=await c.current();assert(lowMood.hunger>=30&&lowMood.water>=30&&lowMood.mood<60);
  for(let i=0;i<3;i++){await pet();assert.equal(await emotion(),'happy');assert((await c.current()).mood<60)}
  mark('latest low mood prevents belly despite sufficient food/water');assert.deepEqual(result.errors,[]);result.passed=true;
 }catch(error){result.error=error.stack;try{result.state=await c.state();result.emotion=await emotion();await c.snapshot('belly-failure')}catch{}console.error('FAIL belly',error.stack)}
 finally{if(c)await c.context.close()}
 fs.writeFileSync(path.join(out,'belly-special.json'),JSON.stringify(result,null,2)+'\n','utf8');return result;
}

async function verifyExpressionRecovery(browser,base){
 const result={name:'single failed need retries, and multiple needs skip unavailable artwork',passed:false};let c;
 try{
  c=await regressionHarness(browser,base,result);
  let fail=true,failed=0,succeeded=0;
  const pattern=/\/emotions\/hungry-v2(?:\.[0-9a-f]{12})?\.webp(?:\?|$)/;
  await c.context.route(pattern,route=>{if(fail){failed++;return route.fulfill({status:404,contentType:'text/plain',body:'isolated missing expression fixture'})}succeeded++;return route.continue()});
  await c.advance(120000);
  for(let i=0;i<2;i++){await c.nest().locator('.dock [data-action=water]').click({force:true,noWaitAfter:true});await c.tick(50)}
  await c.advance(6000);
  assert(failed>=1,'single hungry expression must really return HTTP 404');
  const retry=c.nest().locator('[data-action=retry-expression]');await retry.waitFor({state:'visible'});
  assert.equal(await c.image().getAttribute('data-emotion'),'hungry');
  assert.equal(await c.image().evaluate(im=>im.complete&&im.naturalWidth===0),true);
  await c.snapshot('404-before-retry');
  fail=false;await retry.click({force:true,noWaitAfter:true});await c.image().evaluate(im=>im.decode());
  assert(succeeded>=1);assert.equal(await c.image().getAttribute('data-emotion'),'hungry');assert(await c.image().evaluate(im=>im.complete&&im.naturalWidth>0));
  await c.tick(50);await c.snapshot('404-retry-recovered');
  // A different unloaded emotion can fail while the other real needs continue.
  const lonely=/\/emotions\/unwell(?:\.[0-9a-f]{12})?\.webp(?:\?|$)/;let failedLonely=0;
  await c.context.route(lonely,route=>{failedLonely++;return route.fulfill({status:404,contentType:'text/plain',body:'isolated missing lonely fixture'})});
  const observed=new Set();
  for(let i=0;i<240;i++){await c.tick(1000);observed.add(await c.image().getAttribute('data-emotion'))}
  assert(failedLonely>0,'multi-need test must really request its missing artwork');
  assert(observed.has('thirsty')&&observed.has('hungry'),'an unavailable third need must not freeze the remaining visible needs');
  assert.deepEqual(result.errors,[]);result.evidence={failedHungryRequests:failed,retriedHungryRequests:succeeded,failedLonelyRequests:failedLonely,remainingStates:[...observed]};result.passed=true;
 }catch(error){result.error=error.stack;console.error('FAIL regression',result.name,error.stack)}
 finally{if(c)await c.context.close()}
 console.log(result.passed?'PASS regression':'FAIL regression',result.name);return result;
}

async function verifyFootCryRace(browser,base){
 const result={name:'in-flight cry waits for foot reaction and is discarded after real comfort',passed:false,scenarios:[]};
 for(const action of ['foot','body']){
  let c;
  try{
   c=await regressionHarness(browser,base,result,()=>{
    if(window!==window.top)return;
    window.__enterHeld=false;window.__heldEnterResult=null;
    Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,set(original){Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,value:async(...args)=>{
     const value=await original(...args);
     if(args[0]==='care'&&args[1]?.action==='enter'&&value.cry&&!window.__enterHeld){window.__enterHeld=true;window.__heldEnterResult=value;await new Promise(resolve=>window.__releaseHeldEnter=resolve)}
     return value;
    }})}});
   });
   await c.frame().locator('.bottom [data-go=profile]').click({force:true,noWaitAfter:true});await c.frame().locator('#xcwc-account-page').waitFor();
   await c.advance(210000);
   assert.deepEqual([(await c.current()).hunger,(await c.current()).water,(await c.current()).mood],[0,0,30]);
   await c.frame().locator('.bottom [data-go=home]').click({force:true,noWaitAfter:true});
   for(let i=0;i<300&&!(await c.page.evaluate(()=>window.__enterHeld));i++)await c.tick(10);
   assert(await c.page.evaluate(()=>window.__enterHeld),'a real <=30-mood care.enter result must be held');
   const before=await c.current();assert.equal(before.mood,30);
   assert.notEqual(await c.image().getAttribute('data-emotion'),'crying');
   assert(['happy','thirsty'].includes(await c.image().getAttribute('data-emotion')));
   await c.image().evaluate(im=>im.decode());await c.nest().locator('#bird').click({force:true,noWaitAfter:true,position:await c.point(207,525)});await c.tick(20);
   assert.equal(await c.image().getAttribute('data-emotion'),'angry');await c.image().evaluate(im=>im.decode());
   const after=await c.current();assert.equal(after.mood,before.mood);assert.equal(after.lastCompanionAt,before.lastCompanionAt);
   if(action==='body'){
    await c.nest().locator('#bird').click({force:true,noWaitAfter:true,position:await c.point(320,390)});await c.tick(50);
    assert.equal(await c.image().getAttribute('data-emotion'),'happy');await c.image().evaluate(im=>im.decode());
    assert((await c.current()).lastCompanionAt>before.lastCompanionAt);
   }
   const accompanied=await c.current();
   await c.frame().locator('body').evaluate(()=>{window.__heldCryReceived=false;addEventListener('message',event=>{if(event.data?.channel==='xcwc-account-result'&&event.data.value?.cry===true)window.__heldCryReceived=true})});
   await c.page.evaluate(()=>window.__releaseHeldEnter());await c.tick(10);
   for(let i=0;i<100&&!(await c.frame().locator('body').evaluate(()=>window.__heldCryReceived));i++)await c.tick(1);
   assert(await c.frame().locator('body').evaluate(()=>window.__heldCryReceived),'held cry result must actually reach the iframe');
   assert.equal(await c.image().getAttribute('data-emotion'),action==='foot'?'angry':'happy','old enter result must not replace the current reaction');
   await c.tick(1900);assert.equal(await c.image().getAttribute('data-emotion'),action==='foot'?'angry':'happy');
   await c.tick(200);
   if(action==='foot'){
    for(let i=0;i<50&&await c.image().getAttribute('data-emotion')!=='crying';i++)await c.tick(100);
    assert.equal(await c.image().getAttribute('data-emotion'),'crying','unaccompanied cry must be deferred until the foot reaction ends');
    await c.image().evaluate(im=>im.decode());await c.snapshot('held-cry-after-foot');
   }else{
    for(let i=0;i<7;i++){assert.notEqual(await c.image().getAttribute('data-emotion'),'crying','real comfort must discard the old cry');await c.tick(1000)}
    assert.equal((await c.current()).mood,accompanied.mood);assert.equal((await c.current()).lastCompanionAt,accompanied.lastCompanionAt);
    await c.snapshot('held-cry-discarded-after-body');
   }
   result.scenarios.push({action,passed:true});
  }catch(error){result.error=error.stack;result.scenarios.push({action,passed:false,error:error.stack});console.error('FAIL regression',action,error.stack)}
  finally{if(c)await c.context.close()}
 }
 result.passed=result.scenarios.every(scenario=>scenario.passed)&&result.errors.length===0;console.log(result.passed?'PASS regression':'FAIL regression',result.name);return result;
}

async function verifyExpressionDeadline(browser,base){
 const result={name:'15-second image deadline restores real state and ignores late completion',passed:false};let c,release;
 try{
  c=await regressionHarness(browser,base,result);
  const gate=new Promise(resolve=>release=resolve);let intercepted=false,served=false,finishTerminal;
  const terminal=new Promise(resolve=>finishTerminal=resolve),pattern=/\/emotions\/puzzled(?:\.[0-9a-f]{12})?\.webp(?:\?|$)/;
  c.page.on('requestfinished',request=>{if(pattern.test(request.url()))finishTerminal()});c.page.on('requestfailed',request=>{if(pattern.test(request.url()))finishTerminal()});
  await c.context.route(pattern,async route=>{intercepted=true;await gate;try{await route.continue()}finally{served=true}});
  await c.nest().locator('[data-action=play]').click({force:true,noWaitAfter:true});
  for(let i=0;i<100&&(!intercepted||await c.image().getAttribute('data-emotion')!=='puzzled');i++)await c.tick(10);
  assert(intercepted);assert.equal(await c.image().getAttribute('data-emotion'),'puzzled');assert.equal(served,false);
  assert.equal(await c.image().evaluate(im=>im.complete&&im.naturalWidth>0),false);
  await c.image().evaluate(im=>{window.__deadlineDecode={done:false};im.decode().then(()=>window.__deadlineDecode={done:true,outcome:'decoded'},()=>window.__deadlineDecode={done:true,outcome:'canceled-or-failed'})});
  await c.advance(14000);assert.equal(await c.image().getAttribute('data-emotion'),'puzzled');assert.equal(served,false);
  await c.tick(1001);assert.equal(await c.image().getAttribute('data-emotion'),'happy','15-second pending-image deadline must restore actual happy state');assert.equal(served,false);
  release();await bounded(terminal,'deadline old image network terminal');
  for(let i=0;i<300&&!(await c.frame().locator('body').evaluate(()=>window.__deadlineDecode.done));i++)await realDelay(10);
  assert(await c.frame().locator('body').evaluate(()=>window.__deadlineDecode.done));
  for(let i=0;i<4;i++){await c.tick(1000);assert.equal(await c.image().getAttribute('data-emotion'),'happy','a late deadline decode must not resurrect puzzled')}
  await c.snapshot('15-second-image-deadline');assert.deepEqual(result.errors,[]);result.passed=true;
 }catch(error){result.error=error.stack;console.error('FAIL regression',result.name,error.stack)}
 finally{release?.();if(c)await c.context.close()}
 console.log(result.passed?'PASS regression':'FAIL regression',result.name);return result;
}

async function runCase(browser,engine,width,base){
 const result={engine,width,passed:false,checks:[],samples:[],screenshots:[],errors:[],failedResources:[],blockedRequests:[],cryEpisodes:[],retiredRequests:[]},observedEmotions=new Set();
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',locale:'zh-CN',timezoneId:'Asia/Shanghai'});
 const page=await context.newPage();
 page.setDefaultTimeout(10000);
 page.on('pageerror',error=>result.errors.push(error.message));
 page.on('request',request=>{if(/\/emotions\/shy(?:\.|-)/.test(request.url()))result.retiredRequests.push(request.url())});
 page.on('response',response=>{if(!response.ok()&&!new URL(response.url()).pathname.startsWith('/api/'))result.failedResources.push({status:response.status(),url:response.url()})});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith('/api/')){
   result.blockedRequests.push({kind:'api',method:route.request().method(),path:url.pathname});
   return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  }
  if(!['data:','blob:','about:'].includes(url.protocol)&&url.origin!==base){result.blockedRequests.push({kind:'external',url:url.origin+url.pathname});return route.abort()}
  return route.continue();
 });
 await context.addInitScript(()=>{
  if(window!==window.top)return;
  window.__nestAuditOps=[];
  Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,set(original){
   Object.defineProperty(window,'xcwcGuestOperation',{configurable:true,value:async(...args)=>{
    const entry={operation:args[0],action:args[1]?.action,done:false};window.__nestAuditOps.push(entry);
    try{return await original(...args)}finally{entry.done=true}
   }});
  }});
 });
 const frame=()=>page.frameLocator('iframe');
 const nest=()=>frame().locator('#xcwc-nest');
 const image=()=>nest().locator('#bird img');
 const touch=()=>nest().locator('#bird');
 const now=()=>page.evaluate(()=>Date.now());
 const state=()=>page.evaluate(()=>window.xcwcGuest.read());
 const current=async()=>{const s=await state();return s.birds.find(b=>b.id===s.currentId)};
 const emotion=()=>image().getAttribute('data-emotion');
 const ticks=async ms=>{await page.clock.runFor(ms);await page.evaluate(()=>0);await realDelay(15)};
 const poll=async(fn,label)=>{
  const started=Date.now();
  while(Date.now()-started<10000){if(await fn())return;await ticks(10)}
  throw Error('Timed out: '+label);
 };
 const waitName=name=>poll(async()=>await nest().locator('#name').count()>0&&await nest().locator('#name').innerText()===name,'mounted bird '+name);
 async function screenshot(label){
  await image().evaluate(im=>im.decode());
  const filename=engine+'-'+width+'-'+label+'.png';
  await page.screenshot({path:path.join(out,filename),animations:'disabled'});
  result.screenshots.push(filename);
 }
 async function expectEmotion(expected){await poll(async()=>await emotion()===expected,'emotion '+expected);observedEmotions.add(expected)}
 async function click(locator,{action,operation='care',checkHit=true,position}={}){
  await locator.waitFor({state:'visible'});
  if(checkHit){
   await locator.scrollIntoViewIfNeeded();
   const geometry=await locator.evaluate(button=>{
    const r=button.getBoundingClientRect(),root=button.getRootNode(),hit=root.elementFromPoint?.(r.x+r.width/2,r.y+r.height/2);
    return{width:r.width,height:r.height,visible:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1,hit:!hit||button===hit||button.contains(hit),hitElement:hit?{tag:hit.tagName,id:hit.id,className:String(hit.className),text:hit.textContent.slice(0,100),pointerEvents:getComputedStyle(hit).pointerEvents}:null};
   });
   assert(geometry.visible&&geometry.hit&&geometry.width>=24&&geometry.height>=24,'button must have a reachable visible hit target: '+JSON.stringify(geometry));
  }
  const start=await page.evaluate(()=>window.__nestAuditOps.length);
  await locator.click({force:true,noWaitAfter:true,...(position?{position}:{})});
  if(action||operation!=='care')await poll(()=>page.evaluate(({start,action,operation})=>window.__nestAuditOps.slice(start).some(entry=>entry.done&&entry.operation===operation&&(!action||entry.action===action)),{start,action,operation}),'saved '+(action||operation));
  await ticks(20);
 }
 async function feed(){await click(nest().locator('.dock [data-action=feed]'));await click(nest().locator('[data-action=do-feed]'),{action:'feed'})}
 const water=()=>click(nest().locator('.dock [data-action=water]'),{action:'water'});
 const play=()=>click(nest().locator('[data-action=play]'),{action:'play'});
 async function artPosition(point){
  return image().evaluate((im,{x,y})=>{
   const r=im.getBoundingClientRect(),scale=Math.min(r.width/im.naturalWidth,r.height/im.naturalHeight);
   return{x:(r.width-im.naturalWidth*scale)/2+x*scale,y:(r.height-im.naturalHeight*scale)/2+y*scale};
  },point);
 }
 const petArt=async point=>click(touch(),{operation:'pet',position:await artPosition(point)});
 async function footArt(point){
  const before=await current(),balance=(await state()).balance,start=await page.evaluate(()=>window.__nestAuditOps.length);
  await touch().click({force:true,noWaitAfter:true,position:await artPosition(point)});await ticks(20);await expectEmotion('angry');
  await image().evaluate(im=>im.decode());
  const after=await current();assert.equal(after.mood,before.mood,'touching feet must not change mood');
  assert.equal(after.lastCompanionAt,before.lastCompanionAt,'touching feet must not count as companionship');
  assert.equal((await state()).balance,balance,'touching feet must not grant or deduct points');
  const calls=await page.evaluate(start=>window.__nestAuditOps.slice(start).filter(entry=>['pet','care'].includes(entry.operation)),start);
  assert.deepEqual(calls,[],'touching feet is visual feedback and must not call rewarded care');
 }
 async function supply(){await click(nest().locator('[data-action=daily]'));await click(nest().locator('[data-action=supply]'),{action:'supply'})}
 async function nav(route){await click(frame().locator('.bottom [data-go='+route+']'));await frame().locator(route==='home'?'#xcwc-nest':'#xcwc-account-page').waitFor()}
 async function check(label,fn){await fn();result.checks.push(label);console.log('PASS',engine,width,label)}
 let priorEmotion=null,adoptedAt;
 const seen=new Set();
 async function sample(capture=false){
  const value=await emotion(),bird=await current();
  observedEmotions.add(value);
  const row={elapsed:await now()-adoptedAt,emotion:value,hunger:bird.hunger,water:bird.water,mood:bird.mood,displayed:await nest().locator('.stat b').allTextContents(),speech:await nest().locator('#speech').innerText()};
  result.samples.push(row);
  if(value==='crying'&&priorEmotion!=='crying')result.cryEpisodes.push(row.elapsed);
  priorEmotion=value;
  if(capture&&!seen.has(value)){
   seen.add(value);
   if(value==='thirsty'){
    assert.match(await image().getAttribute('src'),/happy(?:\.[0-9a-f]+)?\.webp/,'thirst must reuse happy art instead of lonely art');
    assert(await nest().locator('.actor').evaluate(el=>el.classList.contains('is-thirsty')));
    assert(await nest().locator('.thirst-drops').evaluate(el=>getComputedStyle(el).opacity!=='0'&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none'));
   }
   await screenshot('natural-'+value);
  }
  return row;
 }
 async function advance(ms,{capture=false,step=1000}={}){
  for(let left=ms;left>0;){const amount=Math.min(step,left);await ticks(amount);left-=amount;if(await image().count())await sample(capture)}
 }
 try{
  assert(page.clock,'Installed Playwright must support page.clock');
  await page.clock.install({time:new Date(epoch)});
  await page.clock.pauseAt(new Date(epoch+1000));
  await page.goto(base+'/?page=home',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.xcwcGuest);
  assert.equal((await state()).birds.length,0,'each case must start from empty local cache');
  await page.evaluate(bird=>window.xcwcGuest.adopt(bird,'展会甲'),fixture);
  adoptedAt=await now();
  await page.reload({waitUntil:'domcontentloaded'});await ticks(50);
  await waitName('展会甲');
  const clocks=await Promise.all([now(),frame().locator('body').evaluate(()=>Date.now())]);
  assert.equal(clocks[0],clocks[1],'host and opaque srcdoc Date must use the same controlled clock');
  result.clockStart=clocks[0];
  await check('empty context adopts artificial bird through real store and synchronizes iframe clock',async()=>{
   const bird=await current();assert.deepEqual([bird.hunger,bird.water,bird.mood],[60,60,80]);
   assert.equal((await state()).balance,5);
   await expectEmotion('happy');await sample(true);
   assert.equal(await nest().locator('.emotion-portrait').isVisible(),false);
   assert.deepEqual(await frame().locator('.bottom [data-go]').evaluateAll(buttons=>buttons.map(b=>b.dataset.go)),['home','city','shop','profile']);
  });
  await check('0–4 minutes settle real decay and naturally show thirsty, hungry, low mood and crying',async()=>{
   await advance(240000,{capture:true});
   for(const expected of ['happy','thirsty','hungry','unwell','crying'])assert(seen.has(expected),'natural loop never displayed '+expected);
   const bird=await current();assert.deepEqual([bird.hunger,bird.water,bird.mood],[0,0,20]);
   for(const [seconds,stats]of [[60,[40,25,80]],[120,[20,0,60]],[180,[0,0,40]]]){
    assert(result.samples.some(row=>row.elapsed>=seconds*1000&&row.elapsed<seconds*1000+6500&&JSON.stringify(row.displayed)===JSON.stringify(stats.map(value=>value+'%'))),'automatic UI refresh did not show boundary '+seconds+' seconds');
   }
   const tags=await nest().locator('[data-need]').evaluateAll(elements=>elements.filter(el=>!el.hidden&&getComputedStyle(el).display!=='none').map(el=>el.dataset.need));
   assert.deepEqual([...new Set(tags)].sort(),['company','food','water']);
   const thirsty=result.samples.find(row=>row.emotion==='thirsty');assert.match(thirsty.speech,/水/);
   const lonely=result.samples.find(row=>row.emotion==='unwell');assert.match(lonely.speech,/陪|想你/);
   assert.equal(result.cryEpisodes.length,1,'one continuous low-mood cycle must cry once');
   assert(result.cryEpisodes[0]>=210000&&result.cryEpisodes[0]<=216000,'cry must come from the <=30 threshold and automatic 5-second refresh');
  });
  await check('persistent needs rotate on an 8-second cadence instead of hiding food or company',async()=>{
   const transitions=[];let previous;
   for(let i=0;i<25;i++){await ticks(1000);const currentNeed=await nest().locator('[data-need].is-current').getAttribute('data-need');if(currentNeed!==previous){transitions.push({need:currentNeed,at:await now()});previous=currentNeed}}
   assert.deepEqual([...new Set(transitions.map(t=>t.need))].sort(),['company','food','water']);
   for(let i=2;i<transitions.length;i++)assert(Math.abs(transitions[i].at-transitions[i-1].at-8000)<=1500,'need rotation must remain close to 8 seconds');
   await advance(120000,{step:5000});
   assert.equal(result.cryEpisodes.length,1,'remaining at low mood must not start another crying cycle');
  });
  await check('play is a visible 3-second puzzled response, grants companionship and no points',async()=>{
   const before=await current(),balance=(await state()).balance;
   await play();await expectEmotion('puzzled');await screenshot('play-puzzled');
   assert((await current()).mood>before.mood,'play must count as companionship');
   assert.equal((await state()).balance,balance);
   const at=await now();await ticks(2000);assert.equal(await emotion(),'puzzled');await ticks(1100);assert.notEqual(await emotion(),'puzzled');
   assert(await now()-at>=3000);
  });
  await check('body and dock touches show happy wings while visible feet alone cause playful anger',async()=>{
   await click(touch(),{operation:'pet'});await expectEmotion('happy');await screenshot('touch-happy');
   await ticks(1000);assert.equal(await emotion(),'happy');await ticks(1100);assert.notEqual(await emotion(),'happy');
   await ticks(1100);
   for(let i=0;i<5;i++)await petArt({x:320,y:390});
   assert.equal(await emotion(),'happy','five quick body touches must stay happy');
   await feed();await expectEmotion('happy');await image().evaluate(im=>im.decode());
   await footArt({x:207,y:525});await screenshot('visible-foot-angry');
   await ticks(1000);assert.equal(await emotion(),'angry');await footArt(angryDeltaPoints.foot);
   await ticks(1100);assert.notEqual(await emotion(),'angry','another foot touch must not restart the active 2-second reaction');
   await feed();await expectEmotion('happy');await image().evaluate(im=>im.decode());
   await touch().click({force:true,noWaitAfter:true,position:await artPosition({x:320,y:568})});await ticks(50);
   assert.notEqual(await emotion(),'angry','transparent space below the bird must not count as a foot');
   await footArt({x:207,y:525});await ticks(2200);
   await click(nest().locator('.dock [data-action=touch]'),{operation:'pet'});await expectEmotion('happy');
   await ticks(2200);await touch().press('Enter');await expectEmotion('happy');
   await ticks(2200);
  });
  await check('repeat supply caps both inventories at 3 and never adds wallet points',async()=>{
   await feed();await water();const before=await state();
   await supply();let bird=await current();assert.equal(bird.food,3);assert.equal(bird.waterStock,3);
   assert.equal((await state()).balance,before.balance);
   await click(nest().locator('[data-action=daily]'));
   assert(await nest().locator('[data-action=supply]').isDisabled(),'full demo inventory must disable redundant supply');
   await click(nest().locator('#sheet > [data-action=close]'));
   await feed();await water();const afterCare=await state();
   await supply();bird=await current();assert.equal(bird.food,3);assert.equal(bird.waterStock,3);
   assert.equal((await state()).balance,afterCare.balance);
  });
  await check('ordinary care restores >=50 mood and rearms exactly one later low-mood cry',async()=>{
   for(let i=0;i<14;i++){
    const bird=await current();if(bird.hunger>=30&&bird.water>=30&&bird.mood>=60)break;
    if(bird.food<1||bird.waterStock<1)await supply();
    if(bird.hunger<60)await feed();else if(bird.water<60)await water();else await play();
    await ticks(5100);
   }
   assert((await current()).mood>=50,'care should quickly restore mood, including after the former daily cap');
   await ticks(3500);priorEmotion=await emotion();
   const initialCount=result.cryEpisodes.length;
   const mood=(await current()).mood;
   const untilLow=60000+Math.max(0,Math.ceil((mood-30)/10))*30000+10000;
   await advance(untilLow,{step:1000});
   assert.equal(result.cryEpisodes.length,initialCount+1,'restored mood must rearm a later low-mood cycle');
   const episodes=result.cryEpisodes;assert(episodes[episodes.length-1]-episodes[episodes.length-2]>=120000,'cry cooldown must be at least 120 seconds');
  });
  await check('switch and route changes clear temporary feedback without crossing birds',async()=>{
   await page.evaluate(bird=>{window.xcwcGuest.adopt(bird,'展会乙');window.xcwcGuest.select('1234567890abcdef1234567890abcdef')},second);
   // Rebuilding an opaque srcdoc after hundreds of clock.runFor calls can
   // replay Playwright's timer history during route loading. Real navigation
   // refreshes the fixture without that test-clock-only iframe reconstruction.
   await nav('profile');await nav('home');await waitName('展会甲');
   await play();await expectEmotion('puzzled');
   await click(nest().locator('[data-action=switch]').first());
   await click(nest().locator('.bird-choice').filter({hasText:'展会乙'}),{operation:'selectBird'});
   await waitName('展会乙');await expectEmotion('happy');
   await play();await expectEmotion('puzzled');await nav('profile');await nav('home');
   assert.notEqual(await emotion(),'puzzled');
   await screenshot('switch-and-return');
  });
  await check('open supply dialog and simulated background defer crying without consuming the cycle',async()=>{
   const guardBird={...fixture,id:'fedcba0987654321fedcba0987654321'};
   async function fresh(name){await page.evaluate(({bird,name})=>window.xcwcGuest.adopt(bird,name),{bird:guardBird,name});await nav('profile');await nav('home');await waitName(name)}
   await fresh('弹窗啾');
   const before=(await current()).lastCryAt??null;
   await click(nest().locator('[data-action=daily]'));
   await advance(220000,{step:5000});
   assert((await current()).mood<=30);assert.equal((await current()).lastCryAt??null,before,'a dialog must not consume the pending cry');
   assert.notEqual(await emotion(),'crying');
   await click(nest().locator('#sheet > [data-action=close]'));
   await ticks(5200);await expectEmotion('crying');await screenshot('dialog-close-cry');
   await image().evaluate(im=>im.decode());await footArt({x:249,y:529});
   const backgroundBird={...fixture,id:'0123456789abcdef0123456789abcdef'};
   await page.evaluate(bird=>window.xcwcGuest.adopt(bird,'后台啾'),backgroundBird);await nav('profile');await nav('home');await waitName('后台啾');
   await frame().locator('body').evaluate(()=>{
    window.__nestAuditHidden=true;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__nestAuditHidden});
    document.dispatchEvent(new Event('visibilitychange'));
   });
   await advance(220000,{step:5000});
   assert((await current()).mood<=30);assert.equal((await current()).lastCryAt??null,null,'background must not consume the pending cry');
   await frame().locator('body').evaluate(()=>{window.__nestAuditHidden=false;document.dispatchEvent(new Event('visibilitychange'))});
   await ticks(100);await expectEmotion('crying');await screenshot('foreground-cry');
   const lonelyMood=(await current()).mood;
   await image().evaluate(im=>im.decode());await petArt({x:320,y:390});await expectEmotion('happy');
   assert((await current()).mood>lonelyMood,'a body touch must comfort the crying bird and count as companionship');
   result.visibilityEvidence='Controlled document.hidden plus visibilitychange; operating-system backgrounding remains a device check.';
   await ticks(3200);
  });
  await check('outfit keeps full character while a decoded portrait shows current emotions',async()=>{
   // Earn fixture funds through existing rewarded operations. Never inject balance,
   // ownership, moods or inventories into localStorage to make the visual pass.
   await nav('profile');
   let request=0;
   for(let day=0;day<3&&(await state()).balance<30;day++){
    if(day){await page.clock.setSystemTime(new Date(epoch+(day+1)*86400000));await page.evaluate(()=>0)}
    await page.evaluate(()=>{try{window.xcwcGuest.care(window.xcwcGuest.read().currentId,'greet')}catch(error){if(error.code!=='ALREADY_CLAIMED')throw error}});
    for(let pet=0;pet<10&&(await state()).balance<30;pet++){
     await page.clock.setSystemTime(new Date(await now()+31000));
     await page.evaluate(requestId=>window.xcwcGuest.pet(window.xcwcGuest.read().currentId,requestId),'nest_outfit_earning_'+String(++request).padStart(6,'0'));
    }
   }
   assert((await state()).balance>=30,'legitimate fixture earnings must fund one outfit');
   // Restore mood using the same new play action after the earning clock jump.
   for(let i=0;i<20&&(await current()).mood<80;i++){
    await page.clock.setSystemTime(new Date(await now()+5100));
    await page.evaluate(()=>window.xcwcGuest.care(window.xcwcGuest.read().currentId,'play'));
   }
   await nav('home');await click(nest().locator('[data-action=dress]'));
   const wardrobe=frame().locator('.account-wardrobe-felt');await wardrobe.locator('.wardrobe-hero').waitFor();
   await click(wardrobe.locator('[data-skin=huangying_osmanthus]'));
   await click(wardrobe.locator('[data-account-action=confirm-redeem]'),{operation:'redeem'});
   await click(wardrobe.locator('[data-skin=huangying_osmanthus]'),{operation:'equip'});
   await nav('home');await image().evaluate(im=>im.decode());
   const source=await image().getAttribute('src');assert.match(source,/osmanthus-640(?:\.[0-9a-f]+)?\.webp/);
   await play();await expectEmotion('puzzled');
   const portrait=nest().locator('.emotion-portrait');assert(await portrait.isVisible());
   const portraitImage=portrait.locator('img');await portraitImage.evaluate(im=>im.decode());
   assert.match(await portraitImage.getAttribute('src'),/puzzled(?:\.[0-9a-f]+)?\.webp/);
   assert.equal(await image().getAttribute('src'),source,'outfit must remain on the main character');
   assert(await portraitImage.evaluate(im=>im.naturalWidth>0&&im.naturalHeight>0));
   await screenshot('outfit-puzzled-portrait');
   await ticks(3100);await click(touch(),{operation:'pet'});await expectEmotion('happy');
   assert(await portrait.isVisible(),'outfit must retain its decoded happy reaction portrait during a touch');
   await portraitImage.evaluate(im=>im.decode());assert.match(await portraitImage.getAttribute('src'),/happy(?:\.[0-9a-f]+)?\.webp/);
   assert.equal(await image().getAttribute('src'),source);
   await screenshot('outfit-happy-portrait');
   await ticks(2200);
   await footArt({x:218,y:500});await portraitImage.evaluate(im=>im.decode());
   assert.match(await portraitImage.getAttribute('src'),/angry-v2(?:\.[0-9a-f]+)?\.webp/);
   assert.equal(await image().getAttribute('src'),source,'touching outfit feet must retain the full outfit');
   await screenshot('outfit-foot-angry-portrait');
   await ticks(2200);
   for(let i=0;i<2;i++){await feed();await water()}
   assert((await current()).hunger>=30&&(await current()).water>=30&&(await current()).mood>=60);
   for(let i=0;i<3;i++){await click(nest().locator('.dock [data-action=touch]'),{operation:'pet'});await expectEmotion(i===2?'belly':'happy')}
   await portraitImage.evaluate(im=>im.decode());assert.match(await portraitImage.getAttribute('src'),/belly-v1\.[0-9a-f]+\.webp/);
   assert.equal(await image().getAttribute('src'),source,'belly reaction must retain the full outfit');await screenshot('outfit-belly-portrait');
  });
  await check('slow images preserve a full decoded reaction and late loads cannot cross birds or routes',async()=>{
   result.slowFeedback=await verifySlowFeedback(browser,engine,width,base);
   assert(result.slowFeedback.every(scenario=>scenario.passed));
  });
  await check('narrow layout, image decoding and isolated requests remain clean',async()=>{
   assert.equal(await frame().locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const invalid=await nest().locator('img[src]').evaluateAll(images=>images.filter(im=>getComputedStyle(im).display!=='none'&&im.getBoundingClientRect().width>0&&!im.complete).map(im=>im.src));
   assert.deepEqual(invalid,[]);
   assert.deepEqual(result.errors,[]);assert.deepEqual(result.failedResources,[]);
   assert.deepEqual(result.retiredRequests,[],'retired shy sprite must not load anywhere in the current UI');
   result.seenEmotions=[...observedEmotions].sort();
   assert.deepEqual(result.seenEmotions,['angry','belly','crying','happy','hungry','puzzled','thirsty','unwell']);
   assert(result.blockedRequests.every(r=>r.kind==='api'&&['GET','HEAD'].includes(r.method)),'guest interactions must not attempt cloud writes or external requests');
  });
  result.passed=true;
 }catch(error){
  result.error=error.stack;
  try{result.failureDom={url:page.url(),body:(await frame().locator('body').innerText({timeout:1500})).slice(0,8000)}}catch{}
  try{result.failureState=await state();result.failureEmotion=await emotion();await screenshot('failure')}catch{}
  console.error('FAIL',engine,width,error.stack);
 }finally{
  await context.close();fs.writeFileSync(path.join(out,engine+'-'+width+'.json'),JSON.stringify(result,null,2)+'\n','utf8');
 }
 return result;
}

(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;report.preview=base;
 try{
  for(const engine of [chromium,webkit]){
   const name=engine.name(),bundled=engine.executablePath(),chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
   if(bellyOnly&&name!=='chromium')continue;
   const executable=fs.existsSync(bundled)?bundled:name==='chromium'&&fs.existsSync(chrome)?chrome:null;
   if(!executable){report.engines.push({engine:name,skipped:true,reason:'No local browser executable'});continue}
   const browser=await engine.launch({headless:true,executablePath:executable});
   try{
    if(angryOnly){for(const width of [390,320])report.regressions.push(await verifyAngryAssetDelta(browser,base,name,width));continue}
    if(name==='chromium'){const belly=await verifyBellySpecial(browser,base);report.regressions.push(belly);if(!belly.passed||bellyOnly)continue}
    for(const width of [390,320])report.engines.push(await runCase(browser,name,width,base));
    if(name==='chromium'){report.regressions.push(await verifyExpressionRecovery(browser,base));report.regressions.push(await verifyFootCryRace(browser,base));report.regressions.push(await verifyExpressionDeadline(browser,base))}
   }finally{await browser.close()}
  }
  const completed=report.engines.filter(result=>!result.skipped);report.passed=(bellyOnly||angryOnly?report.regressions.length>0:completed.length>0)&&completed.every(result=>result.passed)&&report.regressions.every(result=>result.passed);
 }catch(error){report.error=error.stack}
 finally{
  await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json'),cases:report.engines.map(({engine,width,passed,skipped,checks,error})=>({engine,width,passed,skipped,checks:checks?.length,error}))},null,2));
  if(!report.passed)process.exitCode=1;
 }
})().catch(error=>{console.error(error.stack);server.close();process.exitCode=1});
