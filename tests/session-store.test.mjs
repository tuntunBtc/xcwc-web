import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/account/session-store.js',import.meta.url),'utf8');
const key='yanji.cloud.session.v1';
function storage(map=new Map()){return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}}
function browser(local=storage(),tab=storage(),now=Date.now()){
 const c={localStorage:local,sessionStorage:tab,Date:class extends Date{static now(){return now}}};c.window=c;vm.runInNewContext(source,c);return c;
}
function session(now=Date.now()){return {token:'a'.repeat(64),username:'test_owner',expiresAt:new Date(now+7*86400000).toISOString()}}
test('session survives closing a tab and keeps its original seven-day expiry',()=>{
 const local=storage(),first=browser(local);const value=session();first.XcwcSession.write(value);
 const reopened=browser(local,storage());assert.equal(reopened.XcwcSession.read().token,value.token);assert.equal(reopened.XcwcSession.read().expiresAt,value.expiresAt);
 assert.equal([...local.map.values()].join('').includes('password'),false);
});
test('expired/revoked-local session clears both stores and does not silently renew',()=>{
 const now=Date.now(),local=storage(),first=browser(local,storage(),now);first.XcwcSession.write(session(now));
 assert.equal(browser(local,storage(),now+8*86400000).XcwcSession.read(),null);assert.equal(local.getItem(key),null);
 first.XcwcSession.write(session(now));const other=browser(local);first.XcwcSession.clear();assert.equal(other.XcwcSession.read(),null);
});
test('valid legacy tab session migrates once, invalid entries never become logged in',()=>{
 const tab=storage(),local=storage(),value=session();tab.setItem(key,JSON.stringify(value));const c=browser(local,tab);
 assert.equal(c.XcwcSession.read().username,value.username);assert.equal(tab.getItem(key),null);assert.ok(local.getItem(key));
 local.setItem(key,'{bad');assert.equal(c.XcwcSession.read(),null);
 local.setItem(key,JSON.stringify({loggedIn:true,username:'test_owner'}));assert.equal(c.XcwcSession.read(),null);
});
