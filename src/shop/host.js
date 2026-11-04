(()=>{const style=document.createElement('style');style.textContent='.xcwc-shop-view body{padding:0!important;margin:0!important;overflow:hidden}.xcwc-shop-view #codex-visualization{height:100dvh!important;min-height:0!important;max-width:100%;display:block;margin:auto}';document.head.append(style);const frame=document.getElementById('codex-visualization');window.addEventListener('message',event=>{const m=event.data;if(event.source!==frame?.contentWindow||m?.channel!=='xcwc-shop')return;if(m.operation==='layout'){document.documentElement.classList.toggle('xcwc-shop-view',m.active===true);return;}if(m.operation!=='taobao')return;try{const url=new URL(m.href);if(url.protocol!=='https:'||!['e.tb.cn','item.taobao.com','detail.tmall.com'].includes(url.hostname))return;window.open(url.href,'_blank','noopener,noreferrer');}catch{}});})();

// Shop-only public reads and local cart operations. Shared layout/account behavior stays above.
(()=>{
 const frame=document.getElementById('codex-visualization'),requests=new Map();
 const failure=(code,message)=>Object.assign(new Error(message),{code});
 const cartPrefix='xcwc.shop.cart.v1:',productId=/^[a-z0-9_-]{1,64}$/,knownResetEpoch=new Map();let mutexDatabase;
 const cartOwner=()=>{const session=window.xcwcSession.read();return {token:session?.token||null,key:cartPrefix+encodeURIComponent(session?.username||'@anonymous')}};
 function readCart(key){
  let value;try{value=JSON.parse(localStorage.getItem(key)||'[]')}catch{throw failure('CART_UNAVAILABLE','购物车记录无法读取，请保留数据并重试')}
  if(!Array.isArray(value))throw failure('CART_UNAVAILABLE','购物车记录无法读取，请保留数据并重试');
  return [...new Set(value.filter(id=>typeof id==='string'&&productId.test(id)))].slice(0,100);
 }
 function cartMutex(){
  if(mutexDatabase)return mutexDatabase;
  const attempt=new Promise((resolve,reject)=>{
   const request=indexedDB.open('xcwc.shop.coordination.v1',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('mutex');
   request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();mutexDatabase=null};resolve(db)};
   request.onerror=()=>reject(failure('CART_UNAVAILABLE','浏览器无法安全保存购物车，请允许本机存储后重试'));
   request.onblocked=()=>reject(failure('CART_UNAVAILABLE','购物车存储暂时被占用，请关闭旧页面后重试'));
  });mutexDatabase=attempt;void attempt.catch(()=>{if(mutexDatabase===attempt)mutexDatabase=null});return attempt;
 }
 async function cartOperation(operation,id,signal){
  const writing=operation!=='cart-read';
  if(writing&&(typeof id!=='string'||!productId.test(id)))throw failure('INVALID_PRODUCT','商品编号无效');
  const owner=cartOwner(),expectedEpoch=knownResetEpoch.get(owner.key),db=await cartMutex();
  return new Promise((resolve,reject)=>{
   // Read and write the canonical snapshot in one transaction. localStorage is
   // retained as a legacy mirror; its per-tab cache cannot coordinate writers.
   const tx=db.transaction('mutex','readwrite'),store=tx.objectStore('mutex');let value,error;
   const abort=()=>{error=failure('CART_CANCELLED','购物车操作已取消');try{tx.abort()}catch{}};
   tx.oncomplete=()=>{signal.removeEventListener('abort',abort);knownResetEpoch.set(owner.key,value.resetEpoch);resolve(value)};
   tx.onabort=tx.onerror=()=>{signal.removeEventListener('abort',abort);reject(error||failure('CART_UNAVAILABLE','购物车保存失败，请重试'))};
   signal.addEventListener('abort',abort,{once:true});
   const epochRequest=store.get('reset-epoch');epochRequest.onsuccess=()=>{
    try{
     if(signal.aborted)throw failure('CART_CANCELLED','购物车操作已取消');
     const current=cartOwner();if(current.token!==owner.token||current.key!==owner.key)throw failure('SESSION_CHANGED','账号已变化，请重新进入商城');
     const resetEpoch=epochRequest.result||'initial';
     if(writing&&expectedEpoch!==resetEpoch)throw failure('CART_CANCELLED','购物车已重置，请重新操作');
     const snapshot=store.get(owner.key);snapshot.onsuccess=()=>{
      try{
       if(signal.aborted)throw failure('CART_CANCELLED','购物车操作已取消');
       const current=cartOwner();if(current.token!==owner.token||current.key!==owner.key)throw failure('SESSION_CHANGED','账号已变化，请重新进入商城');
       // A reset invalidates every legacy mirror, including stale tab caches.
       const ids=snapshot.result===undefined?(resetEpoch==='initial'?readCart(owner.key):[]):snapshot.result;
       if(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string'||!productId.test(id))||new Set(ids).size!==ids.length)throw failure('CART_UNAVAILABLE','购物车记录无法读取，请保留数据并重试');
       const already=ids.includes(id);
       if(operation==='cart-add'&&!already&&ids.length>=100)throw failure('CART_FULL','购物车最多保存 100 件商品，请先移除部分商品');
       const next=operation==='cart-add'?[...new Set([...ids,id])]:operation==='cart-remove'?ids.filter(value=>value!==id):ids;
       if(writing){try{localStorage.setItem(owner.key,JSON.stringify(next))}catch{throw failure('CART_UNAVAILABLE','购物车保存失败，请释放浏览器空间后重试')}}
       if(writing||snapshot.result===undefined)store.put(next,owner.key);
       value={ids:next,already,resetEpoch};
      }catch(cause){error=cause;tx.abort()}
     };
    }catch(cause){error=cause;tx.abort()}
   };
  });
 }
 async function resetCart(){
  const db=await cartMutex();return new Promise((resolve,reject)=>{
   const tx=db.transaction('mutex','readwrite'),store=tx.objectStore('mutex');let error;
   tx.oncomplete=()=>{knownResetEpoch.clear();cartChanged();resolve()};
   tx.onabort=tx.onerror=()=>reject(error||failure('CART_UNAVAILABLE','购物车缓存未能清除，请重试'));
   store.get('reset-epoch').onsuccess=()=>{
    try{
     const keys=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(cartPrefix))keys.push(key)}
     for(const key of keys){localStorage.removeItem(key);if(localStorage.getItem(key)!==null)throw failure('CART_UNAVAILABLE','购物车缓存未能清除，请重试')}
     store.clear();store.put(Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),'reset-epoch');
    }catch(cause){error=cause;tx.abort()}
   };
  });
 }
 window.xcwcShopCart=Object.freeze({reset:resetCart});
 function cartChanged(){frame?.contentWindow?.postMessage({channel:'xcwc-shop-cart-change'},'*')}
 window.addEventListener('storage',event=>{if(event.key===null||event.key==='yanji.cloud.session.v1'||event.key===cartOwner().key)cartChanged()});
 window.addEventListener('xcwc-session-change',cartChanged);window.addEventListener('focus',cartChanged);window.addEventListener('pageshow',cartChanged);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)cartChanged()});
 // Public catalogue cache belongs to the host, so route changes reuse it. No
 // account/cart/private responses enter this cache. Each waiter can cancel
 // independently; the shared fetch stops when its last waiter leaves.
 const publicCache=new Map(),publicJobs=new Map(),publicTtl=60000;
 function rememberPublic(path,record){
  publicCache.delete(path);publicCache.set(path,record);
  while(publicCache.size>128)publicCache.delete(publicCache.keys().next().value);
 }
 function publicRead(path,signal,revalidate=false){
  if(signal.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
  const hit=publicCache.get(path);
  if(!revalidate&&hit&&hit.freshUntil>Date.now())return Promise.resolve(hit);
  const key=(revalidate?'validate:':'read:')+path;
  let job=publicJobs.get(key);
  if(job?.controller.signal.aborted){publicJobs.delete(key);job=null;}
  if(!job){
   const controller=new AbortController();job={controller,waiters:new Set(),settled:false};
   const timeout=setTimeout(()=>controller.abort(),20000);
   job.promise=(async()=>{
    const response=await fetch(path,{credentials:'omit',cache:revalidate?'no-cache':'default',signal:controller.signal});
    let value;try{value=await response.json()}catch{throw failure('SHOP_UNAVAILABLE','商城服务暂时无法读取，请稍后重试')}
    if(!response.ok){publicCache.delete(path);throw failure(value.code||'SHOP_UNAVAILABLE',value.message||'商城服务暂时不可用')}
    const headers=response.headers,policy=headers?.get('Cache-Control')||'',maxAge=/\bmax-age=(\d+)/i.exec(policy),date=Date.parse(headers?.get('Date')||''),age=Number(headers?.get('Age')||0)*1000;
    const lifetime=Math.min(publicTtl,maxAge?Number(maxAge[1])*1000:publicTtl),elapsed=Math.max(age,Number.isFinite(date)?Math.max(0,Date.now()-date):0);
    const record={value,freshUntil:Date.now()+Math.max(0,lifetime-elapsed)};
    if(/\b(no-store|private)\b/i.test(policy))record.freshUntil=Date.now();
    rememberPublic(path,record);
    // Lists and details use the same public Product representation.
    if(path.startsWith('/api/shop/products?')&&Array.isArray(value?.items))for(const item of value.items){
     if(item&&typeof item.id==='string'&&productId.test(item.id))rememberPublic('/api/shop/products/'+encodeURIComponent(item.id),{value:item,freshUntil:record.freshUntil});
    }
    return record;
   })().finally(()=>{job.settled=true;clearTimeout(timeout);if(publicJobs.get(key)===job)publicJobs.delete(key)});
   publicJobs.set(key,job);
  }
  return new Promise((resolve,reject)=>{
   const waiter={};job.waiters.add(waiter);
   const cleanup=()=>{signal.removeEventListener('abort',abort);job.waiters.delete(waiter);if(!job.settled&&!job.waiters.size)job.controller.abort()};
   const abort=()=>{cleanup();reject(new DOMException('Aborted','AbortError'))};
   signal.addEventListener('abort',abort,{once:true});
   if(signal.aborted)abort();
   job.promise.then(value=>{cleanup();if(!signal.aborted)resolve(value)},error=>{cleanup();if(!signal.aborted)reject(error)});
  });
 }
 window.addEventListener('message',async event=>{
  const m=event.data;
  if(event.source!==frame?.contentWindow||m?.channel!=='xcwc-shop-data'||typeof m.id!=='string'||m.id.length>80)return;
  if(m.operation==='cancel'){requests.get(m.id)?.abort();return;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let purchaseWindow=null;requests.set(m.id,controller);
  try{
   const a=m.args||{};let path;
   if(['cart-read','cart-add','cart-remove'].includes(m.operation)){
    const value=await cartOperation(m.operation,a.id,controller.signal);
    if(!controller.signal.aborted)frame.contentWindow?.postMessage({channel:'xcwc-shop-data-result',id:m.id,ok:true,value},'*');
    return;
   }
   if(m.operation==='banners')path='/api/shop/banners';
   else if(m.operation==='detail'||m.operation==='purchase'){
    if(typeof a.id!=='string'||!/^[a-z0-9_-]{1,64}$/.test(a.id))throw failure('INVALID_PRODUCT','商品编号无效');
    path='/api/shop/products/'+encodeURIComponent(a.id);
   }else if(m.operation==='list'){
    if(!Number.isInteger(a.page)||a.page<1||!Number.isInteger(a.pageSize)||a.pageSize<1||a.pageSize>100||!['default','priceAsc','priceDesc'].includes(a.sort)||typeof a.city!=='string'||a.city.length>64)throw failure('INVALID_QUERY','商品查询条件无效');
    path='/api/shop/products?'+new URLSearchParams({page:String(a.page),pageSize:String(a.pageSize),sort:a.sort,city:a.city});
   }else throw failure('UNSUPPORTED_OPERATION','商城操作暂不支持');
   // Reserve while the click's user activation is still live; an async check
   // must not turn a valid Taobao click into a blocked mobile popup.
   if(m.operation==='purchase'){
    purchaseWindow=window.open('about:blank','_blank');
    if(!purchaseWindow)throw failure('POPUP_BLOCKED','请允许打开新窗口，再试一次');
    purchaseWindow.opener=null;
    const doc=purchaseWindow.document,referrer=doc.createElement('meta');referrer.name='referrer';referrer.content='no-referrer';doc.head.append(referrer);doc.title='正在打开商品';
   }
   const record=await publicRead(path,controller.signal,m.operation==='purchase'||a.revalidate===true);let value=record.value;
   if(controller.signal.aborted)return;
   if(m.operation==='purchase'){
    if(!value?.purchaseUrl)throw Object.assign(failure('PURCHASE_LINK_UNAVAILABLE','购买链接待配置'),{product:value});
    let url;try{url=new URL(value.purchaseUrl)}catch{throw Object.assign(failure('INVALID_PURCHASE_LINK','商品购买链接无效'),{product:value})}
    if(url.protocol!=='https:'||!['e.tb.cn','item.taobao.com','detail.tmall.com'].includes(url.hostname)||url.username||url.password||(url.port&&url.port!=='443'))throw Object.assign(failure('INVALID_PURCHASE_LINK','商品购买链接无效'),{product:value});
    if(purchaseWindow.closed)throw failure('PURCHASE_CANCELLED','商品窗口已关闭，可以重新打开');
    const link=purchaseWindow.document.createElement('a');link.href=url.href;link.target='_self';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';purchaseWindow.document.body.append(link);link.click();purchaseWindow=null;value={opened:true,product:value};
   }
   frame.contentWindow?.postMessage({channel:'xcwc-shop-data-result',id:m.id,ok:true,value,freshUntil:record.freshUntil},'*');
  }catch(error){
   frame.contentWindow?.postMessage({channel:'xcwc-shop-data-result',id:m.id,ok:false,value:{code:error.code||'SHOP_UNAVAILABLE',message:error.name==='AbortError'?'商城读取超时，请重试':error.message,product:error.product}},'*');
  }finally{if(purchaseWindow&&!purchaseWindow.closed)purchaseWindow.close();clearTimeout(timer);requests.delete(m.id)}
 });
})();
