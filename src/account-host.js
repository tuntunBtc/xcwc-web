// Fixed, same-origin account operations; credentials never cross the sandbox boundary.
(()=>{
 const frame=document.getElementById('codex-visualization'),key='yanji.cloud.session.v1',pending=new Map();
 const session=()=>{try{return JSON.parse(sessionStorage.getItem(key)||'null')}catch{return null}};
 const trusted=location.protocol==='https:'||['127.0.0.1','localhost','[::1]'].includes(location.hostname);
 let observed=session()?.token||null,revision=0;
 const identity=()=>({account:session()?.username||null,revision});
 function changed(){const token=session()?.token||null;if(token===observed)return;observed=token;revision++;for(const c of pending.values())c.abort();frame?.contentWindow?.postMessage({channel:'xcwc-account-change',...identity()},'*');}
 window.addEventListener('resize',()=>frame?.contentWindow?.postMessage({channel:'xcwc-account-viewport',height:innerHeight},'*'));
 window.addEventListener('focus',changed);window.addEventListener('pageshow',changed);document.addEventListener('visibilitychange',changed);setInterval(changed,700);
 async function api(path,{method='GET',body,signal}={}){
  if(!trusted)throw Error('请通过 HTTPS 打开账号服务');const auth=session(),token=auth?.token;
  const response=await fetch('/api'+path,{method,signal,cache:'no-store',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(session()?.token!==token)throw Error('账号已切换，请重新进入');
  if(response.status===401){sessionStorage.removeItem(key);changed();throw Object.assign(Error('登录已失效，请重新登录'),{code:'LOGIN_REQUIRED'})}
  if(response.status===204)return null;let result;try{result=await response.json()}catch{throw Error('服务未连接或返回格式有误')}
  if(!response.ok)throw Object.assign(Error(result.message||'请求失败'),{code:result.code});return result;
 }
 const birdId=id=>{if(!/^[a-f0-9]{32}$/.test(id||''))throw Error('请选择真实实体小鸟');return id};
 const skinId=id=>{if(!/^[a-z0-9_]{1,32}$/.test(id||''))throw Error('皮肤编号无效');return id};
 function cartKey(){return 'xcwc.shop.cart.v1:'+encodeURIComponent(session()?.username||'@anonymous')}
 function readCart(){try{const ids=JSON.parse(localStorage.getItem(cartKey())||'[]');return Array.isArray(ids)?[...new Set(ids.filter(x=>typeof x==='string'&&/^[a-z0-9_-]{1,64}$/.test(x)))].slice(0,100):[]}catch{return []}}
 window.addEventListener('message',async event=>{
  const m=event.data;if(event.source!==frame?.contentWindow||m?.channel!=='xcwc-account'||typeof m.id!=='string'||m.id.length>80)return;
  if(m.operation==='cancel'){pending.get(m.id)?.abort();return}changed();const c=new AbortController(),timer=setTimeout(()=>c.abort(),20000);pending.set(m.id,c);const a=m.args||{},start=revision,requestOwner=session()?.token;let value;
  try{
   switch(m.operation){
    case 'bootstrap':{if(!session()){value={...identity(),birds:[],wallet:null};break}const [birds,wallet]=await Promise.all([api('/me/birds',{signal:c.signal}),api('/me/points',{signal:c.signal})]);value={...identity(),birds,wallet};break}
    case 'identity':value=identity();break;
    case 'wallet':value=await api('/me/points',{signal:c.signal});break;
    case 'ledger':value=await api('/me/points/ledger',{signal:c.signal});break;
    case 'catalog':value=await api('/checkin-catalog',{signal:c.signal});break;
    case 'wardrobe':{const [skins,outfits]=await Promise.all([api('/skins',{signal:c.signal}),api('/me/outfits',{signal:c.signal})]);value={skins,outfits};break}
    case 'pet':value=await api('/birds/'+birdId(a.birdId)+'/pet',{method:'POST',body:{requestId:a.requestId},signal:c.signal});break;
    case 'redeem':value=await api('/skins/'+skinId(a.skinId)+'/redeem',{method:'POST',body:{requestId:a.requestId},signal:c.signal});break;
    case 'equip':value=await api('/birds/'+birdId(a.birdId)+'/skin',{method:'PUT',body:{skinId:a.skinId==null?null:skinId(a.skinId)},signal:c.signal});break;
    case 'cartRead':value={ids:readCart(),...identity()};break;
    case 'cartWrite':{if(!Array.isArray(a.ids)||a.ids.length>100||a.ids.some(x=>typeof x!=='string'||!/^[a-z0-9_-]{1,64}$/.test(x)))throw Error('购物车内容无效');localStorage.setItem(cartKey(),JSON.stringify([...new Set(a.ids)]));value={ids:readCart(),...identity()};break}
    case 'login':{const page=['home','city','photo','shop','profile','wardrobe'].includes(a.page)?a.page:'home';if(a.context?.source==='nest'&&/^[a-f0-9]{32}$/.test(a.context.birdId||''))sessionStorage.setItem('xcwc.return-context',JSON.stringify({source:'nest',birdId:a.context.birdId,returnTo:'home'}));location.assign('/register.html?returnTo='+page);return}
    case 'logout':await api('/auth/logout',{method:'POST',signal:c.signal});sessionStorage.removeItem(key);changed();value=identity();break;
    case 'returnContext':{try{value=JSON.parse(sessionStorage.getItem('xcwc.return-context')||'null')}catch{value=null}sessionStorage.removeItem('xcwc.return-context');break}
    case 'scrollTop':window.scrollTo(0,0);value={done:true};break;
    case 'viewport':value={top:Math.max(0,-frame.getBoundingClientRect().top),height:innerHeight};break;
    default:throw Error('未开放的账号操作');
   }
   if((start!==revision||requestOwner!==session()?.token)&&m.operation!=='logout')throw Error('账号已变化，请重新进入');frame.contentWindow.postMessage({channel:'xcwc-account-result',id:m.id,ok:true,value},'*');
  }catch(e){frame.contentWindow?.postMessage({channel:'xcwc-account-result',id:m.id,ok:false,value:{code:e.code||'NETWORK_ERROR',message:e.name==='AbortError'?'请求已取消或超时，请重试':e.message}},'*')}
  finally{clearTimeout(timer);pending.delete(m.id)}
 });
})();
