import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseBird,sortedBirds,sortedMemories,earnedPoints,arrangement,rectFor,constrain} from '../src/checkin-model.mjs';
const birds=[{id:'locked',adopted:false},...['a','b','c','d'].map(id=>({id,adopted:true}))];
test('adopted birds precede locked birds; locked birds cannot join a photo',()=>{assert.equal(sortedBirds(birds).at(-1).id,'locked');assert.deepEqual(chooseBird([], 'locked',birds).selected,[]);assert(chooseBird([], 'locked',birds).error)});
test('three-bird limit still allows deselection and replacement',()=>{let selected=[];for(const id of ['a','b','c'])selected=chooseBird(selected,id,birds).selected;assert(chooseBird(selected,'d',birds).error);assert.deepEqual(chooseBird(selected,'d',birds).selected,['a','b','c']);selected=chooseBird(selected,'b',birds).selected;assert.deepEqual(chooseBird(selected,'d',birds).selected,['a','c','d'])});
test('memories sort by full timestamp and legacy photos earn no points',()=>{const rows=[{id:'old',createdAt:100,reward:0},{id:'latest',createdAt:300,reward:1},{id:'middle',createdAt:200,reward:1}];assert.deepEqual(sortedMemories(rows).map(e=>e.id),['latest','middle','old']);assert.equal(earnedPoints(rows),2)});
test('one to three birds remain inside the photo at every supported size',()=>{for(const ids of [['a'],['a','b'],['a','b','c']])for(const p of Object.values(arrangement(ids))){const r=rectFor(constrain(p));assert(r.x>=38&&r.x+r.w<=962&&r.y>=38&&r.y+r.h<=850)}for(const size of [0,12,30,55,100])for(const cx of [-1000,500,2000])for(const cy of [-1000,500,2000]){const r=rectFor(constrain({size,cx,cy}));assert(r.x>=38-1e-7&&r.x+r.w<=962+1e-7&&r.y>=38-1e-7&&r.y+r.h<=850+1e-7)}});

test("tall sprites stay within the photo",()=>{for(const ratio of [0.6,1,1.5,2.4])for(const size of [12,30,55]){const p=constrain({size,cx:900,cy:800},ratio),r=rectFor(p,ratio);assert(r.x>=38-1e-7&&r.x+r.w<=962+1e-7&&r.y>=38-1e-7&&r.y+r.h<=850+1e-7)}});

test('changing the cast preserves every remaining pose without sharing mutable objects',async()=>{
 const {reconcilePoses,resetPose}=await import('../src/checkin-model.mjs');
 const previous={a:{cx:300,cy:250,size:18},b:{cx:700,cy:450,size:22}};
 const next=reconcilePoses(['a','b','c'],previous);
 assert.deepEqual(next.a,previous.a);assert.deepEqual(next.b,previous.b);assert(next.c);
 next.a.cx=100;assert.equal(previous.a.cx,300);
 const without=reconcilePoses(['b','c'],next);assert.deepEqual(without.b,previous.b);assert.equal(without.a,undefined);
 const reset=resetPose(['a','b'],previous,'a');assert.deepEqual(reset.b,previous.b);assert.notDeepEqual(reset.a,previous.a);
});

test('whole-photo mode retains every edge and cover offsets can expose either cropped edge',async()=>{
 const {photoPlacement}=await import('../src/checkin-model.mjs');
 for(const [width,height] of [[4000,1000],[1000,4000],[924,812]]){
  const whole=photoPlacement(width,height,'contain');
  assert(whole.x>=38-1e-6&&whole.y>=38-1e-6);
  assert(whole.x+whole.width<=962+1e-6&&whole.y+whole.height<=850+1e-6);
  assert(Math.abs(whole.width/whole.height-width/height)<1e-6);
  const left=photoPlacement(width,height,'cover',0,0),right=photoPlacement(width,height,'cover',100,100);
  assert.equal(left.x,38);assert.equal(left.y,38);
  assert(Math.abs(right.x+right.width-962)<1e-6);assert(Math.abs(right.y+right.height-850)<1e-6);
 }
});
