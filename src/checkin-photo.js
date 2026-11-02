// The decoder is local and lazy: normal JPG/PNG/WebP never download it.
let checkinHeicLoader=null,checkinHeicQueue=Promise.resolve();
function loadCheckinHeic(){
 if(globalThis.HeicTo)return Promise.resolve(globalThis.HeicTo);
 if(checkinHeicLoader)return checkinHeicLoader;
 checkinHeicLoader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');let timer;
  const failed=()=>{clearTimeout(timer);script.remove();checkinHeicLoader=null;reject(new Error('苹果照片处理组件加载失败，请检查网络后重试'));};
  script.src='__XCWC_ASSET_ORIGIN__/vendor/heic-to-1.6.7/heic-to.js';
  script.onload=()=>{clearTimeout(timer);if(globalThis.HeicTo)resolve(globalThis.HeicTo);else failed();};
  script.onerror=failed;timer=setTimeout(failed,30000);document.head.append(script);
 });
 return checkinHeicLoader;
}
async function isCheckinHeic(file){
 // Detect bytes too: iOS containers can omit MIME or change the filename.
 const buffer=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reader.onabort=()=>reject(new Error('照片读取失败'));reader.readAsArrayBuffer(file.slice(0,64));});
 const bytes=new Uint8Array(buffer),text=String.fromCharCode(...bytes);
 return text.slice(4,8)==='ftyp'&&/heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(text.slice(8));
}
function convertCheckinHeic(file){
 const job=checkinHeicQueue.then(async()=>{const convert=await loadCheckinHeic();return convert({blob:file,type:'image/jpeg',quality:.92});});
 checkinHeicQueue=job.catch(()=>{});return job;
}
