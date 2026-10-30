import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseBird,sortedBirds,sortedMemories,earnedPoints,arrangement,rectFor,constrain} from '../src/checkin-model.mjs';
const birds=[{id:'locked',adopted:false},...['a','b','c','d'].map(id=>({id,adopted:true}))];
test('adopted birds precede locked birds; locked birds cannot join a photo',()=>{assert.equal(sortedBirds(birds).at(-1).id,'locked');assert.deepEqual(chooseBird([], 'locked',birds).selected,[]);assert(chooseBird([], 'locked',birds).error)});
test('three-bird limit still allows deselection and replacement',()=>{let selected=[];for(const id of ['a','b','c'])selected=chooseBird(selected,id,birds).selected;assert(chooseBird(selected,'d',birds).error);assert.deepEqual(chooseBird(selected,'d',birds).selected,['a','b','c']);selected=chooseBird(selected,'b',birds).selected;assert.deepEqual(chooseBird(selected,'d',birds).selected,['a','c','d'])});
test('memories sort by full timestamp and legacy photos earn no points',()=>{const rows=[{id:'old',createdAt:100,reward:0},{id:'latest',createdAt:300,reward:1},{id:'middle',createdAt:200,reward:1}];assert.deepEqual(sortedMemories(rows).map(e=>e.id),['latest','middle','old']);assert.equal(earnedPoints(rows),2)});
test('one to three birds remain inside the photo at every supported size',()=>{for(const ids of [['a'],['a','b'],['a','b','c']])for(const p of Object.values(arrangement(ids))){const r=rectFor(constrain(p));assert(r.x>=38&&r.x+r.w<=962&&r.y>=38&&r.y+r.h<=850)}for(const size of [0,12,30,55,100])for(const cx of [-1000,500,2000])for(const cy of [-1000,500,2000]){const r=rectFor(constrain({size,cx,cy}));assert(r.x>=38-1e-7&&r.x+r.w<=962+1e-7&&r.y>=38-1e-7&&r.y+r.h<=850+1e-7)}});

test("tall sprites stay within the photo",()=>{for(const ratio of [0.6,1,1.5,2.4])for(const size of [12,30,55]){const p=constrain({size,cx:900,cy:800},ratio),r=rectFor(p,ratio);assert(r.x>=38-1e-7&&r.x+r.w<=962+1e-7&&r.y>=38-1e-7&&r.y+r.h<=850+1e-7)}});
