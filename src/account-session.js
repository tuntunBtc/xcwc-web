// Shared by the outer H5 host and login page. Tokens never enter the sandbox.
(()=>{
 const key='yanji.cloud.session.v1';
 function valid(value){return value&&/^[a-f0-9]{64}$/.test(value.token||'')&&/^[a-z0-9_]{4,32}$/.test(value.username||'')&&Number.isFinite(Date.parse(value.expiresAt))&&Date.parse(value.expiresAt)>Date.now();}
 function clear(){for(const name of ['localStorage','sessionStorage']){try{window[name].removeItem(key);}catch{}}window.dispatchEvent(new Event('xcwc-session-change'));}
 function read(){
  try{
   const stored=localStorage.getItem(key);let value=JSON.parse(stored||'null');
   if(!stored){const old=JSON.parse(sessionStorage.getItem(key)||'null');if(valid(old)){localStorage.setItem(key,JSON.stringify(old));sessionStorage.removeItem(key);value=old;}}
   if(!valid(value)){if(stored){localStorage.removeItem(key);sessionStorage.removeItem(key);}return null;}
   return {token:value.token,username:value.username,expiresAt:value.expiresAt};
  }catch{return null;}
 }
 function write(value){if(!valid(value))throw Error('服务返回的会话格式或有效期无效');const safe={token:value.token,username:value.username,expiresAt:value.expiresAt};try{localStorage.setItem(key,JSON.stringify(safe));sessionStorage.removeItem(key);}catch{throw Error('浏览器无法保存登录状态，请允许本地存储后重试');}window.dispatchEvent(new Event('xcwc-session-change'));return safe;}
 window.xcwcSession=Object.freeze({read,write,clear});
})();
