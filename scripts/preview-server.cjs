const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mjs':'text/javascript; charset=utf-8'};
http.createServer((req,res)=>{
 if(req.url.startsWith('/api/')){
  if(!process.env.API_TARGET){res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({code:'BACKEND_NOT_CONFIGURED',message:'未配置后端，请设置 API_TARGET 后重启预览服务'}));return;}
  const upstream=http.request(new URL(req.url,process.env.API_TARGET),{method:req.method,headers:{...req.headers,host:new URL(process.env.API_TARGET).host}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
  upstream.setTimeout(45000,()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'BACKEND_UNAVAILABLE',message:'打卡服务暂时不可用，请稍后重试'}));});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);return;
 }
 let filename;try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));}catch{res.writeHead(400).end();return;}
 if(!filename.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(filename,(error,data)=>{
  if(error){res.writeHead(404).end('Not found');return;}
  const reusable=filename.startsWith(path.join(root,'assets')+path.sep)||filename.startsWith(path.join(root,'vendor')+path.sep);
  const headers={'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':reusable?'no-cache':'no-store',...(reusable?{'Access-Control-Allow-Origin':'*'}:{})};
  if(reusable){
   const etag='"'+crypto.createHash('sha256').update(data).digest('hex')+'"';headers.ETag=etag;
   if(req.headers['if-none-match']?.split(',').map(value=>value.trim()).includes(etag)){res.writeHead(304,headers).end();return;}
  }
  res.writeHead(200,headers);res.end(data);
 });
}).listen(Number(process.env.PORT||8766),'127.0.0.1',()=>console.log('xcwc-web: http://127.0.0.1:'+(process.env.PORT||8766)));
