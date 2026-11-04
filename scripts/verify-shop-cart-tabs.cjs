// Isolated same-origin browser contexts; cart changes never leave the client.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8814',key='xcwc.shop.cart.v1:%40anonymous';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
(async()=>{
 for(const engine of [chromium,...(fs.existsSync(webkit.executablePath())?[webkit]:[])]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  try{
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const a=await context.newPage(),b=await context.newPage(),errors=[];
   for(const p of[a,b]){if(p===b)await p.addInitScript(()=>{if(window.parent===window){const stop=e=>{if(window.__freezeCartNotices)e.stopImmediatePropagation()};for(const type of ['storage','focus','pageshow','xcwc-session-change'])window.addEventListener(type,stop,true);document.addEventListener('visibilitychange',stop,true)}});p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/?page=shop',{waitUntil:'domcontentloaded'});await p.frameLocator('iframe').locator('#xcwc-shop .add:not([disabled])').first().waitFor({state:'attached'})}
   const sa=a.frameLocator('iframe').locator('#xcwc-shop'),sb=b.frameLocator('iframe').locator('#xcwc-shop');
   // Freeze B's notification listener to prove stale UI cannot overwrite newer cart state.
   await b.evaluate(()=>{window.__freezeCartNotices=true});
   await sa.locator('.add').nth(0).click();await sa.locator('#panelTitle').filter({hasText:'已加入购物车'}).waitFor();assert.equal(await sb.locator('#cartCount').textContent(),'0');
   await sb.locator('.add').nth(1).click();await sb.locator('#panelTitle').filter({hasText:'已加入购物车'}).waitFor();
   assert.deepEqual(await a.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),['hangzhou-xihu','hangzhou-guihua']);await sa.locator('#cartCount').filter({hasText:'2'}).waitFor({state:'attached'});assert.equal(await sb.locator('#cartCount').textContent(),'2');
   await b.evaluate(()=>{window.__freezeCartNotices=false});
   const request=(page,operation,id)=>page.frameLocator('iframe').locator('#xcwc-shop #cartButton').evaluate((el,{operation,id})=>new Promise((resolve,reject)=>{
    const requestId='cart-test-'+Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>b.toString(16).padStart(2,'0')).join('');
    const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('cart probe timeout'));},15000);
    function receive(event){const m=event.data;if(event.source!==window.parent||m?.channel!=='xcwc-shop-data-result'||m.id!==requestId)return;clearTimeout(timer);window.removeEventListener('message',receive);m.ok?resolve(m.value):resolve({__error:m.value})}
    window.addEventListener('message',receive);window.parent.postMessage({channel:'xcwc-shop-data',id:requestId,operation,args:{id}},'*');
   }),{operation,id}).then(value=>{if(value.__error)throw Object.assign(Error(value.__error.message),{code:value.__error.code});return value});
   const empty=async()=>{const ids=(await request(a,'cart-read')).ids;for(let i=0;i<ids.length;i+=20)await Promise.all(ids.slice(i,i+20).map((id,j)=>request(j%2?a:b,'cart-remove',id)));assert.deepEqual((await request(a,'cart-read')).ids,[]);assert.deepEqual((await request(b,'cart-read')).ids,[])};
   const outcome=await Promise.all([request(a,'cart-remove','hangzhou-xihu'),request(b,'cart-add','suzhou-fengyin')]);
   assert.deepEqual((await request(a,'cart-read')).ids.sort(),['hangzhou-guihua','suzhou-fengyin']);
   await empty();
   const many=Array.from({length:24},(_,i)=>'parallel-'+String(i).padStart(2,'0'));
   await Promise.all(many.map((id,i)=>request(i%2?a:b,'cart-add',id)));assert.deepEqual((await request(a,'cart-read')).ids.sort(),many);
   const duplicate=await Promise.all(Array.from({length:8},(_,i)=>request(i%2?a:b,'cart-add','same-product')));assert.equal(duplicate.filter(x=>x.already===false).length,1);assert.equal((await request(a,'cart-read')).ids.filter(x=>x==='same-product').length,1);
   // Resume normal UI operations after the bridge stress probes; a real add must
   // refresh its own view and notify the other tab without a reload.
   await sa.locator('.close').click();await sb.locator('.close').click();await sa.locator('.add').nth(0).click();
   await sa.locator('#cartCount').filter({hasText:'26'}).waitFor({state:'attached'});await sb.locator('#cartCount').filter({hasText:'26'}).waitFor({state:'attached'});
   await empty();for(let i=0;i<99;i+=20)await Promise.all(Array.from({length:Math.min(20,99-i)},(_,j)=>request(j%2?a:b,'cart-add','seed-'+(i+j))));
   assert.equal((await request(a,'cart-read')).ids.length,99);assert.equal((await request(b,'cart-read')).ids.length,99);
   const limit=await Promise.allSettled([request(a,'cart-add','last-slot-a'),request(b,'cart-add','last-slot-b')]);assert.equal(limit.filter(r=>r.status==='fulfilled').length,1);assert.equal(limit.find(r=>r.status==='rejected').reason.code,'CART_FULL');assert.equal((await request(a,'cart-read')).ids.length,100);
   await empty();await request(a,'cart-add','preserved');
   await a.evaluate(()=>{window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('xcwc.shop.cart.v1:'))throw new DOMException('quota test','QuotaExceededError');return window.__setItem.call(this,key,value)}});
   await assert.rejects(request(a,'cart-add','must-not-write'),e=>e.code==='CART_UNAVAILABLE');assert.deepEqual((await request(b,'cart-read')).ids,['preserved']);
   await a.evaluate(()=>{Storage.prototype.setItem=window.__setItem});assert.deepEqual(errors,[]);
   console.log('PASS '+engine.name()+': stale-tab add retains both products, cross-tab count sync, concurrent add/remove, 24 simultaneous additions, same-ID dedup, atomic 100 limit, storage failure preserves cart');
  }finally{await browser.close()}
 }
})().catch(error=>{console.error(error);process.exitCode=1});
