// Local-only disposable birds. No public-code lookup or remote API access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-nest-browser-check/node_modules/playwright');
const base=process.env.XCWC_PREVIEW_URL,out=path.resolve(process.env.XCWC_NEST_REPORT_DIR||'output/nest-idle-20261105/browser');
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base||''))throw Error('Explicit local preview required');
fs.mkdirSync(out,{recursive:true});
const data=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../src/nest/idle-animation.json'),'utf8'));
const report={base,passed:false,cases:[]},bird={id:'1234567890abcdef1234567890abcdef',active:true,typeId:'huangying',typeName:'小黄莺',cityCode:'hangzhou',cityName:'杭州'};
const modes=(process.env.XCWC_NEST_IDLE_MODES||'normal,reduced,failure,audio-failure,timeout').split(',');
if(modes.some(mode=>!['normal','reduced','failure','audio-failure','timeout'].includes(mode)))throw Error('Unknown idle test mode');
async function run(browser,engine,width,mode='normal'){
 const r={engine,width,mode,passed:false,checks:[],requests:[],errors:[]};report.cases.push(r);
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:mode==='reduced'?'reduce':'no-preference',locale:'zh-CN'}),page=await context.newPage();
 await context.addInitScript(()=>{
  if(window===window.top)return;
  window.__idleCadenceTrace={startedAt:null,endedAt:null};
  const create=document.createElement.bind(document);
  document.createElement=(name,options)=>{
   const element=create(name,options);
   if(String(name).toLowerCase()==='audio'){
    element.addEventListener('playing',()=>{window.__idleCadenceTrace.startedAt=performance.now()});
    element.addEventListener('ended',()=>{window.__idleCadenceTrace.endedAt=performance.now()});
   }
   return element;
  };
 });
 page.setDefaultTimeout(12000);page.on('pageerror',e=>r.errors.push(e.message));
 page.on('request',q=>{if(q.url().includes('/idle/'))r.requests.push(new URL(q.url()).pathname)});
 let heldAtlas=false,releaseAtlas=()=>{},failAtlas=mode==='failure',failAudio=mode==='audio-failure';
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname.startsWith('/api/')||(!['data:','blob:','about:'].includes(u.protocol)&&u.origin!==base))return route.abort();
  if(failAtlas&&u.pathname.includes('/idle/')&&u.pathname.includes('huangying-idle'))return route.fulfill({status:404,body:'missing'});
  if(failAudio&&u.pathname.includes('/idle/')&&u.pathname.endsWith('.m4a'))return route.fulfill({status:404,body:'missing'});
  if(mode==='timeout'&&u.pathname.includes('/idle/')&&u.pathname.includes('huangying-idle')&&u.pathname.endsWith('.webp')&&!heldAtlas){heldAtlas=true;await new Promise(resolve=>{releaseAtlas=resolve})}
  return route.continue();
 });
 const nest=()=>page.frameLocator('iframe').locator('#xcwc-nest'),canvas=()=>nest().locator('canvas'),image=()=>nest().locator('#bird img'),audio=()=>nest().locator('audio');
 const tick=async ms=>{await page.clock.runFor(ms);await page.evaluate(()=>0);await new Promise(resolve=>setTimeout(resolve,30))};
 const mark=s=>{r.checks.push(s);console.log('PASS',engine,width,mode,s)};
 async function playing(){
  // This helper never starts playback: an earlier trusted care tap must unlock
  // the same element, and the player must resume after feedback on its own.
  await canvas().waitFor({state:'visible'});
  assert.equal(await nest().locator('.idle-play,[data-action=idle-play]').count(),0,'daily playback must not require a dedicated control');
  assert(await nest().locator('.idle-retry').isHidden(),'recovery control is only for failed resources');
  await audio().evaluate(a=>{if(a.paused||a.muted)throw Error('Idle picture is running without its original sound')});
 }
 async function decodedReaction(emotion){await nest().locator('#bird img[data-emotion="'+emotion+'"]').waitFor();await image().evaluate(im=>im.decode());await tick(30)}
 async function ordinaryTouch(){
  await nest().locator('.dock [data-action=touch]').tap();await decodedReaction('happy');
  assert(await canvas().isHidden());assert(await audio().evaluate(a=>a.paused));
  await tick(1800);assert(await canvas().isHidden(),'ordinary feedback must finish before automatic playback');
  await tick(300);
 }
 async function finishReservedCooldown(){
  assert(await canvas().isHidden(),'an interruption must not bypass the reserved playback interval');
  // Business Date stays fixed while the display clock advances to the observed
  // native playback reservation. Never fabricate an ended event. If native
  // audio ends during that advancement, honor the newly started full gap too.
  for(let attempt=0;attempt<3;attempt++){
   const state=await page.frameLocator('iframe').locator('body').evaluate(()=>({...window.__idleCadenceTrace,now:performance.now()}));
   assert.notEqual(state.startedAt,null,'cooldown checks require an earlier real playback');
   const deadline=Math.max(state.startedAt+data.durationMs+30000,state.endedAt===null?0:state.endedAt+30000);
   r.cooldowns??=[];r.cooldowns.push({...state,deadline});
   await tick(Math.max(100,Math.ceil(deadline-state.now)+100));
   if(await canvas().isVisible())return;
  }
 }
 async function tapPixel(x,y){
  const p=await canvas().evaluate((c,p)=>{const r=c.getBoundingClientRect(),s=Math.min(r.width/c.width,r.height/c.height);return{x:r.x+(r.width-c.width*s)/2+p.x*s,y:r.y+(r.height-c.height*s)/2+p.y*s,w:innerWidth,h:innerHeight}},{x,y});
  const b=await page.locator('iframe').boundingBox();await page.touchscreen.tap(b.x+p.x*b.width/p.w,b.y+p.y*b.height/p.h);await tick(25);
 }
 try{
  await page.clock.install({time:new Date('2026-11-05T02:00:00+08:00')});await page.clock.pauseAt(new Date('2026-11-05T02:00:01+08:00'));await page.clock.setFixedTime(new Date('2026-11-05T02:00:01+08:00'));
  await page.goto(base+'/?page=home');await page.waitForFunction(()=>window.xcwcGuest);await nest().locator('#bird').waitFor();await tick(100);
  assert.equal(r.requests.length,0,'empty nest must not request idle media');mark('empty nest loads no idle media');
  await page.evaluate(b=>{xcwcGuest.adopt(b,'动画预览');for(const action of ['feed','feed','water','water'])xcwcGuest.care(b.id,action)},bird);await page.reload({waitUntil:mode==='timeout'?'domcontentloaded':'load'});await image().evaluate(im=>im.decode());
  if(mode==='timeout'){
   for(let i=0;i<200&&!heldAtlas;i++)await new Promise(resolve=>setTimeout(resolve,20));
   assert(heldAtlas,'atlas request was not held');
   assert(await nest().locator('.idle-retry').isHidden(),'loading must not present an unnecessary playback control');
   await tick(31000);assert(await canvas().isHidden());
   assert.equal(await nest().locator('.idle-retry').textContent(),'↻ 重试动画');
   assert(await nest().locator('.idle-retry').isEnabled());mark('slow atlas leaves care controls clear and exposes recovery after timeout');
   if(engine==='chromium')await page.screenshot({path:path.join(out,engine+'-'+width+'-timeout-retry.png')});
   await nest().locator('[data-action=idle-retry]').tap();
   releaseAtlas();await playing();
   await tick(100);assert(await canvas().isVisible());
   assert(await nest().locator('.idle-retry').isHidden());
   mark('retry starts picture and original sound, and late old load cannot hide the new player');
  }else if(['failure','audio-failure'].includes(mode)){
   await nest().locator('.idle-retry').waitFor({state:'visible'});
   await tick(500);assert(await canvas().isHidden());assert.equal(await image().evaluate(im=>getComputedStyle(im).opacity),'1');
   assert.match(await nest().locator('.idle-retry').textContent(),/重试动画/);
   await ordinaryTouch();
   mark(mode==='audio-failure'?'failed audio does not silently run the animation; static hero and touch remain':'missing atlases retain the static hero, touch and recovery');
   failAtlas=false;failAudio=false;await nest().locator('[data-action=idle-retry]').tap();await playing();
   mark('resource recovery restores automatic picture and original sound without a daily play control');
  }else{
   await ordinaryTouch();await playing();const first=+(await canvas().getAttribute('data-frame'));await new Promise(resolve=>setTimeout(resolve,400));await tick(40);assert.notEqual(+(await canvas().getAttribute('data-frame')),first);mark(mode==='reduced'?'ordinary touch automatically starts picture and original sound even with system reduced motion':'ordinary touch automatically starts transparent animation with original unmuted audio');
   assert.equal(await image().evaluate(im=>getComputedStyle(im).opacity),'0');assert.equal(await image().evaluate(im=>getComputedStyle(im).animationName),'none');
   assert(!r.requests.some(p=>p.endsWith('.avif')));mark('runtime uses exact-alpha WebP without lossy alpha fringes');
   r.idleScreenshot=engine+'-'+width+'-'+mode+'-idle.png';await page.screenshot({path:path.join(out,r.idleScreenshot)});
   await nest().locator('.tools [data-action=clean]').tap();await decodedReaction('happy');
   assert(await canvas().isHidden());assert(await audio().evaluate(a=>a.paused));
   const pausedFrame=await canvas().getAttribute('data-frame');await tick(2800);assert.equal(await canvas().getAttribute('data-frame'),pausedFrame);assert.equal(await image().getAttribute('data-emotion'),'happy');
   await tick(300);await finishReservedCooldown();await playing();mark('ordinary care preserves three-second feedback and waits for the reserved cooldown before automatic playback');
   // Slow real media time so CSS-pixel taps can target a particular source frame.
   for(const target of [0,10,30,40,59]){
    await audio().evaluate((a,time)=>{a.playbackRate=.0625;a.currentTime=time},(data.frameTimesMs[target]+1)/1000);await new Promise(resolve=>setTimeout(resolve,30));await tick(40);const current=+(await canvas().getAttribute('data-frame'));
    assert.equal(current,target);const area=data.footAreas[target],m=area.masks[0],bytes=Buffer.from(m.bits,'base64');let point;
    // Mobile tap coordinates round to CSS pixels: use a reviewed interior toe,
    // rather than the first feather-edge pixel of a subpixel-scaled mask.
    const hit=(x,y)=>{const bit=y*m.width+x;return x>=0&&y>=0&&x<m.width&&y<m.height&&!!(bytes[bit>>3]&(1<<(bit&7)))};
    for(let y=2;y<m.height-2&&!point;y++)for(let x=2;x<m.width-2;x++){
     if([-2,-1,0,1,2].every(dy=>[-2,-1,0,1,2].every(dx=>hit(x+dx,y+dy)))){point={x:m.x+x+.5,y:m.y+y+.5};break}
    }
    assert(point,'opaque interior toe missing in '+target);
    const before=await page.evaluate(()=>JSON.stringify(xcwcGuest.read()));await tapPixel(point.x,point.y);
    await decodedReaction('angry');assert(await canvas().isHidden());assert(await audio().evaluate(a=>a.paused));assert.equal(await page.evaluate(()=>JSON.stringify(xcwcGuest.read())),before);
    await tick(2200);await decodedReaction('happy');await finishReservedCooldown();await playing();
   }
   await audio().evaluate(a=>{a.playbackRate=1});
   mark('five different moving toe frames trigger anger without data or reward changes');
   await tapPixel(128,90);await decodedReaction('happy');assert(await canvas().isHidden());await tick(2100);await finishReservedCooldown();await playing();mark('head touch shows the existing happy feedback and retains the cooldown');
   for(let i=0;i<3;i++){await nest().locator('.dock [data-action=touch]').tap();await tick(100)}assert.equal(await image().getAttribute('data-emotion'),'veryhappy');assert(await canvas().isHidden());await tick(4100);await finishReservedCooldown();await playing();mark('very-happy feedback retains its full duration without resetting playback cooldown');
   const body=()=>page.frameLocator('iframe').locator('body');
   await body().evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});assert(await canvas().isHidden());assert(await audio().evaluate(a=>a.paused));const f=await canvas().getAttribute('data-frame');await tick(1500);assert.equal(await canvas().getAttribute('data-frame'),f);
   await body().evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))});await finishReservedCooldown();await playing();mark('background suspends rendering and foreground retains cooldown before restoring current state');
   await body().evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert(await canvas().isHidden());await body().evaluate(()=>window.dispatchEvent(new Event('pageshow')));await finishReservedCooldown();await playing();mark('pagehide pauses and pageshow retains the reserved cooldown');
   await page.frameLocator('iframe').locator('.bottom [data-go=profile]').tap();await page.frameLocator('iframe').locator('#xcwc-account-page').waitFor();assert.equal(await canvas().count(),0);
   await page.frameLocator('iframe').locator('.bottom [data-go=home]').tap();await ordinaryTouch();await finishReservedCooldown();await playing();mark('route reentry unlocks the new audio element without clearing the shared cooldown');
   await page.clock.setFixedTime(new Date('2026-11-05T02:03:30+08:00'));await page.reload();await image().waitFor();await tick(3300);await image().evaluate(im=>im.decode());
   assert.notEqual(await image().getAttribute('data-emotion'),'happy');assert(await canvas().isHidden());
   await ordinaryTouch();await image().evaluate(im=>im.decode());await tick(100);assert.notEqual(await image().getAttribute('data-emotion'),'happy');
   await tick(4700);assert(await canvas().isHidden(),'the real decoded reminder must last five seconds');
   await tick(400);await playing();assert.equal(await audio().evaluate(a=>a.loop),false);mark('real needs keep their five-second reminder, then automatically play one complete sound-and-picture cycle');
   assert.equal(await page.frameLocator('iframe').locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  assert.deepEqual(r.errors,[]);r.passed=true;
 }catch(e){r.error=e.stack;r.shell=await page.frameLocator('iframe').locator('body').innerText().catch(()=>null);r.state=await nest().evaluate(h=>({actor:h.shadowRoot.querySelector('.actor').className,emotion:h.shadowRoot.querySelector('#bird img').dataset.emotion,canvas:h.shadowRoot.querySelector('canvas').outerHTML})).catch(()=>null);console.error(engine,width,mode,e.stack,JSON.stringify(r.state));await page.screenshot({path:path.join(out,engine+'-'+width+'-'+mode+'-failure.png')}).catch(()=>{})}
 finally{releaseAtlas();await context.close()}
}
(async()=>{try{for(const [name,engine]of Object.entries({chromium,webkit})){
 const quick=process.env.XCWC_NEST_IDLE_QUICK==='1';if(quick&&name!=='chromium')continue;
 const bundled=engine.executablePath(),browser=await engine.launch({headless:true,executablePath:fs.existsSync(bundled)?bundled:name==='chromium'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined});
 try{for(const mode of quick?['normal']:modes)for(const width of mode==='normal'&&!quick?[390,320]:[390])await run(browser,name,width,mode)}finally{await browser.close()}
 }report.passed=report.cases.length===(process.env.XCWC_NEST_IDLE_QUICK==='1'?1:2*modes.reduce((count,mode)=>count+(mode==='normal'?2:1),0))&&report.cases.every(r=>r.passed)}catch(e){report.error=e.stack}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json')}));if(!report.passed)process.exitCode=1}})();
