import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/checkin-page.js',import.meta.url),'utf8');
const scheduling=source.slice(source.indexOf('let paintFrame=null;'),source.indexOf('function syncSelection()'));
const controls=source.slice(source.indexOf('function setSize(value)'),source.indexOf('async function upload(file)'));
const cloudSource=readFileSync(new URL('../src/checkin-cloud.js',import.meta.url),'utf8');
function harness(){
 const frames=new Map(),clicks=new Map(),nodes=new Map(),controller=new AbortController(),snapshots=[];let next=0,draws=0,drafts=0;
 const state={destroyed:false,ready:true,pendingSubmission:{old:true},dirty:false,selected:['bird'],poses:{bird:{cx:20}},ratio:()=>1,constrain(){},render(){draws++;snapshots.push({pose:{...state.poses.bird},photoX:state.photoX,photoY:state.photoY,label:state.$('#ck-location').value})},syncSelection(){},syncPhotoControls(){},syncGenerate(){},scheduleDraft(){drafts++},rpcController:controller,uploaded:true,
  $:key=>{if(!nodes.has(key))nodes.set(key,{addEventListener:(type,fn)=>clicks.set(key,fn)});return nodes.get(key)},
  requestAnimationFrame:fn=>{const id=++next;frames.set(id,fn);return id},cancelAnimationFrame:id=>frames.delete(id)};
 vm.createContext(state);vm.runInContext(scheduling,state);
 return {state,frames,clicks,controller,snapshots,draws:()=>draws,drafts:()=>drafts,call:code=>vm.runInContext(code,state),paint(){const jobs=[...frames.values()];frames.clear();for(const job of jobs)job()}};
}
function editorHarness(){
 const h=harness();Object.assign(h.state,{active:'bird',busy:false,readingPhoto:false,photo:{naturalWidth:1600,naturalHeight:1200},photoFit:'cover',photoX:50,photoY:50,photoPlacement:()=>({horizontal:true,vertical:false})});
 h.state.poses.bird={cx:400,cy:500,size:34};h.state.$('#ck-location').value='旧地点';h.state.$('#ck-generate').disabled=true;
 h.state.syncGenerate=()=>{h.state.$('#ck-generate').disabled=!h.state.dirty;};h.call(controls);return h;
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
test('size, framing and location input events share one paint and make an edited saved work immediately exportable',()=>{
 const h=editorHarness(),node=h.state.$;
 for(let i=0;i<20;i++){
  node('#ck-size').oninput({target:{value:String(20+i)}});
  node('#ck-photoX').oninput({target:{value:String(i+10)}});
  node('#ck-photoY').oninput({target:{value:String(i+30)}});
  node('#ck-location').value='地点'+i;node('#ck-location').oninput();
 }
 assert.equal(h.frames.size,1);assert.equal(h.draws(),0);assert.equal(h.state.pendingSubmission,null);
 assert.equal(h.state.poses.bird.size,39);assert.equal(h.state.photoX,29);assert.equal(h.state.photoY,49);
 assert.equal(node('#ck-generate').disabled,false);
 h.paint();assert.equal(h.draws(),1);assert.equal(h.snapshots[0].label,'地点19');assert.equal(h.snapshots[0].pose.size,39);
});
test('an immediate export after input flushes the final size, crop and label without waiting for a frame',()=>{
 for(const button of ['#ck-generate','#ck-download']){
  const h=editorHarness(),node=h.state.$;
  node('#ck-size').oninput({target:{value:'48'}});node('#ck-photoX').oninput({target:{value:'81'}});
  node('#ck-location').value='最后一次中文输入';node('#ck-location').oninput();
  h.clicks.get(button)();assert.equal(h.draws(),1);assert.equal(h.frames.size,0);
  assert.deepEqual(h.snapshots[0],{pose:{cx:400,cy:500,size:48},photoX:81,photoY:50,label:'最后一次中文输入'});
  h.paint();assert.equal(h.draws(),1);
 }
});
test('leaving before the scheduled paint keeps the latest input in the draft and cancels the abandoned frame',()=>{
 const h=editorHarness(),node=h.state.$,writes=[];
 Object.assign(h.state,{draftTimer:null,draftReady:true,restoringDraft:false,draftEpoch:'initial',draftLease:'editor-lease',displayBlob:new Blob(['original'],{type:'image/jpeg'}),style:0,uploadVersion:0,
  ownedUrls:new Set(),albumPending:new Map(),URL:{revokeObjectURL(){}},setTimeout:()=>1,clearTimeout(){},
  reconcilePoses:(ids,poses)=>Object.fromEntries(ids.map(id=>[id,{...poses[id]}])),
  checkinRpc:(operation,args)=>{writes.push({operation,args});return Promise.resolve({});},rpc:()=>Promise.resolve({})});
 h.call(cloudSource.slice(cloudSource.indexOf('function draftSnapshot()'),cloudSource.indexOf('async function restoreDraft()')));
 h.call(cloudSource.slice(cloudSource.indexOf('checkinCleanup=()=>')));
 node('#ck-size').oninput({target:{value:'51'}});node('#ck-photoY').oninput({target:{value:'73'}});
 node('#ck-location').value='离页前的地点';node('#ck-location').oninput();
 assert.equal(h.frames.size,1);h.call('checkinCleanup()');
 assert.equal(writes.length,1);assert.equal(writes[0].operation,'draftWrite');
 const draft=writes[0].args.draft;assert.equal(draft.poses.bird.size,51);assert.equal(draft.photoY,73);assert.equal(draft.label,'离页前的地点');
 assert.equal(draft.dirty,true);assert.equal(draft.pendingSubmission,null);assert.equal(draft.photoBlob,h.state.displayBlob);
 assert.equal(h.frames.size,0);h.paint();assert.equal(h.draws(),0);
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
