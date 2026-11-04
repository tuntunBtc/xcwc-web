import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('../src/nest/nest.js',import.meta.url),'utf8');
const choose=vm.runInNewContext(source+'\nchooseNestPetReaction;');
const bird={id:'bird-a',hunger:60,water:60,mood:80};
const empty=()=>({birdId:null,times:[]});

test('three accepted comfortable pets within twelve seconds trigger a four-second very happy reaction',()=>{
 let sequence=empty();
 for(const [now,emotion,duration] of [[0,'happy',2000],[5000,'happy',2000],[12000,'veryhappy',4000]]){
  const result=choose(sequence,bird,now);sequence=result.sequence;
  assert.equal(result.emotion,emotion);assert.equal(result.duration,duration);
 }
 assert.equal(sequence.birdId,bird.id);assert.equal(sequence.times.length,0);
 assert.equal(choose(sequence,bird,12001).emotion,'happy');
});

test('the twelve-second window rolls forward and expired or future touches never count',()=>{
 let sequence=choose(empty(),bird,0).sequence;
 sequence=choose(sequence,bird,1000).sequence;
 const late=choose(sequence,bird,12001);assert.equal(late.emotion,'happy');
 assert.deepEqual(Array.from(late.sequence.times),[1000,12001]);
 assert.equal(choose(late.sequence,bird,12002).emotion,'veryhappy');
 const future=choose({birdId:bird.id,times:[20000,21000]},bird,1000);
 assert.equal(future.emotion,'happy');assert.deepEqual(Array.from(future.sequence.times),[1000]);
});

test('every new response checks the latest mood, food and water before counting',()=>{
 const two={birdId:bird.id,times:[0,1000]};
 for(const changed of [{mood:59},{hunger:29},{water:29},{mood:null},{hunger:NaN},{water:'60'}]){
  const result=choose(two,{...bird,...changed},2000);
  assert.equal(result.emotion,'happy');assert.equal(result.duration,2000);assert.equal(result.sequence.times.length,0);
 }
 assert.equal(choose(two,{...bird,mood:60,hunger:30,water:30},2000).emotion,'veryhappy');
});

test('replayed, failed, busy or obsolete results never advance the comfortable sequence',()=>{
 const two={birdId:bird.id,times:[0,1000]};
 const replay=choose(two,bird,2000,{replayed:true});assert.equal(replay.emotion,'happy');assert.equal(replay.sequence,two);
 for(const ignored of ['failed','busy','old-bird','background']){
  const result=choose(two,bird,2000,{accepted:false});assert.equal(result.emotion,null,ignored);assert.equal(result.sequence,two,ignored);
 }
 assert.equal(choose(two,bird,2001).emotion,'veryhappy');
});

test('a different bird cannot inherit another birds touches',()=>{
 const two={birdId:bird.id,times:[0,1000]},other={...bird,id:'bird-b'};
 const result=choose(two,other,2000);assert.equal(result.emotion,'happy');
 assert.equal(result.sequence.birdId,'bird-b');assert.deepEqual(Array.from(result.sequence.times),[2000]);
 const replay=choose(two,other,2000,{replayed:true});assert.equal(replay.sequence.birdId,'bird-b');assert.equal(replay.sequence.times.length,0);
});

test('pets during very happy preserve its reaction and cannot seed or revive the next round',()=>{
 const two={birdId:bird.id,times:[0,1000]};
 for(const options of [{veryHappyActive:true},{duringVeryHappy:true},{veryHappyActive:true,duringVeryHappy:true},{duringVeryHappy:true,replayed:true}]){
  const result=choose(two,bird,2000,options);assert.equal(result.emotion,null);assert.equal(result.duration,0);assert.equal(result.sequence.times.length,0);
 }
 const ended=choose(two,bird,10000,{duringVeryHappy:true,veryHappyActive:false});
 assert.equal(ended.emotion,null);assert.equal(ended.sequence.times.length,0);
 let sequence=ended.sequence;
 for(const [at,expected] of [[11000,'happy'],[12000,'happy'],[13000,'veryhappy']]){
  const result=choose(sequence,bird,at);assert.equal(result.emotion,expected);sequence=result.sequence;
 }
});

test('clearing comfort after feet, background or reset requires three new successes',()=>{
 const two={birdId:bird.id,times:[0,1000]};assert.equal(choose(two,bird,2000).emotion,'veryhappy');
 for(const reason of ['feet','background','pagehide','switch','leave']){
  let sequence=empty();
  for(const [at,expected] of [[2000,'happy'],[3000,'happy'],[4000,'veryhappy']]){
   const result=choose(sequence,bird,at);assert.equal(result.emotion,expected,reason);sequence=result.sequence;
  }
 }
});

test('comfort decisions do not mutate the saved bird or the prior sequence',()=>{
 const sequence={birdId:bird.id,times:[0,1000]},beforeBird=JSON.stringify(bird),beforeSequence=JSON.stringify(sequence);
 choose(sequence,bird,2000);choose(sequence,{...bird,mood:20},2000);choose(sequence,bird,2000,{duringVeryHappy:true});
 assert.equal(JSON.stringify(bird),beforeBird);assert.equal(JSON.stringify(sequence),beforeSequence);
});
