// Fresh local contexts only: loading failures must never strand the shared shell.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.XCWC_PREVIEW_URL;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base||''))throw Error('An explicit isolated preview is required');
const chromiumExecutable=process.env.XCWC_CHROMIUM_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const output=process.env.XCWC_ROUTE_REPORT||path.resolve(__dirname,'../output/performance/route-recovery.json');
const report={passed:false,base,chromiumExecutable,results:[]};
const selectors={home:'#xcwc-nest #name',city:'#xcwc-city .city-card',shop:'#xcwc-shop #products[aria-busy=false]',profile:'#xcwc-account-page .profile-card',wardrobe:'.wardrobe-outfit-card',flock:'.flock-grid button',photo:'.bird-card[aria-pressed=true]',adopt:'#xcwc-adopt [data-action=confirm]'};
const birdCode=process.env.XCWC_TEST_BIRD_CODE||'HZ-HY-900000000000000001';
const routeUrl=route=>route==='adopt'?'/register.html?birdCode='+encodeURIComponent(birdCode):'/?page='+route+(['wardrobe','flock'].includes(route)?'&from=profile':'');
async function ready(page,route){
 const locator=page.frameLocator('iframe');await locator.locator(selectors[route]).first().waitFor();
 const handle=await page.$('#codex-visualization'),frame=await handle.contentFrame();
 const layout=await frame.evaluate(()=>({page:document.querySelector('#bjd-review')?.dataset.xcwcPage,boxes:[document.documentElement,document.body,document.querySelector('#bjd-review')].map(e=>{const b=e?.getBoundingClientRect();return b?{width:b.width,height:b.height}:null})}));
 assert.equal(layout.page,route);assert(layout.boxes.every(b=>b?.width>0&&b.height>0),'Current sandbox document has a positive layout after '+route+' navigation');
 const policy=await page.evaluate(()=>({content:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,origin:location.origin,sandbox:document.querySelector('iframe')?.getAttribute('sandbox')}));
 assert.equal(policy.sandbox,'allow-scripts');assert(policy.content?.includes('script-src '+policy.origin+' '),'Parent CSP binds its source to the embedding origin');assert(!policy.content.includes("'self'"),'Opaque history restoration must not reinterpret the parent source');
}
async function seed(page){
 await page.goto(base+'/?page=home',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.xcwcGuest);
 const response=await page.request.get(base+'/api/birds/by-code/'+encodeURIComponent(birdCode));assert.equal(response.status(),200);const bird=await response.json();
 await page.evaluate(bird=>{xcwcGuest.adopt(bird,'历史验收');localStorage.setItem('yanji.cloud.session.v1',JSON.stringify({token:'e'.repeat(64),username:'history_fixture',expiresAt:'2099-01-01T00:00:00Z'}))},bird);
}
async function retained(page){const value=await page.evaluate(()=>({birds:xcwcGuest.read().birds.map(b=>({id:b.id,name:b.name})),balance:xcwcGuest.read().balance,session:xcwcSession.read()?.username}));assert.equal(value.birds.length,1);assert.equal(value.birds[0].name,'历史验收');assert.equal(value.balance,5);assert.equal(value.session,'history_fixture')}
(async()=>{
 try{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:chromiumExecutable}:{})});
  const checks=[],entry={engine:engine.name(),browserVersion:browser.version(),checks};report.results.push(entry);
  try{
   for(const [route,pattern,ready] of [['city',/\/runtime\/city\.[^/]+\.js$/,'#xcwc-city .city-card'],['profile',/\/runtime\/account\.[^/]+\.css$/,'#xcwc-account-page .profile-card']]){
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
    let fail=true,failures=0;await context.route('**/*',r=>{if(pattern.test(r.request().url())&&fail){failures++;return r.abort()}return r.continue()});
    try{const page=await context.newPage();page.setDefaultTimeout(25000);await page.goto(base+'/?page='+route,{waitUntil:'domcontentloaded'});
     const frame=page.frameLocator('iframe');await frame.locator('#bjd-content').waitFor();const retry=frame.locator('#bjd-content>button').filter({hasText:'重新加载'});await retry.waitFor();assert(failures>0,'Target resource fault was actually injected');fail=false;await retry.tap();await frame.locator(ready).first().waitFor();checks.push(route+' resource failure recovers on retry');console.log('PASS',engine.name(),route,'failure/retry');
    }catch(error){entry.failure={route,injectedFailures:failures,error:error.stack};throw error;
    }finally{await context.close()}
   }
   const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
   let held;await context.route('**/*',r=>{if(/\/runtime\/city\.[^/]+\.js$/.test(r.request().url()))held=r;else return r.continue()});
   try{const page=await context.newPage();page.setDefaultTimeout(10000);await page.goto(base+'/?page=city',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('iframe'));while(!held)await page.waitForTimeout(20);
    const frame=page.frameLocator('iframe');await frame.locator('.bottom [data-go=home]').tap();await frame.locator('#xcwc-nest').waitFor();await held.continue();await page.waitForTimeout(150);assert.equal(await frame.locator('#xcwc-city').count(),0);checks.push('a late route cannot replace the current page');
   }finally{await context.close()}
   const history=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),page=await history.newPage();page.setDefaultTimeout(15000);
   try{
    await seed(page);
    for(const route of Object.keys(selectors)){
     const anchor=route==='home'?'city':'home';await page.goto(base+routeUrl(anchor),{waitUntil:'domcontentloaded'});await ready(page,anchor);
     await page.goto(base+routeUrl(route),{waitUntil:'domcontentloaded'});await ready(page,route);
     await page.reload({waitUntil:'domcontentloaded'});await ready(page,route);await retained(page);
     await page.goBack({waitUntil:'domcontentloaded'});await ready(page,anchor);await retained(page);
     await page.goForward({waitUntil:'domcontentloaded'});await ready(page,route);await retained(page);
     checks.push(route+' cross-document reload/back/forward preserves guest and account session');console.log('PASS',engine.name(),route,'document history');
    }
    await page.goto(base+'/?page=home',{waitUntil:'domcontentloaded'});await ready(page,'home');const frame=page.frameLocator('iframe');
    await frame.locator('.bottom [data-go=city]').tap();await ready(page,'city');await frame.locator('.bottom [data-go=shop]').tap();await ready(page,'shop');await page.goBack();await ready(page,'city');await page.goForward();await ready(page,'shop');await retained(page);
    checks.push('SPA back/forward preserves route and data');console.log('PASS',engine.name(),'SPA history');
   }finally{await history.close()}
  }finally{await browser.close()}
 }
 report.passed=true;
 }catch(error){report.error=error.stack;process.exitCode=1}finally{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n','utf8');console.log(JSON.stringify(report));}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
