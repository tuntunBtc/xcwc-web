const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.mp3':'audio/mpeg','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.wav':'audio/wav','.mp4':'video/mp4','.webm':'video/webm','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
const textType=value=>/^(?:text\/|application\/(?:javascript|x-javascript|json|manifest\+json|xml)|image\/svg\+xml)/i.test(value||'');
const acceptsGzip=value=>{
 const encodings=String(value||'').split(',').map(item=>item.trim().toLowerCase().split(';'));
 const encoding=encodings.find(item=>item[0]==='gzip')||encodings.find(item=>item[0]==='*');
 return Boolean(encoding)&&!encoding.slice(1).some(part=>/^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(part));
};
const varyEncoding=previous=>!previous?'Accept-Encoding':String(previous).split(',').some(x=>['*','accept-encoding'].includes(x.trim().toLowerCase()))?previous:previous+', Accept-Encoding';
const matchesEtag=(value,etag)=>String(value||'').split(',').some(item=>item.trim()==='*'||item.trim().replace(/^W\//,'')===etag.replace(/^W\//,''));
function send(req,res,status,headers,data){
 const output={...headers};
 const compressible=status===200&&textType(output['Content-Type']||output['content-type'])&&data.length>=1024&&!output['Content-Encoding']&&!output['content-encoding'];
 if(compressible){
  const oldVary=output.Vary||output.vary;delete output.vary;output.Vary=varyEncoding(oldVary);
 }
 if(compressible&&acceptsGzip(req.headers['accept-encoding'])){
  data=zlib.gzipSync(data,{level:5});output['Content-Encoding']='gzip';
  const etag=output.ETag||output.etag;
  if(etag&&!etag.startsWith('W/')){delete output.etag;output.ETag='W/'+etag;}
 }
 delete output['content-length'];delete output['transfer-encoding'];output['Content-Length']=data.length;
 res.writeHead(status,output);res.end(req.method==='HEAD'||status===304?undefined:data);
}
http.createServer((req,res)=>{
 if(req.url.startsWith('/api/')){
  if(!process.env.API_TARGET){send(req,res,503,{'Content-Type':'application/json','Cache-Control':'no-store'},Buffer.from(JSON.stringify({code:'BACKEND_NOT_CONFIGURED',message:'未配置后端，请设置 API_TARGET 后重启预览服务'})));return;}
  const failUpstream=()=>{if(res.writableEnded)return;if(!res.headersSent)send(req,res,502,{'Content-Type':'application/json','Cache-Control':'no-store'},Buffer.from(JSON.stringify({code:'BACKEND_UNAVAILABLE',message:'打卡服务暂时不可用，请稍后重试'})));else res.end();};
  const target=new URL(process.env.API_TARGET);
  const upstream=http.request(new URL(req.url,target),{method:req.method,headers:{...req.headers,host:target.host}},response=>{
   response.on('error',failUpstream);
   // Only bounded public JSON is buffered for preview compression; private photos stay streamed.
   const publicRead=req.method==='GET'&&/^\/api\/(?:health|checkin-catalog|birds\/|shop\/)/.test(req.url);
   if(publicRead&&textType(response.headers['content-type'])&&!response.headers['content-encoding']&&response.statusCode!==304){
    const chunks=[];let length=0,streaming=false;
    response.on('data',chunk=>{
     if(streaming){res.write(chunk);return;}
     chunks.push(chunk);length+=chunk.length;
     if(length>2*1024*1024){streaming=true;res.writeHead(response.statusCode,response.headers);for(const part of chunks)res.write(part);chunks.length=0;}
    });
    response.on('end',()=>{if(streaming)res.end();else send(req,res,response.statusCode,response.headers,Buffer.concat(chunks));});
   }else{res.writeHead(response.statusCode,response.headers);response.pipe(res);}
  });
  upstream.setTimeout(45000,()=>upstream.destroy());upstream.on('error',failUpstream);req.on('aborted',()=>upstream.destroy());req.pipe(upstream);return;
 }
 if(!['GET','HEAD'].includes(req.method)){send(req,res,405,{'Allow':'GET, HEAD','Cache-Control':'no-store'},Buffer.alloc(0));return;}
 let filename;try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));}catch{send(req,res,400,{'Cache-Control':'no-store'},Buffer.alloc(0));return;}
 if(!filename.startsWith(root+path.sep)){send(req,res,403,{'Cache-Control':'no-store'},Buffer.alloc(0));return;}
 fs.stat(filename,(statError,stat)=>{
  if(statError||!stat.isFile()){send(req,res,404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'},Buffer.from('Not found'));return;}
  fs.readFile(filename,(error,data)=>{
   if(error){send(req,res,404,{'Cache-Control':'no-store'},Buffer.from('Not found'));return;}
   const reusable=['assets','vendor','runtime'].some(dir=>filename.startsWith(path.join(root,dir)+path.sep));
   const fingerprinted=reusable&&/\.[0-9a-f]{12}\.(?:js|css|svg|webp|png|jpe?g|avif|gif|mp3|m4a|aac|ogg|mp4|webm|woff2?)$/.test(filename);
   const etag='"'+crypto.createHash('sha256').update(data).digest('hex')+'"';
   const headers={'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':fingerprinted?'public, max-age=31536000, immutable':'no-cache',ETag:etag,'Last-Modified':stat.mtime.toUTCString(),...(filename.startsWith(path.join(root,'assets')+path.sep)?{'Access-Control-Allow-Origin':'*'}:{})};
   const modified=req.headers['if-modified-since'];
   if(matchesEtag(req.headers['if-none-match'],etag)||(!req.headers['if-none-match']&&modified&&Number.isFinite(Date.parse(modified))&&Math.floor(stat.mtimeMs/1000)*1000<=Date.parse(modified))){
    if(textType(headers['Content-Type'])&&data.length>=1024){headers.Vary='Accept-Encoding';if(acceptsGzip(req.headers['accept-encoding']))headers.ETag='W/'+etag;}
    res.writeHead(304,headers).end();return;
   }
   send(req,res,200,headers,data);
  });
 });
}).listen(Number(process.env.PORT||8766),'127.0.0.1',function(){console.log('xcwc-web: http://127.0.0.1:'+this.address().port);});
