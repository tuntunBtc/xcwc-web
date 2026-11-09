// Keep photo storage/viewer and cart support out of the initial host script.
// Only the existing sandbox can activate these fixed, build-time modules.
(()=>{
 const frame=document.getElementById('codex-visualization'),manifest=__XCWC_HOST_FEATURES__,jobs=new Map();
 const channels={'xcwc-checkin':{feature:'photo',result:'xcwc-checkin-result'},'xcwc-shop-data':{feature:'shop',result:'xcwc-shop-data-result'}};
 const loaded=new Set(),factories=new Map();
 window.xcwcHostFeatures=Object.freeze({register(name,factory){if(!Object.hasOwn(manifest,name)||typeof factory!=='function')throw Error('未知功能模块');if(!factories.has(name))factories.set(name,factory)}});
 function activate(name){if(loaded.has(name))return;const factory=factories.get(name);if(!factory)throw Error('功能模块尚未就绪，请重试');factory();loaded.add(name)}
 function ensure(name){
  if(!Object.hasOwn(manifest,name))return Promise.reject(Error('功能暂不可用'));
  if(loaded.has(name))return Promise.resolve();
  if(jobs.has(name))return jobs.get(name);
  if(factories.has(name)){try{activate(name);return Promise.resolve()}catch(error){return Promise.reject(error)}}
  const pending=new Promise((resolve,reject)=>{
   const script=document.createElement('script');let timer,finished=false;
   const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error)}else resolve()};
   script.src=manifest[name];script.onload=()=>{try{activate(name);finish()}catch(error){finish(error)}};
   script.onerror=()=>finish(Error('功能资源读取失败，请重试'));timer=setTimeout(()=>finish(Error('功能资源读取超时，请重试')),20000);document.head.append(script);
  }).finally(()=>{if(jobs.get(name)===pending)jobs.delete(name)});
  jobs.set(name,pending);return pending;
 }
 window.xcwcEnsureHostFeature=ensure;
 const waiting=new Map();
 window.addEventListener('message',event=>{
  const message=event.data,entry=channels[message?.channel];
  if(event.source!==frame?.contentWindow||!entry||typeof message.id!=='string'||message.id.length>80||loaded.has(entry.feature))return;
  const key=message.channel+':'+message.id;
  if(message.operation==='cancel'){waiting.delete(key);return;}
  const fail=error=>frame.contentWindow?.postMessage({channel:entry.result,id:message.id,ok:false,value:{code:'FEATURE_UNAVAILABLE',message:error.message}},'*');
  if(waiting.size>=100){fail(Error('正在打开功能，请稍后重试'));return;}
  if(waiting.has(key))return;
  const job={event,owner:window.xcwcSession.read()?.token||null};waiting.set(key,job);
  ensure(entry.feature).then(()=>{
   if(waiting.get(key)!==job)return;waiting.delete(key);
   if((window.xcwcSession.read()?.token||null)!==job.owner){fail(Error('账号已变化，请重新进入'));return;}
   // Preserve source and origin: the original modules retain their own checks.
   window.dispatchEvent(new MessageEvent('message',{data:message,source:event.source,origin:event.origin}));
  },error=>{if(waiting.get(key)===job){waiting.delete(key);fail(error)}});
 });
})();
