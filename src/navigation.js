// Internal views share one sandbox; the trusted host owns browser history.
const appRoutes=new Set(['home','city','shop','profile','adopt','photo','wardrobe','flock']);
const appSections=new Set(['home','city','shop','profile']);
let navigationReady=false;
function navigationSection(page=s.page){
 if(appSections.has(page))return page;
 if(page==='photo'||page==='adopt')return 'home';
 return appSections.has(s.navigationSection)?s.navigationSection:'home';
}
function syncNavigation(){
 if(navigationReady)return;
 navigationReady=true;
 window.parent.postMessage({channel:'xcwc-navigation',operation:'ready',page:s.page,section:navigationSection()},'*');
}
function nav(page,options={}){
 if(page==='back'){
  window.parent.postMessage({channel:'xcwc-navigation',operation:'back',fallback:navigationSection()},'*');
  return;
 }
 if(!appRoutes.has(page))return;
 const previous=s.page,section=appSections.has(page)?page:page==='photo'||page==='adopt'?'home':navigationSection();
 s.navigationSection=appSections.has(options.section)?options.section:section;
 if(page===previous){referenceChrome();return;}
 if(page==='photo')checkinBack=previous;
 if(page==='city')s.cityDetail=false;
 if(page!=='photo'&&previous!=='photo')photoEntry=null;
 window.scrollTo(0,0);accountRpc('scrollTop').catch(()=>{});
 s.page=page;modal.hidden=true;render();save();
 if(options.history!=='none')window.parent.postMessage({channel:'xcwc-navigation',operation:'navigate',page,section:navigationSection(),replace:!!options.replace},'*');
}
window.addEventListener('message',event=>{
 if(event.source!==window.parent)return;
 const message=event.data;
 if(message?.channel!=='xcwc-navigation-state'||!appRoutes.has(message.page))return;
 nav(message.page,{history:'none',section:message.section});
});
