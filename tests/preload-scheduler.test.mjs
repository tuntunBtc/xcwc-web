import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/nest-preload.js',import.meta.url),'utf8').split('const nestMedia=')[0];
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};

class Target{
 constructor(){this.listeners=new Map()}
 addEventListener(type,listener,options={}){
  if(options.signal?.aborted)return;
  const entries=this.listeners.get(type)||[];
  if(entries.some(entry=>entry.listener===listener))return;
  const entry={listener,signal:options.signal,once:options.once};
  entry.abort=()=>this.removeEventListener(type,listener);
  entries.push(entry);this.listeners.set(type,entries);options.signal?.addEventListener('abort',entry.abort,{once:true});
 }
 removeEventListener(type,listener){const entries=this.listeners.get(type)||[],entry=entries.find(value=>value.listener===listener);if(!entry)return;entry.signal?.removeEventListener('abort',entry.abort);this.listeners.set(type,entries.filter(value=>value!==entry))}
 dispatch(type,properties={}){const event={type,target:this,...properties};for(const entry of [...(this.listeners.get(type)||[])]){if(entry.once)this.removeEventListener(type,entry.listener);entry.listener(event)}this['on'+type]?.(event)}
 count(){return [...this.listeners.values()].reduce((sum,entries)=>sum+entries.length,0)}
}

function setup(){
 const document=new Target(),window=new Target(),connection=new Target(),timers=new Map(),requests=[],images=[];let now=0,nextTimer=1,active=0,maxActive=0;
 document.hidden=false;connection.saveData=false;connection.effectiveType='4g';
 function setTimer(callback,delay=0){const id=nextTimer++;timers.set(id,{callback,time:now+delay});return id}
 class Image extends Target{
  constructor(){super();this.attributes=new Map();this.complete=false;this.naturalWidth=0;this.isConnected=true;this.tagName='IMG';this.style={visibility:'visible',backgroundImage:'none'};images.push(this)}
  set src(url){this.attributes.set('src',url);this.complete=false;this.naturalWidth=0;this.loadingResource=true;active++;maxActive=Math.max(maxActive,active);requests.push({url,image:this})}
  get src(){return this.attributes.get('src')||''}
  getAttribute(name){return this.attributes.get(name)||null}
  setAttribute(name,value){this.attributes.set(name,value)}
  removeAttribute(name){if(name==='src')this.end();this.attributes.delete(name)}
  end(){if(this.loadingResource){this.loadingResource=false;active--}}
  load(){this.end();this.complete=true;this.naturalWidth=100;this.dispatch('load')}
  fail(){this.end();this.complete=true;this.naturalWidth=0;this.dispatch('error')}
  decode(){return Promise.resolve()}
  matches(selector){return selector.includes('fetchpriority')&&this.getAttribute('fetchpriority')==='high'||selector.includes('data-xcwc-media-required')&&this.attributes.has('data-xcwc-media-required')}
  getBoundingClientRect(){return {width:100,height:100,left:0,right:100,top:0,bottom:100}}
  querySelectorAll(){return []}
 }
 const context=vm.createContext({Map,Set,Promise,Error,Object,Math,AbortController,document,window,navigator:{connection},Image,innerHeight:800,innerWidth:400,
  setTimeout:setTimer,clearTimeout:id=>timers.delete(id),getComputedStyle:(node,pseudo)=>pseudo?{visibility:'visible',backgroundImage:'none'}:node.style,xcwcMediaUrl:url=>url});
 vm.runInContext(source+'\nglobalThis.api={waitForVisibleMedia,mediaPreparation,createIntentPreloader};',context);
 const tick=async milliseconds=>{const end=now+milliseconds;while(true){const entry=[...timers].filter(([,value])=>value.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!entry)break;now=entry[1].time;timers.delete(entry[0]);entry[1].callback();await flush()}now=end;await flush()};
 return {...context.api,document,window,connection,Image,requests,images,tick,root:(nodes=[])=>Object.assign(new Target(),{querySelectorAll:()=>nodes}),maxActive:()=>maxActive};
}

test('the shared queue keeps one active image and aborts queued work immediately',async()=>{
 const env=setup(),first=env.mediaPreparation.image('/first'),controller=new AbortController();
 const skipped=env.mediaPreparation.image('/skipped',{signal:controller.signal}),rejected=assert.rejects(skipped,{name:'AbortError'});
 const last=env.mediaPreparation.image('/last');assert.deepEqual(env.requests.map(value=>value.url),['/first']);
 controller.abort();await rejected;assert.equal(env.requests.length,1);
 env.requests[0].image.load();await first;await flush();assert.deepEqual(env.requests.map(value=>value.url),['/first','/last']);
 env.requests[1].image.load();await last;assert.equal(env.maxActive(),1);
});

test('automatic intent gets queue priority while explicit playback alone bypasses data saving',async()=>{
 const env=setup();let release;const blocker=env.mediaPreparation.enqueue(()=>new Promise(resolve=>{release=resolve}));
 const background=env.mediaPreparation.image('/background'),intent=env.mediaPreparation.image('/intent',{priority:'intent'});
 release();await blocker;await flush();assert.equal(env.requests[0].url,'/intent');assert.equal(env.requests[0].image.fetchPriority,'low');
 env.requests[0].image.load();await intent;await flush();assert.equal(env.requests[1].url,'/background');env.requests[1].image.load();await background;
 env.connection.saveData=true;await assert.rejects(env.mediaPreparation.image('/automatic',{priority:'intent'}),{name:'AbortError'});
 const playback=env.mediaPreparation.image('/playback',{intent:true});assert.equal(env.requests.at(-1).image.fetchPriority,'auto');env.requests.at(-1).image.load();await playback;
});

test('queued work rechecks network conditions before starting',async()=>{
 const env=setup();let release;const blocker=env.mediaPreparation.enqueue(()=>new Promise(resolve=>{release=resolve}));
 const pending=env.mediaPreparation.image('/queued'),rejected=assert.rejects(pending,{name:'AbortError'});
 env.connection.effectiveType='2g';release();await blocker;await rejected;assert.equal(env.requests.length,0);
});

test('hiding cancels active and queued work; the next visible request can run',async()=>{
 const env=setup(),active=env.mediaPreparation.image('/active'),queued=env.mediaPreparation.image('/queued');
 const rejected=[assert.rejects(active,{name:'AbortError'}),assert.rejects(queued,{name:'AbortError'})];
 env.document.hidden=true;env.document.dispatch('visibilitychange');await Promise.all(rejected);await flush();
 assert.equal(env.requests[0].image.src,'');assert.equal(env.requests.length,1);
 await assert.rejects(env.mediaPreparation.image('/hidden'),{name:'AbortError'});
 env.document.hidden=false;env.document.dispatch('visibilitychange');const resumed=env.mediaPreparation.image('/resumed');assert.equal(env.requests.at(-1).url,'/resumed');env.requests.at(-1).image.load();await resumed;
 assert.equal(env.maxActive(),1);
});

test('a cancelled generic callback retains its serial slot until the callback settles',async()=>{
 const env=setup(),controller=new AbortController();let release,effectiveSignal;
 const running=env.mediaPreparation.enqueue(signal=>{effectiveSignal=signal;return new Promise(resolve=>{release=resolve})},{signal:controller.signal});
 const rejected=assert.rejects(running,{name:'AbortError'});controller.abort();await rejected;assert.equal(effectiveSignal.aborted,true);
 const next=env.mediaPreparation.image('/next');assert.equal(env.requests.length,0);release();await flush();assert.equal(env.requests.length,1);env.requests[0].image.load();await next;
});

test('the visible-media gate waits for decorations to settle but only core image failure blocks readiness',async()=>{
 const env=setup(),core=new env.Image(),decoration=new env.Image();core.src='/hero';core.setAttribute('fetchpriority','high');decoration.src='/decoration';decoration.style.backgroundImage='url("/decoration-background")';
 let resolved=false;const ready=env.waitForVisibleMedia([env.root([core,decoration])]).then(value=>{resolved=true;return value});
 core.load();decoration.fail();await flush();assert.equal(resolved,false);
 env.requests.find(value=>value.url==='/decoration-background').image.fail();assert.equal(await ready,true);
 const failedCore=new env.Image();failedCore.src='/broken-hero';const blocked=env.waitForVisibleMedia([env.root([failedCore])],undefined,{requiredImages:[failedCore]});failedCore.fail();assert.equal(await blocked,false);
});

test('hung decorative media is bounded; core source changes and cancellation fail the gate safely',async()=>{
 const env=setup(),decoration=new env.Image();decoration.src='/hung';const settled=env.waitForVisibleMedia([env.root([decoration])],undefined,{timeoutMs:50});await env.tick(50);assert.equal(await settled,true);assert.equal(decoration.src,'/hung');
 const core=new env.Image();core.src='/old';core.setAttribute('fetchpriority','high');const stale=env.waitForVisibleMedia([env.root([core])]);core.src='/new';core.load();assert.equal(await stale,false);
 const hungCore=new env.Image();hungCore.src='/hung-core';const timeout=env.waitForVisibleMedia([env.root([hungCore])],undefined,{requiredImages:[hungCore],timeoutMs:20});await env.tick(20);assert.equal(await timeout,false);
 const controller=new AbortController(),background=env.root();background.getBoundingClientRect=()=>({width:100,height:100,left:0,right:100,top:0,bottom:100});background.style={visibility:'visible',backgroundImage:'url("/background")'};
 const cancelled=env.waitForVisibleMedia([background],controller.signal);controller.abort();assert.equal(await cancelled,false);assert.equal(env.requests.at(-1).image.src,'');
});

test('scroll and a dragging touch cancel a started intent request',async()=>{
 const env=setup(),root=env.root(),target={url:'/detail'};env.createIntentPreloader({root,resolve:node=>node?.url});
 root.dispatch('pointerover',{target,pointerType:'mouse'});await env.tick(180);assert.equal(env.requests.length,1);assert.equal(env.requests[0].image.fetchPriority,'low');
 root.dispatch('scroll');await flush();assert.equal(env.requests[0].image.src,'');
 root.dispatch('pointerdown',{target,pointerType:'touch',clientX:10,clientY:10});await env.tick(140);assert.equal(env.requests.length,2);
 root.dispatch('pointermove',{target,clientX:19,clientY:10});await flush();assert.equal(env.requests[1].image.src,'');
});

test('intent preparation resumes after visibility restoration and destroy removes its own listeners',async()=>{
 const env=setup(),root=env.root(),target={url:'/detail'},baseline=env.document.count(),helper=env.createIntentPreloader({root,resolve:node=>node?.url});
 root.dispatch('focusin',{target});await env.tick(120);env.document.hidden=true;env.document.dispatch('visibilitychange');await flush();assert.equal(env.requests[0].image.src,'');
 env.document.hidden=false;env.document.dispatch('visibilitychange');root.dispatch('focusin',{target});await env.tick(120);assert.equal(env.requests.length,2);env.requests[1].image.load();await flush();
 helper.destroy();assert.equal(root.count(),0);assert.equal(env.document.count(),baseline);root.dispatch('focusin',{target:{url:'/late'}});await env.tick(200);assert.equal(env.requests.length,2);
});

test('automatic intent respects Save-Data and 2g and an aborted route cannot arm it',async()=>{
 const env=setup(),root=env.root(),target={url:'/detail'},controller=new AbortController();env.createIntentPreloader({root,signal:controller.signal,resolve:node=>node?.url});
 env.connection.saveData=true;root.dispatch('pointerdown',{target,pointerType:'mouse'});await env.tick(200);assert.equal(env.requests.length,0);
 env.connection.saveData=false;env.connection.effectiveType='2g';root.dispatch('focusin',{target});await env.tick(200);assert.equal(env.requests.length,0);
 env.connection.effectiveType='4g';controller.abort();assert.equal(root.count(),0);root.dispatch('focusin',{target});await env.tick(200);assert.equal(env.requests.length,0);
});
