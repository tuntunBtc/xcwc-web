#!/usr/bin/env node
// Deterministic merchandise derivatives. Original artwork and catalogue stay untouched.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/xcwc-browser-check/node_modules/playwright');
const web=path.resolve(__dirname,'..');
const args=process.argv.slice(2);
function option(name,fallback){const index=args.indexOf(name);return index<0?fallback:path.resolve(args[index+1])}
const catalogueFile=option('--catalog',path.resolve(web,'../xcwc-api/src/main/resources/shop/catalog.json'));
const manifestFile=option('--manifest',path.join(web,'assets/shop/media-optimization.json'));
const catalogue=JSON.parse(fs.readFileSync(catalogueFile,'utf8'));
const previous=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):null;
const previousProducts=new Map((previous?.products||[]).map(p=>[p.id,p]));
const previousBanners=new Map((previous?.banners||[]).map(p=>[p.id,p]));
const full={left:0,top:0,width:1,height:1};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function local(url){
 if(typeof url!=='string'||!url.startsWith('/assets/shop/')||url.includes('..')||/[?#]/.test(url))throw Error('Only local shop media is supported: '+url);
 return path.join(web,url.slice(1));
}
function rectangle(raw){const r=raw||full;if(!['left','top','width','height'].every(k=>Number.isFinite(r[k]))||r.left<0||r.top<0||r.width<=0||r.height<=0||r.left+r.width>1||r.top+r.height>1)throw Error('Invalid cover crop');return r}
const originals=new Map();
function source(url){const file=local(url),bytes=fs.readFileSync(file);const sha256=hash(bytes);originals.set(file,sha256);return {url,file,bytes,sha256}}
function write(url,base64){const file=local(url);if(originals.has(file))throw Error('Refusing to overwrite source artwork');fs.mkdirSync(path.dirname(file),{recursive:true});const bytes=Buffer.from(base64,'base64');fs.writeFileSync(file,bytes);return {url,bytes:bytes.length,sha256:hash(bytes)}}
const reduction=(before,after)=>Number(((1-after/before)*100).toFixed(2));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const products=[],banners=[];
 try{
  const page=await browser.newPage();
  async function encode(input,crop,cover){
   return page.evaluate(async({base64,crop,cover})=>{
    const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
    const width=image.naturalWidth,height=image.naturalHeight;
    const encodeCanvas=(canvas,quality)=>{const encoded=canvas.toDataURL('image/webp',quality);if(!encoded.startsWith('data:image/webp;base64,'))throw Error('WebP encoder unavailable');return encoded.split(',')[1]};
    const detail=document.createElement('canvas');detail.width=width;detail.height=height;detail.getContext('2d').drawImage(image,0,0);
    const result={width,height,detailBase64:encodeCanvas(detail,.91)};detail.width=detail.height=1;
    if(cover){const canvas=document.createElement('canvas');canvas.width=480;canvas.height=Math.max(1,Math.round(480*(height*crop.height)/(width*crop.width)));const c=canvas.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(image,width*crop.left,height*crop.top,width*crop.width,height*crop.height,0,0,canvas.width,canvas.height);result.coverBase64=encodeCanvas(canvas,.85);result.coverWidth=canvas.width;result.coverHeight=canvas.height;canvas.width=canvas.height=1}
    return result;
   },{base64:input.bytes.toString('base64'),crop,cover});
  }
  for(const p of catalogue.products){
   const prior=previousProducts.get(p.id);
   const optimized=p.detailImageUrl.endsWith('/detail-optimized.webp');
   if(optimized&&!prior)throw Error('Missing original-media manifest for '+p.id);
   const input=source(optimized?prior.source.url:p.detailImageUrl);
   const crop=rectangle(optimized?prior.source.coverCrop:p.coverCrop);
   const result=await encode(input,crop,true),directory=path.posix.dirname(input.url);
   const detail=write(directory+'/detail-optimized.webp',result.detailBase64),cover=write(directory+'/cover-480.webp',result.coverBase64);
   products.push({id:p.id,title:p.title,source:{url:input.url,bytes:input.bytes.length,sha256:input.sha256,width:result.width,height:result.height,coverCrop:crop},cover:{...cover,width:result.coverWidth,height:result.coverHeight,crop:full},detail:{...detail,width:result.width,height:result.height},cataloguePatch:{coverImageUrl:cover.url,detailImageUrl:detail.url,coverCrop:full}});
  }
  for(const b of catalogue.banners){
   const prior=previousBanners.get(b.id);const optimized=b.imageUrl.endsWith('-optimized.webp');
   if(optimized&&!prior)throw Error('Missing original banner manifest for '+b.id);
   const input=source(optimized?prior.source.url:b.imageUrl),result=await encode(input,full,false);
   const stem=path.posix.basename(input.url,path.posix.extname(input.url));
   const image=write(path.posix.dirname(input.url)+'/'+stem+'-optimized.webp',result.detailBase64);
   banners.push({id:b.id,source:{url:input.url,bytes:input.bytes.length,sha256:input.sha256,width:result.width,height:result.height},image:{...image,width:result.width,height:result.height},cataloguePatch:{imageUrl:image.url}});
  }
 }finally{await browser.close()}
 for(const [file,expected]of originals)if(hash(fs.readFileSync(file))!==expected)throw Error('Original artwork changed during optimization: '+file);
 const sum=(list,selector)=>list.reduce((total,p)=>total+selector(p),0);
 const original=sum(products,p=>p.source.bytes),covers=sum(products,p=>p.cover.bytes),details=sum(products,p=>p.detail.bytes);
 const enabledOrder=products.filter(p=>catalogue.products.find(c=>c.id===p.id)?.enabled!==false).sort((a,b)=>{
  const ca=catalogue.products.find(p=>p.id===a.id),cb=catalogue.products.find(p=>p.id===b.id);return(ca.sortOrder||0)-(cb.sortOrder||0)||a.id.localeCompare(b.id)
 });
 const firstTwo=enabledOrder.slice(0,2);
 const stats={products:products.length,originalDetailBytes:original,allCoverBytes:covers,allOptimizedDetailBytes:details,coverReductionPercent:reduction(original,covers),detailReductionPercent:reduction(original,details),firstTwoOriginalBytes:sum(firstTwo,p=>p.source.bytes),firstTwoCoverBytes:sum(firstTwo,p=>p.cover.bytes),firstTwoReductionPercent:reduction(sum(firstTwo,p=>p.source.bytes),sum(firstTwo,p=>p.cover.bytes)),originalBannerBytes:sum(banners,p=>p.source.bytes),optimizedBannerBytes:sum(banners,p=>p.image.bytes),originalSha256Unchanged:true};
 const manifest={schemaVersion:1,method:'Chromium Canvas deterministic crop/resize and WebP encoding; source artwork unchanged',settings:{coverWidth:480,coverQuality:.85,detailQuality:.91,detailGeometry:'original pixel dimensions'},stats,products,banners};
 fs.mkdirSync(path.dirname(manifestFile),{recursive:true});fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n',{encoding:'utf8'});
 console.log(JSON.stringify({manifest:manifestFile,...stats},null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
