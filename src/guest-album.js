// Local originals and generated works use IndexedDB rather than large JSON strings.
(()=>{
 let dbPromise;
 function database(){return dbPromise??=new Promise((resolve,reject)=>{const request=indexedDB.open('xcwc.guest.album.v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('works',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('本机相册无法打开，请允许浏览器存储'));});}
 async function transaction(mode,fn){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('works',mode),store=tx.objectStore('works');let value;try{const request=fn(store);request.onsuccess=()=>value=request.result;request.onerror=()=>tx.abort();}catch(error){reject(error);return}tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(Error('本机相册保存或读取失败，请检查浏览器空间'));});}
 const all=()=>transaction('readonly',s=>s.getAll());
 const get=id=>transaction('readonly',s=>s.get(id)).then(row=>{if(!row)throw Error('没有找到本机合照');return row});
 const hash=blob=>window.xcwcDigestBlob(blob);
 const view=row=>({id:row.id,status:'COMPLETE',birdIds:row.metadata.birdIds,styleId:row.metadata.styleId,label:row.metadata.label,createdAt:row.createdAt,reward:row.reward||0,localOnly:true});
 const operations=['bootstrap','history','detail','image','original','create','points'];
 window.xcwcLocalAlbum={operations,async run(op,args){
  const guest=window.xcwcGuest;
  if(op==='bootstrap'){let catalog=[];try{const response=await fetch('/api/checkin-catalog',{cache:'no-store'});if(response.ok)catalog=await response.json();}catch{}const state=guest.snapshot();return{authenticated:true,localMode:true,birds:state.birds,wallet:state.wallet,catalog};}
  if(op==='points')return guest.snapshot().wallet;
  if(op==='history'){const rows=(await all()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));const start=args.cursor?rows.findIndex(row=>row.id===args.cursor)+1:0;if(args.cursor&&start===0)throw Error('相册分页位置已变化，请重新进入');const page=rows.slice(start,start+20);return{items:page.map(view),nextCursor:rows.length>start+page.length?page.at(-1)?.id:null,total:rows.length};}
  if(op==='detail')return view(await get(args.id));
  if(op==='image'||op==='original'){const row=await get(args.id);return op==='image'?row.image:row.original;}
  if(op==='create'){
   const metadata=args.metadata,ids=metadata?.birdIds;if(!metadata||!/^[a-zA-Z0-9_-]{16,64}$/.test(metadata.requestId||'')||!Array.isArray(ids)||ids.length<1||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>!guest.snapshot().birds.some(b=>b.id===id)))throw Error('请选择 1–3 只本机已领取小鸟');
   if(!(args.original instanceof Blob)||!(args.image instanceof Blob)||args.original.size>15*1024*1024||args.image.size>8*1024*1024||!['image/jpeg','image/png'].includes(args.original.type)||!['image/jpeg','image/png'].includes(args.image.type))throw Error('图片格式或大小不正确');
   const digest=await hash(args.original),outputHash=await hash(args.image),id=metadata.requestId.replaceAll('-','');
   const rows=await all();let row=rows.find(row=>row.id===id);
   if(row){if(row.digest!==digest||row.outputHash!==outputHash||JSON.stringify(row.metadata)!==JSON.stringify(metadata))throw Error('同一请求编号不能保存不同的作品');}
   else{if(rows.length>=30)throw Error('本机相册已保存 30 张，请先导出图片并管理浏览器存储');row={id,metadata,digest,outputHash,original:args.original,image:args.image,createdAt:new Date().toISOString(),reward:0};await transaction('readwrite',s=>s.put(row));}
   row.reward=guest.photoReward(id,digest);await transaction('readwrite',s=>s.put(row));return view(row);
  }
 }};
})();
