// Real native soundtrack endings and a real 30-second quiet interval.
// Disposable local guest caches only; no play button or business API calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-nest-browser-check/node_modules/playwright');
const base=process.env.XCWC_PREVIEW_URL,out=path.resolve(process.env.XCWC_CADENCE_REPORT_DIR||'output/nest-animation-cadence-20261105/browser');
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base||''))throw Error('Explicit local preview required');
fs.mkdirSync(out,{recursive:true});const report={base,passed:false,cases:[]},delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const bird={id:'1234567890abcdef1234567890abcdef',active:true,typeId:'huangying',typeName:'小黄莺',cityCode:'hangzhou',cityName:'杭州'};
async function run(browser,engine,mode){
 const r={engine,mode,checks:[],errors:[],passed:false};report.cases.push(r);
 const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,reducedMotion:'reduce',locale:'zh-CN'}),page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>r.errors.push(e.message));
 await context.route('**/*',route=>{const u=new URL(route.request().url());return u.pathname.startsWith('/api/')||!['data:','blob:','about:'].includes(u.protocol)&&u.origin!==base?route.abort():route.continue()});
 const {createGuestStore}=await import('../../src/guest-store.mjs');let raw;const store=createGuestStore({getItem:()=>raw??null,setItem:(_,v)=>raw=v});store.adopt(bird,'间隔验收');
 const s=JSON.parse(raw);if(mode==='needs'){s.birds[0].hunger=20;s.birds[0].water=20}
 await context.addInitScript(value=>{
  if(window===window.top){localStorage.setItem('xcwc.guest.v1',value);return}
  const log=window.__cadence={plays:[],ended:[],states:[]},seen=new WeakSet(),original=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(...args){const row={at:performance.now(),gesture:navigator.userActivation?.isActive};log.plays.push(row);return original.apply(this,args).then(v=>{row.playedAt=performance.now();row.ok=true;return v},e=>{row.error=e.name;throw e})};
  setInterval(()=>{const h=document.querySelector('#xcwc-nest'),q=s=>h?.shadowRoot?.querySelector(s),a=q('audio');if(!a)return;
   if(!seen.has(a)){seen.add(a);a.addEventListener('ended',()=>log.ended.push({at:performance.now(),time:a.currentTime,duration:a.duration}))}
   log.states.push({at:performance.now(),canvas:!q('canvas').hidden,need:q('[data-need].is-current')?.dataset.need||null,emotion:q('#bird img').dataset.emotion});
  },100);
 },JSON.stringify(s));
 const nest=()=>page.frameLocator('iframe').locator('#xcwc-nest'),canvas=()=>nest().locator('canvas'),read=()=>page.frameLocator('iframe').locator('body').evaluate(()=>({...window.__cadence,now:performance.now()}));
 const mark=message=>{r.checks.push(message);console.log('PASS',engine,mode,message)};
 try{
  await page.goto(base+'/?page=home');await delay(8500);
  await nest().locator('.dock [data-action=touch]').tap();await canvas().waitFor({state:'visible',timeout:18000});
  assert.equal(await nest().locator('audio').evaluate(a=>a.loop),false);assert.equal(await nest().locator('[data-action=idle-play]').count(),0);
  await canvas().waitFor({state:'hidden',timeout:10000});
  let t=await read();assert.equal(t.plays.filter(p=>p.ok).length,1);assert.equal(t.ended.length,1);const end=t.ended[0];
  assert(end.time>6&&end.duration>6);assert(end.at-t.plays.find(p=>p.ok).playedAt>=5800,'five-second refresh must not cut the clip short');mark('healthy and needs playback each end after exactly one full original soundtrack');
  await nest().locator('.dock [data-action=touch]').tap();await nest().locator('#bird img[data-emotion=happy]').waitFor();await delay(2500);assert(await canvas().isHidden());
  await page.frameLocator('iframe').locator('.bottom [data-go=profile]').tap();await page.frameLocator('iframe').locator('#xcwc-account-page').waitFor();
  await page.frameLocator('iframe').locator('.bottom [data-go=home]').tap();await nest().locator('#name').waitFor();await nest().locator('.dock [data-action=touch]').tap();await delay(2500);
  t=await read();assert.equal(t.plays.filter(p=>p.ok).length,1);assert(await canvas().isHidden());mark('ordinary feedback and leaving/re-entering the nest cannot reopen the reserved cooldown');
  await delay(Math.max(0,end.at+29700-t.now));t=await read();assert.equal(t.plays.filter(p=>p.ok).length,1);assert(await canvas().isHidden());
  if(mode==='needs'){const needs=new Set(t.states.filter(s=>s.at>end.at&&s.at<t.now).map(s=>s.need));assert(needs.has('food')&&needs.has('water'));mark('real food and water reminders keep rotating while animation waits')}
  await canvas().waitFor({state:'visible',timeout:8000});t=await read();const successes=t.plays.filter(p=>p.ok);assert.equal(successes.length,2);assert(successes[1].playedAt-end.at>=29950,'next clip started before a full thirty-second quiet interval');
  assert.equal(await nest().locator('audio').evaluate(a=>a.loop||a.muted||a.paused),false);assert.equal(await nest().locator('#bird img').evaluate(im=>getComputedStyle(im).opacity),'0');mark('the next synchronized single clip starts only after thirty seconds, without a play button');
  r.intervalMs=successes[1].playedAt-end.at;r.trace=t;await page.screenshot({path:path.join(out,engine+'-'+mode+'-second-clip.png')});assert.deepEqual(r.errors,[]);r.passed=true;
 }catch(e){r.error=e.stack;r.trace=await read().catch(()=>null);console.error(engine,mode,e.stack);await page.screenshot({path:path.join(out,engine+'-'+mode+'-failure.png')}).catch(()=>{})}
 finally{await context.close()}
}
(async()=>{await Promise.all(Object.entries({chromium,webkit}).map(async([name,type])=>{const browser=await type.launch({headless:true,executablePath:name==='chromium'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined,args:name==='chromium'?['--autoplay-policy=document-user-activation-required']:[]});try{await Promise.all(['healthy','needs'].map(mode=>run(browser,name,mode)))}finally{await browser.close()}}));report.passed=report.cases.length===4&&report.cases.every(c=>c.passed);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');if(!report.passed)process.exitCode=1})().catch(e=>{console.error(e);process.exitCode=1});
