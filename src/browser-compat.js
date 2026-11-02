// Compatibility for phase-one HTTP/IP visitor previews. Never generates account tokens.
(()=>{
 function randomId(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');}
 const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 const rotate=(x,n)=>(x>>>n)|(x<<(32-n));
 function sha256(input){
  const len=input.length,size=Math.ceil((len+9)/64)*64,data=new Uint8Array(size);data.set(input);data[len]=128;const view=new DataView(data.buffer);view.setUint32(size-8,Math.floor(len/0x20000000));view.setUint32(size-4,(len*8)>>>0);
  const state=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Uint32Array(64);
  for(let pos=0;pos<size;pos+=64){for(let i=0;i<16;i++)w[i]=view.getUint32(pos+i*4);for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2],s0=rotate(x,7)^rotate(x,18)^(x>>>3),s1=rotate(y,17)^rotate(y,19)^(y>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}let[a,b,c,d,e,f,g,h]=state;
   for(let i=0;i<64;i++){const s1=rotate(e,6)^rotate(e,11)^rotate(e,25),choice=(e&f)^(~e&g),t1=(h+s1+choice+K[i]+w[i])>>>0,s0=rotate(a,2)^rotate(a,13)^rotate(a,22),major=(a&b)^(a&c)^(b&c),t2=(s0+major)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}[a,b,c,d,e,f,g,h].forEach((v,i)=>state[i]=(state[i]+v)>>>0);
  }return state.map(v=>v.toString(16).padStart(8,'0')).join('');
 }
 window.xcwcRandomId=randomId;
 window.xcwcDigestBlob=async blob=>{const buffer=await blob.arrayBuffer();if(crypto.subtle){const hash=await crypto.subtle.digest('SHA-256',buffer);return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}return sha256(new Uint8Array(buffer));};
})();
