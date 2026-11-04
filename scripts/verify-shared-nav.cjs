// All browser contexts and API fixtures are disposable; no backend mutations.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=(process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8920').replace(/\/$/,'');
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local preview URL required');
const out=path.resolve(__dirname,'../output/navigation-plush'),widths=[320,375,390,430],height=844;
const sections=['home','city','shop','profile'],routes=[...sections,'adopt','photo','wardrobe','flock'];
const labels=['小窝','城市','商城','我的'],navSelector='.phone>.bottom';
const bird={id:'f'.repeat(32),birdCode:'HZ-HY-999999999999999999',name:'导航验收鸟',cityCode:'hangzhou',cityName:'杭州',typeId:'hy',typeName:'小黄莺',skinId:'default',skinName:'默认',active:true};
const report={schemaVersion:1,base,widths,routes,scope:'Isolated Chromium contexts. All API calls use fictional fixtures; seeded birds are disposable browser-only data. No production or physical-device claim.',checks:[],records:[],interactions:[],screenshots:[],apiCalls:[],errors:[],assetFailures:[],passed:false};
fs.mkdirSync(out,{recursive:true});
const near=(a,b,message,tolerance=1)=>assert(Math.abs(a-b)<=tolerance,message+': '+a+' vs '+b);
const activeFor=route=>sections.includes(route)?route:'home';
const routeUrl=route=>route==='adopt'?'/register.html?birdCode='+bird.birdCode:'/?page='+route;
async function newCase(browser,width,name){
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce',locale:'zh-CN',timezoneId:'Asia/Shanghai'});
 await context.route('**/api/**',async route=>{
  const request=route.request(),endpoint=new URL(request.url()).pathname;report.apiCalls.push({name,endpoint,method:request.method()});let status=200,json=[];
  if(!['GET','HEAD'].includes(request.method())){status=405;json={code:'FIXTURE_READ_ONLY',message:'导航验收仅允许读取'}}
  else if(endpoint==='/api/shop/products')json={items:[],total:0,cities:[],page:1,pageSize:20};
  else if(endpoint==='/api/shop/banners')json={items:[]};
  else if(endpoint==='/api/birds/by-code/'+bird.birdCode||endpoint==='/api/birds/'+bird.id)json=bird;
  else if(!['/api/me/birds','/api/bird-types','/api/birds'].includes(endpoint)){status=404;json={code:'FIXTURE_EMPTY',message:'导航验收隔离空数据'}}
  await route.fulfill({status,json});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',error=>report.errors.push({name,message:error.message}));
 page.on('response',response=>{if(response.status()>=400&&/\/assets\/.*(?:navigation|nav-)/.test(response.url()))report.assetFailures.push({name,url:response.url(),status:response.status()})});
 return{context,page,frame:page.frameLocator('iframe'),width,name};
}
async function ready(c,route){
 await c.frame.locator('#bjd-review[data-xcwc-page="'+route+'"]').waitFor();
 await c.frame.locator('.phone>main:not([aria-busy="true"])').waitFor();
 const selectors={home:'#xcwc-nest #name',city:'#xcwc-city .city-card',shop:'#xcwc-shop #products[aria-busy="false"]',profile:'#xcwc-account-page h1',adopt:'#xcwc-adopt',photo:'.checkin-page',wardrobe:'#xcwc-account-page h1',flock:'#xcwc-account-page h1'};
 await c.frame.locator(selectors[route]).first().waitFor({state:route==='shop'?'attached':'visible'});
 if(route==='photo')await c.frame.locator('#ck-retryData:not([disabled])').waitFor({state:'attached'});
 const nav=c.frame.locator(navSelector);await nav.locator('img.navigation-icon').nth(3).waitFor();
 await nav.evaluate(async element=>{await Promise.all([...element.querySelectorAll('img.navigation-icon')].map(image=>image.decode()));await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))});
 assert.equal(await nav.count(),1,'one shared navigation');assert.equal(await nav.locator('button').count(),4,'four navigation columns');
}
async function open(c,route){await c.page.goto(base+routeUrl(route),{waitUntil:'domcontentloaded'});await ready(c,route)}
async function measure(c,route,phase='direct'){
 const r=await c.frame.locator(navSelector).evaluate(async element=>{
  const pick=(style,names)=>Object.fromEntries(names.map(name=>[name,style[name]]));
  const nav=getComputedStyle(element),before=getComputedStyle(element,'::before'),match=before.backgroundImage.match(/url\(["']?(.*?)["']?\)/);let background=null;
  if(match){const image=new Image();image.src=match[1];await image.decode();background={src:image.src,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,size:before.backgroundSize,width:parseFloat(before.width),height:parseFloat(before.height),position:before.backgroundPosition}}
  const buttons=[...element.querySelectorAll('button')].map(button=>{
   const image=button.querySelector('img.navigation-icon'),label=button.querySelector('span'),style=getComputedStyle(button),rect=button.getBoundingClientRect();
   const points=[[rect.x+rect.width/2,rect.y+rect.height/2],[rect.x+3,rect.y+3],[rect.right-3,rect.bottom-3],[rect.x+rect.width/2,rect.bottom-3]];
   return{route:button.dataset.go,text:label?.textContent||'',current:button.getAttribute('aria-current'),active:button.classList.contains('active'),rect:rect.toJSON(),style:pick(style,['display','height','minHeight','paddingTop','paddingRight','paddingBottom','paddingLeft','fontFamily','fontSize','fontWeight','color','gap','borderRadius']),labelColor:getComputedStyle(label).color,image:{src:image.currentSrc||image.src,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,rect:image.getBoundingClientRect().toJSON(),objectFit:getComputedStyle(image).objectFit},allPointsHit:points.every(([x,y])=>button.contains(document.elementFromPoint(x,y)))};
  });
  return{nav:pick(nav,['display','height','minHeight','paddingTop','paddingRight','paddingBottom','paddingLeft','backgroundColor','borderTopColor','borderRadius','gap']),background,buttons,rect:element.getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth||document.body.scrollWidth>innerWidth,phoneWidth:element.parentElement.getBoundingClientRect().width,svgCount:element.querySelectorAll('svg').length};
 });
 Object.assign(r,{width:c.width,route,phase});report.records.push(r);
 assert.equal(r.overflow,false,c.width+' '+route+': no horizontal overflow');assert.equal(r.svgCount,0,'images replace line icons');assert.notEqual(r.nav.display,'none');
 near(r.rect.bottom,height,'bar at viewport bottom');near(r.rect.width,r.phoneWidth,'bar shares page width');
 assert.deepEqual(r.buttons.map(b=>b.route),sections);assert.deepEqual(r.buttons.map(b=>b.text),labels);
 assert.equal(r.buttons.filter(b=>b.active).length,1);assert.equal(r.buttons.filter(b=>b.current==='page').length,1);
 const active=r.buttons.find(b=>b.active);assert.equal(active.route,activeFor(route));assert.equal(active.current,'page');
 for(const b of r.buttons){
  near(b.rect.width,r.buttons[0].rect.width,'four equal columns',0.1);near(b.rect.top,r.buttons[0].rect.top,'column top alignment',0.1);near(b.rect.height,r.buttons[0].rect.height,'column height alignment',0.1);
  assert(b.rect.height>=44,'minimum 44px touch target');assert(b.allPointsHit,route+'/'+b.route+': column blank edges clickable');
  assert.match(b.image.src,new RegExp('/nav-'+b.route+'-'+(b.active?'active':'default')+'(?:\\.[a-f0-9]{12})?\\.webp$'));
  assert(b.image.naturalWidth>0&&b.image.naturalHeight>0,'icon decoded');near(b.image.rect.width/b.image.rect.height,b.image.naturalWidth/b.image.naturalHeight,'icon keeps aspect ratio',0.02);assert.equal(b.image.objectFit,'contain');
  assert.equal(b.labelColor,b.active?'rgb(78, 140, 76)':'rgb(128, 80, 44)','confirmed selected/default text color');if(!b.active)assert.equal(b.current,null);
 }
 assert(r.background,'decoded background');assert.match(r.background.src,/\/nav-background(?:\.[a-f0-9]{12})?\.webp$/);
 const bg=r.background;assert.equal(bg.naturalWidth,960);assert.equal(bg.naturalHeight,195);assert.equal(bg.size,'contain');near(bg.width/bg.height,960/195,'background box keeps artwork ratio',0.04);
 return r;
}
function sameAppearance(actual,expected){
 assert.deepEqual(actual.nav,expected.nav,actual.width+'/'+actual.route+': shared bar style');assert.deepEqual(actual.background,expected.background,actual.route+': shared background');
 const selected=r=>r.buttons.find(b=>b.active);assert.deepEqual(selected(actual).style,selected(expected).style,actual.route+': selected column style');
 for(const b of actual.buttons){near(b.image.rect.width,selected(expected).image.rect.width,'shared icon width',0.1);near(b.image.rect.height,selected(expected).image.rect.height,'shared icon height',0.1)}
}
async function screenshot(c,filename,navOnly=false){const target=navOnly?c.frame.locator(navSelector):c.page;await target.screenshot({path:path.join(out,filename),animations:'disabled',...(navOnly?{}:{fullPage:true})});report.screenshots.push(filename)}
async function clickTo(c,destination,target='icon'){
 const button=c.frame.locator(navSelector+' [data-go="'+destination+'"]');
 if(target==='icon'||target==='text'){
  // Artwork is decorative (pointer-events:none); click its real screen position.
  const area=await button.locator(target==='icon'?'img.navigation-icon':'span').boundingBox();assert(area);await c.page.mouse.click(area.x+area.width/2,area.y+area.height/2);
 }
 else{const rect=await button.boundingBox();assert(rect);await button.click({position:target==='upper-blank'?{x:3,y:3}:{x:rect.width-3,y:rect.height-3}})}
 await ready(c,destination);assert.equal(new URL(c.page.url()).searchParams.get('page'),destination,target+' changes route');report.interactions.push({width:c.width,destination,target,passed:true});
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});let current;
 try{
  for(const width of widths){
   let baseline;
   for(const route of routes){
    current=await newCase(browser,width,route+'-'+width);
    try{
     await open(current,route);const record=await measure(current,route);if(!baseline)baseline=record;else sameAppearance(record,baseline);
     if(sections.includes(route)){await current.page.reload({waitUntil:'domcontentloaded'});await ready(current,route);sameAppearance(await measure(current,route,'refresh'),baseline)}
     if(width===390)await screenshot(current,route+'-390.png');if(route==='home')await screenshot(current,'navigation-'+width+'.png',true);
     if(route==='photo'){
      await current.frame.locator('.phone>main').evaluate(element=>{element.scrollTop=element.scrollHeight});near(await current.frame.locator(navSelector).evaluate(element=>element.getBoundingClientRect().bottom),height,'photo scroll keeps bar visible');
      for(const next of sections){await clickTo(current,next);sameAppearance(await measure(current,next,'after-photo'),baseline)}
     }
    }catch(error){await screenshot(current,'failure-'+route+'-'+width+'.png').catch(()=>{});throw error}finally{await current.context.close();current=null}
   }
   report.checks.push({name:'All 8 routes, 4 refreshes and photo-to-main transitions at '+width+'px',passed:true});
   current=await newCase(browser,width,'interactions-'+width);
   try{
    await open(current,'home');
    for(const target of ['icon','text','upper-blank','lower-blank'])for(const destination of ['city','shop','profile','home']){await clickTo(current,destination,target);await measure(current,destination,target)}
    for(const [destination,key]of [['city','Enter'],['shop','Space']]){const button=current.frame.locator(navSelector+' [data-go="'+destination+'"]');await button.focus();await button.press(key);await ready(current,destination);assert.equal(new URL(current.page.url()).searchParams.get('page'),destination);report.interactions.push({width,destination,key,passed:true})}
    await current.frame.locator(navSelector+' [data-go="home"]').focus();await current.page.keyboard.press('Tab');assert.equal(await current.frame.locator(navSelector+' [data-go="city"]').evaluate(button=>button===document.activeElement),true,'Tab navigation order');
    await clickTo(current,'profile');await current.page.goBack();await ready(current,'shop');await measure(current,'shop','back');await current.page.goBack();await ready(current,'city');await measure(current,'city','back');await current.page.goForward();await ready(current,'shop');await measure(current,'shop','forward');await current.page.reload({waitUntil:'domcontentloaded'});await ready(current,'shop');await measure(current,'shop','history-refresh');
    report.checks.push({name:'Icon/text/blank clicks, Enter/Space/Tab and browser history at '+width+'px',passed:true});
    await current.page.waitForFunction(()=>!!window.xcwcGuest);await current.page.evaluate(bird=>window.xcwcGuest.adopt(bird,'导航小叽'),bird);await open(current,'home');await current.frame.locator('#xcwc-nest #name').filter({hasText:'导航小叽'}).waitFor();await current.frame.locator('#xcwc-nest .actor img[data-emotion]').evaluate(image=>image.decode());await screenshot(current,'home-seeded-'+width+'.png');
   }catch(error){await screenshot(current,'failure-interactions-'+width+'.png').catch(()=>{});throw error}finally{await current.context.close();current=null}
   console.log('PASS: navigation routes, hit areas and history at '+width+'px');
  }
  assert.deepEqual(report.errors,[],'no unhandled browser errors');assert.deepEqual(report.assetFailures,[],'no missing navigation artwork');assert(report.apiCalls.every(call=>['GET','HEAD'].includes(call.method)),'no backend mutation attempted');report.passed=true;
 }catch(error){report.error=error.stack;throw error}finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,records:report.records.length,interactions:report.interactions.length,output:out,error:report.error},null,2))}
})().catch(error=>{console.error(error);process.exitCode=1});
