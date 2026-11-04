import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('../src/nest/nest.js',import.meta.url),'utf8');
const {select:select,describe}=vm.runInNewContext(source+'\n({select:selectNestEmotion,describe:describeNestState});');
const bird={id:'bird-a',hunger:60,water:60,mood:80};

test('care status selects a real emotion, with a stable low-stat threshold',()=>{
 assert.equal(select(bird),'happy');
 assert.equal(select({...bird,hunger:30,water:30}),'happy');
 assert.equal(select({...bird,hunger:29}),'hungry');
 assert.equal(select({...bird,water:29}),'thirsty');
 assert.equal(select({...bird,hunger:0,water:0}),'thirsty');
 assert.equal(select(null),'happy');
});

test('the lower physical need wins, with water winning ties',()=>{
 assert.equal(describe({...bird,hunger:15,water:20}).need,'food');
 assert.equal(describe({...bird,hunger:20,water:15}).need,'water');
 assert.equal(describe({...bird,hunger:20,water:20}).need,'water');
 assert.equal(describe({...bird,hunger:0,water:0}).need,'water');
 assert.equal(select({...bird,hunger:15,water:20,mood:20}),'hungry');
});

test('low mood has its own expression and remains available alongside physical needs',()=>{
 assert.equal(select({...bird,mood:50}),'happy');
 assert.equal(select({...bird,mood:49}),'unwell');
 const low=describe({...bird,mood:49});
 assert.equal(low.need,'company');assert.equal(low.mood,49);assert.equal(low.moodLabel,'想你陪陪我');
 assert.equal(low.speech,'有一点点想你，陪我待一会儿吧～');
 assert.equal(describe({...bird,mood:50}).moodLabel,'开心');
});

test('each simultaneous real need gets a matching image and speech without changing the bird',()=>{
 const mixed={...bird,hunger:0,water:0,mood:20},original=JSON.stringify(mixed);
 const expected=[['water','thirsty',/水/],['food','hungry',/谷粒/],['company','unwell',/想你/]];
 for(let phase=0;phase<9;phase++){
  const state=describe(mixed,phase),[need,emotion,speech]=expected[phase%3];
  assert.equal(state.need,need);assert.equal(state.emotion,emotion);assert.match(state.speech,speech);
  assert.equal(select(mixed,null,phase),emotion);
  assert.deepEqual(Array.from(state.needs,n=>n.key),['water','food','company']);
 }
 assert.equal(JSON.stringify(mixed),original);
});

test('resolved needs stop appearing and feedback stays attached to the correct bird during rotation',()=>{
 const recovered={...bird,hunger:60,water:60,mood:60};
 for(const phase of [0,1,2,999,NaN,Infinity,-1])assert.equal(describe(recovered,phase).emotion,'happy');
 const onlyCompany={...recovered,mood:20};
 for(let phase=0;phase<5;phase++)assert.equal(describe(onlyCompany,phase).need,'company');
 const mixed={...bird,hunger:0,water:0,mood:20};
 assert.equal(select(mixed,{birdId:'bird-a',emotion:'belly'},2),'belly');
 assert.equal(select(mixed,{birdId:'bird-b',emotion:'belly'},2),'unwell');
});

test('missing mood is not turned into a fabricated value',()=>{
 for(const mood of [undefined,null,'80',NaN,Infinity]){
  const state=describe({...bird,mood});
  assert.equal(state.mood,null);
  assert.equal(state.moodLabel,'状态待接');
  assert.equal(state.need,null);
 }
 assert.equal(describe({...bird,mood:0}).mood,20);
 assert.equal(describe({...bird,mood:120}).mood,100);
 assert.equal(describe(null).mood,null);
});

test('severe physical needs strengthen the matching warm prompt at 10',()=>{
 assert.match(describe({...bird,hunger:10}).speech,/先给我一点谷粒/);
 assert.doesNotMatch(describe({...bird,hunger:11}).speech,/先给我/);
 assert.match(describe({...bird,water:10}).speech,/先给我添点水/);
 assert.doesNotMatch(describe({...bird,water:11}).speech,/先给我/);
 assert.equal(describe({...bird,hunger:30,water:30}).need,null);
 assert.equal(describe({...bird,hunger:null,water:undefined}).need,null);
});

test('all supported brief feedback overrides apply only to the same bird',()=>{
 const hungry={...bird,hunger:10};
 for(const emotion of ['happy','belly','puzzled','angry','crying']){
  assert.equal(select(hungry,{birdId:'bird-a',emotion}),emotion);
  assert.equal(select(hungry,{birdId:'bird-b',emotion}),'hungry');
 }
 for(const emotion of ['hungry','unwell','shy','sleeping','',null]){
  assert.equal(select(hungry,{birdId:'bird-a',emotion}),'hungry');
 }
 assert.equal(select(null,{birdId:'bird-a',emotion:'crying'}),'happy');
});
