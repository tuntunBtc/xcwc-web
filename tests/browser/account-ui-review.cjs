// Current-source UI regressions. All documents/assets/API responses are intercepted locally.
// No preview server, build output, real account, or remote write is used.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),origin='https://xcwc-ui-review.invalid';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const inline=code=>'<script>'+code.replace(/<\/script/gi,'<\\/script')+'</script>';
const css=paths=>'<style>'+paths.map(read).join('\n').replaceAll('__XCWC_ASSET_ORIGIN__',origin)+'</style>';
const bird={id:'a'.repeat(32),active:true,name:'湖小叽',cityName:'杭州',cityCode:'hangzhou',typeId:'hy',skinId:'green'};
const shell=(body,scripts,styles='')=>'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0">'+styles+body+inline(scripts.replaceAll('__XCWC_ASSET_ORIGIN__',origin))+'</body></html>';
function accountDocument(params){
 const page=params.get('page')||'profile',empty=params.has('empty');
 const fixture={page,account:'本机体验',localMode:true,birds:empty?[]:[bird,{...bird,id:'b'.repeat(32),name:'小团子'}],currentId:empty?null:bird.id,wallet:{balance:5,earnedToday:0,dailyLimit:10}};
 const helpers=`const content=document.querySelector('main'),root=document.getElementById('bjd-review'),s={page:${JSON.stringify(page)}};let pageCleanup=null;const liveAccount=${JSON.stringify(fixture)};window.uiCalls=[];window.fixture=liveAccount;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ownedCurrent=()=>liveAccount.birds.find(b=>b.id===liveAccount.currentId)||null;
 const birdArt=(bird,usage)=>${JSON.stringify(origin+'/assets/nest/felt/emotions/happy-192.webp')};
 const refreshAccount=async()=>liveAccount;const nav=page=>{window.lastNav=page};const pageNotice=message=>{window.lastNotice=message};
 const openPageDialog=async dialog=>{dialog.style.top='24px';dialog.style.maxHeight='calc(100dvh - 48px)';if(!dialog.open)dialog.showModal()};
 const accountRpc=async(op,args)=>{window.uiCalls.push({op,args});if(op==='wallet'){if(window.walletFail){window.walletFail=false;throw Error('测试读取失败')}return liveAccount.wallet}if(op==='ledger')return liveAccount.birds.length?[{operation:'WELCOME',delta:5,balanceAfter:5,createdAt:'2026-11-03T01:02:03Z'}]:[];if(op==='wardrobe')return {skins:WARDROBE_SKINS.map(s=>({...s,owned:false})),outfits:[]};if(op==='selectBird'){liveAccount.currentId=args.birdId;return}throw Error('Unexpected operation '+op)};`;
 return shell('<div id="bjd-review" class="is-integrated"><div class="phone"><main></main><nav class="bottom" style="height:72px"></nav></div></div>',read('src/wardrobe-catalog.mjs').replaceAll('export ','')+'\n'+read('src/media-lazy.js')+'\n'+helpers+'\n'+read('src/account-pages.js')+'\ncontent.innerHTML=accountPage();mountAccountPage();',css(['src/account-pages.css','src/account-felt.css','src/wardrobe-felt.css']));
}
function adoptionDocument(params){
 const owned=params.has('owned');
 const helpers=`const content=document.querySelector('main');let pageCleanup=null;const liveAccount={currentId:null};window.uiCalls=[];let publicFails=${params.has('fail')?1:0};
 const mountIsolated=(id,css,template)=>{const shadow=document.getElementById(id).attachShadow({mode:'open'});shadow.innerHTML='<style>'+css+'</style>'+template;return shadow};
 const openPageDialog=async dialog=>dialog.showModal();const installDialogClose=()=>{};const nav=page=>{window.lastNav=page};
 const accountRpc=async(op,args)=>{window.uiCalls.push({op,args});if(op==='adoptionContext')return {code:${JSON.stringify(bird.id)},lookupSupported:true};if(op==='identity')return {account:'本机体验',localMode:true};if(op==='adoptionPublic'){if(publicFails-->0)throw Error('测试网络断开');return ${JSON.stringify(bird)}};if(op==='adoptionMine')return ${JSON.stringify(owned?[bird]:[])};if(op==='selectBird')return;throw Error('Unexpected operation '+op)};
 const adoptionV1Css=${JSON.stringify(read('src/adopt/v1/adopt.css'))},adoptionV1Template=${JSON.stringify(read('src/adopt/v1/template.html'))};`;
 return shell('<main><section id="xcwc-adopt"></section></main>',read('src/adopt/entry.mjs').replaceAll('export ','')+'\n'+helpers+'\n'+read('src/adopt/v1/adopt.js')+'\nadoptionV1Draft.code='+JSON.stringify(bird.id)+';adoptionV1Draft.nickname="草稿团子";mountAdoptionV1();');
}
function legacyDocument(params){
 let doc=read('src/account/register.html').replace(/<link[^>]+>/g,'').replace(/<script[\s\S]*?<\/script>/g,'');
 const session=params.has('signed')?{username:'fixture_user',token:'c'.repeat(64),expiresAt:'2099-01-01T00:00:00Z'}:null;
 const helpers=`window.fakeSession=${JSON.stringify(session)};window.xcwcSession={read:()=>window.fakeSession,write:value=>window.fakeSession=value,clear:()=>window.fakeSession=null};`;
 const scripts=helpers+read('src/account/points.js').replace('export function createPoints','function createPoints')+'\n;(async()=>{'+read('src/account/registration.js').replace(/^import .*;\n/gm,'')+'})().catch(error=>{window.sourceError=error.message});';
 return doc.replace('</head>',css(['src/account/registration.css'])+'</head>').replace('</body>',inline(scripts)+'</body>');
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[],requests=[];
 try{
  const context=await browser.newContext({viewport:{width:320,height:568},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin,'all requests stay in local interception');
   if(url.pathname.startsWith('/assets/')){const file=path.join(root,url.pathname);return route.fulfill({path:file})}
   if(url.pathname.startsWith('/api/')){
    requests.push({path:url.pathname,method:request.method(),body:request.postDataJSON()});
    let data={};if(url.pathname==='/api/me/birds')data=[];else if(url.pathname==='/api/me/points')data={balance:100,earnedToday:0,dailyLimit:10};else if(url.pathname==='/api/skins')data=[{id:'lake_glow',name:'湖蓝光晕',price:30,owned:false}];else if(url.pathname==='/api/me/outfits'||url.pathname==='/api/me/points/ledger')data=[];else if(url.pathname.endsWith('/redeem'))data={replayed:false,entry:{delta:-30}};else if(url.pathname.includes('/birds/'))data=bird;else if(url.pathname.includes('/auth/'))data={token:'d'.repeat(64),username:'fixture_user',expiresAt:'2099-01-01T00:00:00Z'};else throw Error('Unexpected intercepted API '+url.pathname);
    return route.fulfill({json:data});
   }
   const html=url.pathname==='/adopt'?adoptionDocument(url.searchParams):url.pathname==='/account.html'?legacyDocument(url.searchParams):accountDocument(url.searchParams);return route.fulfill({contentType:'text/html',body:html});
  });
  await page.goto(origin+'/?page=profile');await page.locator('.profile-card').waitFor();
  assert.match(await page.locator('[data-account-action=clear-cache]').innerText(),/重置本机数据.*删除小鸟与相册/s);
  assert.equal(await page.locator('.profile-hero .account-local-badge summary').evaluate(e=>getComputedStyle(e).fontSize),'13px');
  await page.locator('.profile-points').click();await page.locator('.account-wallet-dialog[open]').waitFor();
  assert.match(await page.locator('[data-wallet-content]').innerText(),/09:02:03/);assert.equal(await page.locator('.wallet-rules').getAttribute('open'),null);
  await page.locator('[data-account-action=close-wallet]').click();assert.equal(await page.locator('.account-wallet-dialog').evaluate(e=>e.open),false);
  await page.evaluate(()=>window.walletFail=true);await page.locator('.profile-points').click();await page.getByText('测试读取失败',{exact:true}).waitFor();await page.locator('.account-wallet-dialog [data-account-action=wallet]').click();await page.locator('.wallet-ledger').waitFor();await page.keyboard.press('Escape');
  await page.goto(origin+'/?page=profile&empty');await page.locator('.profile-points').click();await page.locator('.wallet-empty').waitFor();
  await page.goto(origin+'/?page=flock');await page.locator('.flock-grid button').first().waitFor();assert.equal(await page.locator('.flock-grid [aria-pressed=true]').count(),1);assert.match(await page.locator('.flock-grid [aria-pressed=true]').innerText(),/当前陪伴/);assert.match(await page.locator('.flock-grid [aria-pressed=false]').innerText(),/切换到这只/);assert.equal(await page.locator('[data-go=back]').count(),1);
  await page.goto(origin+'/?page=wardrobe');await page.locator('#account-bird').waitFor();assert.match(await page.locator('[data-skin=huangying_osmanthus]').innerText(),/还差 25 叽分/);
  const last=page.locator('[data-preview-skin=huangying_pilgrim]');await last.scrollIntoViewIfNeeded();const before=await page.locator('main').evaluate(e=>e.scrollTop);await last.click();await page.locator('[data-account-action=return-preview]').click();assert(Math.abs(await page.locator('main').evaluate(e=>e.scrollTop)-before)<3,'preview returns to outfit position');
  await page.goto(origin+'/?page=wardrobe&empty');await page.locator('.wardrobe-empty-status').waitFor();assert.equal(await page.locator('.wardrobe-basic').count(),0);assert.doesNotMatch(await page.locator('.wardrobe-look').innerText(),/当前穿戴/);
  for(const route of ['profile','flock','wardrobe']){await page.goto(origin+'/?page='+route);await page.locator('.account-page-head').waitFor();assert.equal(await page.locator('html').evaluate(e=>e.scrollWidth>innerWidth),false,'narrow account fit '+route)}
  await page.goto(origin+'/adopt?fail');const adoption=page.locator('.adopt-v1');await adoption.locator('[data-action=retry]').waitFor();assert.equal(await adoption.locator('#adopt-v1-name').isDisabled(),true);await adoption.locator('[data-action=retry]').click();await adoption.locator('[data-role=identity-state]').filter({hasText:'公开资料已读取'}).waitFor();assert.equal(await adoption.locator('#adopt-v1-name').inputValue(),'草稿团子');assert.equal(await adoption.locator('.trait-row').count(),0);assert.equal((await page.evaluate(()=>window.uiCalls.filter(x=>x.op==='adoptionPublic'))).length,2);assert.equal((await page.evaluate(()=>window.uiCalls.filter(x=>x.op==='adoptionConfirm'))).length,0);
  await page.goto(origin+'/adopt?owned');await adoption.locator('[data-action=confirm]').filter({hasText:'回小窝'}).waitFor();assert.equal(await adoption.locator('#adopt-v1-name').getAttribute('readonly'),'');assert.equal(await adoption.locator('[data-action=random]').isVisible(),false);assert.equal(await adoption.locator('.back').evaluate(e=>e.getBoundingClientRect().width>=44&&e.getBoundingClientRect().height>=44),true);
  await page.goto(origin+'/account.html');await page.locator('[data-auth-mode=register]').click();assert.equal(await page.locator('#password').getAttribute('autocomplete'),'new-password');await page.locator('#toggle-password').click();assert.equal(await page.locator('#password').getAttribute('type'),'text');assert.equal(await page.locator('#confirm-password').isVisible(),true);await page.locator('[data-auth-mode=login]').click();assert.equal(await page.locator('#password').getAttribute('autocomplete'),'current-password');assert.equal(await page.locator('#confirm-password').isVisible(),false);
  await page.goto(origin+'/account.html?signed&bird='+bird.id);await page.locator('#claim-panel').waitFor();await page.locator('#bird-name').fill('云小叽');await page.locator('#claim-form button').click();await page.locator('#notice').filter({hasText:'登记成功'}).waitFor();const claim=requests.find(r=>r.path.endsWith('/claim'));assert.deepEqual(claim.body,{name:'云小叽'});
  const redeem=page.locator('[data-points-action=redeem]');await redeem.click();await page.locator('#cloud-redeem-dialog[open]').waitFor();await page.locator('#cloud-redeem-dialog [value=cancel]').click();assert.equal(requests.filter(r=>r.path.endsWith('/redeem')).length,0,'cancel never submits redemption');await redeem.click();await page.locator('#cloud-redeem-dialog [value=confirm]').click();await page.locator('#notice').filter({hasText:'兑换成功'}).waitFor();assert.equal(requests.filter(r=>r.path.endsWith('/redeem')).length,1,'confirm submits exactly one mocked redemption');
  assert.equal(await page.evaluate(()=>window.sourceError||null),null);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:['wallet timestamps/close/empty/retry/folded rules','explicit local reset label','local data badge readable','current flock marker and back control','insufficient point gap','preview returns to scroll position','empty wardrobe no fake worn state','320px account layouts','adoption retry preserves draft without claim','owned nickname readonly and random hidden','trait placeholders removed','44px adoption back','login/register autofill and visibility','claim sends only contract name','cloud redemption cancel sends no request'],interceptedOnly:true}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
