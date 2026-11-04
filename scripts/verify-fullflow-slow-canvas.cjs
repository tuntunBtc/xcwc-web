// Delay a real allowlisted background response while the user interacts with the editor.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.XCWC_PREVIEW_URL,code=process.env.XCWC_TEST_BIRD_CODE;
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base||'')||!code)throw Error('Explicit real isolated backend preview and entity code required');
const auditLabel=process.env.XCWC_AUDIT_LABEL||'';if(auditLabel&&!/^[a-zA-Z0-9_-]{1,80}$/.test(auditLabel))throw Error('Invalid audit label');
const results=[];
async function run(engine){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();page.setDefaultTimeout(10000);
 const r={engine:engine.name(),errors:[]};results.push(r);page.on('pageerror',e=>r.errors.push(e.message));const frame=()=>page.frameLocator('iframe');
 let release,started;const gate=new Promise(resolve=>release=resolve),start=new Promise(resolve=>started=resolve);
 try{
  await context.route('**/assets/checkin/lake.jpg',async route=>{const response=await route.fetch();started();await gate;await route.fulfill({response})});
  await page.goto(base+'/register.html?birdCode='+code);const adopt=frame().locator('#xcwc-adopt');await adopt.locator('[data-role=recognition]').filter({hasText:'已读取'}).waitFor();await adopt.locator('#adopt-v1-name').fill('慢图啾');await adopt.locator('[data-action=confirm]').click();await frame().locator('#xcwc-nest #name').filter({hasText:'慢图啾'}).waitFor();await frame().locator('#xcwc-nest [data-action=checkin]').click();await frame().locator('.bird-card[aria-pressed=true]').waitFor();
  await frame().locator('#ck-editor > summary').click();await Promise.race([start,new Promise((_,reject)=>setTimeout(()=>reject(Error('Background was not requested')),10000))]);
  for(const id of ['ck-smaller','ck-larger','ck-size','ck-resetBird'])assert(await frame().locator('#'+id).isDisabled(),id+' must not edit an absent photo');
  await frame().locator('#ck-location').fill('慢素材测试');await frame().locator('[data-style="1"]').click();await frame().locator('.bird-card[aria-pressed=true]').click();await frame().locator('.bird-card[aria-pressed=false]:not([disabled])').first().click();
  assert.deepEqual(r.errors,[]);release();
  await frame().locator('#ck-file').setInputFiles(path.resolve(__dirname,'../src/checkin-assets/lake.jpg'));await frame().locator('#ck-dropzone.has-image').waitFor();await frame().locator('#ck-generate').click();await frame().locator('#ck-albumCount').filter({hasText:'1'}).waitFor();await page.locator('#xcwc-checkin-save').waitFor({state:'visible'});assert.deepEqual(r.errors,[]);r.passed=true;r.checks=['pending background keeps size/reset controls disabled','location/filter/bird changes while photo is absent do not throw','real delayed response is released intact','upload and generate complete after resources arrive'];
 }catch(error){r.passed=false;r.error=error.stack}finally{release();await context.close();await browser.close()}
}
(async()=>{await run(chromium);if(fs.existsSync(webkit.executablePath()))await run(webkit);const report={base,code,passed:results.every(r=>r.passed),results,limitations:['Response delay is local failure simulation, not whole-page 4G or device proof.']};const destination=path.resolve(__dirname,'../output/full-audit/browser',auditLabel,'slow-canvas.json');fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n','utf8');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1})().catch(e=>{console.error(e);process.exitCode=1});
