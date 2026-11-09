// Disposable local birds and real native media. Never clicks a play control.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-nest-browser-check/node_modules/playwright');
const base=process.env.XCWC_PREVIEW_URL,out=path.resolve(process.env.XCWC_AUTOPLAY_REPORT_DIR||'output/nest-autoplay-ios-20261105/browser');
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base||''))throw Error('Explicit local preview required');
const scenarios=(process.env.XCWC_AUTOPLAY_SCENARIOS||'needs,feed,late-resource,resource-failure').split(',');
if(scenarios.some(s=>!['needs','feed','late-resource','resource-failure'].includes(s)))throw Error('Unknown scenario');
fs.mkdirSync(out,{recursive:true});
const bird={id:'1234567890abcdef1234567890abcdef',active:true,typeId:'huangying',typeName:'小黄莺',cityCode:'hangzhou',cityName:'杭州'},report={base,passed:false,cases:[]};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(browser,engine,scenario){
 const r={engine,scenario,passed:false,errors:[],checks:[],requests:[]};report.cases.push(r);
 const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,reducedMotion:'reduce',locale:'zh-CN',timezoneId:'Asia/Shanghai'}),page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>r.errors.push(e.message));
 let releaseAtlas=()=>{},held=false,failedOnce=false;
 const gate=new Promise(resolve=>releaseAtlas=resolve);
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname.startsWith('/api/')||!['data:','blob:','about:'].includes(u.protocol)&&u.origin!==base)return route.abort();
  if(u.pathname.includes('/idle/')&&u.pathname.includes('huangying-idle')&&u.pathname.endsWith('.webp')){
   r.requests.push({url:u.pathname,at:Date.now()});
   if(scenario==='late-resource'&&!held){held=true;await gate}
   if(scenario==='resource-failure'&&!failedOnce){failedOnce=true;return route.fulfill({status:404,body:'fixture missing'})}
  }
  return route.continue();
 });
 const {createGuestStore}=await import('../../src/guest-store.mjs');let raw;
 const store=createGuestStore({getItem:()=>raw??null,setItem:(_,v)=>raw=v});store.adopt(bird,'自动验收');
 const saved=JSON.parse(raw);if(scenario!=='feed'){saved.birds[0].hunger=20;saved.birds[0].water=20}
 await context.addInitScript(value=>{
  if(window===window.top){localStorage.setItem('xcwc.guest.v1',value);return}
  window.__autoplayTrace={media:[],states:[],clicks:[]};const log=window.__autoplayTrace;
  for(const method of ['play','load']){const native=HTMLMediaElement.prototype[method];HTMLMediaElement.prototype[method]=function(...args){const row={kind:method,at:performance.now(),gesture:navigator.userActivation?.isActive};log.media.push(row);const result=native.apply(this,args);if(method==='play')return result.then(v=>{row.result='played';return v},e=>{row.result=e.name;throw e});return result}}
  document.addEventListener('click',e=>{log.clicks.push({at:performance.now(),trusted:e.isTrusted,action:e.composedPath().find(n=>n.dataset?.action)?.dataset.action})},true);
  setInterval(()=>{const h=document.querySelector('#xcwc-nest'),q=s=>h?.shadowRoot?.querySelector(s),a=q('audio'),im=q('#bird img');if(!a||!im)return;const previous=log.states.at(-1),state={at:performance.now(),emotion:im.dataset.emotion,decoded:im.complete&&im.naturalWidth>0,canvas:!q('canvas').hidden,time:a.currentTime,paused:a.paused,loop:a.loop,muted:a.muted,volume:a.volume,frame:q('canvas').dataset.frame};if(!previous||state.at-previous.at>=90||previous.emotion!==state.emotion||previous.canvas!==state.canvas)log.states.push(state)},20);
 },JSON.stringify(saved));
 const nest=()=>page.frameLocator('iframe').locator('#xcwc-nest');
 const trace=()=>page.frameLocator('iframe').locator('body').evaluate(()=>window.__autoplayTrace);
 const mark=message=>{r.checks.push(message);console.log('PASS',engine,scenario,message)};
 try{
  await page.goto(base+'/?page=home');
  // No evaluate/locator actions before this wait: they can confer synthetic activation.
  await delay(scenario==='late-resource'?1200:10000);
  if(scenario==='late-resource'){assert(held);mark('atlas remains pending until after a normal trusted gesture')}
  else if(scenario==='resource-failure'){await nest().locator('.idle-retry').waitFor({state:'visible'});mark('only the resource failure exposes a retry control')}
  else{const initial=await trace();assert(initial.media.some(e=>e.kind==='play'&&e.gesture===false&&e.result==='NotAllowedError'));assert(!initial.states.some(s=>s.canvas));mark('strict first-entry sound rejection never shows a silent animation')}
  assert.equal(await nest().locator('[data-action=idle-play]').count(),0);
  if(scenario==='feed'){
   await nest().locator('.dock [data-action=feed]').tap();await nest().locator('[data-action=do-feed]').tap();
  }else await nest().locator('.dock [data-action=touch]').tap();
  if(scenario==='late-resource'){await delay(250);releaseAtlas()}
  await nest().locator('canvas').waitFor({state:'visible',timeout:20000});await delay(400);
  const t=await trace(),click=t.clicks.filter(c=>['touch','do-feed'].includes(c.action)).at(-1),successful=t.media.find(m=>m.kind==='play'&&m.result==='played');
  assert(click?.trusted);assert(t.media.some(m=>m.kind==='load'&&m.gesture===true&&m.at<=click.at+200));assert(successful);
  assert(!t.clicks.some(c=>['idle-play','idle-retry'].includes(c.action)),'normal autoplay must not require a separate media control');
  const playing=t.states.filter(s=>s.canvas);assert(playing.length>1);assert(playing.every(s=>!s.paused&&!s.muted&&s.volume===1));assert(new Set(playing.map(s=>s.frame)).size>1);assert(playing.at(-1).time>playing[0].time);
  const feedback=t.states.filter(s=>s.at>=click.at&&s.emotion==='happy'&&s.decoded&&!s.canvas);assert(feedback.length>0);
  const target=scenario==='feed'?3000:2000;assert(successful.at-feedback[0].at>=target-150,'complete feedback duration must precede playback');
  if(scenario!=='feed')assert.equal(playing[0].loop,false);
  assert.equal(await nest().locator('.idle-retry').isVisible(),false);assert.equal(await nest().locator('#bird img').evaluate(im=>getComputedStyle(im).animationName),'none');
  assert.equal(await nest().locator('#bird img').evaluate(im=>getComputedStyle(im).opacity),'0','the static poster must not overlap the running animation');
  mark('reduced-motion character exception autoplays unmuted original sound after full normal feedback, with no play-button click');
  await page.screenshot({path:path.join(out,engine+'-'+scenario+'-playing.png')});
  if(scenario==='needs'){
   await nest().locator('canvas').waitFor({state:'hidden',timeout:10000});
   const endedAt=Date.now();await delay(29000);
   assert.equal(await nest().locator('canvas').isVisible(),false,'the next clip must not start inside the thirty-second gap');
   await delay(Math.max(0,30000-(Date.now()-endedAt)));
   await nest().locator('canvas').waitFor({state:'visible',timeout:8000});
   assert(Date.now()-endedAt>=30000,'native soundtrack completion must be followed by at least thirty seconds of reminders');
   mark('native soundtrack completion returns to real reminders for at least thirty seconds before the next automatic cycle');
  }
  await page.frameLocator('iframe').locator('body').evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});
  assert.equal(await nest().locator('audio').evaluate(a=>a.paused),true);assert.equal(await nest().locator('canvas').isVisible(),false);mark('background stops the original soundtrack and canvas together');
  r.trace=await trace();assert.deepEqual(r.errors,[]);r.passed=true;
 }catch(e){r.error=e.stack;r.trace=await trace().catch(()=>null);console.error(engine,scenario,e.stack);await page.screenshot({path:path.join(out,engine+'-'+scenario+'-failure.png')}).catch(()=>{})}
 finally{releaseAtlas();await context.close()}
}
(async()=>{await Promise.all(Object.entries({chromium,webkit}).map(async([name,type])=>{const browser=await type.launch({headless:true,executablePath:name==='chromium'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined,args:name==='chromium'?['--autoplay-policy=document-user-activation-required']:[]});try{for(const scenario of scenarios)await run(browser,name,scenario)}finally{await browser.close()}}));report.passed=report.cases.length===scenarios.length*2&&report.cases.every(c=>c.passed);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');if(!report.passed)process.exitCode=1})().catch(e=>{console.error(e);process.exitCode=1});
