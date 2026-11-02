// Opaque sessions only; passwords never enter browser storage.
(()=>{
 const key='yanji.cloud.session.v1';
 const valid=value=>value&&typeof value.token==='string'&&/^[0-9a-f]{64}$/.test(value.token)&&
  typeof value.username==='string'&&/^[a-z0-9_]{4,32}$/.test(value.username)&&Number.isFinite(Date.parse(value.expiresAt))&&Date.parse(value.expiresAt)>Date.now();
 const clear=()=>{for(const name of ['localStorage','sessionStorage']){try{window[name].removeItem(key)}catch{}}};
 function write(value){if(!valid(value))throw Error('登录会话无效或已过期');try{localStorage.setItem(key,JSON.stringify({token:value.token,username:value.username,expiresAt:value.expiresAt}));sessionStorage.removeItem(key)}catch{throw Error('无法保存登录状态，请允许本站存储后重试')}}
 function read(){try{let value=JSON.parse(localStorage.getItem(key)||'null');if(!value){value=JSON.parse(sessionStorage.getItem(key)||'null');if(valid(value))write(value)}if(valid(value))return value;clear();return null}catch{clear();return null}}
 window.XcwcSession={read,write,clear};
})();
