import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('../src/nest/nest.js',import.meta.url),'utf8');
const select=vm.runInNewContext(source+'\nselectNestEmotion;');
const bird={id:'bird-a',hunger:60,water:60};

test('care status selects a real emotion, with a stable low-stat threshold',()=>{
 assert.equal(select(bird),'happy');
 assert.equal(select({...bird,hunger:30,water:30}),'happy');
 assert.equal(select({...bird,hunger:29}),'hungry');
 assert.equal(select({...bird,water:29}),'unwell');
 assert.equal(select({...bird,hunger:0,water:0}),'hungry');
 assert.equal(select(null),'happy');
});

test('brief interaction feedback applies only to the same bird',()=>{
 const hungry={...bird,hunger:10};
 assert.equal(select(hungry,{birdId:'bird-a',emotion:'shy'}),'shy');
 assert.equal(select(hungry,{birdId:'bird-a',emotion:'happy'}),'happy');
 assert.equal(select(hungry,{birdId:'bird-b',emotion:'shy'}),'hungry');
 assert.equal(select(hungry,{birdId:'bird-a',emotion:'angry'}),'hungry');
});
