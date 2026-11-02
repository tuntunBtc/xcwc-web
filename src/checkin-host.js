(()=>{
 const frame=document.getElementById('codex-visualization'),controllers=new Map();const key='yanji.cloud.session.v1';
 const trusted=location.protocol==='https:'||['127.0.0.1','localhost','[::1]'].includes(location.hostname);
 const session=()=>window.xcwcSession.read();
 const failure=(code,message)=>Object.assign(new Error(message),{code});
 async function api(path,{method='GET',body,binary=false,signal}={}){
  if(!trusted)throw failure('HTTPS_REQUIRED','请通过 HTTPS 打开，保护账号与照片');
  const auth=session(),headers={};if(auth?.token)headers.Authorization='Bearer '+auth.token;
  const response=await fetch('/api'+path,{method,body,headers,cache:'no-store',signal});
  if(session()?.token!==auth?.token)throw failure('SESSION_CHANGED','账号已切换，请重新进入打卡页');
  if(!response.ok){let value;try{value=await response.json();}catch{value={message:'后端服务未连接或代理配置有误'};}if(response.status===401)window.xcwcSession.clear();throw failure(value.code||'API_ERROR',value.message||'服务暂时不可用');}
  return binary?response.blob():response.json();
 }
 window.addEventListener('message',async event=>{
  const message=event.data;if(event.source!==frame?.contentWindow||message?.channel!=='xcwc-checkin'||typeof message.id!=='string'||message.id.length>80)return;
  if(message.operation==='cancel'){controllers.get(message.id)?.abort();return;}
  const controller=new AbortController();controllers.set(message.id,controller);const timer=setTimeout(()=>controller.abort(),45000);
  const args=message.args||{};let value;
  try{
   if(window.xcwcLocalAlbum?.operations.includes(message.operation)){value=await window.xcwcLocalAlbum.run(message.operation,args);if(!controller.signal.aborted)frame.contentWindow.postMessage({channel:'xcwc-checkin-result',id:message.id,ok:true,value},'*');return;}
   switch(message.operation){
    case 'bootstrap':{const catalog=await api('/checkin-catalog',{signal:controller.signal});if(!session()){value={authenticated:false,catalog,birds:[]};break;}try{const [birds,wallet]=await Promise.all([api('/me/birds',{signal:controller.signal}),api('/me/points',{signal:controller.signal})]);value={authenticated:true,catalog,birds,wallet};}catch(e){if(e.code!=='LOGIN_REQUIRED')throw e;value={authenticated:false,catalog,birds:[]};}break;}
    case 'points':value=await api('/me/points',{signal:controller.signal});break;
    case 'history':{const cursor=args.cursor?'&cursor='+encodeURIComponent(String(args.cursor)):'';value=await api('/me/checkins?limit=20'+cursor,{signal:controller.signal});break;}
    case 'detail':{if(!/^[a-f0-9]{32}$/.test(args.id))throw failure('INVALID_ID','作品编号不正确');value=await api('/checkins/'+args.id,{signal:controller.signal});break;}
    case 'original':{if(!/^[a-f0-9]{32}$/.test(args.id))throw failure('INVALID_ID','作品编号不正确');value=await api('/checkins/'+args.id+'/original',{binary:true,signal:controller.signal});break;}
    case 'image':{if(!/^[a-f0-9]{32}$/.test(args.id))throw failure('INVALID_ID','作品编号不正确');value=await api('/checkins/'+args.id+'/image',{binary:true,signal:controller.signal});break;}
    case 'create':{if(!(args.original instanceof Blob)||!(args.image instanceof Blob)||args.original.size>15*1024*1024||args.image.size>8*1024*1024)throw failure('INVALID_IMAGE','请选择有效的照片');const form=new FormData();form.append('metadata',new Blob([JSON.stringify(args.metadata)],{type:'application/json'}));form.append('original',args.original,'original.jpg');form.append('image',args.image,'checkin.jpg');value=await api('/checkins',{method:'POST',body:form,signal:controller.signal});break;}
    case 'account':location.assign('/account.html?returnTo=checkin');return;
    case 'viewport':value={top:Math.max(0,-frame.getBoundingClientRect().top),height:innerHeight};break;
    case 'notice':{let notice=document.getElementById('xcwc-checkin-notice');if(!notice){notice=document.createElement('div');notice.id='xcwc-checkin-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');Object.assign(notice.style,{position:'fixed',bottom:'max(24px, env(safe-area-inset-bottom))',left:'50%',transform:'translateX(-50%)',padding:'12px 20px',borderRadius:'12px',background:'#3f5837f5',color:'#fffbea',font:'12px/1.6 sans-serif',maxWidth:'90%',width:'max-content',zIndex:'1000',boxShadow:'0 5px 25px #0003'});document.body.append(notice);}notice.textContent=String(args.message||'').slice(0,240);notice.hidden=false;clearTimeout(notice.hideTimer);notice.hideTimer=setTimeout(()=>notice.hidden=true,3500);value={shown:true};break;}
    case 'download':{if(!(args.image instanceof Blob)||args.image.size>16*1024*1024||!['image/jpeg','image/png'].includes(args.image.type))throw failure('INVALID_IMAGE','图片无法保存');const url=URL.createObjectURL(args.image),link=document.createElement('a');link.href=url;link.download='小鸟伴游-'+Date.now()+'.jpg';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);value={saved:true};break;}
    default:throw failure('UNSUPPORTED_OPERATION','未开放的操作');
   }
   frame.contentWindow.postMessage({channel:'xcwc-checkin-result',id:message.id,ok:true,value},'*');
  }catch(error){frame.contentWindow?.postMessage({channel:'xcwc-checkin-result',id:message.id,ok:false,value:{code:error.code||'NETWORK_ERROR',message:error.name==='AbortError'?'请求超时，请原样重试':error.message}},'*');}
  finally{clearTimeout(timer);controllers.delete(message.id);}
 });
})();
