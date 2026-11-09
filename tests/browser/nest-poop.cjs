// Local disposable guest records only. Actions use the actual UI and public model.
// The browser clock is controlled; no production entity, account, or write is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-nest-browser-check/node_modules/playwright');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8997';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Explicit local preview required');
const out=path.resolve(process.env.XCWC_POOP_REPORT_DIR||'output/nest-poop-20261105/browser');
const engines=(process.env.XCWC_POOP_ENGINES||'chromium,webkit').split(',');
if(engines.some(value=>!['chromium','webkit'].includes(value)))throw Error('Unknown browser engine');
const codes=['HZ-HY-900000000000000001','HZ-HY-900000000000000002'];
const epoch=Date.parse('2026-11-05T02:00:00+08:00');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={base,passed:false,testSha256:sha(__filename),entrySha256:sha(path.resolve(__dirname,'../../dist/index.html')),scope:'Local UI against the existing synthetic public HTTP model with isolated browser storage and a controlled clock.',engines:[],limitations:['Physical Safari/WeChat and emoji rendering on other operating systems are not established by desktop browser checks.','No production writes, deployment, or user browser storage changes.']};
fs.mkdirSync(out,{recursive:true});
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');

async function scenario(browser,result,width,name,body){
 const r={name,width,passed:false,checks:[],errors:[],forbidden:[],requests:[],snapshots:{}};result.scenarios.push(r);
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',locale:'zh-CN',timezoneId:'Asia/Shanghai'});
 const page=await context.newPage();page.setDefaultTimeout(12000);
 context.on('page',p=>p.on('pageerror',error=>r.errors.push(error.message)));
 context.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/'))r.requests.push({method:request.method(),path:url.pathname})});
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()!=='GET'||(!['data:','blob:','about:'].includes(url.protocol)&&url.origin!==base)){
   r.forbidden.push({method:request.method(),url:request.url()});return route.abort();
  }
  return route.continue();
 });
 const f=()=>page.frameLocator('iframe'),nest=()=>f().locator('#xcwc-nest'),poop=()=>nest().locator('.nest-poop[data-action=clean]');
 const state=()=>page.evaluate(()=>window.xcwcGuest.read());
 const current=async()=>{const value=await state();return value.birds.find(bird=>bird.id===value.currentId)};
 const mark=text=>{r.checks.push(text);console.log('PASS',result.engine,name,width,text)};
 async function eventually(fn,predicate,message,timeout=7000){
  const end=Date.now()+timeout;let value;
  do{value=await fn();if(predicate(value))return value;await sleep(30)}while(Date.now()<end);
  throw Error(message+': '+JSON.stringify(value));
 }
 async function art(){
  for(const selector of ['.scene','.avatar img','#bird img'])await nest().locator(selector).evaluate(im=>im.complete&&im.naturalWidth?null:im.decode());
 }
 async function ready(label){await nest().locator('#name').filter({hasText:label}).waitFor();await art();await poop().waitFor({state:'attached'})}
 async function adopt(index,label){
  await page.goto(base+'/register.html?birdCode='+codes[index],{waitUntil:'domcontentloaded'});
  const confirm=f().locator('#xcwc-adopt [data-action=confirm]');await confirm.filter({hasText:'孵化并领养'}).waitFor();
  await f().locator('#adopt-v1-name').fill(label);await confirm.tap();await ready(label);
 }
 async function feed(){
  const before=await current();await nest().locator('.dock [data-action=feed]').tap();await nest().locator('[data-action=do-feed]').tap();
  await nest().locator('#sheet').waitFor({state:'hidden'});
  return eventually(current,bird=>bird.hunger===Math.min(100,before.hunger+30),'feed must persist its actual capped hunger');
 }
 async function clean(fromPoop=false){
  const before=await state();await (fromPoop?poop():nest().locator('.tools [data-action=clean]')).tap();
  await eventually(current,bird=>bird.poopDueAt==null,'clean must persist removal before it is shown as complete');
  await poop().waitFor({state:'hidden'});const after=await state();
  assert.equal(after.balance,before.balance);assert.deepEqual(after.ledger,before.ledger);
  return after;
 }
 async function tick(ms){
  // Preserve every tick around 59.999/60s; long offline/layout spans only need
  // the elapsed-time settlement and the final due-timer callbacks.
  if(ms>=60000)await page.clock.fastForward(ms);else await page.clock.runFor(ms);
  await sleep(40);
 }
 async function switchTo(label){await nest().locator('[data-action=switch]').first().tap();await nest().locator('.bird-choice').filter({hasText:label}).tap();await ready(label)}
 async function visible(yes){await f().locator('body').evaluate((_,yes)=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>!yes});document.dispatchEvent(new Event('visibilitychange'))},yes)}
 async function geometry(){
  await poop().scrollIntoViewIfNeeded();
  const measured=await poop().evaluate(el=>{
   const root=el.getRootNode(),rect=el.getBoundingClientRect(),cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
   const intersects=(a,b)=>Math.max(a.left,b.left)<Math.min(a.right,b.right)-.5&&Math.max(a.top,b.top)<Math.min(a.bottom,b.bottom)-.5;
   const computed=getComputedStyle(el);
   return{width:rect.width,height:rect.height,computedWidth:parseFloat(computed.width),computedHeight:parseFloat(computed.height),hit:root.elementFromPoint(cx,cy)?.closest('[data-action]')===el,overlaps:[...root.querySelectorAll('#bird,.dock button,.tools button')].filter(other=>!other.hidden&&intersects(rect,other.getBoundingClientRect())).map(other=>other.id||other.dataset.action),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  r.snapshots.geometry=measured;
  // Fractional translations can report 43.999969 for a computed 44px target.
  assert(measured.computedWidth>=44&&measured.computedHeight>=44&&measured.width+.01>=44&&measured.height+.01>=44,'poop target must remain at least 44 x 44 CSS px');
  assert.equal(measured.hit,true,'the visible poop centre must hit the clean button');assert.deepEqual(measured.overlaps,[],'poop must not cover bird or care controls');assert.equal(measured.overflow,false);
  return measured;
 }
 try{
  await page.clock.install({time:new Date(epoch)});await page.clock.pauseAt(new Date(epoch));
  await body({page,f,nest,poop,state,current,mark,art,ready,adopt,feed,clean,tick,switchTo,visible,geometry,eventually,r});
  assert.deepEqual(r.errors,[]);assert.deepEqual(r.forbidden,[]);assert(r.requests.every(request=>request.method==='GET'));r.passed=true;
 }catch(error){
  r.error=error.stack;r.snapshots.failure=await current().catch(()=>null);console.error('FAIL',result.engine,name,width,error.stack);
  await page.screenshot({path:path.join(out,result.engine+'-'+name+'-'+width+'-failure.png')}).catch(()=>{});
 }finally{await context.close();save()}
}

async function run(engine,name){
 const result={engine:name,passed:false,scenarios:[]};report.engines.push(result);
 const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 try{
  await scenario(browser,result,390,'lifecycle',async({page,f,nest,poop,state,current,mark,ready,adopt,feed,clean,tick,switchTo,visible,geometry,eventually,r})=>{
   await adopt(0,'便便一号');assert(await poop().isHidden());const idA=(await current()).id;
   // Remove only the optional new field to represent an older valid cache.
   const beforeLegacy=await state();await page.evaluate(()=>{const s=xcwcGuest.read();for(const bird of s.birds)delete bird.poopDueAt;localStorage.setItem('xcwc.guest.v1',JSON.stringify(s))});
   await page.reload();await ready('便便一号');assert(await poop().isHidden());const afterLegacy=await state();
   for(const key of ['balance','ledger','skins','requests'])assert.deepEqual(afterLegacy[key],beforeLegacy[key]);
   mark('legacy cache with no poop field stays clean and preserves existing assets');
   const fed=await feed(),due=fed.poopDueAt;assert.equal(due,epoch+60000);assert.equal(fed.hunger,90);assert.equal(fed.food,2);assert(await poop().isHidden());
   const beforeEarlyClean=await state();await nest().locator('.tools [data-action=clean]').tap();
   await eventually(current,bird=>!!bird.cleanedAt,'early clean must finish');assert.equal((await current()).poopDueAt,due);assert.equal((await state()).balance,beforeEarlyClean.balance);
   mark('successful feeding schedules one 60-second record and early cleaning keeps undigested food pending');
   await tick(10000);const twice=await feed();assert.equal(twice.poopDueAt,due);assert.equal(twice.hunger,100);const beforeFull=await current();await feed();
   assert.equal((await current()).food,beforeFull.food);assert.equal((await current()).poopDueAt,due);
   await nest().locator('.dock [data-action=water]').tap();await eventually(current,bird=>bird.water===90,'watering must finish');assert.equal((await current()).poopDueAt,due);
   mark('repeat feeding does not postpone or stack poop; full feeding and watering do not create another record');
   await tick(49999);assert.equal(await page.evaluate(()=>Date.now()),due-1);assert(await poop().isHidden());
   const beforeDue=await state();await tick(1);await poop().waitFor({state:'visible'});assert.equal(await poop().count(),1);assert.equal((await current()).poopDueAt,due);assert.equal((await state()).balance,beforeDue.balance);
   mark('poop stays hidden at 59.999 seconds and appears once at the 60-second boundary');
   await geometry();await page.screenshot({path:path.join(out,name+'-poop-visible-390.png')});
   r.snapshots.visible=await current();await clean(true);assert.equal((await current()).id,idA);await tick(60000);assert(await poop().isHidden());
   mark('tapping the poop persists removal with no points and an old meal cannot recreate it');
   const pending=await feed();assert.equal(pending.poopDueAt,await page.evaluate(()=>Date.now()+60000));
   await f().locator('.bottom [data-go=profile]').tap();await f().locator('#xcwc-account-page').waitFor();await tick(60000);
   assert.equal(await nest().count(),0);await f().locator('.bottom [data-go=home]').tap();await ready('便便一号');await poop().waitFor({state:'visible'});
   await page.reload();await ready('便便一号');await poop().waitFor({state:'visible'});assert.equal((await current()).poopDueAt,pending.poopDueAt);
   await clean(false);mark('route exit and reload preserve due poop; the right-side clean tool removes it without rewards');
   await adopt(1,'便便二号');const idB=(await current()).id;assert.notEqual(idB,idA);assert(await poop().isHidden());
   const bPending=await feed();await switchTo('便便一号');assert(await poop().isHidden());await tick(60000);assert(await poop().isHidden());
   await switchTo('便便二号');await poop().waitFor({state:'visible'});assert.equal((await current()).poopDueAt,bPending.poopDueAt);
   await clean(true);const both=await state();assert.equal(both.birds.find(bird=>bird.id===idA).poopDueAt,null);assert.equal(both.birds.find(bird=>bird.id===idB).poopDueAt,null);
   mark('switching birds keeps separate pending and visible poop and cleaning never changes another bird');
   const bgPending=await feed();await visible(false);await tick(60000);await visible(true);await poop().waitFor({state:'visible'});assert.equal((await current()).poopDueAt,bgPending.poopDueAt);
   mark('foreground return rechecks the persisted due time after background suspension');
   const beforeFailure=await page.evaluate(()=>localStorage.getItem('xcwc.guest.v1'));
   await page.evaluate(()=>{const native=Storage.prototype.setItem;window.__restorePoopStorage=()=>{Storage.prototype.setItem=native};Storage.prototype.setItem=function(key,value){if(key==='xcwc.guest.v1')throw new DOMException('Local test storage denial','QuotaExceededError');return native.call(this,key,value)}});
   await nest().locator('.tools [data-action=clean]').tap();await sleep(180);assert(await poop().isVisible());assert.equal(await page.evaluate(()=>localStorage.getItem('xcwc.guest.v1')),beforeFailure);
   await page.evaluate(()=>{window.__restorePoopStorage();delete window.__restorePoopStorage});await clean(false);
   mark('a failed clean save keeps the visible poop and original stored record, then a retry succeeds');
  });
  for(const width of [320,390,480])await scenario(browser,result,width,'layout',async({page,poop,adopt,feed,tick,geometry,mark})=>{
   await adopt(0,'草地伙伴');await feed();await tick(60000);await poop().waitFor({state:'visible'});await geometry();
   await page.screenshot({path:path.join(out,name+'-layout-'+width+'.png')});
   mark('visible 44px clean target stays reachable without overlapping the bird, care controls or horizontal viewport');
  });
  result.passed=result.scenarios.every(value=>value.passed);
 }finally{await browser.close();save()}
}
(async()=>{
 for(const name of engines)await run(name==='chromium'?chromium:webkit,name);
 report.passed=report.engines.every(value=>value.passed);save();
 console.log(report.passed?'PASS all poop browser scenarios':'FAIL poop browser scenarios');if(!report.passed)process.exitCode=1;
})().catch(error=>{report.error=error.stack;save();console.error(error);process.exitCode=1});
