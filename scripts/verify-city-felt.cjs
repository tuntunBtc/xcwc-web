// Browser-local fixtures only. No production entities, photos or API writes.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=(process.env.XCWC_PREVIEW_URL||'http://127.0.0.1:8790').replace(/\/$/,''),out=path.resolve(process.env.XCWC_CITY_REPORT_DIR||path.join(__dirname,'../output/city-felt-20261102'));
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('City fixtures are restricted to a loopback preview.');
fs.mkdirSync(out,{recursive:true});
const names=['杭州','苏州','南京','上海','西安','武汉'],ids=['hz','sz','nj','sh','xa','wh'];
const hz={id:'11111111111111111111111111111111',name:'小黄莺',active:true,typeId:'huangying',typeName:'小黄莺',cityCode:'hangzhou',cityName:'杭州',skinId:'green',skinName:'绿色'};
const hz2={...hz,id:'22222222222222222222222222222222'};
const sh={...hz,id:'33333333333333333333333333333333',cityCode:'shanghai',cityName:'上海'};
const unknown={...hz,id:'44444444444444444444444444444444',cityCode:'unknown-city',cityName:'未知城市'};
const report={passed:false,fixtureOnly:true,widths:[],engines:[],errors:[],api:[],checks:[]};
function plain(text){return text.replace(/\s+/g,'');}
async function setup(browser,width,engine){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600});
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>report.errors.push({engine,width,message:error.message}));
 let catalog=[],catalogStatus=200;
 await page.route('**/api/**',route=>{const request=route.request(),url=new URL(request.url());report.api.push({engine,width,method:request.method(),path:url.pathname});return route.fulfill({status:request.method()==='GET'&&url.pathname==='/api/checkin-catalog'?catalogStatus:404,contentType:'application/json',body:JSON.stringify(url.pathname==='/api/checkin-catalog'?catalog:{code:'FIXTURE_ONLY',message:'No production API calls in this test'})});});
 const frame=page.frameLocator('iframe'),city=frame.locator('#xcwc-city');
 async function load(){await page.goto(base+'/?page=city');await city.locator('.city-card:not(:disabled)').first().waitFor();await page.waitForLoadState('networkidle');}
 async function all(){await city.locator('.tabs [data-filter=all]').click();await city.locator('.city-card').nth(5).waitFor();}
 async function close(){await page.keyboard.press('Escape');await city.locator('#sheet').waitFor({state:'hidden'});}
 await load();return{context,page,frame,city,load,all,close,setCatalog:value=>{catalog=value;catalogStatus=200;},setCatalogFailure:()=>catalogStatus=503};
}
async function assertOrder(city,expected=names){assert.deepEqual(await city.locator('.city-name h3').allTextContents(),expected);}
async function assertLayout(page,frame,city,width){
 const value=await city.locator('#city-grid').evaluate(grid=>{const cards=[...grid.children],r=grid.getBoundingClientRect();return{columns:getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length,width:r.width,cardBounds:cards.map(card=>{const b=card.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};}),textOverflow:cards.flatMap(card=>[...card.querySelectorAll('.city-name h3,.city-name span,.city-card-body p,.card-action')]).filter(node=>node.scrollWidth>node.clientWidth+1).map(node=>node.textContent)};});
 assert.equal(value.columns,3,'all screen sizes retain confirmed three-column cards');
 assert(value.cardBounds.every(b=>b.width>0&&b.x>=-1&&b.x+b.width<=width+1),'cards stay inside the screen');assert.deepEqual(value.textOverflow,[],'card text stays within its box');
 const heroText=await city.locator('.hero').evaluate(hero=>{const rule=hero.querySelector('.hero-rule').getBoundingClientRect(),tag=hero.querySelector('.journey-tag').getBoundingClientRect();const title=hero.querySelector('h1').getBoundingClientRect(),description=hero.querySelector('.hero-description').getBoundingClientRect();return{titleBottom:title.bottom,descriptionTop:description.top,descriptionBottom:description.bottom,ruleTop:rule.top,ruleBottom:rule.bottom,tagTop:tag.top,overlap:rule.left<tag.right&&tag.left<rule.right&&rule.top<tag.bottom&&tag.top<rule.bottom};});assert.equal(heroText.overlap,false,'hero rule and journey tag do not cover each other');assert(heroText.tagTop-heroText.ruleBottom>=8,'hero rule has at least eight pixels of clearance above the rotated tag');assert(heroText.titleBottom<=heroText.descriptionTop&&heroText.descriptionBottom<=heroText.ruleTop,'hero title, description and rule stay separate');value.heroText=heroText;
 assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'frame has no horizontal overflow');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'host has no horizontal overflow');
 const nav=frame.locator('.phone>.bottom');const navBox=await nav.boundingBox();assert(navBox&&Math.abs(navBox.y+navBox.height-844)<2,'shared navigation stays at bottom');assert.equal(await nav.locator('button').count(),4);assert.equal(await nav.locator('[aria-current=page]').getAttribute('data-go'),'city');
 assert.deepEqual(await nav.locator('button span').allTextContents(),['小窝','城市','商城','我的']);
 return value;
}
async function emptyChecks(env,width){const {page,city,close}=env;assert.equal(plain(await city.locator('#progress').innerText()),'0/6');await assertOrder(city);assert.equal(await city.locator('#unlocked-count').innerText(),'0');assert.equal(await city.locator('#locked-count').innerText(),'6');
 await city.locator('.tabs [data-filter=unlocked]').click();assert.equal(await city.locator('.city-card').count(),0);assert(await city.locator('#empty').isVisible());await city.locator('#empty [data-filter=all]').click();await assertOrder(city);
 await city.locator('[data-city=sz]').click();await city.locator('#sheet[open]').waitFor();assert.match(await city.locator('#sheet-content').innerText(),/暂未开放/);assert.equal(await city.locator('.bird-row').count(),0);await close();
 await page.screenshot({path:path.join(out,`empty-${width}.png`)});
}
async function seed(env,birds){await env.page.evaluate(items=>{for(const [bird,name] of items)window.xcwcGuest.adopt(bird,name);},birds);await env.load();}
async function oneCityChecks(env,width){const {page,city,all,close}=env;
 assert.equal(plain(await city.locator('#progress').innerText()),'1/6');assert.equal(await city.locator('#unlocked-count').innerText(),'1');assert.equal(await city.locator('#locked-count').innerText(),'5');await assertOrder(city);
 const state=await page.evaluate(()=>window.xcwcGuest.snapshot());assert.equal(await city.locator('.points b').innerText(),String(state.wallet.balance));assert.equal(await city.locator('.profile strong').innerText(),state.birds.find(b=>b.id===hz.id).name);assert.match(await city.locator('.profile img').getAttribute('src'),/emotions\/happy-192\.webp$/);
 await city.locator('.tabs [data-filter=unlocked]').click();await assertOrder(city,['杭州']);await city.locator('.tabs [data-filter=locked]').click();await assertOrder(city,names.slice(1));await all();
 await city.locator('[data-city=hz]').click();await city.locator('#sheet[open]').waitFor();assert.equal(await city.locator('.bird-row').count(),2,'same-city entities remain separate in bird details');assert.match(await city.locator('#sheet-content').innerText(),/湖边叽/);assert.match(await city.locator('#sheet-content').innerText(),/叶叶/);await close();
 await page.reload();await city.locator('.city-card:not(:disabled)').first().waitFor();await page.waitForLoadState('networkidle');assert.equal(plain(await city.locator('#progress').innerText()),'1/6','progress survives reloading');await page.screenshot({path:path.join(out,`city-${width}.png`)});
 await city.locator('#city-grid').screenshot({path:path.join(out,`cards-${width}.png`)});
 if(width===390){const fullHeight=Math.ceil(await city.locator('main.phone').evaluate(el=>el.scrollHeight))+72;await page.setViewportSize({width,height:fullHeight});await env.frame.locator('.phone>main').first().evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,'city-390-full.png')});await page.setViewportSize({width,height:844});}

}
(async()=>{let browser;try{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const width of [390,320,430,1024]){const env=await setup(browser,width,'chromium');try{
 await emptyChecks(env,width);await seed(env,[[hz,'湖边叽'],[hz2,'叶叶']]);await env.page.evaluate(id=>window.xcwcGuest.select(id),hz.id);await env.load();await oneCityChecks(env,width);
 const layout=await assertLayout(env.page,env.frame,env.city,width);
 const original=await env.page.evaluate(()=>localStorage.getItem('xcwc.guest.v1'));
 await env.page.evaluate(()=>{const data=JSON.parse(localStorage.getItem('xcwc.guest.v1'));data.birds.find(b=>b.id===data.currentId).name='西湖小黄莺呀';data.balance=999999;localStorage.setItem('xcwc.guest.v1',JSON.stringify(data));});await env.load();
 const header=await env.city.locator('.topbar').evaluate(bar=>{const profile=bar.querySelector('.profile').getBoundingClientRect(),points=bar.querySelector('.points').getBoundingClientRect();return{profile:{x:profile.x,right:profile.right},points:{x:points.x,right:points.right},width:innerWidth};});
 assert(header.profile.right+1<=header.points.x&&header.profile.x>=0&&header.points.right<=width+1,'long nickname and balance never overlap');layout.longHeader=header;
 await env.page.screenshot({path:path.join(out,`long-header-${width}.png`)});await env.page.evaluate(value=>localStorage.setItem('xcwc.guest.v1',value),original);await env.load();
 report.widths.push({engine:'chromium',width,layout});
 if(width===390){
  await seed(env,[[sh,'江边叽']]);assert.equal(plain(await env.city.locator('#progress').innerText()),'2/6');await assertOrder(env.city);await env.city.locator('.tabs [data-filter=unlocked]').click();await assertOrder(env.city,['杭州','上海']);await env.all();
  await seed(env,[[unknown,'远方叽']]);assert.equal(plain(await env.city.locator('#progress').innerText()),'2/6','unknown cached cities do not inflate six-city progress');
  env.setCatalog([{key:'sz-fixture',name:'园林叽',typeId:'huangying',cityCode:'suzhou',skinId:'green'}]);await env.load();await env.city.locator('[data-city=sz]').click();await env.city.locator('#sheet[open]').waitFor();assert.match(await env.city.locator('#sheet-content').innerText(),/园林叽/);assert.match(await env.city.locator('#sheet-content').innerText(),/尚未领取/);await env.close();
  env.setCatalogFailure();await env.load();assert.equal(plain(await env.city.locator('#progress').innerText()),'2/6');assert.match(await env.city.locator('.footnote').innerText(),/暂不可用/);env.setCatalog([]);await env.load();
  const savedCache=await env.page.evaluate(()=>localStorage.getItem('xcwc.guest.v1'));await env.page.evaluate(()=>localStorage.setItem('xcwc.guest.v1','broken-json'));await env.load();assert.equal(plain(await env.city.locator('#progress').innerText()),'—/6','unreadable cache is not represented as zero collected cities');assert.equal(await env.city.locator('#unlocked-count').innerText(),'—');await env.page.evaluate(value=>localStorage.setItem('xcwc.guest.v1',value),savedCache);await env.load();
  const before=await env.page.evaluate(()=>localStorage.getItem('xcwc.guest.v1'));await env.city.locator('[data-city=wh]').click();await env.close();assert.equal(await env.page.evaluate(()=>localStorage.getItem('xcwc.guest.v1')),before,'viewing a city never grants ownership');
  await env.frame.locator('.bottom [data-go=home]').click();await env.frame.locator('#xcwc-nest').waitFor();await env.frame.locator('.bottom [data-go=city]').click();await env.city.locator('.city-card:not(:disabled)').first().waitFor();assert.equal(plain(await env.city.locator('#progress').innerText()),'2/6');
 }
 }finally{await env.context.close();}}
 report.engines.push('chromium');await browser.close();browser=null;
 if(fs.existsSync(webkit.executablePath())){browser=await webkit.launch({headless:true});const env=await setup(browser,390,'webkit');try{await emptyChecks(env,390);await seed(env,[[hz,'湖边叽'],[hz2,'叶叶']]);await env.page.evaluate(id=>window.xcwcGuest.select(id),hz.id);await env.load();await oneCityChecks(env,390);await assertLayout(env.page,env.frame,env.city,390);report.engines.push('webkit');}finally{await env.context.close();}}
 assert.deepEqual(report.errors,[]);assert(report.api.every(r=>r.method==='GET'&&r.path==='/api/checkin-catalog'),'all API traffic is public read-only fixtures');report.passed=true;report.checks=['six cities in confirmed order','0/6 and no fake ownership','three-column grid at 320/390/430/1024','hero text stays separate with at least 8px tag clearance','long nickname and large balance do not overlap','same-city entities count as one unlocked city','three filters and refresh persistence','current nickname/avatar/wallet use local state','local owned birds and unconfigured city dialog','public catalog rows use provided data','viewing a city does not adopt or reward','unknown cached cities excluded from progress','catalog outage preserves local state and unreadable cache stays unknown','shared four-tab navigation and no horizontal overflow'];console.log(JSON.stringify({passed:true,engines:report.engines,widths:report.widths.map(x=>x.width),checks:report.checks},null,2));
}catch(error){report.error=error.stack;console.error(error);process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2)+'\n','utf8');if(browser)await browser.close();}})();
