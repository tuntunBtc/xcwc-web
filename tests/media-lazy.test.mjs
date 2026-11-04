import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/media-lazy.js',import.meta.url),'utf8');
function setup(observers=true){
 const state={observed:new Set(),disconnects:0};
 const context=vm.createContext({Map,JSON,IntersectionObserver:observers?class{
  constructor(callback,options){state.notify=callback;state.options=options}
  observe(target){state.observed.add(target)}
  unobserve(target){state.observed.delete(target)}
  disconnect(){state.observed.clear();state.disconnects++}
 }:undefined});
 vm.runInContext(source,context);
 return {...state,context,state,create:options=>context.createDeferredMedia(options)};
}
function image(){const target={dataset:{},isConnected:true,assignments:[]};Object.defineProperty(target,'src',{set(value){target.assignments.push(value)},get(){return target.assignments.at(-1)}});return target}

test('offscreen images do not receive a URL until intersecting; first-screen media remains eager',()=>{
 const {create,state}=setup(),loader=create(),offscreen=image(),hero=image();
 loader.image(offscreen,'/assets/card.webp');
 assert.equal(offscreen.assignments.length,0);
 state.notify([{target:offscreen,isIntersecting:false}]);
 assert.equal(offscreen.assignments.length,0);
 loader.image(hero,'/assets/hero.webp',{eager:true,priority:'high'});
 assert.deepEqual(hero.assignments,['/assets/hero.webp']);assert.equal(hero.fetchPriority,'high');
 state.notify([{target:offscreen,isIntersecting:true}]);
 state.notify([{target:offscreen,isIntersecting:true}]);
 assert.deepEqual(offscreen.assignments,['/assets/card.webp']);assert.equal(offscreen.decoding,'async');
});

test('leaving the route cancels queued work and removed cards are not fetched',()=>{
 const {create,state}=setup(),controller=new AbortController(),loader=create({signal:controller.signal}),card=image();
 loader.image(card,'/assets/card.webp');controller.abort();state.notify([{target:card,isIntersecting:true}]);
 assert.equal(card.assignments.length,0);assert.equal(state.observed.size,0);
 loader.image(image(),'/assets/late.webp',{eager:true});assert.equal(state.observed.size,0);
 const next=setup(),other=next.create(),removed=image();other.image(removed,'/assets/removed.webp');removed.isConnected=false;
 next.state.notify([{target:removed,isIntersecting:false}]);next.state.notify([{target:removed,isIntersecting:true}]);assert.equal(removed.assignments.length,0);
});

test('browsers without IntersectionObserver still show images and already-aborted routes stay inactive',()=>{
 const {create}=setup(false),target=image();create().image(target,'/assets/compatible.webp');assert.equal(target.src,'/assets/compatible.webp');
 const controller=new AbortController();controller.abort();const stopped=image();create({signal:controller.signal}).image(stopped,'/assets/stopped.webp',{eager:true});assert.equal(stopped.assignments.length,0);
});
