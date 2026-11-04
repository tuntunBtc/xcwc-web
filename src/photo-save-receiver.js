(()=>{
 const source=window.opener,token=location.hash.slice(1),status=document.getElementById('save-status'),recovery=document.getElementById('save-recovery');
 const recover=message=>{status.hidden=false;status.textContent=message;if(recovery)recovery.hidden=false;};
 const back=document.getElementById('save-return');if(back)back.onclick=()=>{try{source?.focus()}catch{}window.close();const hint=document.getElementById('save-returnHint');if(hint)hint.textContent='如果此页未自动关闭，请切换回之前的合照标签页。原照片不会被删除。';};
 if(!isSecureContext||location.protocol!=='https:'||!source||!/^[a-f0-9]{32}$/.test(token)){recover('请返回之前的合照页面，重新点击保存。');return;}
 // Only the paired HTTP page on this exact host/port may supply an image.
 const origin='http://'+location.host;
 const timer=setTimeout(()=>{window.removeEventListener('message',receive);window.opener=null;recover('照片准备超时，请返回之前的合照页面重新保存。');},15000);
 function receive(event){
  const data=event.data;
  if(event.source!==source||event.origin!==origin||data?.channel!=='xcwc-photo-save-image'||data.token!==token)return;
  if(!(data.image instanceof Blob)||data.image.size>16*1024*1024||!['image/jpeg','image/png'].includes(data.image.type))return;
  clearTimeout(timer);window.removeEventListener('message',receive);window.opener=null;history.replaceState(null,'',location.pathname);
  status.hidden=true;
  window.xcwcPhotoSave.mount(data.image,document.getElementById('photo-save-content'),{label:data.label,createdAt:data.createdAt,note:data.note});
 }
 window.addEventListener('message',receive);
 source.postMessage({channel:'xcwc-photo-save-ready',token},origin);
})();
