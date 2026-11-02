// Clear this application's local experience only; cloud sessions stay intact.
(()=>{
 const widgetPrefix='codex:visualization-widget-state-v2:';
 const widgetPaths=new Set(['/','/index.html','/register.html']);
 let resetPromise=null;
 function ownedWidgetKey(key){
  if(!key.startsWith(widgetPrefix))return false;
  let suffix=key.slice(widgetPrefix.length);
  if(suffix.endsWith(':share-size-v1'))suffix=suffix.slice(0,-':share-size-v1'.length);
  try{const value=JSON.parse(suffix);return Array.isArray(value)&&value.length===2&&widgetPaths.has(value[0])&&typeof value[1]==='string'}catch{return false}
 }
 function keys(storage){const result=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(typeof key==='string')result.push(key)}return result}
 function remove(storage,key){storage.removeItem(key);if(storage.getItem(key)!==null)throw Error('部分本机缓存未能删除，请重试')}
 async function reset(){
  if(typeof window.xcwcLocalAlbum?.clear!=='function')throw Error('本机相册尚未准备好，请刷新后重试');
  // IndexedDB failure must not erase the remaining local experience record.
  await window.xcwcLocalAlbum.clear();
  const local=window.localStorage;
  for(const key of keys(local))if(key==='xcwc.guest.v1'||key.startsWith('xcwc.shop.cart.v1:')||ownedWidgetKey(key))remove(local,key);
  remove(window.sessionStorage,'xcwc.return-context');
  return {cleared:true};
 }
 window.xcwcResetLocalData=()=>{
  if(!resetPromise)resetPromise=reset().finally(()=>{resetPromise=null});
  return resetPromise;
 };
})();
