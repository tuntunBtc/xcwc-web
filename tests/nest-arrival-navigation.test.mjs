import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const navigation=readFileSync(new URL('../src/navigation.js',import.meta.url),'utf8');
const accountClient=readFileSync(new URL('../src/account-client.js',import.meta.url),'utf8');
const nestSource=readFileSync(new URL('../src/nest/nest.js',import.meta.url),'utf8');
const birdId='1234567890abcdef1234567890abcdef';
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(page='adopt'){
 const s={page,navigationSection:'home',name:'西湖小黄莺',points:5},liveAccount={currentId:birdId,ready:true};
 const messages=[],savedStates=[],operations=[],retained=[],listeners=new Map(),calls={render:0,chrome:0};
 const parent={postMessage:message=>messages.push(plain(message))};
 const context=vm.createContext({s,liveAccount,modal:{hidden:false},checkinBack:null,photoEntry:null,
  window:{parent,scrollTo(){},addEventListener:(type,listener)=>listeners.set(type,listener)},
  nestMedia:{retain:page=>retained.push({page,previous:s.page})},render(){calls.render++},referenceChrome(){calls.chrome++},
  save:()=>savedStates.push(plain(s)),accountRpc:operation=>{operations.push(operation);return Promise.resolve({})}
 });
 const api=vm.runInContext(navigation+'\n({nav,syncNavigation});',context);
 return {s,liveAccount,messages,savedStates,operations,retained,calls,...api,
  hostNavigate(message,source=parent){listeners.get('message')({source,data:message})}
 };
}

test('adoption to home is an ordinary immediate navigation with no arrival-animation state',()=>{
 const f=fixture();f.nav('home',{nestArrivalBirdId:birdId});
 assert.equal(f.s.page,'home');assert.equal(f.calls.render,1);assert.equal(f.savedStates.length,1);assert.deepEqual(f.operations,['scrollTop']);
 assert(!Object.hasOwn(f.liveAccount,'nestArrival'));assert(!Object.hasOwn(f.s,'nestArrival'));
 assert.deepEqual(f.retained,[{page:'home',previous:'adopt'}],'prepared adoption media is retained before the route renders');
 assert.deepEqual(f.messages,[{channel:'xcwc-navigation',operation:'navigate',page:'home',section:'home',replace:false}]);
 for(const value of [...f.savedStates,...f.messages])assert(!JSON.stringify(value).includes(birdId),'animation metadata is neither persisted nor sent to host history');
});

test('legacy arrival flags are ignored from every route and never gate the main flow',()=>{
 for(const page of ['adopt','city','shop','profile','photo','wardrobe','flock'])for(const id of [birdId,null,'invalid']){
  const f=fixture(page);f.nav('home',{nestArrivalBirdId:id});assert.equal(f.s.page,'home');assert.equal(f.calls.render,1);assert(!Object.hasOwn(f.liveAccount,'nestArrival'));
 }
});

test('same-route navigation and ignored external events cannot recreate preload or animation intents',()=>{
 const f=fixture('home');f.nav('home',{nestArrivalBirdId:birdId});f.nav('invalid');f.hostNavigate({channel:'xcwc-navigation-state',page:'city'},{});
 assert.equal(f.calls.render,0);assert.equal(f.calls.chrome,1);assert.equal(f.savedStates.length,0);assert.deepEqual(f.retained,[]);assert(!Object.hasOwn(f.liveAccount,'nestArrival'));
});

test('leaving the relevant pages delegates cancellation while host back/forward remains ordinary navigation',()=>{
 const f=fixture();f.nav('home');f.nav('city');f.hostNavigate({channel:'xcwc-navigation-state',page:'home',section:'home',nestArrivalBirdId:birdId});
 assert.equal(f.s.page,'home');assert.deepEqual(f.retained.map(value=>value.page),['home','city','home']);
 assert.equal(f.messages.length,2,'history restoration does not post another navigation');assert(!Object.hasOwn(f.liveAccount,'nestArrival'));
});

test('preparation defaults to background priority and returns its pending job without blocking navigation',async()=>{
 let resolve;const pending=new Promise(yes=>resolve=yes),requests=[];
 const prepare=vm.runInNewContext(nestSource+'\nprefetchNestMedia;',{nestMedia:{prepareHome(urls,options){requests.push({urls,options});return pending}}});
 const result=prepare();assert.equal(result,pending);assert.equal(requests.length,1);assert.equal(requests[0].options.intent,undefined,'automatic preparation is not promoted to explicit intent');
 assert(requests[0].urls[0].includes('home-background'));assert(requests[0].urls.some(url=>url.includes('/idle/poster.webp')));
 assert(!requests[0].urls.some(url=>/huangying-idle\.(webp|m4a)/.test(url)),'the shared scheduler owns the later heavy-media stage');
 const f=fixture();f.nav('home');assert.equal(f.calls.render,1,'a pending prepare cannot block the adoption-to-home transition');resolve({atlas:{},audio:{}});await result;
});

test('an explicit playback request can promote preparation without changing the route or guest state',()=>{
 const requests=[],context={nestMedia:{prepareHome(urls,options){requests.push({urls,options});return Promise.resolve({})}}};
 const prepare=vm.runInNewContext(nestSource+'\nprefetchNestMedia;',context);const options={intent:true};prepare(options);
 assert.equal(requests.length,1);assert.equal(requests[0].options,options);assert.equal(requests[0].options.intent,true);
});

test('account change resets the selected bird and does not create an arrival presentation',()=>{
 const listeners=new Map(),parent={},calls={render:0},context=vm.createContext({window:{parent,addEventListener:(type,callback)=>listeners.set(type,callback)},checkinCleanup:null,render(){calls.render++}});
 const live=vm.runInContext(accountClient+'\nliveAccount;',context);Object.assign(live,{currentId:birdId,ready:true});
 listeners.get('message')({source:parent,data:{channel:'xcwc-account-change'}});
 assert.equal(live.currentId,null);assert.equal(live.ready,false);assert.equal(calls.render,1);assert(!Object.hasOwn(live,'nestArrival'));
});
