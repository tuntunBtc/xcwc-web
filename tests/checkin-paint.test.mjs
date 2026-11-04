import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/checkin-page.js',import.meta.url),'utf8');
const scheduling=source.slice(source.indexOf('let paintFrame=null;'),source.indexOf('function syncSelection()'));
function harness(){
 const frames=new Map(),clicks=new Map(),nodes=new Map(),controller=new AbortController();let next=0,draws=0,drafts=0;
 const state={destroyed:false,ready:true,pendingSubmission:{old:true},dirty:false,selected:['bird'],poses:{bird:{cx:20}},ratio:()=>1,constrain(){},render(){draws++},syncSelection(){},syncPhotoControls(){},syncGenerate(){},scheduleDraft(){drafts++},rpcController:controller,uploaded:true,
  $:key=>{if(!nodes.has(key))nodes.set(key,{addEventListener:(type,fn)=>clicks.set(key,fn)});return nodes.get(key)},
  requestAnimationFrame:fn=>{const id=++next;frames.set(id,fn);return id},cancelAnimationFrame:id=>frames.delete(id)};
 vm.createContext(state);vm.runInContext(scheduling,state);
 return {state,frames,clicks,controller,draws:()=>draws,drafts:()=>drafts,call:code=>vm.runInContext(code,state),paint(){const jobs=[...frames.values()];frames.clear();for(const job of jobs)job()}};
}
test('many gesture changes invalidate the old export immediately and paint only once per frame',()=>{
 const h=harness();for(let i=0;i<30;i++){h.state.poses.bird.cx=i;h.call('scheduleUpdate()')}
 assert.equal(h.frames.size,1);assert.equal(h.draws(),0);assert.equal(h.state.pendingSubmission,null);assert.equal(h.state.dirty,true);
 h.paint();assert.equal(h.draws(),1);assert.equal(h.drafts(),1);assert.equal(h.state.poses.bird.cx,29);
});
test('export capture flushes the final pending gesture synchronously without an extra later draw',()=>{
 const h=harness();h.call('scheduleUpdate()');h.clicks.get('#ck-generate')();assert.equal(h.draws(),1);assert.equal(h.frames.size,0);h.paint();assert.equal(h.draws(),1);
 h.call('scheduleUpdate()');h.clicks.get('#ck-download')();assert.equal(h.draws(),2);assert.equal(h.frames.size,0);
});
test('immediate updates supersede queued paints and departed routes cancel pending work',()=>{
 const h=harness();h.call('scheduleUpdate();update(false)');assert.equal(h.draws(),1);assert.equal(h.frames.size,0);
 h.call('scheduleUpdate()');h.state.destroyed=true;h.controller.abort();assert.equal(h.frames.size,0);h.paint();assert.equal(h.draws(),1);
});
test('repeated preview/export rendering preserves 1000x1010 without resetting the canvas each time',()=>{
 const renderSource=source.slice(source.indexOf('function render(canvas,'),source.indexOf('let paintFrame=null;'));
 let width=300,height=150,resizes=0,draws=0;
 const ctx=new Proxy({drawImage(){draws++}},{get:(target,key)=>key in target?target[key]:(()=>{})});
 const canvas={get width(){return width},set width(v){width=v;resizes++},get height(){return height},set height(v){height=v;resizes++},getContext:()=>ctx};
 const state={photo:{naturalWidth:100,naturalHeight:100},selected:[],poses:{},style:0,photoFit:'cover',photoX:50,photoY:50,images:new Map(),presets:[{filter:'none'}],$:()=>({value:'杭州'}),photoPlacement:()=>({x:38,y:38,width:924,height:812}),canvas};
 vm.createContext(state);vm.runInContext(renderSource,state);vm.runInContext('render(canvas);render(canvas);render(canvas)',state);
 assert.equal(width,1000);assert.equal(height,1010);assert.equal(resizes,2);assert.equal(draws,3);
});
