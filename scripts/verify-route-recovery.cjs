// Fresh local contexts only: loading failures must never strand the shared shell.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.XCWC_PREVIEW_URL;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base||''))throw Error('An explicit isolated preview is required');
(async()=>{
 const results=[];
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  const checks=[];
  try{
   for(const [route,pattern,ready] of [['city','**/runtime/city.*.js','#xcwc-city .city-card'],['profile','**/runtime/account.*.css','#xcwc-account-page .profile-card']]){
    const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    try{const page=await context.newPage();page.setDefaultTimeout(25000);let fail=true;
     await context.route(pattern,r=>fail?r.abort():r.continue());await page.goto(base+'/?page='+route,{waitUntil:'domcontentloaded'});
     const frame=page.frameLocator('iframe');await frame.locator('main').waitFor();const retry=frame.getByRole('button',{name:'重新加载',exact:true});await retry.waitFor();fail=false;await retry.click();await frame.locator(ready).first().waitFor();checks.push(route+' resource failure recovers on retry');console.log('PASS',engine.name(),route,'failure/retry');
    }finally{await context.close()}
   }
   const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
   try{const page=await context.newPage();page.setDefaultTimeout(10000);let held;
    await context.route('**/runtime/city.*.js',r=>{held=r});await page.goto(base+'/?page=city',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('iframe'));while(!held)await page.waitForTimeout(20);
    const frame=page.frameLocator('iframe');await frame.locator('.bottom [data-go=home]').click();await frame.locator('#xcwc-nest').waitFor();await held.continue();await page.waitForTimeout(150);assert.equal(await frame.locator('#xcwc-city').count(),0);checks.push('a late route cannot replace the current page');
   }finally{await context.close()}
   results.push({engine:engine.name(),checks});
  }finally{await browser.close()}
 }
 const output=process.env.XCWC_ROUTE_REPORT||path.resolve(__dirname,'../output/performance/route-recovery.json');fs.mkdirSync(path.dirname(output),{recursive:true});const report={passed:true,base,results};fs.writeFileSync(output,JSON.stringify(report,null,2),'utf8');console.log(JSON.stringify(report));
})().catch(error=>{console.error(error.stack);process.exitCode=1});
