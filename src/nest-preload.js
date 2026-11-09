// Shared, bounded public-resource preparation. Nothing here is guest business state.
function mayAutoPreload(){const link=navigator.connection;return !link?.saveData&&!['slow-2g','2g'].includes(link?.effectiveType)}
function waitForVisibleMedia(roots,signal,{requiredImages=[],requiredSelector='img[fetchpriority="high"],[data-xcwc-media-required]',timeoutMs=12000}={}){
 if(signal?.aborted)return Promise.resolve(false);
 const visible=node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&getComputedStyle(node).visibility!=='hidden'};
 const images=new Map(),urls=new Set(),required=new Set(requiredImages);
 for(const root of roots.filter(Boolean))for(const node of [...(typeof root.getBoundingClientRect==='function'?[root]:[]),...root.querySelectorAll('*')]){
  if(!visible(node))continue;
  if(node.tagName==='IMG'&&node.getAttribute('src'))images.set(node,{src:node.getAttribute('src'),required:required.has(node)||!!(requiredSelector&&node.matches(requiredSelector))});
  for(const pseudo of [null,'::before','::after'])for(const m of getComputedStyle(node,pseudo).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g))if(!m[1].startsWith('data:'))urls.add(m[1]);
 }
 const wait=(value,url)=>new Promise(resolve=>{
  let done=false,timer;
  const finish=ok=>{if(done)return;done=true;clearTimeout(timer);value.removeEventListener('load',loaded);value.removeEventListener('error',error);signal?.removeEventListener('abort',abort);if(url&&!ok)value.removeAttribute('src');resolve(ok)};
  const loaded=()=>Promise.resolve().then(()=>typeof value.decode==='function'?value.decode():null).then(()=>finish(value.naturalWidth>0),()=>finish(false)),error=()=>finish(false),abort=()=>finish(false);
  if(signal?.aborted)return abort();signal?.addEventListener('abort',abort,{once:true});value.addEventListener('load',loaded);value.addEventListener('error',error);
  timer=setTimeout(error,Math.max(0,timeoutMs));if(url)value.src=url;
  if(value.complete){if(value.naturalWidth)loaded();else error()}
 });
 // Decorative media must settle, but a failed decoration must not disable preparation forever.
 const jobs=[...images].map(([image,entry])=>wait(image).then(ok=>!entry.required||(ok&&image.getAttribute('src')===entry.src&&image.isConnected!==false)));
 for(const url of urls){const image=new Image();image.decoding='async';jobs.push(wait(image,url).then(()=>true))}
 return Promise.all(jobs).then(results=>!signal?.aborted&&results.every(Boolean));
}
const mediaPreparation=(()=>{
 const queue=[];let running=false,active=null;
 const abortError=()=>Object.assign(Error('资源准备已取消'),{name:'AbortError'});
 const allowed=job=>!job.signal?.aborted&&!document.hidden&&(job.intent||mayAutoPreload());
 function cancel(job){const index=queue.indexOf(job);if(index>=0)queue.splice(index,1);job.controller.abort();job.finish(false,abortError())}
 async function drain(){
  if(running)return;running=true;
  try{while(queue.length){const job=queue.shift();if(!allowed(job)){cancel(job);continue}active=job;
   // A running callback owns this slot until it settles and receives the effective cancellation signal.
   try{const result=await job.run(job.controller.signal);job.finish(!job.controller.signal.aborted,job.controller.signal.aborted?abortError():result)}catch(e){job.finish(false,e)}finally{active=null}
  }}finally{running=false}
 }
 function enqueue(run,{signal,intent=false,priority='background'}={}){
  if(signal?.aborted||(!intent&&!mayAutoPreload())||document.hidden)return Promise.reject(abortError());
  return new Promise((resolve,reject)=>{let finished=false;const job={run,signal,intent,priority:intent?2:priority==='intent'?1:0,controller:new AbortController(),finish(ok,value){if(finished)return;finished=true;signal?.removeEventListener('abort',abort);ok?resolve(value):reject(value)}};
   const abort=()=>cancel(job);signal?.addEventListener('abort',abort,{once:true});queue.push(job);queue.sort((a,b)=>b.priority-a.priority);void drain();
  });
 }
 function image(url,{signal,intent=false,priority='background'}={}){return enqueue(jobSignal=>new Promise((resolve,reject)=>{
  const value=new Image();value.fetchPriority=intent?'auto':'low';let done=false,timer;
  const finish=error=>{if(done)return;done=true;clearTimeout(timer);value.onload=value.onerror=null;jobSignal.removeEventListener('abort',abort);if(error){value.removeAttribute('src');reject(error)}else resolve(value)};
  const abort=()=>finish(abortError());jobSignal.addEventListener('abort',abort,{once:true});
  value.onload=()=>Promise.resolve().then(()=>typeof value.decode==='function'?value.decode():null).then(()=>finish(),finish);value.onerror=()=>finish(Error('资源暂时无法加载'));
  if(jobSignal.aborted)return abort();timer=setTimeout(()=>finish(Error('资源加载超时')),30000);value.src=xcwcMediaUrl(url);
 }),{signal,intent,priority})}
 document.addEventListener('visibilitychange',()=>{if(document.hidden){if(active)cancel(active);for(const job of [...queue])cancel(job)}});
 window.addEventListener('pagehide',()=>{if(active)cancel(active);for(const job of [...queue])cancel(job)});
 return Object.freeze({image,enqueue,abortError});
})();
function createIntentPreloader({root,signal,resolve}){
 let current=null;const attempted=new Map(),lifetime=new AbortController(),listenSignal=lifetime.signal;
 const stop=()=>{if(!current)return;clearTimeout(current.timer);current.controller?.abort();if(attempted.get(current.url)===current&&!current.done)attempted.delete(current.url);current=null};
 const destroy=()=>{stop();lifetime.abort();signal?.removeEventListener('abort',destroy)};
 const choose=target=>{try{const url=resolve(target);return typeof url==='string'&&url?xcwcMediaUrl(url):null}catch{return null}};
 const arm=(event,delay)=>{
  if(listenSignal.aborted||document.hidden||!mayAutoPreload())return;
  const url=choose(event.target);if(url&&current?.url===url){if(event.type==='pointerdown')current.point={x:event.clientX,y:event.clientY};return}stop();if(!url||attempted.has(url))return;
  const action={url,done:false,point:event.type==='pointerdown'?{x:event.clientX,y:event.clientY}:null};current=action;
  action.timer=setTimeout(()=>{
   if(current!==action||listenSignal.aborted||document.hidden||!mayAutoPreload()){if(current===action)stop();return}
   action.controller=new AbortController();attempted.set(url,action);
   // This is automatic intent preparation, so it keeps low network priority and respects data saving.
   mediaPreparation.image(url,{signal:action.controller.signal,priority:'intent'}).then(()=>{action.done=true},()=>{if(attempted.get(url)===action)attempted.delete(url)}).finally(()=>{if(current===action)current=null});
  },delay);
 };
 if(signal?.aborted){destroy();return {destroy}}
 root.addEventListener('pointerover',event=>{if(event.pointerType==='mouse')arm(event,180)},{signal:listenSignal});
 root.addEventListener('focusin',event=>arm(event,120),{signal:listenSignal});
 root.addEventListener('focusout',event=>{if(current&&choose(event.relatedTarget)!==current.url)stop()},{signal:listenSignal});
 root.addEventListener('pointerdown',event=>arm(event,event.pointerType==='touch'?140:0),{signal:listenSignal});
 root.addEventListener('pointerout',event=>{if(current&&choose(event.relatedTarget)!==current.url)stop()},{signal:listenSignal});
 root.addEventListener('pointermove',event=>{if(current?.point&&Math.hypot(event.clientX-current.point.x,event.clientY-current.point.y)>8)stop()},{signal:listenSignal});
 root.addEventListener('pointercancel',stop,{signal:listenSignal});root.addEventListener('scroll',stop,{capture:true,signal:listenSignal});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()},{signal:listenSignal});signal?.addEventListener('abort',destroy,{once:true});
 return {destroy};
}
const nestMedia=(()=>{
 let controller=null,pending=null,result=null,generation=0;
 const relevant=()=>['adopt','home'].includes(s.page)&&!document.hidden;
 function cancel(){generation++;controller?.abort();controller=null;pending=null;result=null}
 function prepareHome(urls,{intent=false}={}){
  if(!relevant()||(!intent&&!mayAutoPreload()))return Promise.reject(mediaPreparation.abortError());
  if(result)return Promise.resolve(result);if(pending)return pending;
  const ticket=++generation;controller=new AbortController();const local=controller,{signal}=local;
  pending=(async()=>{
   for(const url of urls)await mediaPreparation.image(url,{signal,intent});
   if(!relevant()||signal.aborted)throw mediaPreparation.abortError();
   // The nest character is an explicitly confirmed reduced-motion exception.
   const atlas=await mediaPreparation.image('__XCWC_ASSET_ORIGIN__/assets/nest/idle/huangying-idle.webp',{signal,intent});
   const {audio}=await mediaPreparation.enqueue(jobSignal=>accountRpc('nestIdleAudio',{},jobSignal),{signal,intent});
   if(!relevant()||signal.aborted||ticket!==generation)throw mediaPreparation.abortError();
   if(!(audio instanceof Blob)||audio.size>150000)throw Error('动画原声暂时无法读取');
   result={atlas,audio};return result;
  })().finally(()=>{if(ticket===generation)pending=null});
  return pending;
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!result)cancel()});window.addEventListener('pagehide',cancel);
 return Object.freeze({prepareHome,retain(page){if(!['home','adopt'].includes(page))cancel()},retry:cancel});
})();
