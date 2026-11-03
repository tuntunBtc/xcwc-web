function mountCheckin(){
const host=root.querySelector(".checkin-page");
__CHECKIN_CLOUD__
__CHECKIN_MODEL__
const $=selector=>host.querySelector(selector);
let birds=[];
const presets=[{name:'清新自然',filter:'none'},{name:'暖阳胶片',filter:'sepia(.28) saturate(.85) contrast(.93)'},{name:'柔和风景',filter:'saturate(.75) brightness(1.09)'},{name:'黑白记忆',filter:'grayscale(1) contrast(.9)'}];
const images=new Map(),landscape=new Image();
let selected=[],active=null,poses=arrangement(selected),style=0,photo=null,uploaded=false,busy=false,readingPhoto=false,localMode=false,dirty=false,entries=[],examples=[],activeDownload='',uploadUrl='',uploadVersion=0,db=null,ready=false;
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
async function loadCheckinAsset(im,key){
 try{
  // The host fetches only allowlisted public assets with its same origin.
  // A local Blob avoids requiring CORS headers for the opaque sandbox canvas.
  const blob=await rpc('canvasAsset',{key});if(destroyed)throw Error('页面已离开');
  im.src=rememberUrl(URL.createObjectURL(blob));return await loadImage(im);
 }catch{throw Object.assign(new Error('合照素材加载失败，请刷新页面后重试'),{code:'CHECKIN_ASSET_FAILED'});}
}
// Initialize owns asset loading and its errors; do not start an unobserved promise here.
let imageReady=Promise.resolve();
function toast(text){$('#ck-toast').textContent=text;$('#ck-toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#ck-toast').classList.remove('show'),3000)}
function birdFor(id){return birds.find(b=>b.id===id)}
function ratio(id){const im=images.get(id);return im?.naturalHeight/im?.naturalWidth||1}
function eligible(){return ready&&authenticated&&uploaded&&selected.length>0&&dirty&&!busy&&!readingPhoto}
function syncGenerate(){const button=$('#ck-generate');button.disabled=!eligible();$('.generate-text').textContent=busy?'正在收藏回忆…':readingPhoto?'正在处理照片…':!selected.length?'先选一只小鸟':!uploaded?'选择照片，开启合照':!dirty?'已收藏，调整后再合照':'生成合照';$('#ck-points').textContent=balance}
function renderBirdList(){const nodes=birds.map(b=>{const button=document.createElement('button');button.type='button';button.dataset.birdId=b.id;button.className='bird-card'+(selected.includes(b.id)?' selected':'')+(!b.adopted?' locked':'');button.disabled=!b.adopted;button.setAttribute('aria-label',b.name+(b.adopted?'，已领养':'，未领养，已锁定'));if(b.adopted)button.setAttribute('aria-pressed',String(selected.includes(b.id)));const portrait=document.createElement('span');portrait.className='bird-portrait';const im=document.createElement('img');im.src=b.src;im.alt='';portrait.append(im);const badge=document.createElement('span');badge.className='bird-badge';badge.innerHTML=`<svg><use href="#ck-${b.adopted?'check':'lock'}"/></svg>`;portrait.append(badge);const title=document.createElement('strong');title.textContent=b.name;const sub=document.createElement('small');sub.textContent=b.adopted?'已领养':'未领养';button.append(portrait,title,sub);button.onclick=()=>{if(busy)return;const result=chooseBird(selected,b.id,birds);if(result.error)return toast(result.error);selected=result.selected;poses=arrangement(selected);active=selected.at(-1)||null;renderBirdList();update()};return button});$('#ck-birdList').replaceChildren(...nodes);$('#ck-selectedCount').textContent=selected.length;$('#ck-selectedSummary').textContent=selected.length?'已选 '+selected.map(id=>birdFor(id).name).join('、'):'选一位小伙伴，一起出发吧'}
$('#ck-styles').innerHTML=presets.map((p,i)=>`<button class="style ${i===0?'selected':''}" data-style="${i}" aria-label="${p.name}" aria-pressed="${i===0}"><span class="style-thumb" style="filter:${p.filter}"><img src="${checkinAssets['bird-0.png']}" alt=""></span><span>${p.name}</span><i>✓</i></button>`).join('');
$('#ck-styles').onclick=e=>{if(busy)return;const b=e.target.closest('button');if(!b)return;style=Number(b.dataset.style);host.querySelectorAll('.style').forEach((el,i)=>{el.classList.toggle('selected',i===style);el.setAttribute('aria-pressed',String(i===style))});update()};
function cover(c,im,x,y,w,h){const scale=Math.max(w/im.naturalWidth,h/im.naturalHeight),sw=w/scale,sh=h/scale;c.drawImage(im,(im.naturalWidth-sw)/2,(im.naturalHeight-sh)/2,sw,sh,x,y,w,h)}
function render(canvas,options={}){const im=options.photo||photo;if(!im)return;const ids=options.ids||selected,layout=options.poses||poses,filter=options.style??style,label=options.label??$('#ck-location').value,c=canvas.getContext('2d');canvas.width=1000;canvas.height=1010;c.fillStyle='#fffdf4';c.fillRect(0,0,1000,1010);c.save();c.beginPath();c.rect(38,38,924,812);c.clip();c.filter=presets[filter].filter;cover(c,im,38,38,924,812);c.filter='none';for(const id of ids){const bird=images.get(id);if(!bird?.naturalWidth||!layout[id])continue;const r=rectFor(layout[id],ratio(id));c.shadowColor='#26311e38';c.shadowBlur=14;c.shadowOffsetY=7;c.drawImage(bird,r.x,r.y,r.w,r.h)}c.restore();c.fillStyle='#556744';c.font='30px "Noto Serif SC",serif';c.fillText('⌖ '+(label.trim()||'在路上'),55,915);c.fillStyle='#b19d78';c.font='16px Georgia';c.textAlign='right';c.fillText('A LITTLE MOMENT WITH YOU',944,915);c.textAlign='left';c.fillStyle='#9b9e88';c.font='15px Georgia';c.fillText('BIRD & BEYOND',55,962);c.textAlign='right';c.fillText('OUR TRAVEL DIARY',944,962);c.textAlign='left'}
function update(markDirty=true){if(destroyed||!ready)return;if(markDirty)pendingSubmission=null;for(const id of selected)constrain(poses[id],ratio(id));render($('#ck-preview'));syncSelection();if(markDirty)dirty=true;$('#ck-previewBadge').textContent=uploaded?'编辑中':'示例';$('#ck-previewTitle').textContent=uploaded?'调整我们的合照':'看看合照效果';syncGenerate()}
function syncSelection(){const box=$('#ck-birdSelection');box.hidden=!active||!poses[active];const disabled=!active;for(const selector of ['#ck-smaller','#ck-larger','#ck-size','#ck-resetBird'])$(selector).disabled=disabled;if(disabled)return;const p=poses[active],r=rectFor(p,ratio(active));Object.assign(box.style,{left:r.x/10+'%',top:r.y/10.1+'%',width:r.w/10+'%',height:r.h/10.1+'%'});$('#ck-activeName').textContent=birdFor(active).name;$('#ck-size').value=p.size;$('#ck-sizeValue').textContent=Math.round(p.size)+'%';$('#ck-adjustLabel').textContent=birdFor(active).name}
function setSize(value){if(!active||busy)return;poses[active].size=Math.max(12,Math.min(55,Number(value)));update()}
$('#ck-size').oninput=e=>setSize(e.target.value);$('#ck-smaller').onclick=()=>setSize(poses[active]?.size-3);$('#ck-larger').onclick=()=>setSize(poses[active]?.size+3);$('#ck-resetBird').onclick=()=>{if(busy)return;poses=arrangement(selected);update()};$('#ck-location').oninput=()=>{if(!busy)update()};
async function upload(file){
 if(busy||readingPhoto||!file)return;
 const token=++uploadVersion;let url='';
 try{
  const heic=await isCheckinHeic(file);
  if(!photoTypeAllowed(file)&&!heic)return toast('请选择手机拍摄的照片或 JPG、PNG、WEBP 图片');
  if(file.size>15*1024*1024)return toast('照片超过 15 MB，换一张小一点的吧');
  readingPhoto=true;$('#ck-file').disabled=true;syncGenerate();
  toast('正在读取照片…');
  url=rememberUrl(URL.createObjectURL(file));let im=new Image();im.src=url;
  try{await loadImage(im);}catch{
   // A data URL also works in iOS containers that fail to display file blob URLs.
   const data=await photoDataUrl(file);if(destroyed||token!==uploadVersion)return;
   im=new Image();im.src=data;
   try{await loadImage(im);}catch(error){
    if(!heic)throw error;
    toast('正在本机处理苹果照片，请稍候…');
    const converted=await convertCheckinHeic(file);if(destroyed||token!==uploadVersion)return;
    URL.revokeObjectURL(url);ownedUrls.delete(url);
    url=rememberUrl(URL.createObjectURL(converted));im=new Image();im.src=url;
    try{await loadImage(im);}catch{im=new Image();im.src=await photoDataUrl(converted);await loadImage(im);}
   }
  }
  await imageReady;if(destroyed||token!==uploadVersion)return;
  if(uploadUrl){URL.revokeObjectURL(uploadUrl);ownedUrls.delete(uploadUrl);}
  uploadUrl=url;url='';photo=im;originalFile=file;uploaded=true;
  $('#ck-uploadThumb').src=im.src;$('#ck-uploadThumb').hidden=false;
  $('#ck-dropzone').classList.add('has-image');$('.replace').hidden=false;$('#ck-editor').open=true;
  update();toast('照片就位！可以拖动每只小鸟调整位置');
 }catch(error){
  if(!destroyed&&token===uploadVersion)toast(error.code==='CHECKIN_ASSET_FAILED'||error.message?.includes('组件加载失败')?error.message:'照片没能打开，可能文件损坏或格式暂不支持，请换一张照片重试');
 }finally{
  if(url){URL.revokeObjectURL(url);ownedUrls.delete(url);}
  if(!destroyed&&token===uploadVersion){readingPhoto=false;$('#ck-file').disabled=false;$('#ck-file').value='';syncGenerate();}
 }
}
$('#ck-file').onchange=e=>upload(e.target.files[0]);$('#ck-dropzone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!busy)$('#ck-file').click()}};$('#ck-dropzone').onclick=e=>{if(busy)e.preventDefault()};for(const ev of ['dragenter','dragover'])$('#ck-dropzone').addEventListener(ev,e=>{e.preventDefault();$('#ck-dropzone').classList.add('drag')});for(const ev of ['dragleave','drop'])$('#ck-dropzone').addEventListener(ev,e=>{e.preventDefault();$('#ck-dropzone').classList.remove('drag');if(ev==='drop')upload(e.dataTransfer.files[0])});
function formatDate(time){const d=new Date(time);return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`}
function renderGallery(){entries=sortedMemories(entries);const display=entries;$('#ck-gallery').replaceChildren(...display.map(entry=>{const b=document.createElement('button');b.className='memory';const img=document.createElement('img');img.src=entry.image;img.alt=entry.label+'的合照';img.loading='lazy';const body=document.createElement('span');body.className='memory-body';const title=document.createElement('strong');title.textContent=entry.label;const meta=document.createElement('span');meta.className='memory-meta';const date=document.createElement('time');date.dateTime=new Date(entry.createdAt).toISOString();date.textContent=formatDate(entry.createdAt);const badge=document.createElement('small');badge.textContent=entry.example?'示例':entry.reward===1?'+1 叽分':'已收藏';meta.append(date,badge);body.append(title,meta);b.append(img,body);b.onclick=()=>{activeDownload=entry.image;$('#ck-viewerImage').src=entry.image;$('#ck-viewerMeta').textContent=entry.label+' · '+new Date(entry.createdAt).toLocaleString('zh-CN',{hour12:false});activeWorkId=entry.id;showViewer().then(async()=>{const id=entry.id;const detail=await rpc('detail',{id});if(!destroyed&&activeWorkId===id)$('#ck-viewerMeta').textContent=detail.label+' · '+new Date(detail.createdAt).toLocaleString('zh-CN',{hour12:false});}).catch(error=>{if(!destroyed)toast(error.message)})};return b}));$('#ck-albumCount').textContent=albumTotal;$('#ck-albumFoot').textContent=entries.length?(localMode?'最新的回忆排在最前面 · 已保存在本机相册':'最新的回忆排在最前面 · 已保存到你的账号'):'还没有合照，和小鸟一起收藏第一张回忆吧';syncGenerate()}
__CHECKIN_GENERATE__
async function download(src){try{const image=src.startsWith('blob:')?await readBlob(src):await rpc('image',{id:src});await rpc('download',{image});}catch(error){toast(error.message)}}
$('#ck-download').onclick=()=>{if(ready)$('#ck-preview').toBlob(blob=>rpc('download',{image:blob}).catch(e=>toast(e.message)),'image/jpeg',.95)};$('.close').onclick=()=>$('#ck-viewer').close();$('#ck-viewer').onclick=e=>{if(e.target===$('#ck-viewer'))$('#ck-viewer').close()};$('.viewer-download').onclick=()=>download(activeDownload);$('#ck-viewAll').onclick=async()=>{try{if(nextCursor){await loadAlbum(true);$('#ck-gallery').classList.add('expanded');$('#ck-viewAll').textContent=nextCursor?'查看更多 ↗':'收起 ↙';}else{const expanded=$('#ck-gallery').classList.toggle('expanded');$('#ck-viewAll').textContent=expanded?'收起 ↙':'查看全部 ↗';}}catch(e){toast(e.message)}};
const stage=$('#ck-canvasStage'),preview=$('#ck-preview'),pointers=new Map();let gesture=null;
function point(e){const r=preview.getBoundingClientRect();return {x:(e.clientX-r.left)*1000/r.width,y:(e.clientY-r.top)*1010/r.height}}
function hit(p){return [...selected].reverse().find(id=>{const r=rectFor(poses[id],ratio(id));return p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h})}
function startGesture(){
 const pts=[...pointers.values()];if(!active||!pts.length){gesture=null;return}
 const pose={...poses[active]};
 gesture=pts.length===2?{type:'pinch',pose,distance:Math.max(1,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)),mid:{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}}:{type:hit(pts[0])===active?'drag':'pending',pose,start:pts[0]};
}
stage.onpointerdown=e=>{
 if(!ready||busy||e.button>0||pointers.size>=2)return;
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
 update();
};
function endPointer(e){pointers.delete(e.pointerId);if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);startGesture();if(!pointers.size)stage.classList.remove('manipulating')}
for(const ev of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(ev,endPointer);
stage.addEventListener('wheel',e=>{const id=hit(point(e));if(!id||busy)return;e.preventDefault();active=id;setSize(poses[id].size+(e.deltaY<0?2:-2))},{passive:false});
preview.onkeydown=e=>{if(!active||busy)return;const step=e.shiftKey?20:5,p=poses[active];if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();p.cx+=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0;p.cy+=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;update()}else if(['+','=','-','_'].includes(e.key)){e.preventDefault();setSize(p.size+(['-','_'].includes(e.key)?-2:2))}};

$('.viewer-original').onclick=async event=>{const id=activeWorkId;if(!id)return;const button=event.currentTarget;button.disabled=true;try{const image=await rpc('original',{id});if(!destroyed&&id===activeWorkId)await rpc('download',{image});}catch(error){if(!destroyed)toast(error.message)}finally{button.disabled=false}};

__CHECKIN_INITIALIZE__
}
