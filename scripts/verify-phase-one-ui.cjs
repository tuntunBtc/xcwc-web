// Regression for the four UI improvements approved on 2026-11-04.
// All API responses are synthetic public fixtures; no backend writes are allowed.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-nest-browser-check/node_modules/playwright');
const base=process.env.XCWC_PREVIEW_URL;
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base||''))throw Error('Explicit loopback preview required');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.XCWC_UI_OUTPUT||path.join(root,'output/ui-optimization-20261104/browser'));
fs.mkdirSync(out,{recursive:true});
const catalogue=JSON.parse(fs.readFileSync(path.join(root,'../xcwc-api/src/main/resources/shop/catalog.json'),'utf8'));
const ids=['a','b','c'].map(c=>c.repeat(32));
const publicBird=id=>({id,name:'验收小鸟',cityCode:'hangzhou',cityName:'杭州',typeId:'huangying',typeName:'小黄莺',skinId:'green',skinName:'绿色',active:true});
const report={conditions:{base,viewport:'390x844',clock:'2026-11-04T08:00:00Z',api:'Synthetic public fixtures; non-GET requests rejected'},engines:[],limits:['Native Chinese keyboards, NFC hardware, iPhone/WeChat and system gallery remain device checks.']};
const sentinel={home:'#xcwc-nest #name',city:'#xcwc-city .city-card',shop:'#xcwc-shop .card',profile:'.profile-hero',flock:'.flock-grid',wardrobe:'.wardrobe-card',photo:'.bird-card[aria-pressed]'};
async function ready(frame,route){await frame.locator(sentinel[route]).first().waitFor()}
const keyImage={home:'#xcwc-nest .actor img[src]',city:'#xcwc-city .profile img',shop:'#xcwc-shop .photo img',profile:'.profile-avatar',flock:'.flock-grid img[src]',wardrobe:'.wardrobe-actor img',photo:'.bird-card img[src]'};
async function readyImage(frame,route){
 const image=frame.locator(keyImage[route]).first();await image.waitFor({state:'attached'});
 await image.evaluate(im=>Promise.race([im.decode(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Key image decode timed out: '+im.getAttribute('src'))),5000))]));
}
async function fixture(context,result){
 await context.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),p=url.pathname;
  if(request.method()!=='GET'){result.writes.push(p);return route.fulfill({status:405,json:{code:'READ_ONLY_FIXTURE',message:'No backend writes in this verifier'}})}
  if(p==='/api/checkin-catalog')return route.fulfill({json:[]});
  if(ids.some(id=>p==='/api/birds/'+id))return route.fulfill({json:publicBird(p.slice('/api/birds/'.length))});
  if(p==='/api/shop/banners')return route.fulfill({json:{items:catalogue.banners.filter(b=>b.enabled!==false)}});
  const items=catalogue.products.filter(p=>p.enabled!==false).map(({enabled,...p})=>p);
  if(p==='/api/shop/products'){
   const cities=[...new Map(items.map(p=>[p.cityCode,{code:p.cityCode,name:p.cityName}])).values()];
   let filtered=items.filter(p=>!url.searchParams.get('city')||p.cityCode===url.searchParams.get('city'));
   const sort=url.searchParams.get('sort');filtered.sort(sort==='priceAsc'?(a,b)=>a.price-b.price:sort==='priceDesc'?(a,b)=>b.price-a.price:(a,b)=>a.sortOrder-b.sortOrder);
   const page=Number(url.searchParams.get('page')||1),pageSize=Number(url.searchParams.get('pageSize')||20);
   return route.fulfill({json:{items:filtered.slice((page-1)*pageSize,page*pageSize),total:filtered.length,page,pageSize,cities}});
  }
  if(p.startsWith('/api/shop/products/')){const product=items.find(x=>x.id===p.slice('/api/shop/products/'.length));if(product)return route.fulfill({json:product})}
  result.unexpectedApi.push(p);return route.fulfill({status:404,json:{code:'UNKNOWN_FIXTURE',message:p}});
 });
 await context.addInitScript(()=>{
  const NativeDate=Date,now=NativeDate.parse('2026-11-04T08:00:00Z');
  globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
  window.__uiPaintAudit={labels:[],exports:[]};
  const text=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(value,...args){if(this.canvas.id==='ck-preview'&&String(value).startsWith('⌖ '))window.__uiPaintAudit.labels.push(String(value));return text.call(this,value,...args)};
  const blob=HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob=function(...args){if(this.id==='ck-preview')window.__uiPaintAudit.exports.push(window.__uiPaintAudit.labels.at(-1));return blob.apply(this,args)};
 });
 context.on('page',p=>p.on('pageerror',e=>result.errors.push(e.message)));
}
async function run(engine){
 const name=engine.name(),result={engine:name,checks:[],errors:[],writes:[],unexpectedApi:[],layouts:[]};report.engines.push(result);
 const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN',timezoneId:'Asia/Shanghai'});
 await fixture(context,result);const page=await context.newPage();page.setDefaultTimeout(10000);
 const frame=()=>page.frameLocator('iframe'),account=()=>frame().locator('#xcwc-account-page');
 const goto=route=>page.goto(base+route,{waitUntil:'domcontentloaded'});
 const route=async r=>{await goto('/?page='+r);await ready(frame(),r)};
 const state=()=>page.evaluate(()=>window.xcwcGuest.read());
 async function step(label,fn){await fn();result.checks.push(label);console.log('PASS',name,label)}
 const shot=label=>page.screenshot({path:path.join(out,name+'-'+label+'.png'),animations:'disabled'});
 try{
  await step('empty wardrobe remains a static unavailable gallery',async()=>{
   await route('wardrobe');await account().locator('.wardrobe-card').nth(7).waitFor();
   assert.equal(await account().locator('.wardrobe-card button:disabled').count(),8);
   assert.doesNotMatch(await account().innerText(),/轻点试穿|还差 \d+|等待小伙伴|领取后可穿戴/);
   assert.equal((await state()).birds.length,0);
  });
  await step('Chinese composition and legacy 229 never submit; normal Enter still adopts once',async()=>{
   await goto('/register.html?birdCode='+ids[0]);const input=frame().locator('#adopt-v1-name');await input.waitFor();await input.fill('中文候选');
   await input.evaluate(el=>{
    el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));
    el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:false,bubbles:true,cancelable:true}));
   });
   assert.equal((await state()).birds.length,0);assert.equal(new URL(page.url()).pathname,'/register.html');
   await input.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
   await input.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:false,bubbles:true,cancelable:true})));
   assert.equal((await state()).birds.length,0);await shot('ime-not-submitted');
   await input.press('Enter');await frame().locator('#xcwc-nest #name').filter({hasText:'中文候选'}).waitFor();
   assert.equal((await state()).birds.length,1);assert.equal((await state()).balance,5);
   await goto('/register.html?birdCode='+ids[0]);await frame().locator('[data-action=confirm]').filter({hasText:'回小窝'}).waitFor();
   await frame().locator('[data-action=confirm]').click();await frame().locator('#xcwc-nest #name').waitFor();assert.equal((await state()).birds.length,1);assert.equal((await state()).balance,5);
  });
  await step('composition end retains a valid nickname and explicit button works',async()=>{
   await goto('/register.html?birdCode='+ids[1]);const input=frame().locator('#adopt-v1-name');await input.waitFor();
   await input.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='一二三四五六七八';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))});
   assert.equal(await input.inputValue(),'一二三四五六');await frame().locator('[data-action=confirm]').click();await frame().locator('#xcwc-nest #name').filter({hasText:'一二三四五六'}).waitFor();assert.equal((await state()).birds.length,2);
  });
  await step('wardrobe is permanently unavailable at high balance and preserves historical outfits',async()=>{
   await page.evaluate(id=>{const s=window.xcwcGuest.read();s.balance=999;s.skins=['huangying_osmanthus','lake_glow'];s.currentId=id;s.birds.find(b=>b.id===id).equippedSkinId='huangying_osmanthus';localStorage.setItem('xcwc.guest.v1',JSON.stringify(s))},ids[0]);
   await route('wardrobe');await account().locator('.wardrobe-card').nth(7).waitFor();
   assert.equal(await account().locator('.wardrobe-card button:disabled').count(),8);
   assert.equal(await account().locator('[data-account-action=preview],[data-account-action=redeem],[data-account-action=equip],[data-account-action=confirm-redeem]').count(),0);
   const text=await account().innerText();assert.match(text,/暂未开放/);assert.doesNotMatch(text,/轻点试穿|还差 \d+|30 叽分|70 叽分|恢复原貌/);
   assert.match(await account().locator('.wardrobe-actor img').getAttribute('src'),/osmanthus/);
   const before=JSON.stringify(await state());
   const rejected=await page.evaluate(async id=>{
    const results=[];for(const [op,args]of [['redeem',{skinId:'huangying_peach',requestId:'ui-review-redeem-1'}],['equip',{birdId:id,skinId:null}]]){
     try{await window.xcwcGuestOperation(op,args);results.push('UNEXPECTED_SUCCESS')}catch(error){results.push(error.code)}
    }return results;
   },ids[0]);
   assert.deepEqual(rejected,['WARDROBE_NOT_AVAILABLE','WARDROBE_NOT_AVAILABLE']);
   await account().evaluate(el=>{const b=document.createElement('button');b.dataset.accountAction='preview';b.dataset.previewSkin='huangying_peach';el.append(b);b.click();b.remove()});
   assert.equal(JSON.stringify(await state()),before);await shot('wardrobe-unavailable');
   await route('home');await frame().locator('#xcwc-nest .actor img').first().waitFor();assert.match(await frame().locator('#xcwc-nest .actor img').first().getAttribute('src'),/osmanthus/);
   await frame().locator('#xcwc-nest [data-action=dress]').click();await account().locator('.wardrobe-card').nth(7).waitFor();
   await route('profile');await account().locator('[data-go=wardrobe]').waitFor();assert.match(await account().locator('[data-go=wardrobe]').innerText(),/暂未开放/);
   await account().locator('[data-go=wardrobe]').click();await account().locator('.wardrobe-card').nth(7).waitFor();
  });
  await step('continuous edits coalesce; preview export and immediate collection use the final frame',async()=>{
   await route('photo');await frame().locator('#ck-file').setInputFiles(path.join(root,'src/checkin-assets/lake.jpg'));await frame().locator('#ck-dropzone.has-image').waitFor();
   await frame().locator('#ck-generate:enabled').waitFor();
   await frame().locator('#ck-editor').evaluate(el=>{el.open=true});await frame().locator('#ck-preview').scrollIntoViewIfNeeded();
   await frame().locator('#ck-preview').evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const immediate=await frame().locator('#ck-preview').evaluate(el=>{
    const d=el.ownerDocument,w=d.defaultView;w.__uiPaintAudit.labels=[];w.__uiPaintAudit.exports=[];
    for(let i=0;i<30;i++){const size=d.querySelector('#ck-size');size.value=12+i;size.dispatchEvent(new Event('input',{bubbles:true}));const x=d.querySelector('#ck-photoX');x.value=i;x.dispatchEvent(new Event('input',{bubbles:true}));const label=d.querySelector('#ck-location');label.value='连续编辑'+i;label.dispatchEvent(new Event('input',{bubbles:true}))}
    return w.__uiPaintAudit.labels.length;
   });assert.equal(immediate,0);
   const painted=await frame().locator('#ck-preview').evaluate(el=>new Promise(resolve=>requestAnimationFrame(()=>resolve(el.ownerDocument.defaultView.__uiPaintAudit.labels.slice()))));
   assert.deepEqual(painted,['⌖ 连续编辑29']);
   await frame().locator('#ck-preview').evaluate(el=>{const d=el.ownerDocument,label=d.querySelector('#ck-location');label.value='预览最后一帧';label.dispatchEvent(new Event('input',{bubbles:true}));d.querySelector('#ck-download').click()});
   await page.locator('#xcwc-checkin-save[open]').waitFor();await page.locator('[data-save-close]').click();
   await frame().locator('#ck-preview').evaluate(el=>{const d=el.ownerDocument,label=d.querySelector('#ck-location');label.value='收藏最后一帧';label.dispatchEvent(new Event('input',{bubbles:true}));d.querySelector('#ck-generate').click()});
   await frame().locator('#ck-albumCount').filter({hasText:'1'}).waitFor();await page.locator('#xcwc-checkin-save[open]').waitFor();
   const exports=await frame().locator('#ck-preview').evaluate(el=>el.ownerDocument.defaultView.__uiPaintAudit.exports.slice());
   assert.deepEqual(exports.slice(-2),['⌖ 预览最后一帧','⌖ 收藏最后一帧']);
   const history=await page.evaluate(()=>window.xcwcLocalAlbum.run('history',{}));assert.equal(history.items[0].label,'收藏最后一帧');await shot('final-frame-collected');await page.locator('[data-save-close]').click();
  });
  await step('edits re-enable collection immediately and survive navigation before the next paint',async()=>{
   const clicked=await frame().locator('#ck-preview').evaluate(el=>{const d=el.ownerDocument,label=d.querySelector('#ck-location');label.value='立即再次收藏';label.dispatchEvent(new Event('input',{bubbles:true}));const button=d.querySelector('#ck-generate'),enabled=!button.disabled;button.click();return enabled});
   assert.equal(clicked,true);await frame().locator('#ck-albumCount').filter({hasText:'2'}).waitFor();await page.locator('#xcwc-checkin-save[open]').waitFor();await page.locator('[data-save-close]').click();
   await frame().locator('#ck-preview').evaluate(el=>{const d=el.ownerDocument,label=d.querySelector('#ck-location');label.value='离页草稿';label.dispatchEvent(new Event('input',{bubbles:true}));const size=d.querySelector('#ck-size');size.value='47';size.dispatchEvent(new Event('input',{bubbles:true}));d.querySelector('.phone>.bottom [data-go=profile]').click()});
   await account().locator('.profile-hero').waitFor();await frame().locator('.bottom [data-go=home]').click();await frame().locator('#xcwc-nest [data-action=checkin]').click();
   await frame().locator('#ck-dropzone.has-image').waitFor();assert.equal(await frame().locator('#ck-location').inputValue(),'离页草稿');assert.equal(await frame().locator('#ck-size').inputValue(),'47');
  });
  if(name==='chromium')await step('shared navigation keeps 320/390/430 layouts without horizontal overflow',async()=>{
   const seed=await page.evaluate(()=>localStorage.getItem('xcwc.guest.v1'));
   for(const width of [320,390,430]){
    const c=await browser.newContext({viewport:{width,height:width===320?568:844},isMobile:true,hasTouch:true});await fixture(c,result);
    await c.addInitScript(({value,origin})=>{if(window===window.top&&location.origin===origin)localStorage.setItem('xcwc.guest.v1',value)},{value:seed,origin:new URL(base).origin});
    const p=await c.newPage();for(const r of ['home','city','shop','profile','flock','wardrobe','photo']){
     await p.goto(base+'/?page='+r);const f=p.frameLocator('iframe');await ready(f,r);await p.waitForLoadState('networkidle');await readyImage(f,r);
     assert.deepEqual(await f.locator('.phone>.bottom button span').allTextContents(),['小窝','城市','商城','我的']);
     const overflow=await f.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.body.scrollWidth>innerWidth);assert.equal(overflow,false,r+' '+width);
     result.layouts.push({width,route:r,horizontalOverflow:overflow});
     if(width===390||r==='wardrobe')await p.screenshot({path:path.join(out,'layout-'+width+'-'+r+'.png'),animations:'disabled'});
    }await c.close();
   }
  });
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.writes,[]);assert.deepEqual(result.unexpectedApi,[]);
 }catch(error){result.failure=error.stack;await shot('failure').catch(()=>{});throw error}
 finally{await context.close();await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n','utf8')}
}
(async()=>{for(const engine of [chromium,...(fs.existsSync(webkit.executablePath())?[webkit]:[])])await run(engine)})().catch(error=>{console.error(error);process.exitCode=1});
