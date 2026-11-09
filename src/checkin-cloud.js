let historyVersion=0,destroyed=false,authenticated=false,balance=0,nextCursor=null,albumTotal=0,originalFile=null,pendingSubmission=null;
const ownedUrls=new Set(),albumUrls=new Map(),albumPending=new Map(),rpcController=new AbortController();
const rememberUrl=url=>{ownedUrls.add(url);return url;};
const rpc=(operation,args={})=>checkinRpc(operation,args,rpcController.signal);
const readBlob=url=>fetch(url).then(response=>response.blob());
function assetFor(city){return checkinAssets['felt-bird-v1.png'];}
let draftEpoch=null,draftLease=null,draftReady=false,draftTimer=null,displayBlob=null,restoringDraft=false,draftRestoreFailed=false;
function draftSnapshot(){return {photoBlob:uploaded?displayBlob:null,selected:[...selected],active,poses:reconcilePoses(selected,poses),style,label:$('#ck-location').value,photoFit,photoX,photoY,dirty,editorOpen:$('#ck-editor').open,pendingSubmission};}
function persistDraft(){
 clearTimeout(draftTimer);draftTimer=null;
 if(destroyed||!draftReady||restoringDraft||draftEpoch===null)return;
 // Flush before aborting the page controller. The host rejects stale reset generations.
 void checkinRpc('draftWrite',{epoch:draftEpoch,lease:draftLease,draft:draftSnapshot()}).catch(()=>{});
}
function scheduleDraft(){if(!draftReady||restoringDraft||destroyed)return;clearTimeout(draftTimer);draftTimer=setTimeout(persistDraft,180);}
async function restoreDraft(){
 if(restoringDraft)return;restoringDraft=true;draftReady=false;let provisionalUrl='';
 try{
  const result=await rpc('draftRead');if(destroyed)return;
  draftEpoch=result.epoch;draftLease=result.lease;
  const draft=result.draft;
  if(!draft){draftReady=true;draftRestoreFailed=false;setIssue('assets','');return;}
  // Do not publish partial state: a decode or asset failure must leave the host's
  // original Blob and uncertain submission intact for a later route/retry.
  const valid=draft.selected.filter(id=>birds.some(bird=>bird.id===id&&bird.adopted));
  let restoredImage=null,restoredUrl='';
  if(draft.photoBlob){
   restoredUrl=rememberUrl(URL.createObjectURL(draft.photoBlob));provisionalUrl=restoredUrl;restoredImage=new Image();restoredImage.src=restoredUrl;
   try{await loadImage(restoredImage)}catch{restoredImage=new Image();restoredImage.src=await photoDataUrl(draft.photoBlob);await loadImage(restoredImage)}
   if(destroyed)return;
   await prepareCanvasImages(valid,{background:false});if(destroyed)return;
  }
  selected=valid;poses=reconcilePoses(valid,draft.poses);active=valid.includes(draft.active)?draft.active:valid[0]||null;
  style=Math.max(0,Math.min(3,Number(draft.style)||0));photoFit=draft.photoFit==='contain'?'contain':'cover';photoX=draft.photoX??50;photoY=draft.photoY??50;
  $('#ck-location').value=draft.label;$('#ck-editor').open=!!draft.editorOpen;
  if(restoredImage){
   displayBlob=draft.photoBlob;originalFile=displayBlob;uploadUrl=restoredUrl;provisionalUrl='';photo=restoredImage;uploaded=true;
   $('#ck-uploadThumb').src=restoredImage.src;$('#ck-uploadThumb').hidden=false;$('#ck-dropzone').classList.add('has-image');$('.replace').hidden=false;
  }
  dirty=!!draft.dirty;pendingSubmission=valid.length===draft.selected.length?draft.pendingSubmission||null:null;
  host.querySelectorAll('.style').forEach((element,index)=>{element.classList.toggle('selected',index===style);element.setAttribute('aria-pressed',String(index===style))});
  renderBirdList();update(false);$('#ck-draftNote').textContent='已恢复上次编辑。切换页面可继续保留，关闭网页后不保留。';
  draftRestoreFailed=false;draftReady=true;setIssue('assets','');$('#ck-retryAssets').textContent='重新加载合照素材';
 }catch(error){
  draftRestoreFailed=true;draftReady=false;
  if(!destroyed){setIssue('assets','上次编辑尚未恢复，照片和待确认收藏仍为你保留。请重试恢复，或重新选择照片。');$('#ck-retryAssets').textContent='恢复上次编辑';}
  throw error;
 }finally{if(provisionalUrl){URL.revokeObjectURL(provisionalUrl);ownedUrls.delete(provisionalUrl);}restoringDraft=false;}
}
async function claimDraftForNewPhoto(){
 if(draftReady)return;
 const result=await rpc('draftRead');if(destroyed)return;
 draftEpoch=result.epoch;draftLease=result.lease;draftRestoreFailed=false;draftReady=true;
}
function memoryUrl(work){
 if(work.image)return Promise.resolve(work.image);
 if(albumUrls.has(work.id))return Promise.resolve(albumUrls.get(work.id));
 if(albumPending.has(work.id))return albumPending.get(work.id);
 const pending=rpc('image',{id:work.id}).then(blob=>{
  if(destroyed)throw Error('页面已离开');
  const url=rememberUrl(URL.createObjectURL(blob));albumUrls.set(work.id,url);return url;
 }).finally(()=>{if(albumPending.get(work.id)===pending)albumPending.delete(work.id)});
 albumPending.set(work.id,pending);return pending;
}
async function loadAlbum(append=false){
 if(albumLoading)return;
 albumLoading=true;setIssue('album','');syncGenerate();
 const version=++historyVersion;
 try{
  const page=await rpc('history',{cursor:append?nextCursor:null});if(destroyed)return;
  const loaded=page.items.map(work=>({...work,image:albumUrls.get(work.id)||null,createdAt:new Date(work.createdAt).getTime()}));
  if(version!==historyVersion)return;nextCursor=page.nextCursor;albumTotal=page.total;albumAvailable=true;
  entries=sortedMemories([...new Map([...(append?entries:[]),...loaded].map(work=>[work.id,work])).values()]);renderGallery();
 }catch(error){if(!destroyed){albumAvailable=false;setIssue('album','打卡相册暂时无法读取。可先查看大图保存合照，再重试。');throw error;}}
 finally{albumLoading=false;if(!destroyed){syncAlbumControls();syncGenerate();}}
}
async function sourceBlob(){
 const canvas=document.createElement('canvas');const scale=Math.min(1,Math.sqrt(12_000_000/(photo.naturalWidth*photo.naturalHeight)),4096/Math.max(photo.naturalWidth,photo.naturalHeight));canvas.width=Math.max(1,Math.round(photo.naturalWidth*scale));canvas.height=Math.max(1,Math.round(photo.naturalHeight*scale));canvas.getContext('2d').drawImage(photo,0,0,canvas.width,canvas.height);return new Promise((resolve,reject)=>canvas.toBlob(blob=>{canvas.width=canvas.height=1;blob?resolve(blob):reject(new Error('原照片处理失败'));},'image/jpeg',.92));
}
checkinCleanup=()=>{
 persistDraft();clearTimeout(draftTimer);void rpc('closeViewer').catch(()=>{});destroyed=true;uploadVersion++;rpcController.abort();
 if(typeof stage!=='undefined'){for(const id of pointers.keys())if(stage.hasPointerCapture(id))stage.releasePointerCapture(id);pointers.clear();stage.onpointerdown=null;stage.onpointermove=null;stage.onpointerup=null;}
 for(const url of ownedUrls)URL.revokeObjectURL(url);ownedUrls.clear();albumPending.clear();
};
