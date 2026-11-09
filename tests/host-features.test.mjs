import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/host-features.js',import.meta.url),'utf8').replace('__XCWC_HOST_FEATURES__',JSON.stringify({photo:'/runtime/photo-host.hash.js',shop:'/runtime/shop-host.hash.js'}));
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
function host(){
 const listeners=[],scripts=[],sent=[],delivered=[],activated=[],timers=new Map();let owner=null,timerId=0;
 const frame={contentWindow:{postMessage:message=>sent.push(message)}};
 const window={xcwcSession:{read:()=>owner},addEventListener:(name,fn)=>{if(name==='message')listeners.push(fn)},dispatchEvent:event=>{for(const listener of [...listeners])listener(event)}};
 const document={getElementById:()=>frame,createElement:()=>({remove(){this.removed=true}}),head:{append:script=>scripts.push(script)}};
 class MessageEvent{constructor(type,values){this.type=type;Object.assign(this,values)}}
 vm.runInNewContext(source,{window,document,MessageEvent,Map,Set,Object,Promise,Error,setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id)});
 function send(channel,id,operation='bootstrap',source=frame.contentWindow){window.dispatchEvent({type:'message',source,origin:'null',data:{channel,id,operation}})}
 function register(name){window.xcwcHostFeatures.register(name,()=>{activated.push(name);window.addEventListener('message',event=>{if(event.source===frame.contentWindow&&event.data.channel===(name==='photo'?'xcwc-checkin':'xcwc-shop-data'))delivered.push(event)})})}
 return {window,scripts,sent,delivered,activated,timers,send,register,setOwner:value=>{owner=value},complete(name){register(name);scripts.at(-1).onload()}};
}

test('initial load fetches no optional support; matching concurrent calls share one script and preserve source',async()=>{
 const h=host();assert.equal(h.scripts.length,0);
 h.send('xcwc-checkin','untrusted','bootstrap',{});h.send('other','ignored');assert.equal(h.scripts.length,0);
 h.send('xcwc-checkin','one');h.send('xcwc-checkin','two');assert.equal(h.scripts.length,1);
 h.complete('photo');await flush();assert.deepEqual(h.activated,['photo']);assert.deepEqual(h.delivered.map(e=>e.data.id),['one','two']);assert(h.delivered.every(e=>e.origin==='null'));
 h.send('xcwc-checkin','three');assert.deepEqual(h.delivered.map(e=>e.data.id),['one','two','three']);
});

test('a route cancellation removes queued operations before optional support becomes ready',async()=>{
 const h=host();h.send('xcwc-checkin','old');h.send('xcwc-checkin','old','cancel');h.send('xcwc-checkin','current');h.complete('photo');await flush();assert.deepEqual(h.delivered.map(e=>e.data.id),['current']);assert.equal(h.sent.length,0);
});

test('resource failures report retryable errors and the next request loads a new script',async()=>{
 const h=host();h.send('xcwc-shop-data','first','list');h.scripts[0].onerror();await flush();assert.equal(h.sent[0].ok,false);assert.equal(h.sent[0].channel,'xcwc-shop-data-result');
 h.send('xcwc-shop-data','retry','list');assert.equal(h.scripts.length,2);h.complete('shop');await flush();assert.deepEqual(h.delivered.map(e=>e.data.id),['retry']);assert.deepEqual(h.activated,['shop']);
});

test('late registration after timeout cannot run cancelled work or register duplicate handlers',async()=>{
 const h=host();h.send('xcwc-checkin','expired');[...h.timers.values()][0]();await flush();assert.equal(h.sent[0].ok,false);
 h.register('photo');assert.equal(h.activated.length,0);
 h.send('xcwc-checkin','retry');await flush();assert.equal(h.scripts.length,1);assert.deepEqual(h.activated,['photo']);assert.deepEqual(h.delivered.map(e=>e.data.id),['retry']);
 await h.window.xcwcEnsureHostFeature('photo');assert.equal(h.activated.length,1);
});

test('account changes reject queued old-owner work and feature names remain allowlisted',async()=>{
 const h=host();h.send('xcwc-shop-data','old','cart-add');h.setOwner({token:'new-owner'});h.complete('shop');await flush();assert.equal(h.delivered.length,0);assert.equal(h.sent[0].ok,false);
 await assert.rejects(h.window.xcwcEnsureHostFeature('https://outside.test/code.js'));assert.equal(h.scripts.length,1);
});
