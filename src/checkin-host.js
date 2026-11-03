(()=>{
 const frame=document.getElementById('codex-visualization'),controllers=new Map();
 // Photo operations are always local, even if the local album fails to initialize.
 const localOperations=new Set(['bootstrap','history','detail','image','original','create','points']);
 const canvasAssets=Object.freeze({background:'/assets/checkin/lake.jpg',bird:'/assets/nest/felt/emotions/happy-400.webp'});
 const failure=(code,message)=>Object.assign(new Error(message),{code});

 // Keep the image in the top-level document so native long-press menus are available.
 let saveDialog=null,saveUrl=null;
 function showSaveImage(image){
  if(!saveDialog){
   saveDialog=document.createElement('dialog');saveDialog.id='xcwc-checkin-save';
   saveDialog.setAttribute('aria-labelledby','xcwc-checkin-save-title');
   saveDialog.style.cssText='box-sizing:border-box;width:min(480px,94vw);max-height:92dvh;overflow:auto;padding:20px;border:1px solid #dce3cd;border-radius:18px;background:#f7f9ef;color:#3f5837;font:14px/1.7 sans-serif;';
   const title=document.createElement('h2');title.id='xcwc-checkin-save-title';title.textContent='保存到手机相册';title.style.cssText='margin:0 0 8px;font-size:20px';
   const hint=document.createElement('p');hint.textContent='长按下方图片，在弹出的菜单中选择“保存图片”或“添加到照片”。';hint.style.cssText='margin:0 0 14px';
   const picture=document.createElement('img');picture.alt='待保存的完整照片';picture.style.cssText='display:block;width:100%;height:auto;border-radius:8px;-webkit-touch-callout:default;user-select:auto;-webkit-user-select:auto';
   const fallback=document.createElement('p');fallback.textContent='没有保存图片选项？可尝试用手机浏览器打开本页，或下载文件后从文件管理中查看。';fallback.style.cssText='font-size:12px;margin:14px 0;color:#68795c';
   const link=document.createElement('a');link.textContent='下载图片文件';link.style.cssText='display:inline-block;padding:10px;color:#3f5837;text-decoration:underline';
   const close=document.createElement('button');close.type='button';close.textContent='关闭';close.style.cssText='float:right;padding:10px 18px;border:0;border-radius:8px;background:#5b7549;color:white;font:inherit';close.onclick=()=>saveDialog.close();
   saveDialog.append(title,hint,picture,fallback,link,close);document.body.append(saveDialog);
   saveDialog.addEventListener('close',()=>{if(saveDialog.open)return;picture.removeAttribute('src');link.removeAttribute('href');if(saveUrl){URL.revokeObjectURL(saveUrl);saveUrl=null;}});
   saveDialog.addEventListener('click',event=>{if(event.target===saveDialog){const rect=saveDialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)saveDialog.close();}});
  }
  // Replace the previous image without retaining private photo blobs.
  if(saveUrl)URL.revokeObjectURL(saveUrl);
  saveUrl=URL.createObjectURL(image);
  saveDialog.querySelector('img').src=saveUrl;
  const link=saveDialog.querySelector('a');link.href=saveUrl;link.download='小鸟伴游-'+Date.now()+(image.type==='image/png'?'.png':'.jpg');
  if(!saveDialog.open)saveDialog.showModal();
  return {shown:true};
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
    case 'canvasAsset':{
     if(!Object.hasOwn(canvasAssets,args.key))throw failure('INVALID_ASSET','合照素材不可用');
     const response=await fetch(canvasAssets[args.key],{credentials:'omit',cache:'no-cache',signal:controller.signal});
     if(!response.ok)throw failure('CHECKIN_ASSET_FAILED','合照素材加载失败，请刷新页面后重试');
     value=await response.blob();
     if(!value.type.startsWith('image/')||value.size>4*1024*1024)throw failure('CHECKIN_ASSET_FAILED','合照素材加载失败，请刷新页面后重试');
     break;
    }
    case 'account':location.assign('/account.html?returnTo=checkin');return;
    case 'viewport':value={top:Math.max(0,-frame.getBoundingClientRect().top),height:innerHeight};break;
    case 'notice':{let notice=document.getElementById('xcwc-checkin-notice');if(!notice){notice=document.createElement('div');notice.id='xcwc-checkin-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');Object.assign(notice.style,{position:'fixed',bottom:'max(24px, env(safe-area-inset-bottom))',left:'50%',transform:'translateX(-50%)',padding:'12px 20px',borderRadius:'12px',background:'#3f5837f5',color:'#fffbea',font:'12px/1.6 sans-serif',maxWidth:'90%',width:'max-content',zIndex:'1000',boxShadow:'0 5px 25px #0003'});document.body.append(notice);}notice.textContent=String(args.message||'').slice(0,240);notice.hidden=false;clearTimeout(notice.hideTimer);notice.hideTimer=setTimeout(()=>notice.hidden=true,3500);value={shown:true};break;}
    case 'download':{if(!(args.image instanceof Blob)||args.image.size>16*1024*1024||!['image/jpeg','image/png'].includes(args.image.type))throw failure('INVALID_IMAGE','图片无法保存');value=showSaveImage(args.image);break;}
    default:throw failure('UNSUPPORTED_OPERATION','未开放的操作');
   }
   frame.contentWindow.postMessage({channel:'xcwc-checkin-result',id:message.id,ok:true,value},'*');
  }catch(error){frame.contentWindow?.postMessage({channel:'xcwc-checkin-result',id:message.id,ok:false,value:{code:error.code||'NETWORK_ERROR',message:error.name==='AbortError'?'请求超时，请原样重试':error.message}},'*');}
  finally{clearTimeout(timer);controllers.delete(message.id);}
 });
})();
