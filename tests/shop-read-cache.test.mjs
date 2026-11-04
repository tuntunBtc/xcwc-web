import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/shop/host.js',import.meta.url),'utf8');
const product={id:'hangzhou-xihu',title:'西湖小鸟',price:69,coverImageUrl:'/assets/cover.123456789abc.webp',detailImageUrl:'/assets/detail.123456789abc.webp',purchaseUrl:'https://e.tb.cn/old'};
const list={items:[product],total:1,page:1,pageSize:20,cities:[]};
const query={page:1,pageSize:20,sort:'default',city:''};
function harness(){
 const listeners=[],sent=[],calls=[],popups=[],events=[];let time=1_000_000,fetcher=async()=>({value:list}),counter=0;
 const frame={contentWindow:{postMessage:value=>sent.push(value)}};
 const window={addEventListener:(name,fn)=>{if(name==='message')listeners.push(fn)},xcwcSession:{read:()=>null},open:()=>{events.push('open');const popup={closed:false,opener:{},document:{createElement:()=>({click(){popup.href=this.href;popup.linkRel=this.rel;popup.linkReferrerPolicy=this.referrerPolicy}}),head:{append:meta=>{popup.referrerPolicy=meta.content}},body:{append(){}}},close(){this.closed=true}};popups.push(popup);return popup}};
 const document={createElement:()=>({}),head:{append(){}},getElementById:()=>frame,addEventListener(){}};
 class Clock extends Date{static now(){return time}}
 const fetch=async(path,options)=>{calls.push({path,options});events.push('fetch');const r=await fetcher(path,options);return {ok:r.status===undefined||r.status<400,json:async()=>structuredClone(r.value),headers:{get:key=>({'cache-control':'public, max-age=60',...r.headers})[key.toLowerCase()]||null}}};
 vm.runInNewContext(source,{window,document,fetch,URL,URLSearchParams,Map,Set,Promise,AbortController,DOMException,Date:Clock,setTimeout,clearTimeout,crypto:globalThis.crypto});
 const dispatch=message=>listeners[1]({source:frame.contentWindow,data:{channel:'xcwc-shop-data',...message}});
 return {calls,popups,events,sent,setFetch:fn=>fetcher=fn,advance:ms=>time+=ms,
  async run(operation,args={},id='request-'+(++counter)){await dispatch({operation,args,id});return sent.findLast(x=>x.id===id)},
  cancel:id=>dispatch({operation:'cancel',id})};
}
test('public list primes complete product details, remains fresh for 60 seconds, then revalidates through HTTP cache',async()=>{
 const h=harness();h.setFetch(async path=>({value:path.includes('?')?list:product}));
 const first=await h.run('list',query);assert.equal(first.ok,true);assert.equal(first.freshUntil,1_060_000);
 const detail=await h.run('detail',{id:product.id});assert.deepEqual(detail.value,product);assert.equal(h.calls.length,1);
 h.advance(59_999);await h.run('list',query);assert.equal(h.calls.length,1);
 h.advance(2);await h.run('detail',{id:product.id});assert.equal(h.calls.length,2);assert.equal(h.calls[1].options.cache,'default');assert.equal(h.calls[1].options.credentials,'omit');
});
test('query variants are isolated and failed public reads are retryable',async()=>{
 const h=harness();await h.run('list',query);await h.run('list',{...query,city:'hangzhou'});await h.run('list',{...query,sort:'priceAsc'});assert.equal(h.calls.length,3);
 h.setFetch(async()=>({status:404,value:{code:'SHOP_PRODUCT_NOT_FOUND',message:'not found'}}));
 assert.equal((await h.run('detail',{id:'missing'})).ok,false);
 h.setFetch(async()=>({value:{...product,id:'missing'}}));assert.equal((await h.run('detail',{id:'missing'})).ok,true);assert.equal(h.calls.length,5);
});
test('parallel identical reads share a fetch and one cancelled waiter cannot abort the other',async()=>{
 const h=harness();let finish;h.setFetch(()=>new Promise(resolve=>finish=resolve));
 const a=h.run('banners',{},'a'),b=h.run('banners',{},'b');assert.equal(h.calls.length,1);
 await h.cancel('a');assert.equal(h.calls[0].options.signal.aborted,false);
 finish({value:{items:[]}});await a;assert.equal((await b).ok,true);assert.equal(h.calls.length,1);
});
test('leaving every waiter aborts the fetch and an immediate retry gets a new job',async()=>{
 const h=harness();h.setFetch((_path,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})));
 const a=h.run('banners',{},'a');await h.cancel('a');assert.equal(h.calls[0].options.signal.aborted,true);
 h.setFetch(async()=>({value:{items:[]}}));assert.equal((await h.run('banners')).ok,true);await a;assert.equal(h.calls.length,2);
});
test('buy reserves one isolated window and validates the latest link in one fresh detail request',async()=>{
 const h=harness();await h.run('list',query);h.events.length=0;
 h.setFetch(async()=>({value:{...product,purchaseUrl:'https://item.taobao.com/item.htm?id=2'}}));
 const result=await h.run('purchase',{id:product.id});assert.equal(result.ok,true);assert.equal(h.calls.length,2);assert.equal(h.calls[1].options.cache,'no-cache');
 assert.deepEqual(h.events,['open','fetch']);assert.equal(h.popups.length,1);assert.equal(h.popups[0].opener,null);assert.equal(h.popups[0].referrerPolicy,'no-referrer');assert.equal(h.popups[0].linkRel,'noopener noreferrer');assert.equal(h.popups[0].linkReferrerPolicy,'no-referrer');assert.equal(h.popups[0].href,'https://item.taobao.com/item.htm?id=2');assert.equal(h.popups[0].closed,false);
});
test('removed links or products never open cached Taobao destinations, and failures can retry',async()=>{
 const h=harness();await h.run('list',query);
 h.setFetch(async()=>({value:{...product,purchaseUrl:null}}));const empty=await h.run('purchase',{id:product.id});assert.equal(empty.ok,false);assert.equal(empty.value.code,'PURCHASE_LINK_UNAVAILABLE');assert.equal(empty.value.product.purchaseUrl,null);assert.equal(h.popups[0].closed,true);assert.equal(h.popups[0].href,undefined);
 h.setFetch(async()=>({status:404,value:{code:'SHOP_PRODUCT_NOT_FOUND',message:'removed'}}));assert.equal((await h.run('purchase',{id:product.id})).ok,false);assert.equal(h.popups[1].closed,true);
 h.setFetch(async()=>({value:product}));assert.equal((await h.run('purchase',{id:product.id})).ok,true);assert.equal(h.popups[2].href,product.purchaseUrl);
});
test('server age reduces memory freshness and no-store is never reused',async()=>{
 const h=harness();h.setFetch(async()=>({value:{items:[]},headers:{age:'50'}}));const first=await h.run('banners');assert.equal(first.freshUntil,1_010_000);h.advance(10_001);await h.run('banners');assert.equal(h.calls.length,2);
 h.setFetch(async()=>({value:{items:[]},headers:{'cache-control':'no-store'}}));await h.run('banners',{revalidate:true});await h.run('banners');assert.equal(h.calls.length,4);
});
