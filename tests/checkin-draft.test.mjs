import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/checkin-host.js',import.meta.url),'utf8');
const generateSource=readFileSync(new URL('../src/checkin-generate.js',import.meta.url),'utf8');
const birdId='a'.repeat(32),key='xcwc.local.reset.v1';
function harness(){
 const data=new Map(),handlers=new Map(),sent=[];let birds=[{id:birdId}];
 const frame={contentWindow:{postMessage:message=>sent.push(message)}};
 const window={localStorage:{getItem:k=>data.get(k)||null},xcwcGuest:{snapshot:()=>({birds})},addEventListener:(name,handler)=>handlers.set(name,handler)};
 vm.runInNewContext(source,{window,document:{getElementById:()=>frame},AbortController,setTimeout,clearTimeout,Blob,URL,Error,JSON,Number,Map,Set});
 return {window,data,handlers,cast:value=>birds=value,async run(operation,args={}){await handlers.get('message')({source:frame.contentWindow,data:{channel:'xcwc-checkin',id:'test-message',operation,args}});return sent.pop()}};
}
const draft=()=>({photoBlob:new Blob(['photo'],{type:'image/jpeg'}),selected:[birdId],active:birdId,poses:{[birdId]:{cx:300,cy:250,size:18}},style:2,label:'杭州',photoFit:'contain',photoX:25,photoY:80,dirty:true,editorOpen:true});

test('a route round trip retains the photo, cast, poses, crop, and unfinished request',async()=>{
 const x=harness(),value=draft(),lease=(await x.run('draftRead')).value.lease;value.pendingSubmission={metadata:{requestId:'request-photo-12345678',birdIds:[birdId],styleId:'soft',label:'杭州'},original:new Blob(['original'],{type:'image/jpeg'}),image:new Blob(['work'],{type:'image/jpeg'})};
 assert.equal((await x.run('draftWrite',{epoch:'initial',lease,draft:value})).ok,true);
 const restored=(await x.run('draftRead')).value;
 assert.equal(restored.epoch,'initial');assert.equal(await restored.draft.photoBlob.text(),'photo');
 assert.equal(restored.draft.poses[birdId].cx,300);assert.equal(restored.draft.photoFit,'contain');assert.equal(restored.draft.photoY,80);assert.equal(restored.draft.label,'杭州');
 assert.equal(restored.draft.pendingSubmission.metadata.requestId,'request-photo-12345678');
});

test('clearing local data prevents a delayed old draft write from reviving the photo',async()=>{
 const x=harness(),lease=(await x.run('draftRead')).value.lease;await x.run('draftWrite',{epoch:'initial',lease,draft:draft()});
 x.data.set(key,'pending:reset');x.window.xcwcCheckinDraft.clear();
 assert.equal((await x.run('draftRead')).ok,false);
 x.data.set(key,'done:reset');
 const stale=await x.run('draftWrite',{epoch:'initial',lease,draft:draft()});assert.equal(stale.ok,false);assert.equal(stale.value.code,'LOCAL_RESET');
 const latest=(await x.run('draftRead')).value;assert.equal(latest.draft,null);
 const next=draft();next.label='新开始';await x.run('draftWrite',{epoch:'done:reset',lease:latest.lease,draft:next});
 await x.run('draftWrite',{epoch:'initial',lease,draft:draft()});assert.equal((await x.run('draftRead')).value.draft.label,'新开始');
});

test('a newer editor lease rejects delayed writes from the departed editor',async()=>{
 const x=harness(),first=(await x.run('draftRead')).value;
 await x.run('draftWrite',{epoch:first.epoch,lease:first.lease,draft:draft()}); // cleanup flush before the new read
 const second=(await x.run('draftRead')).value;assert.equal(second.draft.label,'杭州');
 const current=draft();current.label='新编辑器';await x.run('draftWrite',{epoch:second.epoch,lease:second.lease,draft:current});
 const late=draft();late.label='旧编码完成';const denied=await x.run('draftWrite',{epoch:first.epoch,lease:first.lease,draft:late});
 assert.equal(denied.ok,false);assert.equal(denied.value.code,'STALE_DRAFT');assert.equal((await x.run('draftRead')).value.draft.label,'新编辑器');
});

test('cast changes discard stale drafts, and unsupported draft content is rejected',async()=>{
 const x=harness(),first=(await x.run('draftRead')).value;await x.run('draftWrite',{epoch:'initial',lease:first.lease,draft:draft()});x.cast([]);
 const empty=(await x.run('draftRead')).value;assert.equal(empty.draft,null);
 assert.equal((await x.run('draftWrite',{epoch:'initial',lease:empty.lease,draft:draft()})).ok,false);
 x.cast([{id:birdId}]);const invalid=draft();invalid.selected=[birdId,birdId];assert.equal((await x.run('draftWrite',{epoch:'initial',lease:empty.lease,draft:invalid})).ok,false);
});

for(const stop of ['image encode','original encode'])test('departed editor finishing delayed '+stop+' cannot replace a newer draft',async()=>{
 let finishImage,finishOriginal,sourceStarted=false,writes=0,creates=0;
 const nodes={'#ck-generate':{},'#ck-location':{value:'杭州'},'#ck-preview':{toBlob:callback=>finishImage=callback}};
 const state={destroyed:false,busy:false,pendingSubmission:null,selected:[birdId],style:0,eligible:()=>true,$:selector=>nodes[selector]||{},syncGenerate(){},syncPhotoControls(){},shutterAudio:{play(){}},sourceBlob:()=>{sourceStarted=true;return new Promise(resolve=>finishOriginal=resolve)},persistDraft:()=>writes++,rpc:()=>{creates++;return Promise.resolve({})},toast(){},crypto:{randomUUID:()=> 'test-request-12345678'}};
 vm.runInNewContext(generateSource,state);const running=nodes['#ck-generate'].onclick();
 if(stop==='original encode'){finishImage(new Blob(['image'],{type:'image/jpeg'}));await Promise.resolve();assert.equal(sourceStarted,true);}
 // A new editor now owns a different draft. Late encoding must produce no write/create.
 state.destroyed=true;state.pendingSubmission={newEditor:true};
 if(stop==='image encode')finishImage(new Blob(['old-image'],{type:'image/jpeg'}));else finishOriginal(new Blob(['old-original'],{type:'image/jpeg'}));
 await running;assert.equal(writes,0);assert.equal(creates,0);assert.equal(state.pendingSubmission.newEditor,true);
});

const cloudSource=readFileSync(new URL('../src/checkin-cloud.js',import.meta.url),'utf8');
for(const failAt of ['photo decode','composing assets'])test('failed '+failAt+' restores transactionally and never replaces the original host draft',async()=>{
 const x=harness(),lease=(await x.run('draftRead')).value.lease,value=draft();
 value.pendingSubmission={metadata:{requestId:'request-photo-12345678',birdIds:[birdId],styleId:'soft',label:'杭州'},original:new Blob(['original'],{type:'image/jpeg'}),image:new Blob(['work'],{type:'image/jpeg'})};
 await x.run('draftWrite',{epoch:'initial',lease,draft:value});
 let failing=true,writes=0;const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',open:false,hidden:false,textContent:'',classList:{add(){}}});return nodes.get(selector)};
 const state={uploadVersion:0,birds:[{id:birdId,adopted:true}],selected:[],active:null,poses:{},style:0,photoFit:'cover',photoX:50,photoY:50,dirty:false,uploaded:false,host:{querySelectorAll:()=>[]},$:node,Image:class{},URL:{createObjectURL:()=> 'blob:restored',revokeObjectURL(){}},AbortController,Blob,Map,Set,Promise,clearTimeout,setTimeout,loadImage:async image=>{if(failing&&failAt==='photo decode')throw Error('decode unavailable');return image},photoDataUrl:async()=> 'data:image/jpeg;base64,eA==',prepareCanvasImages:async()=>{if(failing&&failAt==='composing assets')throw Error('asset unavailable')},reconcilePoses:(_ids,poses)=>poses,renderBirdList(){},update(){},setIssue(){},checkinRpc:async(operation,args)=>{if(operation==='closeViewer')return {};const result=await x.run(operation,args);if(operation==='draftWrite')writes++;if(!result.ok)throw Error(result.value.message);return result.value}};
 vm.createContext(state);vm.runInContext(cloudSource,state);
 await assert.rejects(vm.runInContext('restoreDraft()',state));
 vm.runInContext('persistDraft();checkinCleanup()',state);await Promise.resolve();assert.equal(writes,0);
 assert.equal(vm.runInContext('draftReady',state),false);assert.equal(state.uploaded,false);assert.equal(vm.runInContext('pendingSubmission',state),null);
 const retained=(await x.run('draftRead')).value.draft;assert.equal(await retained.photoBlob.text(),'photo');assert.equal(retained.pendingSubmission.metadata.requestId,'request-photo-12345678');
 // A separate route mount obtains a fresh lease and restores the original photo/request.
 failing=false;const nextState={...state,uploadVersion:0,selected:[],active:null,poses:{},uploaded:false};vm.createContext(nextState);vm.runInContext(cloudSource,nextState);await vm.runInContext('restoreDraft()',nextState);
 assert.equal(nextState.uploaded,true);assert.equal(vm.runInContext('pendingSubmission.metadata.requestId',nextState),'request-photo-12345678');
 assert.equal(await vm.runInContext('displayBlob.text()',nextState),'photo');assert.equal(vm.runInContext('draftReady',nextState),true);
});
