import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/nest/nest.js',import.meta.url),'utf8');
function fixture({now=0,gapMs=30000,shared=false}={}){
 const sandbox=vm.createContext({performance:{now:()=>now}});
 vm.runInContext(source,sandbox);
 const create=vm.runInContext('createNestIdleCadence',sandbox);
 const cadence=shared?vm.runInContext('nestIdleCadence',sandbox):create({gapMs,clock:()=>now});
 return {cadence,setTime:value=>{now=value},shared:()=>vm.runInContext('nestIdleCadence',sandbox)};
}

test('first playback is immediately eligible and waiting or failed preparation never consumes the interval',()=>{
 const f=fixture(),c=f.cadence;
 assert.equal(c.canStart(),true);assert.equal(c.waitMs(),0);
 // A denied play or failed download never calls started().
 for(const time of [1000,30000,120000]){
  f.setTime(time);assert.equal(c.canStart(),true);assert.equal(c.waitMs(),0);
 }
});

test('a successful start reserves the whole clip and gap through the exact millisecond boundary',()=>{
 const f=fixture({now:500}),c=f.cadence;
 c.started(6080);assert.equal(c.canStart(),false);assert.equal(c.waitMs(),36080);
 f.setTime(36579);assert.equal(c.canStart(),false);assert.equal(c.waitMs(),1);
 f.setTime(36580);assert.equal(c.canStart(),true);assert.equal(c.waitMs(),0);
 f.setTime(40000);assert.equal(c.waitMs(),0,'elapsed deadlines must not produce negative waits');
});

test('interrupting playback and completing ordinary feedback cannot reopen the cadence early',()=>{
 const f=fixture(),c=f.cadence;c.started(6080);
 // Stopping an interrupted clip does not call ended() or reset the scheduler.
 // These cover two-, three-, and four-second feedback after an early stop.
 for(const time of [1000,3000,4000,5000,12000,30000,36079]){
  f.setTime(time);assert.equal(c.canStart(),false);assert.equal(c.waitMs(),36080-time);
 }
 f.setTime(36080);assert.equal(c.canStart(),true);
});

test('a real late audio ending preserves a full gap after ended rather than after the nominal clip length',()=>{
 const f=fixture(),c=f.cadence;c.started(6080);
 f.setTime(8000);c.ended();assert.equal(c.waitMs(),30000);
 f.setTime(37999);assert.equal(c.canStart(),false);assert.equal(c.waitMs(),1);
 f.setTime(38000);assert.equal(c.canStart(),true);assert.equal(c.waitMs(),0);
});

test('an early ended callback cannot shorten the reservation made by the successful start',()=>{
 const f=fixture(),c=f.cadence;c.started(6080);
 f.setTime(2000);c.ended();assert.equal(c.waitMs(),34080);
 f.setTime(32000);assert.equal(c.canStart(),false);assert.equal(c.waitMs(),4080);
 f.setTime(36080);assert.equal(c.canStart(),true);
});

test('two complete cycles each enforce their own gap and accept the exact next-start boundary',()=>{
 const f=fixture(),c=f.cadence;
 c.started(6080);f.setTime(6080);c.ended();assert.equal(c.waitMs(),30000);
 f.setTime(36080);assert.equal(c.canStart(),true);c.started(6080);
 f.setTime(42160);c.ended();assert.equal(c.waitMs(),30000);
 f.setTime(72159);assert.equal(c.canStart(),false);assert.equal(c.waitMs(),1);
 f.setTime(72160);assert.equal(c.canStart(),true);
});

test('the module instance shares its default interval across bird switches and page remounts',()=>{
 const f=fixture({now:1000,shared:true}),firstMount=f.cadence;
 firstMount.started(6080);f.setTime(7080);firstMount.ended();
 const otherBird=f.shared(),remountedPage=f.shared();
 assert.equal(otherBird,firstMount);assert.equal(remountedPage,firstMount);
 f.setTime(12000);assert.equal(otherBird.canStart(),false);assert.equal(remountedPage.waitMs(),25080);
 f.setTime(37080);assert.equal(remountedPage.canStart(),true);
 remountedPage.started(6080);assert.equal(firstMount.canStart(),false);
});

test('an explicitly configured gap uses the injected clock without changing the six-second clip budget',()=>{
 const f=fixture({now:10000,gapMs:60000}),c=f.cadence;
 c.started(6080);assert.equal(c.waitMs(),66080);
 f.setTime(16080);c.ended();assert.equal(c.waitMs(),60000);
 f.setTime(76079);assert.equal(c.canStart(),false);
 f.setTime(76080);assert.equal(c.canStart(),true);assert.equal(c.waitMs(),0);
});
