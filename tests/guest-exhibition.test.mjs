import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestStore,GUEST_KEY,DEFAULT_GUEST_PROFILE} from '../src/guest-store.mjs';

const MINUTE=60000,HOUR=60*MINUTE,DAY=24*HOUR;
const bird={id:'a'.repeat(32),active:true,cityCode:'hangzhou',cityName:'杭州',typeName:'小黄莺'};
function setup(profile,at=Date.parse('2026-11-03T12:00:00Z')){
 const data=new Map();let now=at,fail=false,writes=0;
 const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{if(fail)throw Error('quota');data.set(key,value);writes++}};
 const make=next=>createGuestStore(storage,{clock:()=>now,...(next?{profile:next}:{})});
 return {data,make,store:make(profile),advance:milliseconds=>now+=milliseconds,now:()=>now,get writes(){return writes},break:()=>fail=true,repair:()=>fail=false};
}
const state=x=>x.store.read();
const values=x=>{const b=state(x).birds[0];return[b.hunger,b.water,b.mood]};

test('default exhibition follows minute-level physical and companionship thresholds',()=>{
 assert.equal(DEFAULT_GUEST_PROFILE,'exhibition');
 const x=setup();x.store.adopt(bird,'展会鸟');assert.equal(state(x).careProfile,'exhibition');assert.equal(state(x).careProfileVersion,3);
 let previous=0;
 for(const [minutes,expected]of [[0,[60,60,80]],[1,[40,25,80]],[1.5,[40,25,70]],[2,[20,0,60]],[3,[0,0,40]],[3.5,[0,0,30]],[4,[0,0,20]],[10000,[0,0,20]]]){
  x.advance((minutes-previous)*MINUTE);previous=minutes;assert.deepEqual(values(x),expected,String(minutes));
 }
 assert.equal(state(x).balance,5);assert.equal(state(x).ledger.length,1);
});

test('exhibition integer steps preserve sub-minute remainder across repeated reads and writes',()=>{
 const x=setup();x.store.adopt(bird,'余量鸟');x.advance(MINUTE-1);assert.deepEqual(values(x),[60,60,80]);
 x.advance(1);assert.deepEqual(values(x),[40,25,80]);x.advance(30000);assert.deepEqual(values(x),[40,25,70]);
 const cursor=state(x).birds[0].settledAt;x.store.care(bird.id,'rename','新名字');assert.equal(state(x).birds[0].settledAt,cursor);
 assert.deepEqual(values(x),[40,25,70]);x.advance(29999);assert.deepEqual(values(x),[40,25,70]);x.advance(1);assert.deepEqual(values(x),[20,0,60]);
});

test('effective care restores mood and starts a new exhibition grace period without changing points rules',()=>{
 const x=setup();x.store.adopt(bird,'陪伴鸟');x.advance(3.5*MINUTE);assert.deepEqual(values(x),[0,0,30]);
 const pet=x.store.pet(bird.id,'exhibition-touch-0001');assert.equal(pet.reward,1);assert.equal(pet.bird.mood,50);
 x.advance(MINUTE);assert.equal(state(x).birds[0].mood,50);x.advance(30000-1);assert.equal(state(x).birds[0].mood,50);x.advance(1);assert.equal(state(x).birds[0].mood,40);
 x.store.care(bird.id,'feed');assert.deepEqual(values(x),[30,0,45]);assert.equal(state(x).balance,6);x.advance(MINUTE);assert.equal(state(x).birds[0].mood,45);
});

test('old normal cache settles only normal time at cutover and preserves assets, claims and reward replay',()=>{
 const x=setup('normal');x.store.adopt(bird,'老朋友');x.store.care(bird.id,'feed');x.store.care(bird.id,'water');x.store.care(bird.id,'supply');x.store.care(bird.id,'greet');
 x.store.pet(bird.id,'profile-replay-request');x.store.photoReward('old-photo','old-digest');
 const original=state(x);original.skins=['lake_glow'];original.birds[0].equippedSkinId='lake_glow';delete original.careProfile;delete original.careProfileVersion;x.data.set(GUEST_KEY,JSON.stringify(original));
 x.advance(2*HOUR+1234);const before=x.writes;x.store=x.make();const switched=state(x),b=switched.birds[0];
 assert.equal(switched.careProfile,'exhibition');assert.deepEqual([b.hunger,b.water,b.mood],[88,88,100]);
 assert.equal(b.settledAt,x.now());assert.equal(b.moodSettledAt,x.now()+MINUTE);assert.equal(b.name,'老朋友');assert.equal(b.food,3);assert.equal(b.waterStock,3);assert.equal(b.equippedSkinId,'lake_glow');
 for(const key of ['balance','ledger','skins','requests','daily','photoHashes','welcome','lastPet'])assert.deepEqual(switched[key],original[key],key);
 assert.equal(x.writes,before+1);state(x);state(x);assert.equal(x.writes,before+1);
 assert.equal(x.store.pet(bird.id,'profile-replay-request').replayed,true);assert.equal(state(x).balance,original.balance);
 assert.equal(x.store.care(bird.id,'supply').changed,false);assert.throws(()=>x.store.care(bird.id,'greet'),/已经打过招呼/);
 x.advance(MINUTE);assert.deepEqual(values(x),[68,53,100]);
});

test('switching back to normal settles exhibition time once and starts future normal time',()=>{
 const x=setup('normal');x.store.adopt(bird,'切档鸟');x.advance(2*HOUR);x.store=x.make();assert.deepEqual(values(x),[58,58,80]);
 x.advance(90000);x.store=x.make('normal');assert.deepEqual(values(x),[38,23,70]);const saved=state(x);
 assert.equal(saved.careProfile,'normal');assert.equal(saved.birds[0].settledAt,x.now());assert.equal(saved.birds[0].moodSettledAt,x.now()+DAY);
 x.advance(HOUR-1);assert.deepEqual(values(x),[38,23,70]);x.advance(1);assert.deepEqual(values(x),[37,22,70]);
 assert.equal(state(x).balance,5);
});

test('failed profile migration preserves old bytes and retries from the later successful cutover',()=>{
 const x=setup('normal');x.store.adopt(bird,'重试鸟');const bytes=x.data.get(GUEST_KEY);x.advance(2*HOUR);x.store=x.make();x.break();
 assert.throws(()=>state(x),/缓存保存失败/);assert.equal(x.data.get(GUEST_KEY),bytes);
 x.advance(3*MINUTE);assert.throws(()=>state(x),/缓存保存失败/);assert.equal(x.data.get(GUEST_KEY),bytes);
 x.repair();assert.deepEqual(values(x),[58,58,80]);assert.equal(state(x).birds[0].settledAt,x.now());x.advance(MINUTE-1);assert.deepEqual(values(x),[58,58,80]);x.advance(1);assert.deepEqual(values(x),[38,23,80]);
});

test('Shanghai midnight resets daily eligibility without resetting minute cursors or assets',()=>{
 const x=setup(undefined,Date.parse('2026-11-03T15:59:30Z'));x.store.adopt(bird,'跨日鸟');x.store.care(bird.id,'supply');
 x.advance(30000);assert.deepEqual(values(x),[60,60,80]);assert.equal(x.store.snapshot().careDaily.supplyClaimed,false);
 x.store.care(bird.id,'supply');x.advance(30000);assert.deepEqual(values(x),[40,25,80]);assert.equal(state(x).birds[0].food,3);assert.equal(state(x).balance,5);
});

test('pre-mood legacy migration and exhibition cutover preserve stock and do not accelerate old absence',()=>{
 const x=setup('normal');x.store.adopt(bird,'旧版本');const old=state(x);delete old.careProfile;delete old.careProfileVersion;delete old.careRulesVersion;
 for(const key of ['mood','lastCompanionAt','moodSettledAt','lastMoodPetAt','cryShownDate'])delete old.birds[0][key];
 x.data.set(GUEST_KEY,JSON.stringify(old));x.advance(10*HOUR);x.store=x.make();assert.deepEqual(values(x),[50,50,80]);assert.equal(state(x).birds[0].food,3);assert.equal(state(x).balance,5);
 x.advance(90_000);assert.deepEqual(values(x),[30,15,70]);
});

test('invalid profiles and unknown cached profiles never silently overwrite local assets',()=>{
 const x=setup();assert.throws(()=>x.make('unknown'),/规则配置无效/);x.store.adopt(bird,'保留鸟');const raw=state(x);raw.careProfile='unknown';x.data.set(GUEST_KEY,JSON.stringify(raw));const bytes=x.data.get(GUEST_KEY);
 assert.throws(()=>state(x),/缓存无法读取/);assert.equal(x.data.get(GUEST_KEY),bytes);
});

test('versioned A exhibition cache settles A before switching to the faster B profile',()=>{
 const x=setup('normal');x.store.adopt(bird,'版本鸟');const old=state(x);old.careProfile='exhibition';old.careProfileVersion=1;old.birds[0].moodSettledAt=x.now()+2*MINUTE;x.data.set(GUEST_KEY,JSON.stringify(old));
 x.advance(3*MINUTE);x.store=x.make();assert.deepEqual(values(x),[30,24,70]);assert.equal(state(x).careProfileVersion,3);assert.equal(state(x).birds[0].settledAt,x.now());
 x.advance(MINUTE);assert.deepEqual(values(x),[10,0,70]);
});

test('unversioned profile labels still settle historical time at normal speed',()=>{
 const x=setup('normal');x.store.adopt(bird,'无版本鸟');const old=state(x);old.careProfile='exhibition';delete old.careProfileVersion;x.data.set(GUEST_KEY,JSON.stringify(old));
 x.advance(2*HOUR);x.store=x.make();assert.deepEqual(values(x),[58,58,80]);assert.equal(state(x).careProfileVersion,3);
 x.advance(MINUTE);assert.deepEqual(values(x),[38,23,80]);
});
