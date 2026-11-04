import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/guest-album.js',import.meta.url),'utf8');
const epochKey='xcwc.local.reset.v1';
const birdId='a'.repeat(32);
function host({open=()=>{throw Error('unexpected database write')},digest=async()=> '0'.repeat(64)}={}){
 const data=new Map();let rewards=0,fetches=0;
 const guest={snapshot:()=>({birds:[{id:birdId}],wallet:{balance:5}}),photoReward:()=>{rewards++;return 1}};
 const window={localStorage:{getItem:key=>data.get(key)??null},xcwcGuest:guest,xcwcDigestBlob:digest};
 vm.runInNewContext(source,{window,indexedDB:{open},Blob,Error,Date,JSON,fetch:()=>{fetches++;throw Error('cloud must not be called')}});
 return {album:window.xcwcLocalAlbum,data,get rewards(){return rewards},get fetches(){return fetches}};
}
const submission=()=>({metadata:{requestId:'request-photo-12345678',birdIds:[birdId],styleId:'natural',label:'杭州'},original:new Blob(['original'],{type:'image/jpeg'}),image:new Blob(['generated'],{type:'image/jpeg'})});

test('synchronous IndexedDB open failures do not poison later album attempts',async()=>{
 let attempts=0;
 const x=host({open:()=>{attempts++;throw Error('SecurityError: storage temporarily disabled')}});
 await assert.rejects(x.album.run('history',{}),/SecurityError/);
 await assert.rejects(x.album.run('history',{}),/SecurityError/);
 assert.equal(attempts,2);
 assert.equal(x.fetches,0);
});

test('another tab actively clearing data blocks a new photo before hashing or writes',async()=>{
 let hashes=0;
 const x=host({digest:async()=>{hashes++;return '0'.repeat(64)}});
 x.data.set(epochKey,'pending:another-tab');
 await assert.rejects(x.album.run('create',submission()),/正在清除/);
 assert.equal(hashes,0);assert.equal(x.rewards,0);assert.equal(x.fetches,0);
});

test('a photo paused at hashing cannot recreate an album or points after another tab resets',async()=>{
 let release,started;const gate=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>started=resolve);
 const x=host({digest:async()=>{started();await gate;return '0'.repeat(64)}});
 const saving=x.album.run('create',submission());await entered;
 x.data.set(epochKey,'pending:another-tab');
 x.data.set(epochKey,'done:another-tab');release();
 await assert.rejects(saving,/已清除/);
 assert.equal(x.rewards,0);assert.equal(x.fetches,0);
});
