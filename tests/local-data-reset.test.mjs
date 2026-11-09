import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/local-data-reset.js',import.meta.url),'utf8');
function storage(entries=[]){
 const data=new Map(entries);
 return {get length(){return data.size},key:index=>[...data.keys()][index]??null,getItem:key=>data.get(key)??null,removeItem:key=>data.delete(key),setItem:(key,value)=>data.set(key,value),data};
}
function host({local=storage(),session=storage(),clear=async()=>{},clearCart=async()=>{}}={}){
 const window={localStorage:local,sessionStorage:session,xcwcLocalAlbum:{clear},xcwcShopCart:{reset:clearCart}};
 vm.runInNewContext(source,{window,Set,JSON,Error});
 return {window,local,session,reset:window.xcwcResetLocalData};
}

test('resets local experience and only this application widget paths, preserving sessions and unrelated data',async()=>{
 const widget=(pathname,query='?page=profile')=>'codex:visualization-widget-state-v2:'+JSON.stringify([pathname,query]);
 const deleted=['xcwc.guest.v1','xcwc.shop.cart.v1:%40anonymous','xcwc.shop.cart.v1:another_user',widget('/'),widget('/index.html'),widget('/register.html','?birdCode=fixture')+':share-size-v1'];
 const kept=['yanji.cloud.session.v1','unrelated.app','xcwc.guest.v10','xcwc.shop.cart.v10:other',widget('/other-app'),widget('/')+':unknown',widget('/')+':probe'];
 const local=storage([...deleted,...kept].map(key=>[key,'original']));
 const session=storage([['xcwc.return-context','return'],['yanji.cloud.session.v1','session'],['xcwc.adoption.pending:user:fixture','pending'],['xcwc.points.request:user:pet:fixture','pending'],['other','value']]);
 let albumCleared=false,cartCleared=false;
 const {reset}=host({local,session,clear:async()=>{assert.equal(local.getItem('xcwc.guest.v1'),'original');albumCleared=true},clearCart:async()=>{assert.equal(albumCleared,true);assert.equal(local.getItem('xcwc.guest.v1'),'original');cartCleared=true}});
 assert.equal((await reset()).cleared,true);assert.equal(albumCleared,true);assert.equal(cartCleared,true);
 for(const key of deleted)assert.equal(local.getItem(key),null,key);
 for(const key of kept)assert.equal(local.getItem(key),'original',key);
 assert.equal(session.getItem('xcwc.return-context'),null);
 assert.equal(session.getItem('yanji.cloud.session.v1'),'session');
 assert.equal(session.getItem('xcwc.adoption.pending:user:fixture'),'pending');
 assert.equal(session.getItem('xcwc.points.request:user:pet:fixture'),'pending');
 assert.equal(session.getItem('other'),'value');
});

test('album failure preserves local records and allows a later retry',async()=>{
 const local=storage([['xcwc.guest.v1','birds']]);let attempts=0;
 const {reset}=host({local,clear:async()=>{if(++attempts===1)throw Error('IndexedDB unavailable')}});
 await assert.rejects(reset(),/IndexedDB unavailable/);assert.equal(local.getItem('xcwc.guest.v1'),'birds');
 assert.equal((await reset()).cleared,true);assert.equal(local.getItem('xcwc.guest.v1'),null);assert.equal(attempts,2);
});

test('overlapping resets share one operation and completion receipt',async()=>{
 let release,calls=0;const gate=new Promise(resolve=>release=resolve);
 const {reset}=host({clear:async()=>{calls++;await gate}});
 const first=reset(),second=reset();assert.equal(first,second);assert.equal(calls,1);
 release();assert.equal((await first).cleared,true);assert.equal((await second).cleared,true);
 await reset();assert.equal(calls,2);
});

test('cart storage failure preserves remaining experience and permits retry',async()=>{
 const local=storage([['xcwc.guest.v1','birds']]);let attempts=0;
 const {reset}=host({local,clearCart:async()=>{if(++attempts===1)throw Error('Cart IndexedDB unavailable')}});
 await assert.rejects(reset(),/Cart IndexedDB unavailable/);assert.equal(local.getItem('xcwc.guest.v1'),'birds');
 assert.equal((await reset()).cleared,true);assert.equal(local.getItem('xcwc.guest.v1'),null);
});

test('storage exceptions and silent removal failures never report success',async()=>{
 const failing=storage([['xcwc.guest.v1','birds']]);failing.removeItem=()=>{throw Error('storage denied')};
 await assert.rejects(host({local:failing}).reset(),/storage denied/);
 const silent=storage([['xcwc.guest.v1','birds']]);silent.removeItem=()=>{};
 await assert.rejects(host({local:silent}).reset(),/未能删除/);
});

test('session cleanup failure reports incomplete cleanup after local records were removed',async()=>{
 const local=storage([['xcwc.guest.v1','birds']]),session=storage([['xcwc.return-context','return']]);
 session.removeItem=()=>{throw Error('session denied')};
 await assert.rejects(host({local,session}).reset(),/session denied/);
 assert.equal(local.getItem('xcwc.guest.v1'),null);assert.equal(session.getItem('xcwc.return-context'),'return');
});

test('missing album implementation cannot erase local data or claim success',async()=>{
 const h=host({local:storage([['xcwc.guest.v1','birds']])});h.window.xcwcLocalAlbum=null;
 await assert.rejects(h.reset(),/相册尚未准备好/);assert.equal(h.local.getItem('xcwc.guest.v1'),'birds');
});

test('reset generation stays visible to other tabs throughout clearing and changes after completion',async()=>{
 const local=storage();let release;const gate=new Promise(resolve=>release=resolve);
 const {reset}=host({local,clear:()=>gate});
 const pending=reset(),during=local.getItem('xcwc.local.reset.v1');
 assert.match(during,/^pending:/);
 release();assert.equal((await pending).cleared,true);
 assert.equal(local.getItem('xcwc.local.reset.v1'),'done:'+during.slice('pending:'.length));
 await reset();assert.notEqual(local.getItem('xcwc.local.reset.v1'),'done:'+during.slice('pending:'.length));
});

test('unable to persist the reset generation stops before deleting photos or experience',async()=>{
 const local=storage([['xcwc.guest.v1','birds']]);let cleared=false;
 local.setItem=()=>{};
 const {reset}=host({local,clear:async()=>{cleared=true}});
 await assert.rejects(reset(),/清除状态无法保存/);
 assert.equal(cleared,false);assert.equal(local.getItem('xcwc.guest.v1'),'birds');
});


test('reset loads optional stores before deleting any data and a load failure leaves all data intact',async()=>{
 const h=host({local:storage([['xcwc.guest.v1','original']])}),features=[];
 h.window.xcwcEnsureHostFeature=async name=>{features.push(name);throw Error('feature unavailable')};
 await assert.rejects(h.reset(),/feature unavailable/);assert.equal(h.local.getItem('xcwc.guest.v1'),'original');
 assert.deepEqual(features,['photo','shop']);
 h.window.xcwcEnsureHostFeature=async()=>{};assert.equal((await h.reset()).cleared,true);
});
