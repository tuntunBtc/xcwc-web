const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8814',root=path.resolve(__dirname,'..');
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview only');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/shop/media-optimization.json'),'utf8'));
const catalogue=JSON.parse(fs.readFileSync(path.join(root,'../xcwc-api/src/main/resources/shop/catalog.json'),'utf8'));
const file=url=>path.join(root,url.slice(1)),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const p of manifest.products){assert.equal(sha(file(p.source.url)),p.source.sha256);const item=catalogue.products.find(x=>x.id===p.id);assert.equal(item.coverImageUrl,p.cover.url);assert.equal(item.detailImageUrl,p.detail.url);assert.deepEqual(item.coverCrop,{left:0,top:0,width:1,height:1})}
assert(manifest.stats.allCoverBytes<500000);assert(manifest.stats.firstTwoCoverBytes<70000);assert(manifest.stats.allOptimizedDetailBytes<3500000);
(async()=>{for(const engine of [chromium,...(fs.existsSync(webkit.executablePath())?[webkit]:[])]){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),requests=[];page.on('request',r=>{if(r.url().includes('/assets/shop/products/'))requests.push(new URL(r.url()).pathname)});
  await page.goto(base+'/?page=shop',{waitUntil:'domcontentloaded'});const shop=page.frameLocator('iframe').locator('#xcwc-shop');await shop.locator('.card').nth(14).waitFor();
  for(const img of await shop.locator('.photo img').all()){await img.scrollIntoViewIfNeeded();assert(await img.evaluate(el=>el.complete?el.naturalWidth===480:new Promise(resolve=>{el.addEventListener('load',()=>resolve(el.naturalWidth===480),{once:true});el.addEventListener('error',()=>resolve(false),{once:true})})))}
  assert.equal(new Set(requests).size,15);assert(requests.every(url=>url.endsWith('/cover-480.webp')),'list/cart preview must not fetch complete detail images');
  assert.deepEqual(await shop.locator('.photo img').evaluateAll(images=>images.map(el=>el.loading)),['eager','eager',...Array(13).fill('lazy')]);
  await shop.locator('.photo-button').first().click();await shop.locator('.detail-image img').waitFor({state:'attached'});
  const image=shop.locator('.detail-image img');assert(await image.evaluate(el=>el.complete?el.naturalWidth===852&&el.naturalHeight===1846:new Promise(resolve=>{el.addEventListener('load',()=>resolve(el.naturalWidth===852&&el.naturalHeight===1846),{once:true});el.addEventListener('error',()=>resolve(false),{once:true})})));
  assert(requests.some(url=>url.endsWith('/detail-optimized.webp')));assert(requests.every(url=>url.endsWith('.webp')));
  console.log('PASS '+engine.name()+': list requests only 15 small WebP covers; full detail loads on opening only; 480px cover/852x1846 detail geometry, lazy-loading and original SHA preserved');
 }finally{await browser.close()}
}})().catch(error=>{console.error(error);process.exitCode=1});
