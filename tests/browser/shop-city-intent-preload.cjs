// Exercise the current page sources without a server, build, account data, or remote writes.
// The shared intent scheduler is injected: these checks cover the page-to-helper contract.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),origin='https://xcwc-preload.invalid';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const products=Array.from({length:24},(_,i)=>({id:'fixture-'+i,title:'城市小鸟 '+i,price:79,coverImageUrl:'/assets/tests/cover-'+i+'.webp',detailImageUrl:'/assets/tests/detail-'+i+'.webp'}));
const birds=Array.from({length:12},(_,i)=>({id:'owned-'+i,name:'伙伴 '+i,cityCode:'hangzhou',typeId:'hy',skinId:'green',eggStatus:'HATCHED'}));
function documentFor(page){
 const common=`const content=document.getElementById('content');let pageCleanup=null;window.intentHooks=[];window.visibleWaits=[];window.calls=[];
 const esc=value=>String(value??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
 const waitForVisibleMedia=(roots,signal)=>new Promise(resolve=>window.visibleWaits.push({resolve,signal,roots}));
 const createIntentPreloader=options=>window.intentHooks.push(options);
 window.cleanup=()=>pageCleanup?.();
 const xcwcMediaSize=()=>[400,600];
 `;
 const code=page==='shop'?`
 const shopCss=${JSON.stringify(read('src/shop/shop.css'))},shopTemplate=${JSON.stringify(read('src/shop/template.html'))};
 window.addEventListener('message',event=>{const m=event.data;if(m?.channel!=='xcwc-shop-data'||m.operation==='cancel')return;window.calls.push(m.operation);
 const value=m.operation==='list'?{items:${JSON.stringify(products)},total:24,cities:[]}:m.operation==='banners'?{items:[]}:m.operation==='cart-read'?{ids:[]}:null;
 if(value===null)throw Error('Unexpected shop operation '+m.operation);
 window.postMessage({channel:'xcwc-shop-data-result',id:m.id,ok:true,value,freshUntil:Date.now()+60000},'*');});
 ${read('src/shop/shop.js').replace('__SHOP_PRODUCTS__',read('src/shop/products.js'))}
 mountShop().then(()=>window.mounted=true);`:`
 const cityCss=${JSON.stringify(read('src/city/city.css'))},cityTemplate=${JSON.stringify(read('src/city/template.html'))};
 const liveAccount={birds:${JSON.stringify(birds)},wallet:{balance:5},currentId:'owned-0'};
 const birdAssets={avatar:'${origin}/assets/tests/avatar.webp'};
 const birdArt=(bird,usage)=>usage==='avatar'?birdAssets.avatar:'${origin}/assets/tests/sticker-'+bird.id+'.webp';
 const ownedCurrent=()=>liveAccount.birds[0],refreshAccount=async()=>liveAccount;
 const accountRpc=async operation=>{window.calls.push(operation);if(operation==='catalog')return [];throw Error('Unexpected city operation '+operation)};
 const mountIsolated=(id,css,template)=>{const shadow=document.getElementById(id).attachShadow({mode:'open'});shadow.innerHTML='<style>'+css+'</style>'+template;return shadow};
 const installDialogClose=()=>{},openPageDialog=async dialog=>{if(!dialog.open)dialog.showModal()},pageNotice=message=>{throw Error(message)},nav=()=>{};
 ${read('src/city/city.js')}
 mountCity();window.mounted=true;`;
 const scripts=(read('src/media-lazy.js')+'\n'+common+'\n'+code).replaceAll('__XCWC_ASSET_ORIGIN__',origin).replace(/<\/script/gi,'<\\/script');
 return '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="content" style="height:100dvh;overflow:auto"><section id="xcwc-'+page+'"></section></div><script>'+scripts+'</script></body></html>';
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:680}}),page=await context.newPage(),requests=[],errors=[],held=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());assert.equal(url.origin,origin);
   if(url.pathname.startsWith('/assets/')){requests.push(url.pathname);if(url.pathname.includes('/detail-'))await new Promise(resolve=>held.push(resolve));return route.fulfill({contentType:'image/png',body:png})}
   return route.fulfill({contentType:'text/html',body:documentFor(url.pathname==='/city'?'city':'shop')});
  });
  await page.goto(origin+'/shop');await page.waitForFunction(()=>window.mounted&&window.visibleWaits.length===1);
  assert.equal(await page.evaluate(()=>window.intentHooks.length),0,'media readiness gates shop hints');
  assert.equal(requests.filter(url=>url.includes('/detail-')).length,0,'listing never downloads all detail artwork');
  assert.equal(await page.locator('#products .photo-button').last().locator('img').getAttribute('src'),null,'offscreen shop covers remain deferred');
  await page.evaluate(()=>window.visibleWaits[0].resolve(true));await page.waitForFunction(()=>window.intentHooks.length===1);
  assert.equal(await page.evaluate(()=>{const shadow=document.querySelector('#xcwc-shop').shadowRoot;return window.intentHooks[0].resolve(shadow.querySelector('[data-id="fixture-1"] .photo'))}),origin+'/assets/tests/detail-1.webp');
  assert.equal(await page.evaluate(()=>{const shadow=document.querySelector('#xcwc-shop').shadowRoot;return window.intentHooks[0].resolve(shadow.querySelector('[data-shop-action="add"]'))}),null,'add-to-cart intent never fetches a detail image');
  await page.locator('#products .photo-button').first().click();await page.locator('#overlay.show').waitFor();
  await page.locator('.detail-image-status img').waitFor();assert.equal(await page.locator('.detail-image-status img').getAttribute('src'),origin+'/assets/tests/cover-0.webp','opening immediately reuses the list cover while the long image is stalled');
  assert.equal(await page.locator('.detail-image-status').isVisible(),true);assert.equal(await page.locator('.detail-add-btn').isVisible(),false,'hotspots stay unavailable until their artwork loads');
  assert.deepEqual(await page.evaluate(()=>window.calls.sort()),['banners','cart-read','list']);
  for(const release of held.splice(0))release();await page.locator('.panel.art-loaded').waitFor();
  assert.equal(await page.locator('.detail-image-status').isVisible(),false);await page.evaluate(()=>window.cleanup());assert.equal(await page.evaluate(()=>window.intentHooks[0].signal.aborted),true);
  requests.length=0;await page.goto(origin+'/city');await page.waitForFunction(()=>window.visibleWaits.length===1);
  assert.equal(await page.evaluate(()=>window.intentHooks.length),0,'media readiness gates city hints');
  assert.equal(requests.filter(url=>url.includes('/sticker-')).length,0,'city listing does not fetch every partner sticker');
  await page.evaluate(()=>window.visibleWaits[0].resolve(true));await page.waitForFunction(()=>window.intentHooks.length===1);
  assert.equal(await page.evaluate(()=>{const s=document.querySelector('#xcwc-city').shadowRoot;return window.intentHooks[0].resolve(s.querySelector('[data-city="hz"] .city-name'))}),origin+'/assets/tests/sticker-owned-0.webp');
  assert.equal(await page.evaluate(()=>{const s=document.querySelector('#xcwc-city').shadowRoot;return window.intentHooks[0].resolve(s.querySelector('[data-city="sz"]'))}),null,'an empty city prepares no unrelated image');
  await page.locator('[data-city="hz"]').click();await page.locator('#sheet[open]').waitFor();
  assert.equal(await page.locator('.bird-row img').first().getAttribute('src'),origin+'/assets/tests/sticker-owned-0.webp','first partner appears without waiting for hints');
  assert.equal(await page.locator('.bird-row img').last().getAttribute('src'),null,'later partner images stay deferred within the dialog');
  await page.locator('.bird-row').last().scrollIntoViewIfNeeded();await page.waitForFunction(()=>[...document.querySelector('#xcwc-city').shadowRoot.querySelectorAll('.bird-row img')].at(-1)?.hasAttribute('src'));
  assert.equal(await page.locator('.bird-row img').last().getAttribute('src'),origin+'/assets/tests/sticker-owned-11.webp');
  await page.evaluate(()=>window.cleanup());assert.equal(await page.evaluate(()=>window.intentHooks[0].signal.aborted),true);
  await page.goto(origin+'/shop');await page.waitForFunction(()=>window.visibleWaits.length===1);await page.evaluate(()=>{window.cleanup();window.visibleWaits[0].resolve(true)});
  assert.equal(await page.evaluate(()=>window.intentHooks.length),0,'leaving while media waits cannot install late listeners');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,interceptedOnly:true,checks:['visible-media readiness gate','one target detail URL without speculative API reads','offscreen list covers deferred','immediate detail cover and safe hotspots','city first partner intent only','dialog viewport lazy images','cleanup before and after readiness']}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
