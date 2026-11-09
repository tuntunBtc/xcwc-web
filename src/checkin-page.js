function mountCheckin(){
const host=root.querySelector(".checkin-page");
__CHECKIN_CLOUD__
const media=createDeferredMedia({signal:rpcController.signal,root:content});
const shutterAudio=createCheckinShutterAudio(rpcController.signal);
__CHECKIN_MODEL__
const $=selector=>host.querySelector(selector);
let birds=[];
const presets=[{name:'清新自然',filter:'none'},{name:'暖阳胶片',filter:'sepia(.28) saturate(.85) contrast(.93)'},{name:'柔和风景',filter:'saturate(.75) brightness(1.09)'},{name:'黑白记忆',filter:'grayscale(1) contrast(.9)'}];
const images=new Map(),landscape=new Image();
let selected=[],active=null,poses=arrangement(selected),style=0,photo=null,uploaded=false,busy=false,readingPhoto=false,localMode=false,dirty=false,entries=[],examples=[],uploadUrl='',uploadVersion=0,db=null,ready=false;
let photoFit='cover',photoX=50,photoY=50,albumLoading=false,albumAvailable=false,albumExpanded=false,albumManaging=false,deleteEntry=null,deleteBusy=false,initializing=false,canvasReady=false,canvasLoading=false,canvasVersion=0;
// Use the image load lifecycle without requiring Image.decode() support.
function loadImage(im){return new Promise((resolve,reject)=>{
 const loaded=()=>{cleanup();im.naturalWidth?resolve(im):reject(new Error('图片为空'));};
 const failed=()=>{cleanup();reject(new Error('图片无法解码'));};
 const cleanup=()=>{im.removeEventListener('load',loaded);im.removeEventListener('error',failed);};
 im.addEventListener('load',loaded);im.addEventListener('error',failed);
 if(im.complete){if(im.naturalWidth)loaded();else if(im.src)failed();}
});}
function photoTypeAllowed(file){
 const type=(file.type||'').toLowerCase();
 return ['image/jpeg','image/png','image/webp','image/heic','image/heif','image/heic-sequence','image/heif-sequence'].includes(type)||
 ((!type||type==='application/octet-stream')&&/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name||''));
}
function photoDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reader.onabort=()=>reject(new Error('照片读取失败'));reader.readAsDataURL(file);});}
const assetUrls=new Map();
function canvasAssetUrl(key){
 if(assetUrls.has(key))return assetUrls.get(key);
 const pending=rpc('canvasAsset',{key}).then(blob=>{if(destroyed)throw Error('页面已离开');return rememberUrl(URL.createObjectURL(blob));}).catch(error=>{if(assetUrls.get(key)===pending)assetUrls.delete(key);throw error});
 assetUrls.set(key,pending);return pending;
}
async function loadCheckinAsset(im,key){
 try{
  // The host fetches only allowlisted public assets with its same origin.
  // A local Blob avoids requiring CORS headers for the opaque sandbox canvas.
  const url=await canvasAssetUrl(key);if(destroyed)throw Error('页面已离开');
  im.src=url;return await loadImage(im);
 }catch{assetUrls.delete(key);throw Object.assign(new Error('合照素材加载失败，请点击重新加载'),{code:'CHECKIN_ASSET_FAILED'});}
}
// Keep decoded stickers shared, but prepare only birds actually used by the canvas.
// The example landscape is unnecessary once a real photo has been selected.
const stickerImages=new Map();let landscapeReady=null;
function ensureCanvasImages(ids=selected,{background=!uploaded}={}){
 const pending=ids.map(id=>birdFor(id)).filter(Boolean).map(bird=>{
  let shared=stickerImages.get(bird.src);
  if(!shared){
   const image=new Image();
   const ready=loadCheckinAsset(image,'bird').catch(error=>{if(stickerImages.get(bird.src)?.ready===ready)stickerImages.delete(bird.src);throw error});
   shared={image,ready};stickerImages.set(bird.src,shared);
  }
  images.set(bird.id,shared.image);return shared.ready;
 });
 if(background){
  if(!landscapeReady){const ready=loadCheckinAsset(landscape,'background').catch(error=>{if(landscapeReady===ready)landscapeReady=null;throw error});landscapeReady=ready;}
  pending.push(landscapeReady);
 }
 return Promise.all(pending);
}
function canvasAssetsReady(ids=selected,{background=!uploaded}={}){
 return (!background||!!landscape.naturalWidth)&&ids.every(id=>!!images.get(id)?.naturalWidth);
}
function toast(text){$('#ck-toast').textContent=text;$('#ck-toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#ck-toast').classList.remove('show'),3000)}
function birdFor(id){return birds.find(b=>b.id===id)}
function ratio(id){const im=images.get(id);return im?.naturalHeight/im?.naturalWidth||1}
function setIssue(scope,message){const ids={data:'ck-dataError',assets:'ck-assetError',album:'ck-albumError'},box=$('#'+ids[scope]);box.hidden=!message;box.querySelector('p').textContent=message;}
async function prepareCanvasImages(ids=selected,options={}){
 const version=++canvasVersion;canvasLoading=true;canvasReady=false;syncGenerate();
 try{await ensureCanvasImages(ids,options);if(!destroyed&&version===canvasVersion){canvasReady=true;setIssue('assets','');}}
 catch(error){if(!destroyed&&version===canvasVersion){canvasReady=false;setIssue('assets','合照素材暂时无法加载。照片会保留，请重新加载后继续。');}throw error}
 finally{if(!destroyed&&version===canvasVersion){canvasLoading=false;syncGenerate();}}
}
function refreshCanvasSelection(){
 // A late result for the previous cast must not enable export for the new cast.
 canvasVersion++;canvasLoading=false;canvasReady=canvasAssetsReady();if(canvasReady)setIssue('assets','');
 if(photo&&!canvasReady)void prepareCanvasImages().then(()=>{if(!destroyed)update(false)}).catch(()=>{});
}

function eligible(){return ready&&canvasReady&&authenticated&&uploaded&&selected.length>0&&dirty&&albumAvailable&&albumTotal<30&&!busy&&!readingPhoto}
function syncGenerate(){
 $('#ck-download').disabled=!ready||!canvasReady||!uploaded||busy||readingPhoto;
 const button=$('#ck-generate');button.disabled=!eligible();
 $('.generate-text').textContent=busy?'正在收藏回忆…':readingPhoto?'正在处理照片…':!ready?'小鸟资料尚未准备好':!selected.length?'先选一只小鸟':!uploaded?'选择照片，开启合照':!canvasReady?(canvasLoading?'正在准备合照素材…':'合照素材未就绪，请重试'):albumLoading?'正在读取相册…':!albumAvailable?'相册暂不可用，请重试':albumTotal>=30?'相册已满，先管理合照':!dirty?'已收藏，调整后再合照':'生成并收藏';
 $('#ck-points').textContent=balance;
}
function renderBirdList(){const nodes=birds.map(b=>{const button=document.createElement('button');button.type='button';button.dataset.birdId=b.id;button.className='bird-card'+(selected.includes(b.id)?' selected':'')+(!b.adopted?' locked':'');button.disabled=!b.adopted;button.setAttribute('aria-label',b.name+(b.adopted?'，已领取':'，未领取，已锁定'));if(b.adopted)button.setAttribute('aria-pressed',String(selected.includes(b.id)));const portrait=document.createElement('span');portrait.className='bird-portrait';const im=document.createElement('img');im.alt='';im.decoding='async';im.loading='lazy';portrait.append(im);media.defer(im,()=>loadCheckinAsset(im,'bird').catch(()=>{if(!destroyed)im.alt='小鸟图片暂时无法显示'}));const badge=document.createElement('span');badge.className='bird-badge';badge.innerHTML=`<svg><use href="#ck-${b.adopted?'check':'lock'}"/></svg>`;portrait.append(badge);const title=document.createElement('strong');title.textContent=b.name;const sub=document.createElement('small');sub.textContent=b.adopted?'已领取':'未领取';button.append(portrait,title,sub);button.onclick=()=>{if(busy)return;const result=chooseBird(selected,b.id,birds);if(result.error)return toast(result.error);selected=result.selected;poses=reconcilePoses(selected,poses);active=selected.includes(active)?active:selected.at(-1)||null;if(selected.includes(b.id))active=b.id;refreshCanvasSelection();renderBirdList();update()};return button});$('#ck-birdList').replaceChildren(...nodes);if(!nodes.length)media.defer($('#ck-birdList'),()=>canvasAssetUrl('bird').then(url=>{if(!destroyed)$('#ck-birdList').style.setProperty('--ck-empty-bird','url(\"'+url+'\")')}).catch(()=>{}));const activeSelect=$('#ck-activeBird');activeSelect.replaceChildren(...selected.map(id=>{const option=document.createElement('option');option.value=id;option.textContent=birdFor(id).name;return option}));activeSelect.disabled=!selected.length;activeSelect.value=active||'';$('#ck-noBirds').hidden=birds.some(b=>b.adopted);$('#ck-selectedCount').textContent=selected.length;$('#ck-selectedSummary').textContent=selected.length?'已选 '+selected.map(id=>birdFor(id).name).join('、'):'选一位小伙伴，一起出发吧'}
$('#ck-styles').innerHTML=presets.map((p,i)=>`<button class="style ${i===0?'selected':''}" data-style="${i}" aria-label="${p.name}" aria-pressed="${i===0}"><span class="style-thumb" data-xcwc-bg="assets/checkin/felt-style-thumb-192.webp" style="filter:${p.filter}"></span><span>${p.name}</span><i>✓</i></button>`).join('');
media.scan($('#ck-styles'));
$('#ck-styles').onclick=e=>{if(busy)return;const b=e.target.closest('button');if(!b)return;style=Number(b.dataset.style);host.querySelectorAll('.style').forEach((el,i)=>{el.classList.toggle('selected',i===style);el.setAttribute('aria-pressed',String(i===style))});update()};
function render(canvas,options={}){const im=options.photo||photo;if(!im)return;const ids=options.ids||selected,layout=options.poses||poses,filter=options.style??style,label=options.label??$('#ck-location').value;if(canvas.width!==1000)canvas.width=1000;if(canvas.height!==1010)canvas.height=1010;const c=canvas.getContext('2d');c.fillStyle='#fffdf4';c.fillRect(0,0,1000,1010);c.save();c.beginPath();c.rect(38,38,924,812);c.clip();c.filter=presets[filter].filter;const framing=photoPlacement(im.naturalWidth,im.naturalHeight,options.photoFit||photoFit,options.photoX??photoX,options.photoY??photoY);c.drawImage(im,framing.x,framing.y,framing.width,framing.height);c.filter='none';for(const id of ids){const bird=images.get(id);if(!bird?.naturalWidth||!layout[id])continue;const r=rectFor(layout[id],ratio(id));c.shadowColor='#26311e38';c.shadowBlur=14;c.shadowOffsetY=7;c.drawImage(bird,r.x,r.y,r.w,r.h)}c.restore();c.fillStyle='#556744';c.font='30px "Noto Serif SC",serif';c.fillText('⌖ '+(label.trim()||'在路上'),55,915);c.fillStyle='#b19d78';c.font='16px Georgia';c.textAlign='right';c.fillText('A LITTLE MOMENT WITH YOU',944,915);c.textAlign='left';c.fillStyle='#9b9e88';c.font='15px Georgia';c.fillText('BIRD & BEYOND',55,962);c.textAlign='right';c.fillText('OUR TRAVEL DIARY',944,962);c.textAlign='left'}
let paintFrame=null;
function scheduleUpdate(){
 if(destroyed||!ready)return;
 // Record edits immediately, even when the next paint is deferred or cancelled.
 const wasDirty=dirty;pendingSubmission=null;dirty=true;
 // A freshly edited saved work must be clickable before its first scheduled paint.
 if(!wasDirty)syncGenerate();
 if(paintFrame===null)paintFrame=requestAnimationFrame(()=>{paintFrame=null;update()});
}
function flushUpdate(){if(paintFrame!==null){cancelAnimationFrame(paintFrame);paintFrame=null;update()}}
rpcController.signal.addEventListener('abort',()=>{if(paintFrame!==null)cancelAnimationFrame(paintFrame);paintFrame=null;},{once:true});
// Export always sees the last gesture, including a click before the next frame.
for(const selector of ['#ck-generate','#ck-download'])$(selector).addEventListener('click',flushUpdate,{capture:true,signal:rpcController.signal});
function update(markDirty=true){if(paintFrame!==null){cancelAnimationFrame(paintFrame);paintFrame=null;}if(destroyed||!ready)return;if(markDirty)pendingSubmission=null;for(const id of selected)constrain(poses[id],ratio(id));render($('#ck-preview'));syncSelection();syncPhotoControls();if(markDirty)dirty=true;$('#ck-previewBadge').textContent=uploaded?(dirty?'编辑中':'已收藏'):'示例';$('#ck-previewTitle').textContent=uploaded?'调整我们的合照':'看看合照效果';syncGenerate();scheduleDraft();}
function syncSelection(){$('#ck-activeBird').value=active||'';const box=$('#ck-birdSelection');box.hidden=!active||!poses[active]||!photo;const disabled=!active||!photo;for(const selector of ['#ck-smaller','#ck-larger','#ck-size','#ck-resetBird'])$(selector).disabled=disabled;if(disabled)return;const p=poses[active],r=rectFor(p,ratio(active));Object.assign(box.style,{left:r.x/10+'%',top:r.y/10.1+'%',width:r.w/10+'%',height:r.h/10.1+'%'});$('#ck-activeName').textContent=birdFor(active).name;$('#ck-size').value=p.size;$('#ck-sizeValue').textContent=Math.round(p.size)+'%';$('#ck-adjustLabel').textContent=birdFor(active).name}
function setSize(value){if(!active||busy||!photo)return;poses[active].size=Math.max(12,Math.min(55,Number(value)));scheduleUpdate()}
$('#ck-size').oninput=e=>setSize(e.target.value);$('#ck-smaller').onclick=()=>setSize(poses[active]?.size-3);$('#ck-larger').onclick=()=>setSize(poses[active]?.size+3);$('#ck-resetBird').onclick=()=>{if(busy||!active)return;poses=resetPose(selected,poses,active);update()};$('#ck-location').oninput=()=>{if(!busy)scheduleUpdate()};
$('#ck-activeBird').onchange=event=>{if(busy)return;active=event.target.value;syncSelection();scheduleDraft();};
function syncPhotoControls(){
 $('#ck-activeBird').disabled=!selected.length||busy;$('#ck-photoFit').disabled=!uploaded||busy||readingPhoto;$('#ck-photoFit').value=photoFit;
 const placement=photo?photoPlacement(photo.naturalWidth,photo.naturalHeight,photoFit,photoX,photoY):null;
 $('#ck-photoXLabel').hidden=!uploaded||photoFit!=='cover'||!placement?.horizontal;$('#ck-photoYLabel').hidden=!uploaded||photoFit!=='cover'||!placement?.vertical;
 $('#ck-photoX').value=photoX;$('#ck-photoY').value=photoY;$('#ck-photoX').disabled=$('#ck-photoY').disabled=busy||readingPhoto;
}
$('#ck-photoFit').onchange=event=>{if(busy)return;photoFit=event.target.value;update();};
$('#ck-photoX').oninput=event=>{if(busy)return;photoX=Number(event.target.value);scheduleUpdate();};
$('#ck-photoY').oninput=event=>{if(busy)return;photoY=Number(event.target.value);scheduleUpdate();};
async function upload(file){
 if(busy||readingPhoto||!file)return;
 const token=++uploadVersion;let url='',processed=file;
 try{
  const heic=await isCheckinHeic(file);if(destroyed||token!==uploadVersion)return;
  if(!photoTypeAllowed(file)&&!heic)return toast('请选择手机拍摄的照片或 JPG、PNG、WEBP 图片');
  if(file.size>15*1024*1024)return toast('照片超过 15 MB，换一张小一点的吧');
  readingPhoto=true;$('#ck-file').disabled=true;syncGenerate();
  toast('正在读取照片…');
  url=rememberUrl(URL.createObjectURL(file));let im=new Image();im.src=url;
  try{await loadImage(im);}catch{
   if(destroyed||token!==uploadVersion)return;
   // A data URL also works in iOS containers that fail to display file blob URLs.
   const data=await photoDataUrl(file);if(destroyed||token!==uploadVersion)return;
   im=new Image();im.src=data;
   try{await loadImage(im);}catch(error){
    if(destroyed||token!==uploadVersion)return;
    if(!heic)throw error;
    toast('正在本机处理苹果照片，请稍候…');
    const converted=await convertCheckinHeic(file);processed=converted;if(destroyed||token!==uploadVersion)return;
    URL.revokeObjectURL(url);ownedUrls.delete(url);
    url=rememberUrl(URL.createObjectURL(converted));im=new Image();im.src=url;
    try{await loadImage(im);}catch{im=new Image();im.src=await photoDataUrl(converted);await loadImage(im);}
   }
  }
  await initialized;if(!ready)throw Error('小鸟资料尚未准备好，请稍后重试');if(destroyed||token!==uploadVersion)return;
  if(uploadUrl){URL.revokeObjectURL(uploadUrl);ownedUrls.delete(uploadUrl);}
  pendingSubmission=null;dirty=true;uploadUrl=url;url='';photo=im;originalFile=file;displayBlob=processed;uploaded=true;photoX=photoY=50;
  $('#ck-uploadThumb').src=im.src;$('#ck-uploadThumb').hidden=false;
  $('#ck-dropzone').classList.add('has-image');$('.replace').hidden=false;$('#ck-editor').open=true;
  await prepareCanvasImages();if(destroyed||token!==uploadVersion)return;await claimDraftForNewPhoto();if(destroyed||token!==uploadVersion)return;update();toast('照片就位！可以拖动每只小鸟调整位置');
 }catch(error){
  if(!destroyed&&token===uploadVersion){if(uploaded){dirty=true;scheduleDraft();}toast(error.code==='CHECKIN_ASSET_FAILED'||error.message?.includes('组件加载失败')?error.message:'照片没能打开，可能文件损坏或格式暂不支持，请换一张照片重试');}
 }finally{
  if(url){URL.revokeObjectURL(url);ownedUrls.delete(url);}
  if(!destroyed&&token===uploadVersion){readingPhoto=false;$('#ck-file').disabled=false;$('#ck-file').value='';syncPhotoControls();syncGenerate();}
 }
}
$('#ck-file').onchange=e=>upload(e.target.files[0]);$('#ck-dropzone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!busy)$('#ck-file').click()}};$('#ck-dropzone').onclick=e=>{if(busy)e.preventDefault()};for(const ev of ['dragenter','dragover'])$('#ck-dropzone').addEventListener(ev,e=>{e.preventDefault();$('#ck-dropzone').classList.add('drag')});for(const ev of ['dragleave','drop'])$('#ck-dropzone').addEventListener(ev,e=>{e.preventDefault();$('#ck-dropzone').classList.remove('drag');if(ev==='drop')upload(e.dataTransfer.files[0])});
function formatDate(time){const d=new Date(time);return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`}
function syncAlbumControls(){
 const expand=$('#ck-viewAll');expand.hidden=albumTotal<=4;expand.disabled=albumLoading;
 expand.textContent=!albumExpanded?'查看全部 '+albumTotal+' 张':nextCursor?'加载更多':'收起';expand.setAttribute('aria-expanded',String(albumExpanded));
 $('#ck-manageAlbum').hidden=!albumTotal;$('#ck-manageAlbum').textContent=albumManaging?'完成管理':'管理合照';
 $('#ck-gallery').classList.toggle('expanded',albumExpanded);$('#ck-gallery').classList.toggle('managing',albumManaging);
 $('#ck-albumCapacity').textContent='已用 '+albumTotal+' / 30 张';$('#ck-albumFull').hidden=albumTotal<30;
 $('#ck-albumCount').textContent=albumTotal;
}
function renderGallery(){
 entries=sortedMemories(entries);
 $('#ck-gallery').replaceChildren(...entries.map(entry=>{
  const card=document.createElement('article');card.className='memory-card';
  const b=document.createElement('button');b.type='button';b.className='memory';
  const img=document.createElement('img');img.alt=entry.label+'的合照';img.loading='lazy';img.decoding='async';
  media.defer(img,()=>memoryUrl(entry).then(url=>{if(!destroyed&&img.isConnected)img.src=url}).catch(error=>{if(!destroyed&&img.isConnected){img.alt='合照暂时无法加载，点击重试';b.title=error.message}}));
  const body=document.createElement('span');body.className='memory-body';const title=document.createElement('strong');title.textContent=entry.label;const meta=document.createElement('span');meta.className='memory-meta';const date=document.createElement('time');date.dateTime=new Date(entry.createdAt).toISOString();date.textContent=formatDate(entry.createdAt);const badge=document.createElement('small');badge.textContent=entry.reward===1?'+1 叽分':'已收藏';meta.append(date,badge);body.append(title,meta);b.append(img,body);
  b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{const url=await memoryUrl(entry);if(destroyed)return;img.src=url;await viewPhoto(await readBlob(url),{label:entry.label,createdAt:new Date(entry.createdAt).toISOString()})}catch(error){if(!destroyed)toast(error.message)}finally{b.disabled=false}};
  const remove=document.createElement('button');remove.type='button';remove.className='delete-memory';remove.textContent='删除合照';remove.setAttribute('aria-label','删除'+entry.label+'的合照');remove.onclick=()=>askDelete(entry);
  card.append(b,remove);return card;
 }));
 $('#ck-albumFoot').textContent=entries.length?'仅保存在当前浏览器 · 重要合照请保存到手机':'还没有合照，和小鸟一起收藏第一张回忆吧';syncAlbumControls();syncGenerate();
}
function manageAlbum(){albumManaging=!albumManaging;if(albumManaging)albumExpanded=true;syncAlbumControls();}
$('#ck-manageAlbum').onclick=manageAlbum;
$('#ck-manageFull').onclick=()=>{albumManaging=albumExpanded=true;syncAlbumControls();$('#ck-album').scrollIntoView({behavior:'smooth',block:'start'});$('#ck-manageAlbum').focus({preventScroll:true});};
function askDelete(entry){if(deleteBusy)return;deleteEntry=entry;$('#ck-deleteTitle').textContent='删除“'+entry.label+'”这张合照？';$('#ck-deleteStatus').textContent='';$('#ck-deleteConfirm').hidden=false;$('#ck-cancelDelete').focus();$('#ck-deleteConfirm').scrollIntoView({block:'nearest'});}
function cancelDelete(){if(deleteBusy)return;deleteEntry=null;$('#ck-deleteConfirm').hidden=true;$('#ck-manageAlbum').focus();}
$('#ck-cancelDelete').onclick=cancelDelete;
$('#ck-deleteConfirm').onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();cancelDelete();}};
$('#ck-confirmDelete').onclick=async()=>{
 if(!deleteEntry||deleteBusy)return;const entry=deleteEntry;deleteBusy=true;$('#ck-confirmDelete').disabled=$('#ck-cancelDelete').disabled=true;$('#ck-deleteStatus').textContent='正在删除…';
 try{
  await rpc('delete',{id:entry.id,epoch:draftEpoch});if(destroyed)return;
  const url=albumUrls.get(entry.id);if(url){URL.revokeObjectURL(url);ownedUrls.delete(url);albumUrls.delete(entry.id);}
  entries=entries.filter(item=>item.id!==entry.id);albumTotal=Math.max(0,albumTotal-1);deleteEntry=null;$('#ck-deleteConfirm').hidden=true;
  if(!albumTotal)albumManaging=albumExpanded=false;
  renderGallery();try{await loadAlbum(false)}catch{}if(!destroyed){toast('这张合照已删除，小鸟和叽分保持不变');$('#ck-manageAlbum').focus();}
 }catch(error){if(!destroyed){$('#ck-deleteStatus').textContent=error.message+'，可以重试。';}}
 finally{deleteBusy=false;if(!destroyed){$('#ck-confirmDelete').disabled=$('#ck-cancelDelete').disabled=false;}}
};
__CHECKIN_GENERATE__
async function viewPhoto(image,details={}){if(destroyed)return;return rpc('viewImage',{image,...details})}
$('#ck-download').onclick=async()=>{
 const button=$('#ck-download');if(!ready||!canvasReady||!uploaded||busy||readingPhoto||button.disabled)return;
 button.disabled=true;
 try{const image=await new Promise((resolve,reject)=>$('#ck-preview').toBlob(blob=>blob?resolve(blob):reject(new Error('合照生成失败')),'image/jpeg',.95));await viewPhoto(image,{label:$('#ck-location').value.trim()||'在路上',note:'预览合照 · 尚未收藏到打卡相册'});}catch(error){if(!destroyed)toast(error.message)}finally{if(!destroyed)syncGenerate()}
};
$('#ck-viewAll').onclick=async()=>{
 if(albumLoading)return;
 try{
  if(!albumExpanded){albumExpanded=true;syncAlbumControls();}
  else if(nextCursor){await loadAlbum(true);}
  else{albumExpanded=false;albumManaging=false;syncAlbumControls();}
 }catch(error){toast(error.message);}
};
const stage=$('#ck-canvasStage'),preview=$('#ck-preview'),pointers=new Map();let gesture=null;
function point(e){const r=preview.getBoundingClientRect();return {x:(e.clientX-r.left)*1000/r.width,y:(e.clientY-r.top)*1010/r.height}}
function hit(p){return [...selected].reverse().find(id=>{const r=rectFor(poses[id],ratio(id));return p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h})}
function startGesture(){
 const pts=[...pointers.values()];if(!active||!pts.length){gesture=null;return}
 const pose={...poses[active]};
 gesture=pts.length===2?{type:'pinch',pose,distance:Math.max(1,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)),mid:{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}}:{type:hit(pts[0])===active?'drag':'pending',pose,start:pts[0]};
}
stage.onpointerdown=e=>{
 if(!ready||!photo||busy||e.button>0||pointers.size>=2)return;
 const p=point(e),id=hit(p);
 // A first touch beside the bird may be the beginning of a two-finger pinch.
 if(!pointers.size){if(id)active=id;else if(e.pointerType!=='touch'||!active)return;}
 else if(gesture?.type==='pending'&&id)active=id;
 e.preventDefault();pointers.set(e.pointerId,p);stage.setPointerCapture(e.pointerId);stage.classList.add('manipulating');preview.focus({preventScroll:true});syncSelection();startGesture();
};
stage.onpointermove=e=>{
 const p=point(e);if(!pointers.has(e.pointerId)){preview.style.cursor=hit(p)?'grab':'default';return}
 e.preventDefault();pointers.set(e.pointerId,p);if(!gesture||!active||gesture.type==='pending')return;
 const pts=[...pointers.values()],pose=poses[active];
 if(gesture.type==='pinch'&&pts.length===2){
  const distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
  pose.size=gesture.pose.size*distance/gesture.distance;
  constrain(pose,ratio(active));
  const scale=pose.size/gesture.pose.size;
  pose.cx=(pts[0].x+pts[1].x)/2+(gesture.pose.cx-gesture.mid.x)*scale;
  pose.cy=(pts[0].y+pts[1].y)/2+(gesture.pose.cy-gesture.mid.y)*scale;
 }else{pose.cx=gesture.pose.cx+p.x-gesture.start.x;pose.cy=gesture.pose.cy+p.y-gesture.start.y}
 scheduleUpdate();
};
function endPointer(e){flushUpdate();pointers.delete(e.pointerId);if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);startGesture();if(!pointers.size)stage.classList.remove('manipulating')}
for(const ev of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(ev,endPointer);
stage.addEventListener('wheel',e=>{if(!photo)return;const id=hit(point(e));if(!id||busy)return;e.preventDefault();active=id;setSize(poses[id].size+(e.deltaY<0?2:-2))},{passive:false});
preview.onkeydown=e=>{if(!active||busy||!photo)return;const step=e.shiftKey?20:5,p=poses[active];if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();p.cx+=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0;p.cy+=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;scheduleUpdate()}else if(['+','=','-','_'].includes(e.key)){e.preventDefault();setSize(p.size+(['-','_'].includes(e.key)?-2:2))}};



$('#ck-editor').addEventListener('toggle',()=>{scheduleDraft();if(!$('#ck-editor').open)return;void initialized.then(async()=>{if(!ready)return;if(draftRestoreFailed){await restoreDraft();return;}await prepareCanvasImages();if(destroyed)return;if(!uploaded)photo=landscape;update(false)}).catch(error=>{if(!destroyed)toast(error.message)});});

__CHECKIN_INITIALIZE__
}
