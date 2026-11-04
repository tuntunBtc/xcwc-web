(()=>{
 const frame=document.getElementById('codex-visualization'),controllers=new Map();
 // Photo operations are always local, even if the local album fails to initialize.
 const localOperations=new Set(['bootstrap','history','detail','image','original','create','points','delete']);
 const canvasAssets=Object.freeze({background:'/assets/checkin/lake.jpg',bird:'/assets/checkin/felt-bird-v1.png'});
 const failure=(code,message)=>Object.assign(new Error(message),{code});
 let editDraft=null,draftLease=0;
 const draftEpoch=()=>{const epoch=window.localStorage.getItem('xcwc.local.reset.v1')||'initial';if(epoch.startsWith('pending:'))throw failure('LOCAL_RESET','本机数据正在清除，请稍后重新进入');return epoch};
 const clearDraft=()=>{editDraft=null;draftLease++;};
 window.xcwcCheckinDraft=Object.freeze({clear:clearDraft});
 window.addEventListener('storage',event=>{if(event.key==='xcwc.local.reset.v1')clearDraft()});
 function checkedDraft(value){
  if(!value||!Array.isArray(value.selected)||value.selected.length>3)throw failure('INVALID_DRAFT','编辑内容无法保留');
  const owned=new Set(window.xcwcGuest.snapshot().birds.map(bird=>bird.id));
  if(new Set(value.selected).size!==value.selected.length||value.selected.some(id=>!owned.has(id)))throw failure('INVALID_DRAFT','小鸟资料已变化，请重新选择');
  if(value.photoBlob&&(!(value.photoBlob instanceof Blob)||value.photoBlob.size>32*1024*1024))throw failure('INVALID_DRAFT','照片无法暂存');
  const number=(v,fallback,min,max)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
  const poses=Object.fromEntries(value.selected.map(id=>{const pose=value.poses?.[id]||{};return [id,{cx:number(pose.cx,735,0,1000),cy:number(pose.cy,600,0,1010),size:number(pose.size,34,12,55)}]}));
  let pending=null;
  if(value.pendingSubmission){
   const item=value.pendingSubmission,meta=item.metadata;
   if(meta&&/^[a-zA-Z0-9_-]{16,64}$/.test(meta.requestId||'')&&Array.isArray(meta.birdIds)&&JSON.stringify(meta.birdIds)===JSON.stringify(value.selected)&&item.original instanceof Blob&&item.original.size<=15*1024*1024&&item.image instanceof Blob&&item.image.size<=8*1024*1024)pending=item;
  }
  return {photoBlob:value.photoBlob||null,selected:[...value.selected],active:value.selected.includes(value.active)?value.active:value.selected[0]||null,poses,style:Math.round(number(value.style,0,0,3)),label:typeof value.label==='string'?value.label.slice(0,20):'',photoFit:value.photoFit==='contain'?'contain':'cover',photoX:number(value.photoX,50,0,100),photoY:number(value.photoY,50,0,100),dirty:!!value.dirty,editorOpen:!!value.editorOpen,pendingSubmission:pending};
 }


 window.addEventListener('message',async event=>{
  const message=event.data;if(event.source!==frame?.contentWindow||message?.channel!=='xcwc-checkin'||typeof message.id!=='string'||message.id.length>80)return;
  if(message.operation==='cancel'){controllers.get(message.id)?.abort();return;}
  const controller=new AbortController();controllers.set(message.id,controller);const timer=setTimeout(()=>controller.abort(),45000);
  const args=message.args||{};let value;
  try{
   if(localOperations.has(message.operation)){
    const album=window.xcwcLocalAlbum;
    if(!album?.operations.includes(message.operation))throw failure('LOCAL_ALBUM_UNAVAILABLE','本机相册暂时不可用，请刷新后重试');
    value=await album.run(message.operation,args);
    if(!controller.signal.aborted)frame.contentWindow.postMessage({channel:'xcwc-checkin-result',id:message.id,ok:true,value},'*');
    return;
   }
   switch(message.operation){
    case 'draftRead':{
     const epoch=draftEpoch();if(editDraft?.epoch!==epoch)clearDraft();
     // An account's local cast may also have changed while this route was away.
     if(editDraft){try{editDraft.value=checkedDraft(editDraft.value)}catch{clearDraft()}}
     value={epoch,lease:++draftLease,draft:editDraft?.value||null};break;
    }
    case 'draftWrite':{
     const epoch=draftEpoch();if(args.epoch!==epoch)throw failure('LOCAL_RESET','本机数据已清除，旧编辑内容不会恢复');if(args.lease!==draftLease)throw failure('STALE_DRAFT','此编辑页面已离开，旧编辑内容不会覆盖当前草稿');
     editDraft={epoch,value:checkedDraft(args.draft)};value={saved:true};break;
    }
    case 'draftClear':clearDraft();value={cleared:true};break;

    case 'canvasAsset':{
     if(!Object.hasOwn(canvasAssets,args.key))throw failure('INVALID_ASSET','合照素材不可用');
     const asset=canvasAssets[args.key],versioned=/\.[a-f0-9]{12,64}\.[a-z0-9]+$/i.test(asset);
     const response=await fetch(asset,{credentials:'omit',cache:versioned?'default':'no-cache',signal:controller.signal});
     if(!response.ok)throw failure('CHECKIN_ASSET_FAILED','合照素材加载失败，请刷新页面后重试');
     value=await response.blob();
     if(!value.type.startsWith('image/')||value.size>4*1024*1024)throw failure('CHECKIN_ASSET_FAILED','合照素材加载失败，请刷新页面后重试');
     break;
    }
    case 'account':location.assign('/account.html?returnTo=checkin');return;
    case 'viewport':value={top:Math.max(0,-frame.getBoundingClientRect().top),height:innerHeight};break;
    case 'notice':{let notice=document.getElementById('xcwc-checkin-notice');if(!notice){notice=document.createElement('div');notice.id='xcwc-checkin-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');Object.assign(notice.style,{position:'fixed',bottom:'max(24px, env(safe-area-inset-bottom))',left:'50%',transform:'translateX(-50%)',padding:'12px 20px',borderRadius:'12px',background:'#3f5837f5',color:'#fffbea',font:'12px/1.6 sans-serif',maxWidth:'90%',width:'max-content',zIndex:'1000',boxShadow:'0 5px 25px #0003'});document.body.append(notice);}notice.textContent=String(args.message||'').slice(0,240);notice.hidden=false;clearTimeout(notice.hideTimer);notice.hideTimer=setTimeout(()=>notice.hidden=true,3500);value={shown:true};break;}
    case 'closeViewer':window.xcwcPhotoSave.close();value={closed:true};break;
    case 'viewImage':
    case 'download':{if(!(args.image instanceof Blob)||args.image.size>16*1024*1024||!['image/jpeg','image/png'].includes(args.image.type))throw failure('INVALID_IMAGE','图片无法保存');value=window.xcwcPhotoSave.show(args.image,{label:args.label,createdAt:args.createdAt,note:args.note});break;}
    default:throw failure('UNSUPPORTED_OPERATION','未开放的操作');
   }
   frame.contentWindow.postMessage({channel:'xcwc-checkin-result',id:message.id,ok:true,value},'*');
  }catch(error){frame.contentWindow?.postMessage({channel:'xcwc-checkin-result',id:message.id,ok:false,value:{code:error.code||'NETWORK_ERROR',message:error.name==='AbortError'?'请求超时，请原样重试':error.message}},'*');}
  finally{clearTimeout(timer);controllers.delete(message.id);}
 });
})();
