// Local originals and generated works use IndexedDB rather than large JSON strings.
(()=>{
 let dbPromise,clearPromise,resetVersion=0,resetting=false;
 function database(){
  if(dbPromise)return dbPromise;
  const attempt=new Promise((resolve,reject)=>{
   const request=indexedDB.open('xcwc.guest.album.v1',2);let rejected=false;
   const fail=message=>{rejected=true;reject(Error(message))};
   request.onupgradeneeded=()=>{
    const db=request.result,works=db.objectStoreNames.contains('works')?request.transaction.objectStore('works'):db.createObjectStore('works',{keyPath:'id'});
    if(!db.objectStoreNames.contains('metadata')){
     const metadata=db.createObjectStore('metadata',{keyPath:'id'}),cursor=works.openCursor();
     // Project one legacy work at a time. Original/image buffers stay in works.
     cursor.onsuccess=event=>{const row=event.target.result;if(row){metadata.put(view(row.value));row.continue()}};
    }
   };
   request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();if(dbPromise===attempt)dbPromise=null};if(rejected){db.close();return}resolve(db)};
   request.onerror=()=>fail('本机相册无法打开，请允许浏览器存储');
   request.onblocked=()=>fail('本机相册升级被旧页面占用，请关闭其他旧页面后重试');
  });
  dbPromise=attempt;void attempt.catch(()=>{if(dbPromise===attempt)dbPromise=null});return attempt;
 }
 async function transaction(mode,fn,names='works'){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(names,mode),store=tx.objectStore(Array.isArray(names)?names[0]:names);let value;try{const request=fn(store,tx);request.onsuccess=()=>value=request.result;request.onerror=()=>tx.abort();}catch(error){try{tx.abort()}catch{}reject(error);return}tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(Error('本机相册保存或读取失败，请检查浏览器空间'));});}
 const all=()=>transaction('readonly',s=>s.getAll(),'metadata');
 const get=id=>transaction('readonly',s=>s.get(id)).then(row=>{if(!row)throw Error('没有找到本机合照');return row});
 const hash=blob=>window.xcwcDigestBlob(blob);
 const view=row=>({id:row.id,status:'COMPLETE',birdIds:row.metadata.birdIds,styleId:row.metadata.styleId,label:row.metadata.label,createdAt:row.createdAt,reward:row.reward||0,localOnly:true});
 const operations=['bootstrap','history','detail','image','original','create','points','delete'];
 function clear(){
  if(clearPromise)return clearPromise;
  resetting=true;resetVersion++;window.xcwcCheckinDraft?.clear();
  clearPromise=transaction('readwrite',(s,tx)=>{tx.objectStore('metadata').clear();return s.clear()},['works','metadata']).finally(()=>{resetting=false;clearPromise=null});
  return clearPromise;
 }
 function epoch(){const value=window.localStorage.getItem('xcwc.local.reset.v1')||'initial';if(value.startsWith('pending:'))throw Error('本机缓存正在清除，请重新进入相册');return value;}
 const current=(version,generation)=>{if(resetting||version!==resetVersion||generation!==epoch())throw Error('本机缓存已清除，请重新进入相册')};
 // Keep each read/check/write within one store transaction, including across tabs.
 async function writeAlbum(version,generation,operation){
  const db=await database();current(version,generation);
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['works','metadata'],'readwrite'),store=tx.objectStore('works'),metadata=tx.objectStore('metadata');let value,failure;
   const fail=error=>{failure=error;tx.abort()};
   const step=fn=>event=>{try{current(version,generation);fn(event.target.result)}catch(error){fail(error)}};
   tx.oncomplete=()=>resolve(value);
   tx.onabort=tx.onerror=()=>reject(failure||Error('本机相册保存或读取失败，请检查浏览器空间'));
   try{operation(store,result=>{value=result},step,metadata)}catch(error){fail(error)}
  });
 }
 function reserveWork(candidate,version,generation){return writeAlbum(version,generation,(store,done,step,metadata)=>{
  store.get(candidate.id).onsuccess=step(existing=>{
   if(existing){
    if(existing.digest!==candidate.digest||existing.outputHash!==candidate.outputHash||JSON.stringify(existing.metadata)!==JSON.stringify(candidate.metadata))throw Error('同一请求编号不能保存不同的作品');
    done(existing);return;
   }
   store.count().onsuccess=step(count=>{
    if(count>=30)throw Object.assign(Error('相册已保存 30 张，请先保存重要照片，再到相册管理删除不需要的合照'),{code:'ALBUM_FULL'});
    store.add(candidate);metadata.put(view(candidate));done(candidate);
   });
  });
 });}
 function saveReward(id,reward,version,generation){return writeAlbum(version,generation,(store,done,step,metadata)=>{
  store.get(id).onsuccess=step(row=>{
   if(!row)throw Error('没有找到本机合照，请重新进入相册');
   row.reward=reward;store.put(row);metadata.put(view(row));done(row);
  });
 });}
 window.xcwcLocalAlbum={operations,clear,async run(op,args){
  const guest=window.xcwcGuest;
  if(op==='bootstrap'){let catalog=[];try{const response=await fetch('/api/checkin-catalog',{cache:'no-store'});if(response.ok)catalog=await response.json();}catch{}const state=guest.snapshot();return{authenticated:true,localMode:true,birds:state.birds,wallet:state.wallet,catalog};}
  if(op==='points')return guest.snapshot().wallet;
  if(op==='history'){const rows=(await all()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));const start=args.cursor?rows.findIndex(row=>row.id===args.cursor)+1:0;if(args.cursor&&start===0)throw Error('相册分页位置已变化，请重新进入');const page=rows.slice(start,start+20);return{items:page,nextCursor:rows.length>start+page.length?page.at(-1)?.id:null,total:rows.length};}
  if(op==='detail')return view(await get(args.id));
  if(op==='image'||op==='original'){const row=await get(args.id),value=row[op];return value instanceof Blob?value:new Blob([value],{type:row[op+'Type']||'image/jpeg'});}
  if(op==='delete'){
   const version=resetVersion,generation=epoch(),id=args.id;
   if(args.epoch&&args.epoch!==generation)throw Error('本机缓存已清除，请重新进入相册');
   if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(id))throw Error('请选择要删除的合照');
   return writeAlbum(version,generation,(store,done,step,metadata)=>{store.get(id).onsuccess=step(row=>{store.delete(id);metadata.delete(id);done({deleted:!!row,id});});});
  }
  if(op==='create'){
   const version=resetVersion,generation=epoch();current(version,generation);
   const metadata=args.metadata,ids=metadata?.birdIds;if(!metadata||!/^[a-zA-Z0-9_-]{16,64}$/.test(metadata.requestId||'')||!Array.isArray(ids)||ids.length<1||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>!guest.snapshot().birds.some(b=>b.id===id)))throw Error('请选择 1–3 只本机已领取小鸟');
   if(!(args.original instanceof Blob)||!(args.image instanceof Blob)||args.original.size>15*1024*1024||args.image.size>8*1024*1024||!['image/jpeg','image/png'].includes(args.original.type)||!['image/jpeg','image/png'].includes(args.image.type))throw Error('图片格式或大小不正确');
   const digest=await hash(args.original),outputHash=await hash(args.image),id=metadata.requestId.replaceAll('-','');
   // WebKit can reject persisting Blobs received from an opaque sandbox.
   const [original,image]=await Promise.all([args.original.arrayBuffer(),args.image.arrayBuffer()]);
   current(version,generation);
   if(ids.some(id=>!guest.snapshot().birds.some(b=>b.id===id)))throw Error('本机领取记录已变化，请重新选择小鸟');
   const row=await reserveWork({id,metadata,digest,outputHash,original,image,originalType:args.original.type,imageType:args.image.type,createdAt:new Date().toISOString(),reward:0},version,generation);
   current(version,generation);const reward=guest.photoReward(id,row.digest);
   const saved=await saveReward(id,reward,version,generation);current(version,generation);return view(saved);
  }
 }};
})();
