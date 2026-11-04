import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/account-host.js',import.meta.url),'utf8').replace('__ADOPTION_ENTRY__','');
const key='yanji.cloud.session.v1';
function host(initial=null){
 const window=new EventTarget(),document=new EventTarget(),timers=new Map(),messages=[];
 let auth=initial,reads=0,nextTimer=0;
 window.xcwcSession={read:()=>{reads++;return auth}};
 document.hidden=false;document.getElementById=()=>({contentWindow:{postMessage:message=>messages.push(message)}});
 vm.runInNewContext(source,{window,document,location:{protocol:'https:',hostname:'example.test'},Map,AbortController,
  setInterval:callback=>{const id=++nextTimer;timers.set(id,callback);return id},clearInterval:id=>timers.delete(id)});
 function send(target,type,values={}){const event=new Event(type);Object.assign(event,values);target.dispatchEvent(event)}
 return {timers,messages,reads:()=>reads,setAuth:value=>{auth=value},event:(type,values)=>send(window,type,values),
  visibility:hidden=>{document.hidden=hidden;send(document,'visibilitychange')},tick:()=>{for(const callback of [...timers.values()])callback()}};
}
const auth={token:'a'.repeat(64),username:'test_owner'};

test('anonymous visits do not poll and unrelated storage writes do not recheck the session',()=>{
 const h=host(),before=h.reads();assert.equal(h.timers.size,0);
 h.event('storage',{key:'xcwc.guest.v1'});h.tick();assert.equal(h.reads(),before);
 h.event('storage',{key});assert.equal(h.reads(),before+1);
});

test('login, cross-tab changes, expiry and logout retain their session notifications',()=>{
 const h=host();h.setAuth(auth);h.event('xcwc-session-change');assert.equal(h.timers.size,1);
 assert.equal(h.messages.at(-1).account,auth.username);
 const count=h.messages.length;h.tick();assert.equal(h.messages.length,count);
 h.setAuth({...auth,token:'b'.repeat(64)});h.event('storage',{key});assert.equal(h.messages.length,count+1);assert.equal(h.timers.size,1);
 h.setAuth(null);h.tick();assert.equal(h.messages.at(-1).account,null);assert.equal(h.timers.size,0);
 h.setAuth(auth);h.event('storage',{key});h.setAuth(null);h.event('storage',{key:null});assert.equal(h.timers.size,0);
 assert(h.messages.every(message=>!('token' in message)));
});

test('background and pagehide stop polling; foreground/BFCache restore checks expiry immediately',()=>{
 const h=host(auth);assert.equal(h.timers.size,1);
 h.visibility(true);assert.equal(h.timers.size,0);
 const before=h.reads();h.tick();assert.equal(h.reads(),before);
 h.setAuth(null);h.visibility(false);assert.equal(h.messages.at(-1).account,null);assert.equal(h.timers.size,0);
 h.setAuth(auth);h.event('xcwc-session-change');h.event('pagehide');assert.equal(h.timers.size,0);
 h.visibility(false);assert.equal(h.timers.size,0);
 h.event('pageshow');h.event('pageshow');h.visibility(false);assert.equal(h.timers.size,1);
 h.event('pagehide');h.setAuth(null);h.event('pageshow');assert.equal(h.messages.at(-1).account,null);assert.equal(h.timers.size,0);
});
