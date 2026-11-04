// Fixed, same-origin account operations; session tokens never cross the sandbox boundary.
(()=>{
 const frame=document.getElementById('codex-visualization'),key='yanji.cloud.session.v1',pending=new Map();
 const session=()=>window.xcwcSession.read();
 const trusted=location.protocol==='https:'||['127.0.0.1','localhost','[::1]'].includes(location.hostname);
 __ADOPTION_ENTRY__
 const adoptionEntry=()=>parseAdoptionEntry(location.search);
 let observed=session()?.token||null,revision=0,resettingLocalData=false,sessionTimer=null,pageSuspended=false;
 const identity=()=>({account:session()?.username||null,revision});
 function watchSession(){
  if(sessionTimer!==null){clearInterval(sessionTimer);sessionTimer=null;}
  // Anonymous visits use session/storage events. Only a visible signed-in page
  // needs the expiry fallback; recheck immediately when the page returns.
  if(observed&&!document.hidden&&!pageSuspended)sessionTimer=setInterval(changed,700);
 }
 function changed(){const token=session()?.token||null;if(token===observed)return;observed=token;revision++;watchSession();for(const c of pending.values())c.abort();frame?.contentWindow?.postMessage({channel:'xcwc-account-change',...identity()},'*');}
 window.addEventListener('resize',()=>frame?.contentWindow?.postMessage({channel:'xcwc-account-viewport',height:innerHeight},'*'));
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)changed()});window.addEventListener('xcwc-session-change',changed);window.addEventListener('focus',changed);
 window.addEventListener('pagehide',()=>{pageSuspended=true;watchSession()});
 window.addEventListener('pageshow',()=>{pageSuspended=false;changed();watchSession()});
 document.addEventListener('visibilitychange',()=>{changed();watchSession()});watchSession();
 async function api(path,{method='GET',body,signal}={}){
  const publicRead=method==='GET'&&(/^\/birds\/(?:[a-f0-9]{32}|by-code\/[A-Za-z0-9_-]+)$/.test(path)||path==='/checkin-catalog'||path==='/health');if(!trusted&&!publicRead)throw Error('账号服务需要 HTTPS；当前 IP 站点仅提供免登录本机体验');const auth=session(),token=auth?.token;const publicAuth=/^\/auth\/(login|register)$/.test(path);
  const response=await fetch('/api'+path,{method,signal,cache:'no-store',headers:{...(token&&!publicAuth&&!publicRead?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!publicRead&&session()?.token!==token)throw Error('账号已切换，请重新进入');
  if(response.status===401&&!publicAuth&&!publicRead){window.xcwcSession.clear();changed();throw Object.assign(Error('登录已失效，请重新登录'),{code:'LOGIN_REQUIRED'})}
  if(response.status===204)return null;let result;try{result=await response.json()}catch{throw Error('服务未连接或返回格式有误')}
  if(!response.ok)throw Object.assign(Error(result.message||'请求失败'),{code:result.code});return result;
 }
 async function restore(signal){if(!session())return;try{const current=await api('/auth/session',{signal});const saved=session();if(saved)window.XcwcSession.write({...saved,username:current.username,expiresAt:current.expiresAt})}catch(error){if(error.code!=='LOGIN_REQUIRED')throw error}}
 const birdId=id=>{if(!/^[a-f0-9]{32}$/.test(id||''))throw Error('请选择真实实体小鸟');return id};
 const skinId=id=>{if(!/^[a-z0-9_]{1,32}$/.test(id||''))throw Error('皮肤编号无效');return id};
 function cartKey(){return 'xcwc.shop.cart.v1:'+encodeURIComponent(session()?.username||'@anonymous')}
 function readCart(){try{const ids=JSON.parse(localStorage.getItem(cartKey())||'[]');return Array.isArray(ids)?[...new Set(ids.filter(x=>typeof x==='string'&&/^[a-z0-9_-]{1,64}$/.test(x)))].slice(0,100):[]}catch{return []}}
 window.addEventListener('message',async event=>{
  const m=event.data;if(event.source!==frame?.contentWindow||m?.channel!=='xcwc-account'||typeof m.id!=='string'||m.id.length>80)return;
  if(m.operation==='cancel'){pending.get(m.id)?.abort();return}changed();const c=new AbortController(),timer=setTimeout(()=>c.abort(),20000);pending.set(m.id,c);const a=m.args||{},start=revision,requestOwner=session()?.token;let value;
  try{
   if(resettingLocalData&&!['resetLocalData','viewport','scrollTop'].includes(m.operation))throw Error('正在清除本机数据，请稍候');
   const localOps=['bootstrap','identity','adoptionMine','adoptionConfirm','wallet','ledger','wardrobe','pet','care','selectBird','redeem','equip'];
   if(localOps.includes(m.operation)){
    value=await window.xcwcGuestOperation(m.operation,a,async()=>{const entry=adoptionEntry();if(entry.error||a.code!==entry.code)throw Error('请确认当前实体小鸟链接');const bird=await api(adoptionLookupPath(entry.code),{signal:c.signal});if(!matchesAdoptionBird(entry.code,bird))throw Error('实体资料与链接不一致');return bird});
    if(!c.signal.aborted)frame.contentWindow.postMessage({channel:'xcwc-account-result',id:m.id,ok:true,value},'*');return;
   }
   switch(m.operation){
    case 'bootstrap':{await restore(c.signal);if(!session()){value={...identity(),birds:[],wallet:null};break}const [birds,wallet]=await Promise.all([api('/me/birds',{signal:c.signal}),api('/me/points',{signal:c.signal})]);value={...identity(),birds,wallet};break}
    case 'identity':await restore(c.signal);value=identity();break;
    case 'adoptionContext':{const localPreview=['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('previewTest')==='1';value={...adoptionEntry(),previewTest:localPreview};break;}
    case 'adoptionPublic':{const entry=adoptionEntry();if(entry.error||!entry.lookupSupported||a.code!==entry.code)throw Object.assign(Error('该小鸟编码的读取尚未开放'),{code:'ADOPTION_NOT_AVAILABLE'});value=await api(adoptionLookupPath(entry.code),{signal:c.signal});break;}
    case 'adoptionMine':value=await api('/me/birds',{signal:c.signal});break;
    case 'adoptionConfirm':{const entry=adoptionEntry();if(entry.error||a.code!==entry.code||!session())throw Object.assign(Error('请登录并确认小鸟资料'),{code:'LOGIN_REQUIRED'});const storeKey='xcwc.adoption.pending:'+session().username+':'+entry.code;let pending;try{pending=JSON.parse(sessionStorage.getItem(storeKey)||'null')}catch{}if(!pending||pending.name!==a.name){pending={requestId:crypto.randomUUID(),name:a.name};sessionStorage.setItem(storeKey,JSON.stringify(pending))}const bird=await api(adoptionLookupPath(entry.code),{signal:c.signal});value=await api('/birds/'+birdId(bird.id)+'/adopt',{method:'POST',body:pending,signal:c.signal});if(value?.bound)sessionStorage.removeItem(storeKey);break;}
    case 'adoptionLogin':{if(!['login','register'].includes(a.mode)||typeof a.username!=='string'||!/^[a-z0-9_]{4,32}$/.test(a.username)||typeof a.password!=='string'||a.password.length<10||new TextEncoder().encode(a.password).length>72)throw Error('请检查账号或密码格式');const auth=await api('/auth/'+a.mode,{method:'POST',body:{username:a.username,password:a.password},signal:c.signal});if(c.signal.aborted)throw Error('请求已取消');window.xcwcSession.write(auth);value=identity();setTimeout(changed,0);break;}
    case 'wallet':value=await api('/me/points',{signal:c.signal});break;
    case 'ledger':{if(a.beforeId!=null&&!/^[1-9][0-9]{0,18}$/.test(String(a.beforeId)))throw Error('流水分页游标无效');value=await api('/me/points/ledger'+(a.beforeId?'?beforeId='+encodeURIComponent(a.beforeId):''),{signal:c.signal});break;}
    case 'catalog':value=await api('/checkin-catalog',{signal:c.signal});break;
    case 'wardrobe':{const [skins,outfits]=await Promise.all([api('/skins',{signal:c.signal}),api('/me/outfits',{signal:c.signal})]);value={skins,outfits};break}
    case 'pet':value=await api('/birds/'+birdId(a.birdId)+'/pet',{method:'POST',body:{requestId:a.requestId},signal:c.signal});break;
    case 'redeem':value=await api('/skins/'+skinId(a.skinId)+'/redeem',{method:'POST',body:{requestId:a.requestId},signal:c.signal});break;
    case 'equip':value=await api('/birds/'+birdId(a.birdId)+'/skin',{method:'PUT',body:{skinId:a.skinId==null?null:skinId(a.skinId)},signal:c.signal});break;
    case 'cartRead':value={ids:readCart(),...identity()};break;
    case 'cartWrite':{if(!Array.isArray(a.ids)||a.ids.length>100||a.ids.some(x=>typeof x!=='string'||!/^[a-z0-9_-]{1,64}$/.test(x)))throw Error('购物车内容无效');localStorage.setItem(cartKey(),JSON.stringify([...new Set(a.ids)]));value={ids:readCart(),...identity()};break}
    case 'resetLocalData':{
     if(a.confirmation!=='CLEAR_LOCAL_EXPERIENCE')throw Error('请先确认清除全部本机数据');
     resettingLocalData=true;for(const [id,request]of pending)if(id!==m.id)request.abort();
     try{value=await window.xcwcResetLocalData()}catch(error){resettingLocalData=false;throw error}break;
    }
    case 'login':{const page=['home','city','photo','shop','profile','wardrobe'].includes(a.page)?a.page:'home';if(a.context?.source==='nest'&&/^[a-f0-9]{32}$/.test(a.context.birdId||''))sessionStorage.setItem('xcwc.return-context',JSON.stringify({source:'nest',birdId:a.context.birdId,returnTo:'home'}));location.assign('/account.html?returnTo='+page);return}
    case 'logout':await api('/auth/logout',{method:'POST',signal:c.signal});window.xcwcSession.clear();changed();value=identity();break;
    case 'returnContext':{try{value=JSON.parse(sessionStorage.getItem('xcwc.return-context')||'null')}catch{value=null}sessionStorage.removeItem('xcwc.return-context');break}
    case 'scrollTop':window.scrollTo(0,0);value={done:true};break;
    case 'viewport':value={top:Math.max(0,-frame.getBoundingClientRect().top),height:innerHeight};break;
    default:throw Error('未开放的账号操作');
   }
   if((start!==revision||requestOwner!==session()?.token)&&!['logout','adoptionLogin','identity','resetLocalData'].includes(m.operation))throw Error('账号已变化，请重新进入');frame.contentWindow.postMessage({channel:'xcwc-account-result',id:m.id,ok:true,value},'*');
   if(m.operation==='resetLocalData'&&value?.cleared)setTimeout(()=>location.replace('/?page=profile'),150);
  }catch(e){frame.contentWindow?.postMessage({channel:'xcwc-account-result',id:m.id,ok:false,value:{code:e.code||'NETWORK_ERROR',message:e.name==='AbortError'?'请求已取消或超时，请重试':e.message}},'*')}
  finally{clearTimeout(timer);pending.delete(m.id)}
 });
})();
