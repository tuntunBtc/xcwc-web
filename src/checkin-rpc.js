let checkinCleanup=null,checkinBack='home';
const checkinPending=new Map();
function checkinRpc(operation,args={},signal){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new Error('页面已离开'));
  const id=crypto.randomUUID();let timeout;
  const cancel=()=>{clearTimeout(timeout);checkinPending.delete(id);window.parent.postMessage({channel:'xcwc-checkin',id,operation:'cancel'},'*');reject(new Error('请求已取消'));};
  const done=(ok,value)=>{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);checkinPending.delete(id);if(ok)resolve(value);else{const error=new Error(value.message||'服务暂时不可用');error.code=value.code;reject(error);}};
  timeout=setTimeout(()=>done(false,{message:'请求超时，请原样重试'}),50000);signal?.addEventListener('abort',cancel,{once:true});checkinPending.set(id,done);
  window.parent.postMessage({channel:'xcwc-checkin',id,operation,args},'*');
 });
}
window.addEventListener('message',event=>{if(event.source!==window.parent||event.data?.channel!=='xcwc-checkin-result')return;checkinPending.get(event.data.id)?.(event.data.ok,event.data.value);});
