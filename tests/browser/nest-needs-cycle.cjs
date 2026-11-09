// Disposable local care data only. Real audio endings, controlled reminder clock.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-nest-browser-check/node_modules/playwright');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8997',out=path.resolve(process.env.XCWC_NEEDS_REPORT_DIR||'output/nest-resource-interaction-20261105/needs');
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview required');
const bird={id:'1234567890abcdef1234567890abcdef',active:true,typeId:'huangying',typeName:'小黄莺',cityCode:'hangzhou',cityName:'杭州'};
fs.mkdirSync(out,{recursive:true});const report={base,passed:false,cases:[]};
(async()=>{for(const [engineName,engine]of Object.entries({chromium,webkit})){
 const browser=await engine.launch({headless:true,executablePath:engineName==='chromium'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN'}),page=await context.newPage();
 const result={engine:engineName,checks:[],errors:[]};report.cases.push(result);page.on('pageerror',e=>result.errors.push(e.message));
 await context.route('**/*',route=>{const u=new URL(route.request().url());return u.pathname.startsWith('/api/')||(!['data:','blob:','about:'].includes(u.protocol)&&u.origin!==base)?route.abort():route.continue()});
 const nest=()=>page.frameLocator('iframe').locator('#xcwc-nest'),image=()=>nest().locator('#bird img'),canvas=()=>nest().locator('canvas'),audio=()=>nest().locator('audio');
 const tick=async ms=>{await page.clock.runFor(ms);await new Promise(resolve=>setTimeout(resolve,80))};
 const snapshot=()=>nest().evaluate(host=>{const q=s=>host.shadowRoot.querySelector(s);return{emotion:q('#bird img').dataset.emotion,src:q('#bird img').src,canvas:!q('canvas').hidden,speech:q('#speech').textContent,hunger:q('#hunger').textContent,water:q('#water').textContent,mood:q('#mood').textContent,current:host.shadowRoot.querySelector('[data-need].is-current')?.dataset.need,audioPaused:q('audio').paused,loop:q('audio').loop}});
 const mark=message=>{result.checks.push(message);console.log('PASS',engineName,message)};
 try{
  await page.clock.install({time:new Date('2026-11-05T02:00:00+08:00')});await page.clock.pauseAt(new Date('2026-11-05T02:00:01+08:00'));
  await page.goto(base+'/?page=home');await page.waitForFunction(()=>window.xcwcGuest);await page.evaluate(b=>xcwcGuest.adopt(b,'轮换验证'),bird);
  await page.clock.setSystemTime(new Date('2026-11-05T02:04:00+08:00'));await page.reload();await image().evaluate(i=>i.decode());await tick(3200);await image().evaluate(i=>i.decode());
  await nest().locator('.idle-play').waitFor({state:'visible'});const initial=await snapshot();assert.equal(initial.canvas,false);assert.equal(initial.hunger,'0%');assert.equal(initial.water,'0%');
  await nest().locator('.idle-play').tap();await canvas().waitFor({state:'visible'});let state=await snapshot();assert.equal(state.loop,false);assert.equal(state.audioPaused,false);assert.equal(state.hunger,'0%');assert.equal(state.water,'0%');assert.equal(state.current,initial.current);assert.equal(state.speech,initial.speech);mark('single animation uses original sound while actual needs and HUD stay visible');
  await canvas().waitFor({state:'hidden',timeout:10000});state=await snapshot();assert.notEqual(state.current,initial.current);assert.equal(state.audioPaused,true);assert.equal(state.src.includes('poster.'),false);await image().evaluate(i=>i.decode());await tick(100);const reminder=await snapshot();
  await tick(4800);assert.equal((await snapshot()).canvas,false);await tick(300);await canvas().waitFor({state:'visible'});mark('native audio ending returns to the next decoded reminder for a full five seconds');
  await nest().locator('.dock [data-action=feed]').tap();await nest().locator('[data-action=do-feed]').tap();await nest().locator('#bird img[data-emotion=happy]').waitFor();await image().evaluate(i=>i.decode());await tick(50);state=await snapshot();assert.equal(state.canvas,false);assert.equal(state.audioPaused,true);assert(state.src.includes('happy-v2'));await tick(2800);assert.equal((await snapshot()).emotion,'happy');await tick(300);state=await snapshot();assert.notEqual(state.emotion,'happy');assert.equal(state.canvas,false);mark('feeding interrupts immediately, preserves the original happy feedback for three seconds, then shows real remaining needs');
  await image().evaluate(i=>i.decode());await tick(5100);await canvas().waitFor({state:'visible'});await page.screenshot({path:path.join(out,engineName+'-needs-animation.png')});
  await page.frameLocator('iframe').locator('body').evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});state=await snapshot();assert.equal(state.audioPaused,true);assert.equal(state.canvas,false);
  await page.frameLocator('iframe').locator('body').evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))});await tick(100);await image().evaluate(i=>i.decode());await tick(4800);assert.equal((await snapshot()).canvas,false);await tick(300);await canvas().waitFor({state:'visible'});mark('foreground restarts the reminder interval and never resumes an old need segment');
  await page.frameLocator('iframe').locator('.bottom [data-go=profile]').tap();await page.frameLocator('iframe').locator('#xcwc-account-page').waitFor();assert.equal(await audio().count(),0);await tick(7000);assert.equal(await audio().count(),0);mark('leaving the route removes the player and pending cycle');
  assert.deepEqual(result.errors,[]);result.passed=true;
 }catch(e){result.error=e.stack;result.state=await snapshot().catch(()=>null);console.error(engineName,e.stack,JSON.stringify(result.state));await page.screenshot({path:path.join(out,engineName+'-failed.png')}).catch(()=>{})}
 finally{await context.close();await browser.close()}
 }report.passed=report.cases.every(r=>r.passed);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');if(!report.passed)process.exitCode=1})().catch(e=>{console.error(e);process.exitCode=1});
