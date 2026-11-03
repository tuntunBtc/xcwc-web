// Browser-generated touch events, with isolated guest state and no remote requests.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8797';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:[]}));
  await page.goto(base);await page.waitForFunction(()=>!!window.xcwcGuest);
  await page.evaluate(()=>window.xcwcGuest.adopt({id:'a'.repeat(32),cityCode:'hangzhou',cityName:'杭州',typeId:'hy',skinId:'default',active:true},'手势测试'));
  await page.goto(base+'/?page=photo');const frame=page.frameLocator('iframe');
  await frame.locator('#ck-editor').evaluate(e=>e.open=true);await frame.locator('#ck-birdSelection:not([hidden])').waitFor();
  const canvas=frame.locator('#ck-preview');await canvas.scrollIntoViewIfNeeded();
  await frame.locator('#ck-size').evaluate(e=>{e.value=30;e.dispatchEvent(new Event('input',{bubbles:true}))});
  const cdp=await context.newCDPSession(page);
  const touch=async(type,pts)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map((p,i)=>({x:p.x,y:p.y,id:i+1,radiusX:3,radiusY:3,force:1}))});};
  const center=async()=>frame.locator('#ck-birdSelection').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}).then(async p=>{const box=await page.locator('iframe').boundingBox();return {x:p.x+box.x,y:p.y+box.y}});
  const size=()=>frame.locator('#ck-size').inputValue().then(Number);
  const before=await frame.locator('#ck-birdSelection').getAttribute('style');
  let p=await center();const bounds=await canvas.boundingBox();const middle={x:bounds.x+bounds.width*.5,y:bounds.y+bounds.height*.5};
  await touch('touchStart',[p]);await touch('touchMove',[middle]);await touch('touchEnd',[]);
  assert.notEqual(await frame.locator('#ck-birdSelection').getAttribute('style'),before,'single finger moves bird');
  p=await center();const left={x:p.x-18,y:p.y},right={x:p.x+18,y:p.y};
  await touch('touchStart',[left]);await touch('touchStart',[left,right]);await touch('touchMove',[{x:p.x-30,y:p.y},{x:p.x+30,y:p.y}]);
  assert(await size()>45,'two fingers spread to enlarge');await touch('touchEnd',[]);
  p=await center();await touch('touchStart',[{x:p.x-30,y:p.y}]);await touch('touchStart',[{x:p.x-30,y:p.y},{x:p.x+30,y:p.y}]);await touch('touchMove',[{x:p.x-3,y:p.y},{x:p.x+3,y:p.y}]);await touch('touchEnd',[]);
  assert.equal(await size(),12,'pinch inward respects minimum size');
  // Both fingers can start beside a small selected bird.
  p=await center();await touch('touchStart',[{x:p.x-35,y:p.y}]);await touch('touchStart',[{x:p.x-35,y:p.y},{x:p.x+35,y:p.y}]);await touch('touchMove',[{x:p.x-70,y:p.y},{x:p.x+70,y:p.y}]);
  assert(await size()>20,'pinch starts on blank canvas around selected bird');await touch('touchCancel',[]);
  const moved=await frame.locator('#ck-birdSelection').getAttribute('style');p=await center();await touch('touchStart',[p]);await touch('touchMove',[{x:p.x-15,y:p.y-10}]);await touch('touchEnd',[]);
  assert.notEqual(await frame.locator('#ck-birdSelection').getAttribute('style'),moved,'drag works after cancellation');
  assert.equal(await frame.locator('#ck-resizeHandle').count(),0);assert.equal(await canvas.evaluate(e=>getComputedStyle(e).touchAction),'none');
  assert.deepEqual(errors,[]);await page.screenshot({path:'output/checkin-pinch-mobile.png',fullPage:true});
  console.log(JSON.stringify({passed:true,checks:['single finger drag','two-finger enlarge','two-finger shrink and minimum','pinch starting beside bird','cancel then drag','arrow removed','no page errors']},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
