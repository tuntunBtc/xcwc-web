import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const frame=readFileSync(new URL('../src/frame.html',import.meta.url),'utf8');
const start=frame.indexOf('  let heightFrame = null'),end=frame.indexOf('\n  globalThis.addEventListener',start);
function bridge(){
 const queued=[],sent=[];let height=900,reads=0;
 const context=vm.createContext({hostPort:{},postToHost:(type,value)=>sent.push({type,...value}),document:{body:{get scrollHeight(){reads++;return height},getBoundingClientRect(){reads++;return {height}}}},requestAnimationFrame:callback=>{queued.push(callback);return queued.length}});
 vm.runInContext(frame.slice(start,end)+'\nglobalThis.notify=sendHeight;',context);
 return {context,queued,sent,setHeight:value=>{height=value},reads:()=>reads};
}
test('resize bursts defer layout reads, coalesce once per frame, and skip duplicate height',()=>{
 const b=bridge();for(let i=0;i<10;i++)b.context.notify();assert.equal(b.queued.length,1);assert.equal(b.reads(),0);
 b.queued.shift()();assert.equal(b.sent.length,1);assert.equal(b.sent[0].height,900);
 b.context.notify();b.queued.shift()();assert.equal(b.sent.length,1);
 b.setHeight(950);b.context.notify();b.queued.shift()();assert.equal(b.sent.length,2);assert.equal(b.sent[1].height,950);
});
test('a pre-initialization observation cannot suppress the initial connected measurement',()=>{
 const b=bridge();b.context.hostPort=null;b.context.notify();b.queued.shift()();assert.equal(b.sent.length,0);
 b.context.hostPort={};b.context.notify();b.queued.shift()();assert.equal(b.sent.length,1);
});
