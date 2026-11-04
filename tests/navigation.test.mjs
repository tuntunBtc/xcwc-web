import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/navigation-host.js',import.meta.url),'utf8');
function host(url){
 const listeners=new Map(),messages=[],frameWindow={postMessage:value=>messages.push(value)};
 const location={href:url},entries=[{url,state:null}];let index=0;
 const history={get state(){return entries[index].state},replaceState(value,_title,target){location.href=new URL(target,location.href).href;entries[index]={state:value,url:location.href}},pushState(value,_title,target){location.href=new URL(target,location.href).href;entries.splice(++index);entries.push({state:value,url:location.href})},back(){if(!index)return;location.href=entries[--index].url;listeners.get('popstate')?.({state:entries[index].state})}};
 const window={addEventListener:(name,fn)=>listeners.set(name,fn)};
 vm.runInNewContext(source,{window,document:{getElementById:()=>({contentWindow:frameWindow})},location,history,URL,Set,Number});
 const send=(data,source=frameWindow)=>listeners.get('message')({source,data:{channel:'xcwc-navigation',...data}});
 return{send,history,location,messages,entries};
}

test('the first NFC URL is preserved and browser back restores the original entry',()=>{
 const original='http://127.0.0.1:8852/register.html?birdCode=synthetic_fixture';
 const h=host(original);h.send({operation:'ready',page:'adopt',section:'home'});
 assert.equal(h.location.href,original);
 h.send({operation:'navigate',page:'home',section:'home'});
 h.send({operation:'navigate',page:'wardrobe',section:'home'});
 assert.equal(new URL(h.location.href).searchParams.get('page'),'wardrobe');
 h.send({operation:'back',fallback:'home'});
 assert.equal(h.history.state.page,'home');
 h.history.back();assert.equal(h.location.href,original);
 assert.equal(h.messages.at(-1).page,'adopt');
});

test('subpages retain their originating section and back returns to it',()=>{
 const h=host('http://127.0.0.1:8852/?page=profile');
 h.send({operation:'ready',page:'profile',section:'profile'});
 h.send({operation:'navigate',page:'wardrobe',section:'profile'});
 assert.equal(h.history.state.section,'profile');
 assert.equal(new URL(h.location.href).searchParams.get('from'),'profile');
 h.send({operation:'back',fallback:'profile'});
 assert.equal(h.history.state.page,'profile');
});

test('direct subpage links have a local fallback instead of leaving the site',()=>{
 const h=host('http://127.0.0.1:8852/?page=wardrobe&from=profile');
 h.send({operation:'ready',page:'wardrobe',section:'home'});
 assert.equal(h.history.state.section,'profile');
 h.send({operation:'back',fallback:'profile'});
 assert.equal(h.history.state.page,'profile');assert.equal(h.entries.length,1);
});

test('untrusted windows and unsupported routes cannot change history',()=>{
 const h=host('http://127.0.0.1:8852/?page=home');
 h.send({operation:'ready',page:'home',section:'home'});
 h.send({operation:'navigate',page:'profile'},{});
 h.send({operation:'navigate',page:'https://outside.invalid'});
 assert.equal(h.history.state.page,'home');assert.equal(h.entries.length,1);
});

test('repeated ready and same-route messages do not create extra back entries',()=>{
 const h=host('http://127.0.0.1:8852/?page=home');
 h.send({operation:'ready',page:'home',section:'home'});
 h.send({operation:'ready',page:'home',section:'home'});
 h.send({operation:'navigate',page:'home',section:'home'});
 assert.equal(h.entries.length,1);
});
