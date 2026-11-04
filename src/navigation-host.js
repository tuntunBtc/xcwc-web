// Only this app's sandbox can request an allowlisted, same-origin route change.
(()=>{
 const frame=document.getElementById('codex-visualization');
 const routes=new Set(['home','city','shop','profile','adopt','photo','wardrobe','flock']);
 const sections=new Set(['home','city','shop','profile']);
 let initialized=false;
 const sectionFor=(page,section)=>sections.has(page)?page:page==='photo'||page==='adopt'?'home':sections.has(section)?section:'home';
 function state(page,section,depth){return {xcwcNavigation:1,page,section:sectionFor(page,section),depth};}
 function valid(value){return value?.xcwcNavigation===1&&routes.has(value.page)&&sections.has(value.section)&&Number.isSafeInteger(value.depth)&&value.depth>=0;}
 function publish(value){frame?.contentWindow?.postMessage({channel:'xcwc-navigation-state',page:value.page,section:value.section},'*');}
 function dismissNotice(){const notice=document.getElementById('xcwc-checkin-notice');if(notice)notice.hidden=true;}
 function routeUrl(page,section){
  const url=new URL(location.href);
  if(page==='adopt'&&(url.searchParams.has('birdCode')||url.searchParams.has('bird')))return url;
  url.pathname='/';url.search='';url.hash='';url.searchParams.set('page',page);
  if(['wardrobe','flock'].includes(page))url.searchParams.set('from',section);
  return url;
 }
 function replace(value,url=location.href){history.replaceState({...history.state,...value},'',url);}
 window.addEventListener('message',event=>{
  const message=event.data;
  if(event.source!==frame?.contentWindow||message?.channel!=='xcwc-navigation')return;
  if(message.operation==='ready'&&routes.has(message.page)){
   if(initialized){if(valid(history.state))publish(history.state);return;}
   initialized=true;
   const current=history.state,from=new URL(location.href).searchParams.get('from');
   const next=valid(current)&&current.page===message.page?current:state(message.page,sections.has(from)?from:message.section,0);
   // Preserve the exact first NFC/QR URL; reading a link never rewrites it.
   replace(next);publish(next);return;
  }
  if(!initialized)return;
  if(message.operation==='back'){
   dismissNotice();
   const current=history.state;
   if(valid(current)&&current.depth>0){history.back();return;}
   const page=sections.has(message.fallback)?message.fallback:'home',next=state(page,page,0);
   replace(next,routeUrl(page,page));publish(next);return;
  }
  if(message.operation!=='navigate'||!routes.has(message.page))return;
  dismissNotice();
  const current=history.state,section=sectionFor(message.page,message.section);
  if(valid(current)&&current.page===message.page&&current.section===section)return;
  const depth=valid(current)?current.depth:0,next=state(message.page,section,message.replace?depth:depth+1);
  if(message.replace)replace(next,routeUrl(message.page,section));
  else history.pushState({...next},'',routeUrl(message.page,section));
 });
 window.addEventListener('popstate',event=>{
  if(!initialized)return;
  dismissNotice();
  if(valid(event.state)){publish(event.state);return;}
  const params=new URL(location.href).searchParams,page=params.has('birdCode')||params.has('bird')?'adopt':params.get('page')||'home';
  const next=state(routes.has(page)?page:'home',params.get('from'),0);replace(next);publish(next);
 });
})();
