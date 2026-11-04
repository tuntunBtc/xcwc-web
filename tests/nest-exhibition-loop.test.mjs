import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestStore,GUEST_KEY} from '../src/guest-store.mjs';

const MINUTE=60000;
const bird=n=>({id:n.toString(16).padStart(32,'0'),active:true,cityCode:'hangzhou',cityName:'杭州',typeName:'小黄莺'});
function setup(profile='exhibition'){
 const data=new Map();let now=Date.parse('2026-11-04T02:00:00Z'),failed=false;
 const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{if(failed)throw Error('quota');data.set(key,value);}};
 const make=next=>createGuestStore(storage,{clock:()=>now,profile:next});
 const store=make(profile);store.adopt(bird(1),'循环鸟');
 return {data,store,make,now:()=>now,advance:ms=>now+=ms,break:()=>failed=true,repair:()=>failed=false};
}
const current=(x,n=1)=>x.store.snapshot().birds.find(b=>b.id===bird(n).id);
function patch(x,fn){const state=JSON.parse(x.data.get(GUEST_KEY));fn(state);x.data.set(GUEST_KEY,JSON.stringify(state));}
const petRequest=n=>'exhibition-pet-'+String(n).padStart(8,'0');

test('exhibition supply is repeatable, preserves larger stock and has no reward or mood gain',()=>{
 const x=setup();assert.equal(x.store.snapshot().careDaily.exhibition,true);
 let before=x.store.read();let result=x.store.care(bird(1).id,'supply');assert.equal(result.changed,false);
 assert.equal(result.bird.food,3);assert.equal(result.bird.waterStock,3);assert.equal(result.bird.mood,80);
 assert.deepEqual(x.store.read().ledger,before.ledger);assert.equal(x.store.snapshot().careDaily.supplyClaimed,true);
 patch(x,s=>{s.birds[0].food=5;s.birds[0].waterStock=0;});
 for(let i=0;i<15;i++){
  before=x.store.read();result=x.store.care(bird(1).id,'supply');assert.equal(result.changed,i===0);
  assert.equal(result.bird.food,5);assert.equal(result.bird.waterStock,3);assert.equal(result.bird.mood,80);
  assert.deepEqual(x.store.read().ledger,before.ledger);assert.equal(x.store.read().balance,before.balance);
 }
 const normal=x.make('normal');assert.equal(normal.snapshot().careDaily.exhibition,false);
 assert.throws(()=>normal.care(bird(1).id,'supply'),{code:'ALREADY_CLAIMED'});
});

test('exhausted exhibition stock directs users to repeatable supply',()=>{
 const x=setup();patch(x,s=>{s.birds[0].food=0;s.birds[0].waterStock=0;});
 for(const action of ['feed','water'])assert.throws(()=>x.store.care(bird(1).id,action),e=>e.code==='NO_STOCK'&&e.message.includes('去补给里补充')&&!e.message.includes('今日'));
 x.store.care(bird(1).id,'supply');assert.equal(x.store.care(bird(1).id,'feed').changed,true);assert.equal(x.store.care(bird(1).id,'water').changed,true);
});

test('twelve full exhibition loops can cry, recover and replenish without resetting assets or rewarding play',()=>{
 const x=setup();let cries=0;
 for(let round=0;round<12;round++){
  x.advance(4*MINUTE);assert.equal(current(x).mood,20);
  assert.equal(x.store.care(bird(1).id,'enter').cry,true);cries++;
  assert.equal(x.store.care(bird(1).id,'enter').cry,false);
  const balance=x.store.read().balance;
  while(current(x).mood<50){x.store.care(bird(1).id,'play');x.advance(5000);}
  assert.equal(current(x).cryEpisodeShown,false);assert.equal(x.store.read().balance,balance);
  x.store.care(bird(1).id,'supply');
  assert.equal(x.store.care(bird(1).id,'feed').changed,true);assert.equal(x.store.care(bird(1).id,'water').changed,true);
 }
 const state=x.store.read();assert.equal(cries,12);assert.equal(state.balance,8);
 assert.equal(state.ledger.filter(row=>row.operation==='CARE').length,1);
 assert.equal(state.birds.length,1);assert.equal(state.birds[0].name,'循环鸟');
 assert.equal(state.birds[0].cryShownDate,'2026-11-04');
});

test('exhibition mood recovery shares a five-second cooldown while every valid action refreshes companionship',()=>{
 const x=setup();patch(x,s=>{s.birds[0].mood=20;});
 assert.equal(x.store.care(bird(1).id,'play').bird.mood,40);
 assert.equal(x.store.pet(bird(1).id,petRequest(1)).bird.mood,40);
 assert.equal(x.store.care(bird(1).id,'water').bird.mood,40);
 x.advance(4999);assert.equal(x.store.care(bird(1).id,'clean').bird.mood,40);
 assert.equal(current(x).lastCompanionAt,x.now());assert.equal(current(x).moodSettledAt,x.now()+MINUTE);
 x.advance(1);assert.equal(x.store.care(bird(1).id,'play').bird.mood,50);
 x.advance(5000);assert.equal(x.store.care(bird(1).id,'feed').bird.mood,55);
 x.advance(5000);assert.equal(x.store.care(bird(1).id,'clean').bird.mood,60);
});

test('unlimited exhibition companionship does not expand pet rewards or bypass request replay',()=>{
 const x=setup();let rewards=0;
 for(let i=0;i<20;i++){
  const result=x.store.pet(bird(1).id,petRequest(i));rewards+=result.reward;
  assert.equal(result.reward,i<10?1:0);assert.equal(x.store.pet(bird(1).id,petRequest(i)).replayed,true);
  x.store.care(bird(1).id,'play');x.advance(30000);
 }
 assert.equal(rewards,10);assert.equal(x.store.read().balance,15);assert.equal(x.store.snapshot().wallet.earnedToday,10);
 x.advance(5*MINUTE);assert.equal(current(x).mood,20);
 assert.equal(x.store.pet(bird(1).id,petRequest(30)).reward,0);assert.equal(current(x).mood,30);
 x.advance(5000);x.store.care(bird(1).id,'play');assert.equal(current(x).mood,40);
 assert.equal(x.store.read().balance,15);
});

test('cry repeats only after recovery to fifty and at least two minutes, regardless of daily count',()=>{
 const x=setup();patch(x,s=>{s.birds[0].mood=30;});
 assert.equal(x.store.care(bird(1).id,'enter').cry,true);
 assert.equal(x.store.care(bird(1).id,'play').bird.mood,50);
 patch(x,s=>{s.birds[0].mood=30;});assert.equal(x.store.care(bird(1).id,'enter').cry,false);
 x.advance(119999);assert.equal(x.store.care(bird(1).id,'enter').cry,false);
 x.advance(1);assert.equal(x.store.care(bird(1).id,'enter').cry,true);
 x.advance(2*MINUTE);assert.equal(x.store.care(bird(1).id,'enter').cry,false);
 x.store.care(bird(1).id,'play');assert.equal(current(x).mood,30);
 x.advance(5000);x.store.care(bird(1).id,'play');assert.equal(current(x).mood,40);
 assert.equal(current(x).cryEpisodeShown,true);assert.equal(x.store.care(bird(1).id,'enter').cry,false);
 x.advance(5000);x.store.care(bird(1).id,'play');assert.equal(current(x).mood,50);
 const normal=x.make('normal');patch(x,s=>{s.birds[0].mood=30;});
 assert.equal(normal.care(bird(1).id,'enter').cry,false);assert.throws(()=>normal.care(bird(1).id,'play'),{code:'INVALID_ACTION'});
});

test('exhibition cooldown, cry episode and replenishment belong to each individual bird',()=>{
 const x=setup();x.store.adopt(bird(2),'第二只');patch(x,s=>{for(const b of s.birds){b.mood=20;b.food=0;b.waterStock=0;}});
 x.store.select(bird(1).id);assert.equal(x.store.care(bird(1).id,'play').bird.mood,40);
 x.store.select(bird(2).id);assert.equal(x.store.care(bird(2).id,'play').bird.mood,40);
 x.store.care(bird(1).id,'supply');assert.equal(current(x,1).food,3);assert.equal(current(x,2).food,0);
 patch(x,s=>{for(const b of s.birds)b.mood=30;});
 assert.equal(x.store.care(bird(1).id,'enter').cry,true);assert.equal(x.store.care(bird(2).id,'enter').cry,true);
 assert.equal(x.store.care(bird(1).id,'enter').cry,false);assert.equal(x.store.care(bird(2).id,'enter').cry,false);
});

test('failed play, supply and cry saves never confirm or consume their state',()=>{
 for(const action of ['play','supply','enter']){
  const x=setup();patch(x,s=>{s.birds[0].mood=20;s.birds[0].food=0;s.birds[0].waterStock=0;});
  const bytes=x.data.get(GUEST_KEY);x.break();assert.throws(()=>x.store.care(bird(1).id,action),{code:'CACHE_FULL'});
  assert.equal(x.data.get(GUEST_KEY),bytes);x.repair();const result=x.store.care(bird(1).id,action);
  if(action==='enter')assert.equal(result.cry,true);else assert.equal(result.changed,true);
 }
});

test('v2 migration settles historical cadence once, preserves assets and retries failed writes',()=>{
 const x=setup();const old=x.store.read();old.careProfileVersion=2;old.birds[0].cryShownDate='2026-11-04';old.birds[0].equippedSkinId='lake_glow';old.skins=['lake_glow'];
 for(const key of ['lastMoodGainAt','lastCryAt','cryEpisodeShown'])delete old.birds[0][key];
 x.data.set(GUEST_KEY,JSON.stringify(old));const bytes=x.data.get(GUEST_KEY);x.advance(150000);x.break();
 assert.throws(()=>x.store.read(),{code:'CACHE_FULL'});assert.equal(x.data.get(GUEST_KEY),bytes);
 x.repair();const migrated=x.store.read(),b=migrated.birds[0];
 assert.equal(migrated.careProfileVersion,3);assert.deepEqual([b.hunger,b.water,b.mood],[20,0,50]);
 assert.equal(b.cryShownDate,'2026-11-04');assert.equal(b.lastCryAt,null);assert.equal(b.cryEpisodeShown,false);assert.equal(b.lastMoodGainAt,null);
 assert.equal(b.settledAt,x.now());assert.equal(b.moodSettledAt,x.now()+MINUTE);
 for(const key of ['balance','ledger','skins','requests','daily','photoHashes','welcome'])assert.deepEqual(migrated[key],old[key],key);
 assert.equal(b.equippedSkinId,'lake_glow');const saved=x.data.get(GUEST_KEY);x.store.read();assert.equal(x.data.get(GUEST_KEY),saved);
});

test('missing exhibition fields are compatible but invalid optional fields never overwrite cache',()=>{
 for(const [key,value] of [['lastMoodGainAt',-1],['lastMoodGainAt','0'],['lastCryAt',1.5],['lastCryAt',false],['cryEpisodeShown',null],['cryEpisodeShown','false']]){
  const x=setup();patch(x,s=>{s.birds[0][key]=value;});const bytes=x.data.get(GUEST_KEY);
  assert.throws(()=>x.store.read(),{code:'CACHE_INVALID'});assert.equal(x.data.get(GUEST_KEY),bytes);
 }
 const x=setup();patch(x,s=>{for(const key of ['lastMoodGainAt','lastCryAt','cryEpisodeShown'])delete s.birds[0][key];});
 assert.equal(current(x).lastMoodGainAt,null);assert.equal(current(x).lastCryAt,null);assert.equal(current(x).cryEpisodeShown,false);
});
