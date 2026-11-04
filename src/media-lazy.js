// A per-page observer complements native lazy loading in long lists and shadow roots.
// Source URLs are assigned only near the visible scroll area, never during list creation.
function createDeferredMedia({signal,root=null,margin='120px 0px'}={}){
 const waiting=new Map();let stopped=!!signal?.aborted;
 const run=target=>{const task=waiting.get(target);if(!task||stopped)return;waiting.delete(target);observer?.unobserve(target);task()};
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  for(const entry of entries){if(entry.isIntersecting)run(entry.target);else if(!entry.target.isConnected){waiting.delete(entry.target);observer.unobserve(entry.target)}}
 },{root,rootMargin:margin}):null;
 function defer(target,task,{eager=false}={}){
  if(stopped)return;
  waiting.set(target,task);
  if(eager||!observer)run(target);else observer.observe(target);
 }
 function image(target,url,{eager=false,priority='auto'}={}){
  target.decoding='async';target.loading=eager?'eager':'lazy';target.fetchPriority=priority;
  if(stopped)return;
  target.dataset.xcwcSrc=url;
  defer(target,()=>{target.src=url;delete target.dataset.xcwcSrc},{eager});
 }
 function scan(scope){
  for(const target of scope.querySelectorAll('img[data-xcwc-src]')){
   const value=target.dataset.xcwcSrc,url=value.startsWith('assets/')?'__XCWC_ASSET_ORIGIN__/'+value:value;
   image(target,url);
  }
  for(const target of scope.querySelectorAll('[data-xcwc-bg]')){
   const value=target.dataset.xcwcBg,url=value.startsWith('assets/')?'__XCWC_ASSET_ORIGIN__/'+value:value;
   defer(target,()=>{target.style.backgroundImage='url('+JSON.stringify(url)+')';delete target.dataset.xcwcBg});
  }
  // Re-renders may remove queued cards before they ever enter the viewport.
  for(const target of waiting.keys())if(!target.isConnected){waiting.delete(target);observer?.unobserve(target)}
 }
 function destroy(){stopped=true;observer?.disconnect();waiting.clear()}
 signal?.addEventListener('abort',destroy,{once:true});
 return {image,defer,scan,destroy};
}
