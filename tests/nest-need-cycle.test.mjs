import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/nest/nest.js',import.meta.url),'utf8');
const mount=source.indexOf('function mountNest(){');
function inner(start,end){
 const a=source.indexOf(start,mount),b=source.indexOf(end,a+start.length);
 assert(a>=mount&&b>a,'current mount must contain the real presentation helpers');
 return source.slice(a,b);
}
const resetSource=inner(' function resetNeedReminder(', ' function clearFeedback(');
const statusSource=inner(' function nestStatus(', ' function emotionImages(');
const describe=vm.runInNewContext(source+'\ndescribeNestState;');
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 return vm.runInNewContext(`(()=>{
  let needMode='reminder',needSignature='',needPhase=0,needShownAt=null,needResetPending=false;
  ${resetSource}
  ${statusSource}
  return {
   status:nestStatus,
   motion(phase=needPhase){needMode='motion';needPhase=phase;needShownAt=123},
   reminder(phase=needPhase){needMode='reminder';needPhase=phase;needShownAt=123},
   complete(){resetNeedReminder(true)},interrupt(){resetNeedReminder()},
   state(){return {mode:needMode,signature:needSignature,phase:needPhase,shownAt:needShownAt,pending:needResetPending}}
  };
 })()`,{describeNestState:describe});
}
const bird={id:'bird-a',hunger:40,water:25,mood:70};

test('a naturally added physical need updates truth but defers the presentation reset until clip completion',()=>{
 const f=fixture();f.status(bird);f.motion(2);
 const latest={...bird,hunger:20,water:0,mood:60},before=JSON.stringify(latest),status=f.status(latest);
 assert.deepEqual(Array.from(status.needs,need=>need.key),['water','food']);
 assert.equal(status.needs[0].value,0);assert.equal(status.needs[1].value,20);
 assert.deepEqual(plain(f.state()),{mode:'motion',signature:'water,food',phase:2,shownAt:123,pending:true});
 assert.equal(JSON.stringify(latest),before,'presentation never changes the care record');
 f.complete();assert.deepEqual(plain(f.state()),{mode:'reminder',signature:'water,food',phase:0,shownAt:null,pending:false});
 assert.equal(f.status(latest).need,'water');
});

test('reordered physical urgency does not stop an active clip or reset its phase early',()=>{
 const f=fixture(),first={...bird,hunger:5,water:20};f.status(first);f.motion(1);
 const next={...first,hunger:25,water:5},status=f.status(next);
 assert.deepEqual(Array.from(status.needs,need=>need.key),['water','food']);
 assert.deepEqual(plain(f.state()),{mode:'motion',signature:'water,food',phase:1,shownAt:123,pending:true});
 f.complete();assert.equal(f.state().phase,0);assert.equal(f.status(next).need,'water');assert.equal(f.state().pending,false);
});

test('new companionship joins the actual needs while the original sound owns the active presentation',()=>{
 const f=fixture();f.status({...bird,mood:50});f.motion();
 const status=f.status({...bird,mood:40});assert.equal(status.mood,40);assert.deepEqual(Array.from(status.needs,need=>need.key),['water','company']);
 assert.equal(f.state().mode,'motion');assert.equal(f.state().pending,true);f.complete();
 assert.equal(f.state().mode,'reminder');assert.equal(f.state().phase,0);assert.equal(f.state().shownAt,null);
});

test('an empty or repeatedly changed needs collection cannot convert an in-progress one-shot into a healthy loop',()=>{
 const f=fixture();f.status(bird);f.motion(3);
 f.status({...bird,hunger:20,water:0});f.status({...bird,hunger:0,water:20,mood:40});
 const healthy={...bird,hunger:60,water:60,mood:80},status=f.status(healthy);
 assert.equal(status.emotion,'happy');assert.equal(status.needs.length,0);
 assert.deepEqual(plain(f.state()),{mode:'motion',signature:'',phase:3,shownAt:123,pending:true});
 f.complete();assert.deepEqual(plain(f.state()),{mode:'reminder',signature:'',phase:0,shownAt:null,pending:false});
});

test('explicit interruption consumes a pending reset so a later unrelated clip advances normally',()=>{
 const f=fixture(),next={...bird,hunger:20,water:0};f.status(bird);f.motion(4);f.status(next);
 f.interrupt();assert.deepEqual(plain(f.state()),{mode:'reminder',signature:'water,food',phase:0,shownAt:null,pending:false});
 f.status(next);f.motion();f.complete();assert.equal(f.state().phase,1);assert.equal(f.state().pending,false);assert.equal(f.status(next).need,'food');
});

test('a need change during a reminder immediately starts the new real ordering and resets its display clock',()=>{
 const f=fixture();f.status({...bird,hunger:0,water:0,mood:40});f.reminder(2);
 const status=f.status({...bird,hunger:60,water:10,mood:80});
 assert.equal(status.need,'water');assert.deepEqual(plain(f.state()),{mode:'reminder',signature:'water',phase:0,shownAt:null,pending:false});
 f.motion();f.complete();assert.equal(f.state().phase,1,'unchanged cycles keep their regular round-robin advance');
});
