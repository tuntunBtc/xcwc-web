// Count actual all-frame static requests at the local server; never infer network use from loading=lazy alone.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),staticRoot=path.resolve(process.env.XCWC_STATIC_ROOT||path.join(root,'dist'));
const upstream=process.env.API_TARGET||'http://127.0.0.1:18093',label=process.env.XCWC_LAZY_LABEL||'before',code=process.env.XCWC_TEST_BIRD_CODE;
if(!/^[a-zA-Z0-9_-]{1,80}$/.test(label))throw Error('Invalid lazy audit label');
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(upstream)||!code)throw Error('Only an explicit local backend plus actual test bird code is allowed');
const output=path.join(root,'output/full-audit/lazy-images',label);fs.mkdirSync(output,{recursive:true});
const report={label,staticRoot,upstream,scope:'390x844; cold independent Chromium processes; localhost server counts completed media responses from every frame. Not 4G, wire-byte or LCP proof.',interpretation:'An offscreen node whose URL was requested may share that URL with a visible image or CSS background; count unique HTTP paths/bytes and inspect currentSrc/data attributes before attributing extra downloads. Album image reads count local Blob retrieval, not network traffic.',cases:[],errors:[]};
const logs=[];let phase='bootstrap';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.json':'application/json','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  if(request.method!=='GET'){response.writeHead(405).end();return}
  const proxy=http.request(new URL(request.url,upstream),{headers:{...request.headers,host:new URL(upstream).host}},res=>{response.writeHead(res.statusCode,res.headers);res.pipe(response)});proxy.on('error',()=>response.writeHead(502).end());request.pipe(proxy);return;
 }
 const file=path.resolve(staticRoot,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 if(!file.startsWith(staticRoot+path.sep)){response.writeHead(403).end();return}
 fs.readFile(file,(error,data)=>{if(error){response.writeHead(404).end();logs.push({phase,path:url.pathname,status:404});return}const entry={phase,path:url.pathname,bytes:data.length,status:200,finished:false};logs.push(entry);response.on('finish',()=>entry.finished=true);response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});response.end(data)});
});
async function imageSnapshot(frame){return frame.locator('body').evaluate(()=>{
 const images=[];
 function visit(root){for(const node of root.querySelectorAll('*')){if(node instanceof HTMLImageElement){const r=node.getBoundingClientRect();let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};let parent=node.parentElement;while(parent){const style=getComputedStyle(parent);if(/auto|scroll|hidden|clip/.test(style.overflow+style.overflowX+style.overflowY)){const p=parent.getBoundingClientRect();clip={left:Math.max(clip.left,p.left),top:Math.max(clip.top,p.top),right:Math.min(clip.right,p.right),bottom:Math.min(clip.bottom,p.bottom)}}parent=parent.parentElement||(parent.getRootNode() instanceof ShadowRoot?parent.getRootNode().host:null)}images.push({alt:node.alt,src:node.getAttribute('src'),currentSrc:node.currentSrc,loading:node.loading,data:{...node.dataset},width:node.naturalWidth,height:node.naturalHeight,complete:node.complete,rect:{x:r.x,y:r.y,width:r.width,height:r.height},visible:r.width>0&&r.height>0&&r.right>clip.left&&r.left<clip.right&&r.bottom>clip.top&&r.top<clip.bottom})}if(node.shadowRoot)visit(node.shadowRoot)}}visit(document);return images;
})}
async function captureRoute(base,name,route,selector,{album=false,shop=false}={}){
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',locale:'zh-CN'});const page=await context.newPage();page.setDefaultTimeout(12000);
 page.on('pageerror',e=>report.errors.push({case:name,message:e.message}));
 await context.addInitScript(()=>{
  if(window!==window.top)return;window.__auditAlbumReads=[];
  window.__auditAlbumFullRecordBytes=0;
  const getAll=IDBObjectStore.prototype.getAll;
  IDBObjectStore.prototype.getAll=function(...args){
   const request=getAll.apply(this,args);
   if(this.name==='works'&&this.transaction.db.name==='xcwc.guest.album.v1')request.addEventListener('success',()=>{
    for(const row of request.result||[])window.__auditAlbumFullRecordBytes+=(row.original?.byteLength||row.original?.size||0)+(row.image?.byteLength||row.image?.size||0);
   });
   return request;
  };
  Object.defineProperty(window,'xcwcLocalAlbum',{configurable:true,set(value){
   const run=value.run;value.run=function(operation,args){if(operation==='image')window.__auditAlbumReads.push(args.id);return run.call(this,operation,args)};
   Object.defineProperty(window,'xcwcLocalAlbum',{configurable:true,writable:true,value});
  }});
 });
 try{
  if(album){phase=name+':fixture';await page.goto(base+'/?page=home');await page.waitForFunction(()=>!!window.xcwcGuest&&!!window.xcwcLocalAlbum);const bird=await (await context.request.get(base+'/api/birds/by-code/'+code)).json();await page.evaluate(async bird=>{window.xcwcGuest.adopt(bird,'懒加载啾');const canvas=document.createElement('canvas');canvas.width=canvas.height=120;canvas.getContext('2d').fillRect(0,0,120,120);const image=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));for(let i=0;i<10;i++)await window.xcwcLocalAlbum.run('create',{metadata:{requestId:'lazy-audit-'+String(i).padStart(16,'0'),birdIds:[bird.id],styleId:'natural',label:'相册测试'+i},original:image,image})},bird)}
  phase=name+':initial';const start=logs.length;await page.goto(base+route,{waitUntil:'domcontentloaded'});const frame=page.frameLocator('iframe');await frame.locator(selector).waitFor();if(shop)await frame.locator('#xcwc-shop .card').nth(14).waitFor();if(name==='wardrobe')await frame.locator('.wardrobe-card').nth(7).waitFor();if(album)await frame.locator('.memory').nth(9).waitFor({state:'attached'});await page.waitForTimeout(1300);
  const initial=await imageSnapshot(frame),initialLogs=logs.slice(start).filter(e=>e.path.startsWith('/assets/'));
  const record={name,initial:{images:initial,serverRequests:initialLogs,albumImageReads:await page.evaluate(()=>window.__auditAlbumReads),albumFullRecordBytes:await page.evaluate(()=>window.__auditAlbumFullRecordBytes)},scroll:[],errors:[]};report.cases.push(record);
  await page.screenshot({path:path.join(output,name+'-initial.png'),animations:'disabled'});
  // Every gallery/card thumbnail must decode after its own scroll into view.
  const images=frame.locator(selector).locator('img');
  phase=name+':scroll';if(album){await frame.locator('#ck-album').scrollIntoViewIfNeeded();await frame.locator('#ck-viewAll').click()}for(let i=0;i<await images.count();i++){const image=images.nth(i);if(!await image.isVisible())continue;await image.scrollIntoViewIfNeeded();await image.evaluate(im=>im.complete&&im.naturalWidth?null:new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Image did not load on scroll: '+im.getAttribute('src'))),8000);im.addEventListener('load',()=>{clearTimeout(timeout);resolve()},{once:true});im.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('Image failed'))},{once:true})}));}
  record.scroll={images:await imageSnapshot(frame),serverRequests:logs.slice(start).filter(e=>e.phase===name+':scroll'&&e.path.startsWith('/assets/')),albumImageReads:await page.evaluate(()=>window.__auditAlbumReads)};
  await frame.locator('.phone>main').first().evaluate(el=>el.scrollTop=0);await page.waitForTimeout(150);
  record.loadedGeometry=await frame.locator(selector).evaluate(host=>{
   const scope=host.shadowRoot||host,round=n=>Math.round(n*10)/10;
   return [...scope.querySelectorAll('button,input,select,img,h1,h2,canvas')].filter(el=>!el.closest('details:not([open])')).map(el=>{const r=el.getBoundingClientRect();return{tag:el.tagName,id:el.id,alt:el.alt||'',text:el.tagName==='BUTTON'?(el.textContent||'').trim().slice(0,50):'',x:round(r.x),y:round(r.y),width:round(r.width),height:round(r.height)}}).filter(row=>row.width&&row.height);
  });
  await page.screenshot({path:path.join(output,name+'-loaded.png'),animations:'disabled'});
  if(shop){phase=name+':detail';const before=logs.length;await frame.locator('#xcwc-shop .photo-button').first().click();await frame.locator('#xcwc-shop .detail-image img').evaluate(im=>im.complete&&im.naturalWidth?null:new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=reject}));await page.waitForTimeout(100);record.detailRequests=logs.slice(before).filter(e=>e.path.startsWith('/assets/'));assert(!initialLogs.some(e=>e.path.includes('detail-optimized.webp')),'Full product detail must not preload in list')}
  const requested=new Set(initialLogs.map(e=>e.path));record.initial.visibleImages=initial.filter(im=>im.visible).length;record.initial.offscreenImages=initial.filter(im=>!im.visible).length;record.initial.requestedOffscreen=initial.filter(im=>!im.visible&&im.currentSrc&&requested.has(new URL(im.currentSrc).pathname)).map(im=>({alt:im.alt,path:new URL(im.currentSrc).pathname,y:im.rect.y}));
  console.log(name,'initial HTTP media',initialLogs.length,'visible/offscreen images',record.initial.visibleImages,record.initial.offscreenImages,'offscreen requested',record.initial.requestedOffscreen.length,'album reads',record.initial.albumImageReads.length);
 }catch(error){report.errors.push({case:name,message:error.stack});console.log('FAIL',name,error.message)}finally{await context.close();await browser.close()}
}
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;try{await captureRoute(base,'shop','/?page=shop','#xcwc-shop',{shop:true});await captureRoute(base,'wardrobe','/?page=wardrobe','#xcwc-account-page');await captureRoute(base,'photo','/?page=photo','.checkin-page',{album:true});await captureRoute(base,'nest','/?page=home','#xcwc-nest');await captureRoute(base,'city','/?page=city','#xcwc-city');await captureRoute(base,'adopt','/register.html?birdCode='+code,'#xcwc-adopt');report.passed=!report.errors.length;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');console.log(JSON.stringify({passed:report.passed,output,errors:report.errors},null,2));if(!report.passed)process.exitCode=1}finally{server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
