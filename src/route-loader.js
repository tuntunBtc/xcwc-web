// Classic factories work inside the existing opaque-origin sandbox without eval.
function createRouteLoader(manifest,context){
 const factories=new Map(),instances=new Map(),pending=new Map(),loadedStyles=new Map();
 globalThis.xcwcRoutes=Object.freeze({register(name,factory){if(!Object.hasOwn(manifest,name)||typeof factory!=='function')throw Error('未知页面模块');factories.set(name,factory)}});
 function script(url,priority){return new Promise((resolve,reject)=>{
  const element=document.createElement('script');let timer;
  const finish=error=>{clearTimeout(timer);element.onload=element.onerror=null;if(error){element.remove();reject(error)}else resolve()};
  element.fetchPriority=priority;element.src=url;element.onload=()=>finish();element.onerror=()=>finish(Error('页面资源读取失败，请重试'));timer=setTimeout(()=>finish(Error('页面资源读取超时，请重试')),20000);document.head.append(element);
 })}
 function style(url,beforeCommon,priority){if(loadedStyles.has(url))return loadedStyles.get(url);const promise=new Promise((resolve,reject)=>{const element=document.createElement('link');let timer;const done=error=>{clearTimeout(timer);element.onload=element.onerror=null;if(error){element.remove();loadedStyles.delete(url);reject(error)}else resolve()};element.rel='stylesheet';element.fetchPriority=priority;element.href=url;element.onload=()=>done();element.onerror=()=>done(Error('页面样式读取失败，请重试'));timer=setTimeout(()=>done(Error('页面样式读取超时，请重试')),20000);const anchor=beforeCommon&&document.getElementById('xcwc-common-style');if(anchor)document.head.insertBefore(element,anchor);else document.head.append(element)});loadedStyles.set(url,promise);return promise}
 async function load(name,{priority='auto'}={}){
  if(instances.has(name))return instances.get(name);if(pending.has(name))return pending.get(name);
  const entry=manifest[name];if(!entry)throw Error('页面不存在');
  const promise=Promise.all([factories.has(name)?null:script(entry.script,priority),...(entry.styles||[]).map(url=>style(url,entry.beforeCommon,priority))]).then(()=>{
   const factory=factories.get(name);if(!factory)throw Error('页面模块尚未就绪，请重试');const module=factory(context);instances.set(name,module);return module;
  }).finally(()=>pending.delete(name));pending.set(name,promise);return promise;
 }
 return Object.freeze({load,preload:name=>load(name,{priority:'low'})});
}
