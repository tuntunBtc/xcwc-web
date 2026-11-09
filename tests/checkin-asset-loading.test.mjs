import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../src/checkin-page.js',import.meta.url),'utf8');
const assets=page.slice(page.indexOf('const stickerImages=new Map();'),page.indexOf('function toast(text)'));
const preparation=page.slice(page.indexOf('async function prepareCanvasImages('),page.indexOf('function eligible()'));
function harness({uploaded=true}={}){
 const calls=[],issues=[],state={uploaded,selected:['one'],birds:[{id:'one',src:'shared'},{id:'two',src:'shared'},{id:'three',src:'another'},{id:'locked',src:'locked'}],images:new Map(),landscape:{naturalWidth:0},canvasVersion:0,canvasLoading:false,canvasReady:false,destroyed:false,photo:{},Image:class{naturalWidth=0;},syncGenerate(){},update(){},setIssue:(scope,message)=>issues.push(message)};
 state.birdFor=id=>state.birds.find(bird=>bird.id===id);
 state.loadCheckinAsset=(image,key)=>new Promise((resolve,reject)=>calls.push({image,key,resolve:()=>{image.naturalWidth=320;resolve(image)},reject}));
 vm.createContext(state);vm.runInContext(assets+preparation,state);
 return {state,calls,issues,run:code=>vm.runInContext(code,state)};
}
const tick=async()=>{await Promise.resolve();await Promise.resolve();};

test('canvas assets remain idle until requested; an uploaded photo prepares selected stickers and shares their decoded source',async()=>{
 const h=harness();assert.equal(h.calls.length,0);
 const first=h.run('prepareCanvasImages()');assert.deepEqual(h.calls.map(call=>call.key),['bird']);
 assert.deepEqual([...h.state.images.keys()],['one']);assert.equal(h.state.canvasReady,false);
 h.calls[0].resolve();await first;assert.equal(h.state.canvasReady,true);
 h.state.selected=['one','two'];await h.run('prepareCanvasImages()');
 assert.equal(h.calls.length,1);assert.equal(h.state.images.get('one'),h.state.images.get('two'));
 assert.equal(h.state.images.has('three'),false);assert.equal(h.state.images.has('locked'),false);
});

test('only the example editor requests the landscape; restoring a real photo can explicitly skip it',async()=>{
 const h=harness({uploaded:false}),sample=h.run('prepareCanvasImages()');
 assert.deepEqual(h.calls.map(call=>call.key),['bird','background']);h.calls.forEach(call=>call.resolve());await sample;
 const restored=harness({uploaded:false}),pending=restored.run('prepareCanvasImages(["three"],{background:false})');
 assert.deepEqual(restored.calls.map(call=>call.key),['bird']);assert.deepEqual([...restored.state.images.keys()],['three']);
 restored.calls[0].resolve();await pending;
});

for(const outcome of ['success','failure'])test('a late '+outcome+' from the previous cast cannot enable export or show a stale error',async()=>{
 const h=harness(),old=h.run('prepareCanvasImages()').catch(()=>{});
 h.state.selected=['three'];h.run('refreshCanvasSelection()');assert.equal(h.calls.length,2);
 if(outcome==='success')h.calls[0].resolve();else h.calls[0].reject(Error('old asset failed'));
 await old;assert.equal(h.state.canvasReady,false);assert.equal(h.state.canvasLoading,true);assert.deepEqual(h.issues,[]);
 h.calls[1].resolve();await tick();await tick();assert.equal(h.state.canvasReady,true);assert.equal(h.state.canvasLoading,false);
});

test('failed selected assets are retryable, and completion after leaving touches no page state',async()=>{
 const h=harness(),failed=h.run('prepareCanvasImages()');h.calls[0].reject(Error('offline'));
 await assert.rejects(failed);assert.equal(h.state.canvasReady,false);assert.equal(h.state.canvasLoading,false);
 assert.ok(h.issues.at(-1).includes('照片会保留'));
 const retry=h.run('prepareCanvasImages()');assert.equal(h.calls.length,2);h.state.destroyed=true;
 h.calls[1].resolve();await retry;assert.equal(h.state.canvasReady,false);assert.equal(h.issues.length,1);
});

test('removing a failed newcomer immediately restores the already prepared cast and clears its error',async()=>{
 const h=harness(),first=h.run('prepareCanvasImages()');h.calls[0].resolve();await first;
 h.state.selected=['one','three'];const failed=h.run('prepareCanvasImages()');h.calls[1].reject(Error('offline'));await assert.rejects(failed);
 h.state.selected=['one'];h.run('refreshCanvasSelection()');assert.equal(h.state.canvasReady,true);assert.equal(h.issues.at(-1),'');assert.equal(h.calls.length,2);
});

const upload=page.slice(page.indexOf('async function upload(file)'),page.indexOf("$('#ck-file').onchange"));
for(const stage of ['header detection','native decode','fallback decode'])test('leaving during '+stage+' does not start later photo reads or the HEIC converter',async()=>{
 let release,reads=0,converts=0,urls=0,decodes=0;
 const state={busy:false,readingPhoto:false,destroyed:false,uploadVersion:0,ownedUrls:new Set(),
  isCheckinHeic:()=>stage==='header detection'?new Promise(resolve=>release=()=>resolve(true)):Promise.resolve(true),
  photoTypeAllowed:()=>true,Image:class{},URL:{createObjectURL:()=>{urls++;return 'blob:photo'},revokeObjectURL(){}},rememberUrl:value=>value,
  $:()=>({}),syncGenerate(){},toast(){},photoDataUrl:async()=>{reads++;return 'data:photo'},convertCheckinHeic:async()=>{converts++;return new Blob()},
  loadImage:()=>{decodes++;if(stage==='native decode'||decodes===2)return new Promise((resolve,reject)=>release=()=>reject(Error('decode stopped')));return Promise.reject(Error('native unsupported'));}};
 vm.createContext(state);vm.runInContext(upload,state);const pending=vm.runInContext('upload({size:5})',state);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof release,'function');state.destroyed=true;state.uploadVersion++;release();await pending;
 assert.equal(converts,0);assert.equal(reads,stage==='fallback decode'?1:0);assert.equal(urls,stage==='header detection'?0:1);
});
