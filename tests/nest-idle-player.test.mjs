import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/nest/nest.js',import.meta.url),'utf8');
const animation=JSON.parse(readFileSync(new URL('../src/nest/idle-animation.json',import.meta.url),'utf8'));
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function fixture({auto=true,mode='resolve',once=false,eligible=true,onCycleEnd,onBlocked,onRequest}={}){
 let now=0,nextId=1,player;const timers=new Map(),prepared=[],draws=[],paint=[],revoked=[],notices=[],events=[];
 const preparation=deferred(),controller=new AbortController(),classes=new Set(),motion=new EventTarget();motion.matches=false;
 class Sound extends EventTarget{
  paused=true;currentTime=0;error=null;src='';removed=false;playCalls=0;loadCalls=0;pending=[];
  play(){this.playCalls++;if(mode==='reject')return Promise.reject(Object.assign(Error('gesture required'),{name:'NotAllowedError'}));this.paused=false;
   if(mode==='pending'){const job=deferred();this.pending.push(job);return job.promise}return Promise.resolve()}
  pause(){this.paused=true}
  load(){this.loadCalls++}
  removeAttribute(name){if(name==='src')this.src=''}
  remove(){this.removed=true}
  end(){this.paused=true;this.dispatchEvent(new Event('ended'))}
 }
 const sound=new Sound(),button={hidden:true,disabled:false,textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v}};
 const actor={append(value){assert.equal(value,sound)},classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}};
 const canvas={hidden:true,dataset:{},getContext:()=>({clearRect(){paint.push('clear')},drawImage(...args){paint.push('draw');draws.push(args)}})};
 const context=vm.createContext({
  nestIdleAnimation:animation,matchMedia:()=>motion,document:{createElement:tag=>{assert.equal(tag,'audio');return sound}},
  mayAutoPreload:()=>auto,nestMedia:{retry(){events.push('retry')}},pageNotice:value=>notices.push(value),
  URL:{createObjectURL:()=>{events.push('blob');return 'blob:fixture-audio'},revokeObjectURL:value=>revoked.push(value)},
  setTimeout(fn,delay){const id=nextId++;timers.set(id,{fn,at:now+delay});return id},clearTimeout:id=>timers.delete(id)
 });
 const create=vm.runInContext(source+'\ncreateNestIdle;',context);
 player=create(actor,canvas,{},button,controller.signal,{
  prepare(intent){prepared.push(intent);return preparation.promise},
  onStarted(){events.push('started')},onCycleEnd(){events.push('ended');onCycleEnd?.(player)},
  onBlocked(){events.push('blocked');onBlocked?.(player)},onRequest(){events.push('request');onRequest?.(player)}
 });
 player.sync(eligible,false,'bird-a',true,once);
 return {player,sound,canvas,button,classes,motion,controller,prepared,draws,paint,revoked,notices,events,timers,
  setMode:value=>{mode=value},setAuto:value=>{auto=value},
  async ready(){preparation.resolve({atlas:{width:animation.width*animation.columns},audio:{}});await flush()},
  async advance(ms){const end=now+ms;while(true){const due=[...timers.entries()].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;timers.delete(due[0]);now=due[1].at;due[1].fn();await flush()}now=end},
  failPreparation:error=>preparation.reject(error)
 };
}

test('preparing media leaves the poster visible and never starts sound before both resources are ready',async()=>{
 const f=fixture();assert.deepEqual(f.prepared,[false]);assert.equal(f.sound.preload,'none');assert.equal(f.sound.playCalls,0);
 assert.equal(f.canvas.hidden,true);assert.equal(f.button.hidden,true);assert.equal(f.button.disabled,true);assert.equal(f.button.attributes['aria-busy'],'true');
 await f.ready();assert.equal(f.sound.playCalls,1);assert.equal(f.sound.loop,false);assert.equal(f.canvas.hidden,false);assert(f.classes.has('idle-playing'));assert.equal(f.draws.length,1);
 f.controller.abort();assert.equal(f.canvas.hidden,true);assert.equal(f.sound.paused,true);
});

test('a rejected original-sound play waits for natural interaction without exposing a silent canvas or play button',async()=>{
 const f=fixture({mode:'reject'});await f.ready();assert.equal(f.sound.playCalls,1);assert.equal(f.canvas.hidden,true);assert.equal(f.draws.length,0);
 assert.equal(f.button.hidden,true);assert.deepEqual(f.events,['blob','blocked']);
 await f.advance(10000);assert.equal(f.sound.playCalls,1,'an autoplay rejection does not cause a timer retry loop');
 f.setMode('resolve');f.player.armFromGesture({isTrusted:true});f.player.sync(true,false,'bird-a',true,false);await flush();assert.equal(f.sound.playCalls,2);assert.equal(f.canvas.hidden,false);
 f.controller.abort();
});

test('a normal trusted gesture arms rejected audio without sound and autoplay resumes only after feedback',async()=>{
 const f=fixture({mode:'reject'});await f.ready();assert.equal(f.player.canCycle(),false);
 f.player.armFromGesture({isTrusted:false});assert.equal(f.sound.loadCalls,0);assert.equal(f.player.canCycle(),false);
 f.setMode('resolve');f.player.armFromGesture({isTrusted:true});assert.equal(f.sound.loadCalls,1);assert.equal(f.sound.playCalls,1);assert.equal(f.canvas.hidden,true);assert.equal(f.sound.paused,true);
 f.player.sync(false,false,'bird-a',false,false);await f.advance(3000);assert.equal(f.sound.playCalls,1,'arming must not play over care feedback');
 f.player.sync(true,false,'bird-a',true,false);await flush();assert.equal(f.sound.playCalls,2);assert.equal(f.canvas.hidden,false);assert(!f.events.includes('request'),'no dedicated play request is required');
 f.controller.abort();
});

test('a gesture before resources arrive arms the same audio and preserves later feedback priority',async()=>{
 const f=fixture();f.player.armFromGesture({isTrusted:true});assert.equal(f.sound.loadCalls,1);assert.equal(f.sound.src,'');assert.equal(f.sound.playCalls,0);
 f.player.sync(false,false,'bird-a',false,false);await f.ready();assert.equal(f.sound.playCalls,0);assert.equal(f.canvas.hidden,true);
 f.player.sync(true,false,'bird-a',true,false);await flush();assert.equal(f.sound.playCalls,1);assert.equal(f.canvas.hidden,false);
 f.player.armFromGesture({isTrusted:true});assert.equal(f.sound.loadCalls,1,'ordinary gestures must not reload a playing or already armed element');
 f.controller.abort();
});

test('an old rejected play cannot relock audio armed by a newer trusted gesture',async()=>{
 const f=fixture({mode:'pending'});await f.ready();f.sound.pause();
 f.player.armFromGesture({isTrusted:true});f.setMode('resolve');f.sound.pending[0].reject(Object.assign(Error('old rejection'),{name:'NotAllowedError'}));await flush();
 assert.equal(f.player.canCycle(),true);assert(!f.events.includes('blocked'));
 f.player.sync(true,false,'bird-a',true,false);await flush();assert.equal(f.canvas.hidden,false);f.controller.abort();
});

test('the confirmed character exception permits reduced-motion playback and gestures ignore disposed players',async()=>{
 const reduced=fixture();reduced.motion.matches=true;reduced.player.armFromGesture({isTrusted:true});assert.equal(reduced.sound.loadCalls,1);await reduced.ready();assert.equal(reduced.canvas.hidden,false);reduced.controller.abort();
 const disposed=fixture();disposed.controller.abort();disposed.player.armFromGesture({isTrusted:true});assert.equal(disposed.sound.loadCalls,1,'only dispose performs load, never the later gesture');
});

test('a normal gesture on save-data permits preparation and the next needs cycle without a play button',async()=>{
 const f=fixture({auto:false,eligible:false,once:false});
 assert.equal(f.prepared.length,0);assert.equal(f.button.hidden,true);f.player.armFromGesture({isTrusted:true});f.player.sync(false,false,'bird-a',true,false);assert.deepEqual(f.prepared,[true]);assert.equal(f.canvas.hidden,true);
 await f.ready();assert.equal(f.sound.playCalls,0);f.player.sync(true,false,'bird-a',true,true);await flush();assert.equal(f.sound.playCalls,1);assert.equal(f.sound.loop,false);assert.equal(f.canvas.hidden,false);
 f.controller.abort();
});

test('a needs clip runs to its original-sound ended event, then returns to a reminder exactly once',async()=>{
 let completed=0;const f=fixture({once:true,onCycleEnd:player=>{completed++;player.sync(false,false,'bird-a',true,false)}});await f.ready();
 assert.equal(f.sound.loop,false);f.sound.currentTime=5.1;await f.advance(5100);assert.equal(completed,0,'the five-second reminder clock cannot truncate an active clip');assert.equal(f.canvas.hidden,false);
 f.sound.end();assert.equal(completed,1);assert.equal(f.canvas.hidden,true);assert.equal(f.sound.paused,true);f.sound.end();assert.equal(completed,1);
 f.controller.abort();
});

test('canvas frame selection follows sound time and clears each frame before replacing it',async()=>{
 const f=fixture();await f.ready();f.sound.currentTime=animation.frameTimesMs[12]/1000;await f.advance(20);
 assert.equal(f.canvas.dataset.frame,'12');assert.equal(f.draws.length,2);assert.deepEqual(f.paint,['clear','draw','clear','draw'],'every replaced frame clears the old pixels first');
 f.player.sync(false,false,'bird-a',false);assert.equal(f.canvas.hidden,true);assert.equal(f.sound.paused,true);assert.equal(f.timers.size,0);
 f.player.sync(true,false,'bird-a',true);await flush();assert.equal(f.sound.currentTime,0,'a care-feedback interruption restarts sound and visual time together');assert.equal(f.canvas.dataset.frame,'0');
 f.controller.abort();
});

test('feedback interrupts a single needs clip and a stale ended event cannot advance the reminder',async()=>{
 let completed=0;const f=fixture({once:true,onCycleEnd:()=>completed++});await f.ready();
 f.player.sync(false,false,'bird-a',false,false);assert.equal(f.canvas.hidden,true);assert.equal(f.sound.paused,true);
 f.sound.end();await f.advance(animation.durationMs);assert.equal(completed,0);assert.equal(f.canvas.hidden,true);assert.equal(f.sound.playCalls,1);
 f.controller.abort();
});

test('leaving during preparation or an unresolved play cancels late visual work and releases audio',async()=>{
 const loading=fixture();loading.controller.abort();await loading.ready();assert.equal(loading.sound.playCalls,0);assert.equal(loading.sound.src,'');assert.equal(loading.sound.removed,true);assert.equal(loading.canvas.width,0);
 const playing=fixture({mode:'pending'});await playing.ready();assert.equal(playing.sound.playCalls,1);assert.equal(playing.canvas.hidden,true);
 playing.controller.abort();playing.sound.pending[0].resolve();await flush();assert.equal(playing.canvas.hidden,true);assert.equal(playing.sound.paused,true);assert.equal(playing.draws.length,0);assert.equal(playing.timers.size,0);assert.deepEqual(playing.revoked,['blob:fixture-audio']);
});

test('changing reduced-motion does not truncate the explicitly allowed character clip',async()=>{
 const f=fixture({once:true,onBlocked:player=>player.sync(false,false,'bird-a',true,false)});await f.ready();
 f.motion.matches=true;f.motion.dispatchEvent(new Event('change'));assert.equal(f.canvas.hidden,false);assert.equal(f.sound.paused,false);assert(!f.events.includes('blocked'));
 f.motion.matches=false;f.motion.dispatchEvent(new Event('change'));await flush();assert.equal(f.sound.playCalls,1);
 f.controller.abort();
});

test('failed preparation leaves an explicit retry and cannot consume a needs rotation',async()=>{
 const f=fixture({once:true});f.failPreparation(Error('fixture download failure'));await flush();assert.equal(f.sound.playCalls,0);assert.equal(f.canvas.hidden,true);assert.match(f.button.textContent,/重试动画/);assert.equal(f.button.disabled,false);assert(!f.events.includes('ended'));
 f.controller.abort();
});

test('a cancelled preparation does not start an unbounded immediate retry on a still-visible page',async()=>{
 const f=fixture();
 try{
  f.failPreparation(Object.assign(Error('visible media is not ready'),{name:'AbortError'}));await flush();
  assert.equal(f.prepared.length,1,'a cancelled background job waits for a later user/lifecycle trigger');
  assert.equal(f.sound.playCalls,0);assert.equal(f.canvas.hidden,true);
 }finally{f.controller.abort()}
});

test('a system sound pause restores the needs reminder without completing or advancing its cycle',async()=>{
 let stage='motion',completed=0;
 const f=fixture({once:true,onCycleEnd:()=>completed++,onBlocked:player=>{stage='reminder';player.sync(false,false,'bird-a',true,false)}});
 try{
  await f.ready();assert.equal(f.canvas.hidden,false);f.sound.pause();await f.advance(20);
  assert.equal(stage,'reminder');assert.equal(f.canvas.hidden,true);assert.equal(f.sound.paused,true);assert.equal(f.timers.size,0);
  assert.equal(f.button.hidden,true);assert.equal(completed,0);
  f.sound.end();await f.advance(1000);assert.equal(completed,0);assert.equal(f.sound.playCalls,1,'the interrupted sound cannot immediately restart itself');
 }finally{f.controller.abort()}
});

test('a stalled original sound returns to the reminder and normal interaction permits a fresh full cycle',async()=>{
 let stage='motion',completed=0;
 const f=fixture({once:true,onCycleEnd:()=>completed++,
  onBlocked:player=>{stage='reminder';player.sync(false,false,'bird-a',true,false)},
  onRequest:player=>{stage='motion';player.sync(true,false,'bird-a',true,true)}
 });
 try{
  await f.ready();f.sound.currentTime=2;f.sound.dispatchEvent(new Event('stalled'));
  assert.equal(stage,'reminder');assert.equal(f.canvas.hidden,true);assert.equal(f.sound.paused,true);assert.equal(f.player.canCycle(),false);
  f.sound.end();await f.advance(1000);assert.equal(completed,0);assert.equal(f.sound.playCalls,1);
  f.player.armFromGesture({isTrusted:true});stage='motion';f.player.sync(true,false,'bird-a',true,true);await flush();assert.equal(f.sound.playCalls,2);assert.equal(f.sound.loop,false);assert.equal(f.sound.currentTime,0);assert.equal(f.canvas.hidden,false);
 }finally{f.controller.abort()}
});

test('gesture-initiated preparation finishing during care feedback cannot play over that feedback',async()=>{
 let requests=0;
 const f=fixture({auto:false,eligible:false,onRequest:player=>{requests++;player.sync(true,false,'bird-a',true,true)}});
 try{
  f.player.armFromGesture({isTrusted:true});f.player.sync(false,false,'bird-a',true,false);assert.deepEqual(f.prepared,[true]);f.player.sync(false,false,'bird-a',false,false);
  await f.ready();assert.equal(requests,0);assert.equal(f.sound.playCalls,0);assert.equal(f.canvas.hidden,true);assert.equal(f.button.hidden,true);assert.equal(f.timers.size,0);
  f.player.sync(false,false,'bird-a',true,false);await flush();assert.equal(requests,0);assert.equal(f.sound.playCalls,0,'ending feedback still lets the real needs reminder finish first');
  f.player.sync(true,false,'bird-a',true,true);await flush();assert.equal(requests,0);assert.equal(f.sound.playCalls,1);assert.equal(f.canvas.hidden,false,'the next normal cycle can reuse the prepared resources');
 }finally{f.controller.abort()}
});
