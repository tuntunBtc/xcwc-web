(()=>{
 // One top-level viewer serves previews, newly generated photos and the album.
 let view=null,file=null,imageUrl=null,sharing=false,handoffCleanup=null;
 const canShare=()=>{try{return !!(isSecureContext&&file&&navigator.share&&navigator.canShare?.({files:[file]}));}catch{return false;}};
 const needsSecurePage=()=>location.protocol==='http:'&&!isSecureContext;
 const text=value=>typeof value==='string'?value.slice(0,160):'';
 function release(){
  handoffCleanup?.();file=null;
  if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=null;
  view?.image.removeAttribute('src');view?.download.removeAttribute('href');
 }
 function close(){
  if(!view)return;
  if(view.modal){if(view.root.open)view.root.close();release();}
  else{
   release();view.root.hidden=true;window.close();
   const status=document.getElementById('save-status');if(status){status.hidden=false;status.textContent='请切换回之前的合照标签页继续编辑。';const recovery=document.getElementById('save-recovery');if(recovery)recovery.hidden=false;}
  }
 }
 async function share(){
  if(sharing||!canShare())return;
  const current=file;sharing=true;view.action.disabled=true;view.hint.textContent='在系统菜单中选择“存储图像”，也可以长按合照保存。';
  try{
   // Call directly in the button handler; no asynchronous preparation before share.
   await navigator.share({files:[current]});
  }catch(error){
   if(file===current&&error.name!=='AbortError')view.hint.textContent='系统菜单暂时无法打开，请长按上方合照，选择“存储图像”或“保存图片”。';
  }finally{sharing=false;if(view)view.action.disabled=false;}
 }
 function secureSave(){
  if(!file||handoffCleanup)return;
  const current=file,details={...view.details};
  const token=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  const url=new URL('/photo-save.html',location.href);url.protocol='https:';url.hash=token;
  const popup=window.open(url.href,'_blank');
  if(!popup){view.hint.textContent='保存页未能打开，请长按上方合照，选择“存储图像”或“保存图片”。';return;}
  view.action.disabled=true;let timer;
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);if(view)view.action.disabled=sharing;handoffCleanup=null;};
  const receive=event=>{
   if(event.source!==popup||event.origin!==url.origin||event.data?.channel!=='xcwc-photo-save-ready'||event.data.token!==token)return;
   popup.postMessage({channel:'xcwc-photo-save-image',token,image:current,...details},url.origin);cleanup();
  };
  window.addEventListener('message',receive);handoffCleanup=cleanup;
  timer=setTimeout(()=>{cleanup();if(file===current)view.hint.textContent='保存页暂时无法打开，请长按上方合照保存，或稍后重试。';},15000);
 }
 function save(){
  if(canShare())void share();
  else if(needsSecurePage())secureSave();
  else{view.hint.textContent='请长按上方合照，在系统菜单中选择“存储图像”或“保存图片”。';view.image.focus({preventScroll:true});}
 }
 function ensureView(container){
  if(view)return;
  if(!document.getElementById('xcwc-photo-style')){
   const style=document.createElement('style');style.id='xcwc-photo-style';style.textContent=`
.xcwc-photo-view{box-sizing:border-box;color:#3f5837;background:#f7f9ef;font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
.xcwc-photo-view *{box-sizing:border-box}.xcwc-photo-view[hidden],.xcwc-photo-view [hidden]{display:none!important}
dialog.xcwc-photo-view{width:min(500px,94vw);max-height:94dvh;margin:auto;padding:0;border:1px solid #dce3cd;border-radius:20px;overflow:auto;box-shadow:0 20px 60px #13200e44}
dialog.xcwc-photo-view::backdrop{background:#24351db3}.xcwc-photo-view .photo-card{padding:14px 16px max(16px,env(safe-area-inset-bottom))}
.xcwc-photo-view header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.xcwc-photo-view h2{margin:0;font-size:18px}.xcwc-photo-view button{font:inherit;touch-action:manipulation;cursor:pointer}.xcwc-photo-view button:disabled{opacity:.6;cursor:wait}
.xcwc-photo-view .photo-close{min-width:44px;min-height:44px;border:0;border-radius:10px;background:transparent;color:#6c805e;font-size:26px}
.xcwc-photo-view img{display:block;width:100%;height:auto;max-height:60dvh;object-fit:contain;border-radius:10px;-webkit-touch-callout:default;user-select:auto;-webkit-user-select:auto}
.xcwc-photo-view .photo-meta{margin:10px 0 4px;text-align:center;color:#809171;font-size:12px;overflow-wrap:anywhere}
.xcwc-photo-view .photo-note{margin:0 0 12px;text-align:center;color:#5b7549;font-size:13px}
.xcwc-photo-view .photo-save{display:block;width:100%;min-height:48px;border:0;border-radius:12px;background:#5b7549;color:#fffdf1;font-weight:600;font-size:16px}
.xcwc-photo-view .photo-hint{margin:10px 0 0;text-align:center;font-size:12px;line-height:1.7;color:#718464;overflow-wrap:anywhere}
.xcwc-photo-view details{margin-top:12px;font-size:12px;color:#809171}.xcwc-photo-view summary{cursor:pointer;min-height:44px;padding:10px 0}
.xcwc-photo-view details p{margin:4px 0}.xcwc-photo-view a{display:inline-block;min-height:44px;color:#536c43;padding:10px 0;text-decoration:underline}
.xcwc-photo-view button:focus-visible,.xcwc-photo-view summary:focus-visible,.xcwc-photo-view a:focus-visible{outline:2px solid #a7955f;outline-offset:2px}
section.xcwc-photo-view{border:1px solid #dce3cd;border-radius:18px;width:100%;max-width:500px;margin:auto}section.xcwc-photo-view .photo-close{font-size:14px}section.xcwc-photo-view img{max-height:62dvh}
`;document.head.append(style);
  }
  const root=document.createElement(container?'section':'dialog');root.className='xcwc-photo-view';root.id='xcwc-checkin-save';
  root.setAttribute('aria-labelledby','xcwc-photo-title');
  root.innerHTML='<div class="photo-card"><header><h2 id="xcwc-photo-title">打卡合照</h2><button type="button" class="photo-close" data-save-close aria-label="关闭合照">×</button></header><img alt="打卡合照，长按可保存" tabindex="0"><p class="photo-meta"></p><p class="photo-note"></p><button type="button" class="photo-save" data-save-share aria-describedby="xcwc-photo-hint">保存到手机相册</button><p class="photo-hint" id="xcwc-photo-hint" data-save-hint role="status"></p><details><summary>其他保存方式</summary><p>下载会存入“文件”或下载目录，不会直接存入手机相册。</p><a>下载到文件</a></details></div>';
  (container||document.body).append(root);
  view={root,modal:!container,image:root.querySelector('img'),meta:root.querySelector('.photo-meta'),note:root.querySelector('.photo-note'),hint:root.querySelector('[data-save-hint]'),action:root.querySelector('[data-save-share]'),download:root.querySelector('a'),details:{}};
  const closeButton=root.querySelector('[data-save-close]');closeButton.onclick=close;view.action.onclick=save;
  if(container){closeButton.textContent='返回合照';closeButton.setAttribute('aria-label','完成，返回打卡');}
  else{
   root.addEventListener('close',()=>{if(!root.open)release();});
   root.addEventListener('click',event=>{if(event.target===root){const r=root.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  }
 }
 function show(image,details={},container=null){
  if(!(image instanceof Blob)||image.size>16*1024*1024||!['image/jpeg','image/png'].includes(image.type))throw Error('图片无法保存');
  ensureView(container);release();
  file=new File([image],'小鸟伴游-'+Date.now()+(image.type==='image/png'?'.png':'.jpg'),{type:image.type});
  imageUrl=URL.createObjectURL(image);view.image.src=imageUrl;
  view.download.href=imageUrl;view.download.download=file.name;
  view.details={label:text(details.label),createdAt:text(details.createdAt),note:text(details.note)};
  const date=new Date(view.details.createdAt);view.meta.textContent=[view.details.label,Number.isNaN(date.getTime())?'':date.toLocaleString('zh-CN',{hour12:false})].filter(Boolean).join(' · ');
  view.meta.hidden=!view.meta.textContent;view.note.textContent=view.details.note;view.note.hidden=!view.details.note;
  const available=canShare(),securePage=needsSecurePage();
  view.action.textContent=available||securePage?'保存到手机相册':'长按合照保存';view.action.disabled=sharing;
  view.hint.textContent=available?'在系统菜单中选择“存储图像”，也可以长按合照保存。':securePage?'点击保存后进入系统保存页，也可以直接长按合照保存。':'长按上方合照，选择“存储图像”或“保存图片”。';
  view.root.querySelector('details').open=false;view.root.hidden=false;
  if(view.modal&&!view.root.open)view.root.showModal();
  // Opening the viewer never opens another modal, tab or system share sheet.
  return {shown:true};
 }
 window.xcwcPhotoSave=Object.freeze({show,close,mount:(image,container,details)=>show(image,details,container)});
 window.addEventListener('pagehide',release);
})();
