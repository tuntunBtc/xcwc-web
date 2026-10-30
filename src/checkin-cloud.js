let historyVersion=0,destroyed=false,authenticated=false,balance=0,nextCursor=null,albumTotal=0,originalFile=null,pendingSubmission=null;
const ownedUrls=new Set(),albumUrls=new Map(),rpcController=new AbortController();
const rememberUrl=url=>{ownedUrls.add(url);return url;};
const rpc=(operation,args={})=>checkinRpc(operation,args,rpcController.signal);
const readBlob=url=>fetch(url).then(response=>response.blob());
function assetFor(city){return checkinAssets[({'hangzhou':'bird-0.png','suzhou':'bird-1.png','nanjing':'bird-2.png','xian':'bird.png','chengdu':'bird-4.png','wuhan':'bird-5.png'})[city]||'bird-0.png'];}
async function loadAlbum(append=false){
 const version=++historyVersion;const page=await rpc('history',{cursor:append?nextCursor:null});if(destroyed)return;
 const loaded=await Promise.all(page.items.map(async work=>{let image=albumUrls.get(work.id);if(!image){const blob=await rpc('image',{id:work.id});if(destroyed)return null;image=rememberUrl(URL.createObjectURL(blob));albumUrls.set(work.id,image);}return {...work,image,createdAt:new Date(work.createdAt).getTime()};}));
 if(destroyed||version!==historyVersion)return;nextCursor=page.nextCursor;albumTotal=page.total;
 entries=sortedMemories([...new Map([...(append?entries:[]),...loaded.filter(Boolean)].map(work=>[work.id,work])).values()]);renderGallery();
 $('#ck-viewAll').textContent=nextCursor?'查看更多 ↗':'收起 / 展开 ↗';
}
async function sourceBlob(){
 const canvas=document.createElement('canvas');const scale=Math.min(1,Math.sqrt(20_000_000/(photo.naturalWidth*photo.naturalHeight)),6000/Math.max(photo.naturalWidth,photo.naturalHeight));canvas.width=Math.max(1,Math.round(photo.naturalWidth*scale));canvas.height=Math.max(1,Math.round(photo.naturalHeight*scale));canvas.getContext('2d').drawImage(photo,0,0,canvas.width,canvas.height);return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('原照片处理失败')),'image/jpeg',.92));
}
async function showViewer(){
 const viewport=await rpc('viewport');if(destroyed)return;const dialog=$('#ck-viewer');dialog.style.position='absolute';dialog.style.top=Math.max(0,viewport.top+24)+'px';dialog.style.margin='0 auto';dialog.style.maxHeight=Math.max(250,viewport.height-48)+'px';$('#ck-viewerImage').style.maxHeight=Math.max(180,viewport.height-185)+'px';dialog.showModal();
}
checkinCleanup=()=>{destroyed=true;uploadVersion++;rpcController.abort();if(typeof stage!=='undefined'){for(const id of pointers.keys())if(stage.hasPointerCapture(id))stage.releasePointerCapture(id);pointers.clear();stage.onpointerdown=null;stage.onpointermove=null;stage.onpointerup=null;}host.querySelector('dialog[open]')?.close();for(const url of ownedUrls)URL.revokeObjectURL(url);ownedUrls.clear();};
