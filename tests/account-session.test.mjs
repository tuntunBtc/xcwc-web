import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../src/account-session.js',import.meta.url),'utf8');
const key='yanji.cloud.session.v1';
function setup(){const make=()=>{const map=new Map();return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}};const localStorage=make(),sessionStorage=make(),events=[];const window={localStorage,sessionStorage,dispatchEvent:e=>events.push(e.type)};vm.runInNewContext(code,{window,localStorage,sessionStorage,Event,Date,JSON});return{session:window.xcwcSession,localStorage,sessionStorage,events};}
const auth=()=>({token:'a'.repeat(64),username:'valid_owner',expiresAt:new Date(Date.now()+60000).toISOString(),password:'never-save-this'});
test('persistent session stores only server-issued token, identity and expiry',()=>{const x=setup();x.session.write(auth());assert.equal(x.session.read().username,'valid_owner');assert.equal(x.sessionStorage.getItem(key),null);assert(!x.localStorage.getItem(key).includes('never-save'));assert.deepEqual(x.events,['xcwc-session-change']);});
test('existing valid tab session migrates once to persistent storage',()=>{const x=setup();x.sessionStorage.setItem(key,JSON.stringify(auth()));assert(x.session.read());assert(x.localStorage.getItem(key));assert.equal(x.sessionStorage.getItem(key),null);});
test('expired or malformed credentials cannot restore a logged-in identity',()=>{for(const value of [{...auth(),expiresAt:'2000-01-01T00:00:00Z'},{...auth(),token:'bad'},{...auth(),expiresAt:null}]){const x=setup();x.localStorage.setItem(key,JSON.stringify(value));assert.equal(x.session.read(),null);assert.equal(x.localStorage.getItem(key),null);}});
test('logout clears both persistent and legacy tab credentials',()=>{const x=setup();x.session.write(auth());x.sessionStorage.setItem(key,JSON.stringify(auth()));x.session.clear();assert.equal(x.session.read(),null);assert.equal(x.sessionStorage.getItem(key),null);});
