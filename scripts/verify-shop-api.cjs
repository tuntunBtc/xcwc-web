// Real local xcwc-api integration; external purchases are never performed.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8814';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
const catalogue=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../xcwc-api/src/main/resources/shop/catalog.json'),'utf8'));
const expected=catalogue.products.filter(p=>p.enabled!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)||a.id.localeCompare(b.id));
const inCity=city=>expected.filter(p=>p.cityCode===city);
const output=process.env.XCWC_SCREENSHOT_DIR||path.resolve('output/shop-api');fs.mkdirSync(output,{recursive:true});
(async()=>{
 for(const engine of [chromium,...(fs.existsSync(webkit.executablePath())?[webkit]:[])]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  try{
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage(),errors=[],writes=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/')&&!['GET','HEAD'].includes(r.method()))writes.push(r.method()+' '+r.url())});
   await page.goto(base+'/?page=shop',{waitUntil:'domcontentloaded'});const f=page.frameLocator('iframe'),shop=f.locator('#xcwc-shop');
   await shop.locator('.card').nth(expected.length-1).waitFor();assert.equal(await shop.locator('.card').count(),expected.length);
   assert.deepEqual(await shop.locator('.card h2').allTextContents(),expected.map(p=>p.title));
   assert((await shop.locator('.brand').innerText()).includes('小鸟商城'));assert.equal(await shop.locator('#salesSort').count(),0);assert.equal(await shop.locator('.preview-label').count(),0);
   assert.deepEqual(await shop.locator('.price').allTextContents(),expected.map(p=>'¥'+p.price));
   await shop.locator('#slides img').waitFor();assert.equal(await shop.locator('#slides a').count(),0);assert(await shop.locator('#carouselEmpty').isHidden());assert.equal(await shop.locator('.bottom-nav').count(),0);
   const navigation=await f.locator('.bottom').innerHTML();assert.deepEqual(await f.locator('.bottom button span').allTextContents(),['小窝','城市','商城','我的']);
   for(const im of await shop.locator('.photo img').all()){await im.scrollIntoViewIfNeeded();assert(await im.evaluate(el=>el.complete?el.naturalWidth===480:new Promise(resolve=>{el.addEventListener('load',()=>resolve(el.naturalWidth===480),{once:true});el.addEventListener('error',()=>resolve(false),{once:true})})));}console.log(engine.name()+': list/images');
   await shop.locator('#city').selectOption('hangzhou');await shop.locator('#resultCount').filter({hasText:'共 '+inCity('hangzhou').length+' 只'}).waitFor();assert.equal(await shop.locator('.card').count(),inCity('hangzhou').length);
   // A failed new filter must not expose a stale next-page action or old city rows.
   await page.route('**/api/shop/products?**',r=>r.fulfill({status:503,json:{code:'SHOP_UNAVAILABLE',message:'隔离网络错误测试'}}));
   await shop.locator('#city').selectOption('suzhou');await shop.locator('#shopStatus').filter({hasText:'隔离网络错误测试'}).waitFor();assert.equal(await shop.locator('.card').count(),0);assert(await shop.locator('#loadMore').isHidden());
   await page.unroute('**/api/shop/products?**');await shop.locator('#retry').click();await shop.locator('#resultCount').filter({hasText:'共 '+inCity('suzhou').length+' 只'}).waitFor();assert.deepEqual(await shop.locator('.card h2').allTextContents(),inCity('suzhou').map(p=>p.title));
   await shop.locator('#city').selectOption('');await shop.locator('.card').nth(expected.length-1).waitFor();
   for(const item of expected){
    await shop.locator('.photo-button[data-id="'+item.id+'"]').click();await shop.locator('.detail-hotspot').waitFor({state:'attached'});
    assert.equal(await shop.locator('#panelTitle').textContent(),item.title);
    assert((await shop.locator('.detail-image img').getAttribute('src')).endsWith(item.detailImageUrl));
    assert.equal(await shop.locator('.detail-hotspot').textContent(),'');
    for(const control of ['.detail-hotspot','.detail-close-hotspot'])assert(await shop.locator(control).evaluate(el=>{const left=parseFloat(el.style.left),top=parseFloat(el.style.top),width=parseFloat(el.style.width),height=parseFloat(el.style.height);return left>=0&&top>=0&&width>0&&height>0&&left+width<=100.001&&top+height<=100.001}));
    await shop.locator('.detail-close-hotspot').click();assert(await shop.locator('#overlay').isHidden());
   }
   console.log(engine.name()+': '+expected.length+' complete detail images and transparent controls');
   await shop.locator('.photo-button').first().click();await shop.locator('.detail-hotspot').waitFor({state:'attached'});
   assert.equal(await shop.locator('.detail-hotspot').textContent(),'');assert.equal(await shop.locator('.detail-hotspot').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
   assert((await shop.locator('.detail-image img').getAttribute('src')).endsWith(expected[0].detailImageUrl));
   await shop.locator('.detail-hotspot').click();await shop.locator('#panelTitle').filter({hasText:'已加入购物车'}).waitFor();
   await shop.locator('#panelContent [data-shop-action=cart]').click();await shop.locator('.cart-row').waitFor();assert.equal(await shop.locator('.cart-row').count(),1);
   assert.equal(await shop.locator('.taobao').isDisabled(),!expected[0].purchaseUrl);assert.equal(await shop.locator('.taobao').textContent(),expected[0].purchaseUrl?'去淘宝购买 ↗':'购买链接待配置');await shop.locator('.close').click();
   await shop.locator('.add').first().click();await shop.locator('#panelTitle').filter({hasText:'这只小鸟已在购物车中'}).waitFor();assert.equal(await shop.locator('#cartCount').textContent(),'1');await shop.locator('.close').click();
   await page.reload({waitUntil:'domcontentloaded'});await shop.locator('.card').nth(expected.length-1).waitFor();await shop.locator('#cartButton').click();await shop.locator('.cart-row').waitFor();assert.equal(await shop.locator('.cart-row').count(),1);await shop.locator('.close').click();
   // Unknown/downlisted IDs survive catalogue filtering and remain removable.
   await shop.locator('#cartButton').evaluate(()=>new Promise((resolve,reject)=>{
    const id='seed-downlisted-product',timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('cart seed timeout'))},15000);
    function receive(event){const m=event.data;if(event.source!==window.parent||m?.channel!=='xcwc-shop-data-result'||m.id!==id)return;clearTimeout(timer);window.removeEventListener('message',receive);m.ok?resolve():reject(Error(m.value.message))}
    window.addEventListener('message',receive);window.parent.postMessage({channel:'xcwc-shop-data',id,operation:'cart-add',args:{id:'removed-bird'}},'*');
   }));
   await page.reload({waitUntil:'domcontentloaded'});await shop.locator('.card').nth(expected.length-1).waitFor();await shop.locator('#cartButton').click();await shop.locator('.cart-row').nth(1).waitFor();assert.equal(await shop.locator('.cart-row').count(),2);assert((await shop.locator('.unavailable').textContent()).includes('记录仍保留'));
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('xcwc.shop.cart.v1:%40anonymous')).length),2);await shop.locator('.cart-row').nth(1).locator('.remove').click();await shop.locator('.cart-row').nth(1).waitFor({state:'detached'});await shop.locator('.close').click();
   assert.equal(await f.locator('.bottom').innerHTML(),navigation);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
   await page.screenshot({path:path.join(output,'shop-'+engine.name()+'-390.png'),fullPage:true});
   for(const width of [320,430]){const small=await context.newPage();await small.setViewportSize({width,height:844});await small.goto(base+'/?page=shop',{waitUntil:'domcontentloaded'});const sf=small.frameLocator('iframe');await sf.locator('#xcwc-shop .card').nth(expected.length-1).waitFor();assert.equal(await sf.locator('body').evaluate(el=>el.scrollWidth>innerWidth),false);await small.screenshot({path:path.join(output,'shop-'+engine.name()+'-'+width+'.png')});await small.close()}
   console.log('PASS '+engine.name()+': all configured real products, API price/cities, failed-filter retry, complete-image hotspot, local cart/dedup/reload, configured purchase state/downlisted product, 320/390/430, unchanged nav, no API writes; total='+expected.length+'');
  }finally{await browser.close()}
 }
})().catch(error=>{console.error(error);process.exitCode=1});
