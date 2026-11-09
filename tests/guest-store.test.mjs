import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestStore,GUEST_KEY,GUEST_RULES} from '../src/guest-store.mjs';
const HOUR=3600000,DAY=24*HOUR;
const bird=n=>({id:n.toString(16).padStart(32,'0'),cityCode:'hangzhou',typeName:'小黄莺',cityName:'杭州',active:true});
function setup(profile='normal'){
 const data=new Map();let now=Date.parse('2026-11-01T15:50:00Z'),broken=false,writes=0;
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>{if(broken)throw Error('quota');data.set(k,v);writes++;}};
 return {store:createGuestStore(storage,{clock:()=>now,profile}),data,advance:ms=>now+=ms,now:()=>now,get writes(){return writes;},break:()=>broken=true,repair:()=>broken=false};
}
function patch(x,fn){const s=JSON.parse(x.data.get(GUEST_KEY));fn(s);x.data.set(GUEST_KEY,JSON.stringify(s));}
function legacy(x,fn=()=>{}){patch(x,s=>{delete s.careRulesVersion;for(const b of s.birds)for(const key of ['mood','lastCompanionAt','moodSettledAt','lastMoodPetAt','cryShownDate'])delete b[key];fn(s);});}
const current=x=>x.store.snapshot().birds[0];
const req=n=>'pet-request-'+String(n).padStart(8,'0');

test('anonymous adoption is cached, immediately hatched, and replay preserves nickname, mood and welcome',()=>{
 const x=setup();const first=x.store.adopt(bird(1),'黄小叽');assert(first.bound);assert.equal(first.eggStatus,'HATCHED');
 x.advance(1000);assert.equal(x.store.adopt(bird(1),'不覆盖').replayed,true);x.store.adopt(bird(2),'第二只');
 const state=x.store.snapshot();assert.equal(state.birds[0].name,'黄小叽');assert.equal(state.birds[0].mood,80);assert.equal(state.birds[0].lastCompanionAt,x.now()-1000);assert.equal(state.wallet.balance,5);assert.equal(JSON.parse(x.data.get(GUEST_KEY)).birds.length,2);
});
test('daily supply belongs to each bird and Shanghai midnight resets only the claim',()=>{
 const x=setup();x.store.adopt(bird(1),'一号');x.store.adopt(bird(2),'二号');
 x.store.care(bird(1).id,'supply');assert.equal(x.store.snapshot().careDaily.supplyClaimed,false);x.store.select(bird(1).id);assert.equal(x.store.snapshot().careDaily.supplyClaimed,true);
 assert.throws(()=>x.store.care(bird(1).id,'supply'),/已经领取/);x.store.care(bird(2).id,'supply');
 assert.deepEqual(x.store.snapshot().birds.map(b=>b.food),[4,4]);assert.deepEqual(x.store.snapshot().birds.map(b=>b.mood),[80,80]);
 x.advance(11*60000);assert.equal(x.store.snapshot().careDaily.supplyClaimed,false);x.store.care(bird(1).id,'supply');x.store.care(bird(2).id,'supply');assert.deepEqual(x.store.snapshot().birds.map(b=>b.food),[5,5]);
});
test('legacy migration keeps assets and starts mood at first new use, persisting exactly once',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');x.store.care(bird(1).id,'feed');x.store.photoReward('fixture','old-photo');
 legacy(x,s=>{s.skins=['lake_glow'];s.birds[0].equippedSkinId='lake_glow';});const old=JSON.parse(x.data.get(GUEST_KEY));x.advance(5*DAY);
 const before=x.writes,state=x.store.read(),b=state.birds[0];assert.equal(x.writes,before+1);assert.equal(state.careRulesVersion,1);assert.equal(b.mood,80);assert.equal(b.lastCompanionAt,x.now());assert.equal(b.moodSettledAt,x.now()+DAY);assert.equal(b.name,old.birds[0].name);assert.equal(b.food,old.birds[0].food);assert.equal(b.hunger,0);
 for(const key of ['balance','ledger','skins','requests','photoHashes','welcome'])assert.deepEqual(state[key],old[key],key);
 assert.equal(b.equippedSkinId,'lake_glow');x.store.read();x.store.snapshot();assert.equal(x.writes,before+1);
 x.advance(27*HOUR);assert.equal(current(x).mood,79);
});
test('legacy shared supply blocks only existing birds on migration day; new birds and next day are independent',()=>{
 const x=setup();x.store.adopt(bird(1),'一号');x.store.adopt(bird(2),'二号');legacy(x,s=>{s.daily['2026-11-01']={supply:true,greeting:true};s.birds[0].food=4;});
 x.store.read();for(const n of [1,2])assert.throws(()=>x.store.care(bird(n).id,'supply'),/已经领取/);
 assert.deepEqual(x.store.snapshot().birds.map(b=>b.food),[4,3]);x.store.adopt(bird(3),'三号');x.store.care(bird(3).id,'supply');assert.equal(x.store.snapshot().birds[2].food,4);
 assert.throws(()=>x.store.care(bird(3).id,'greet'),/已经打过招呼/);x.advance(11*60000);for(const n of [1,2,3])x.store.care(bird(n).id,'supply');assert.deepEqual(x.store.snapshot().birds.map(b=>b.food),[5,4,5]);
});
test('unclaimed or previous-day legacy supply never blocks today',()=>{
 for(const old of [false,true]){const x=setup();x.store.adopt(bird(1),'团团');legacy(x,s=>{s.daily[old?'2026-10-31':'2026-11-01']={supply:old};});x.store.read();x.store.care(bird(1).id,'supply');assert.equal(current(x).food,4);}
});
test('failed migration keeps original bytes and retries initialization from the later successful use',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');legacy(x);const raw=x.data.get(GUEST_KEY);x.break();assert.throws(()=>x.store.snapshot(),/缓存保存失败/);assert.equal(x.data.get(GUEST_KEY),raw);
 x.advance(HOUR);x.repair();assert.equal(current(x).lastCompanionAt,x.now());assert.equal(current(x).mood,80);
});
test('mood grace, exact 27-hour boundary, three-hour remainder and repeated reads settle once',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');x.advance(24*HOUR);assert.equal(current(x).mood,80);x.advance(3*HOUR-1);assert.equal(current(x).mood,80);x.advance(1);assert.equal(current(x).mood,79);
 const settled=x.writes;assert.equal(current(x).mood,79);assert.equal(x.writes,settled);x.advance(90*60000);assert.equal(current(x).mood,79);x.advance(90*60000);assert.equal(current(x).mood,78);
});
test('long absences clamp physical needs at zero and mood at twenty, matching confirmed examples',()=>{
 for(const [hours,expected] of [[24,[36,36,80]],[48,[12,12,72]],[72,[0,0,64]],[120,[0,0,48]],[192,[0,0,24]],[216,[0,0,20]],[10000,[0,0,20]]]){const x=setup();x.store.adopt(bird(1),'团团');x.advance(hours*HOUR);const b=current(x);assert.deepEqual([b.hunger,b.water,b.mood],expected,String(hours));}
});
test('settlement preserves sub-hour remainder across snapshots and writes',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');x.advance(90*60000);assert.equal(current(x).hunger,59);x.store.care(bird(1).id,'clean');x.advance(30*60000);assert.equal(current(x).hunger,58);
});
test('interaction settles old mood before adding recovery and restarts a fresh grace period',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');x.advance(48*HOUR);const result=x.store.care(bird(1).id,'clean');assert.equal(result.bird.mood,87);assert.equal(result.bird.lastCompanionAt,x.now());x.advance(DAY);assert.equal(current(x).mood,87);x.advance(3*HOUR);assert.equal(current(x).mood,86);
});
test('first companionship plus three spaced touches restores twenty to forty, fifty and sixty',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');patch(x,s=>s.birds[0].mood=20);
 for(let i=1;i<=3;i++){if(i>1)x.advance(30000);assert.equal(x.store.pet(bird(1).id,req(i)).bird.mood,[40,50,60][i-1]);}
 x.advance(30000);const result=x.store.pet(bird(1).id,req(4));assert.equal(result.bird.mood,60);assert.equal(result.bird.lastCompanionAt,x.now());
});
test('touch mood and companionship are independent per bird and survive global points cooldown',()=>{
 const x=setup();x.store.adopt(bird(1),'一号');x.store.adopt(bird(2),'二号');patch(x,s=>s.birds.forEach(b=>b.mood=20));
 assert.equal(x.store.pet(bird(1).id,req(1)).reward,1);const second=x.store.pet(bird(2).id,req(2));assert.equal(second.reward,0);assert.equal(second.rewardStatus,'COOLDOWN');assert.equal(second.bird.mood,40);assert.equal(second.entry,undefined);
 x.advance(1000);const within=x.store.pet(bird(2).id,req(3));assert.equal(within.bird.mood,40);assert.equal(within.bird.lastCompanionAt,x.now());assert.equal(x.store.snapshot().wallet.balance,6);
 x.advance(29000);assert.equal(x.store.pet(bird(2).id,req(4)).bird.mood,50);assert.equal(x.store.snapshot().birds[0].mood,40);
});
test('points daily limit still permits mood recovery, while replay never adds or refreshes companionship',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');x.store.adopt(bird(2),'二号');patch(x,s=>{s.daily['2026-11-01']={pets:10};s.birds[0].mood=20;});
 const result=x.store.pet(bird(1).id,req(1));assert.equal(result.reward,0);assert.equal(result.rewardStatus,'DAILY_LIMIT');assert.equal(result.bird.mood,40);const at=result.bird.lastCompanionAt;x.advance(60000);
 const replay=x.store.pet(bird(1).id,req(1));assert.equal(replay.replayed,true);assert.equal(replay.bird.mood,40);assert.equal(replay.bird.lastCompanionAt,at);assert.equal(x.store.snapshot().wallet.balance,5);assert.throws(()=>x.store.pet(bird(2).id,req(1)),/同一请求编号/);
});
test('old successful pet request remains replayable after migration without regranting mood or points',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');x.store.pet(bird(1).id,req(1));legacy(x,s=>{const entry=s.requests[req(1)].entry;s.requests[req(1)]={entry,replayed:false};});
 const result=x.store.pet(bird(1).id,req(1));assert(result.replayed);assert.equal(result.reward,1);assert.equal(result.bird.mood,80);assert.equal(x.store.snapshot().wallet.balance,6);assert.equal(x.store.read().daily['2026-11-01'].mood[bird(1).id].pets,1);
});
test('Shanghai midnight resets daily mood counts but retains touch cooldown and decay clocks',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');patch(x,s=>s.birds[0].mood=20);x.advance(9*60000+50000);const first=x.store.pet(bird(1).id,req(1));assert.equal(first.bird.mood,40);
 x.advance(11000);const midnight=x.store.pet(bird(1).id,req(2));assert.equal(midnight.reward,0);assert.equal(midnight.bird.mood,50);assert.equal(midnight.bird.lastMoodPetAt,first.bird.lastMoodPetAt);x.advance(19000);assert.equal(x.store.pet(bird(1).id,req(3)).bird.mood,60);
});
test('feed water and clean restore only configured daily amounts; greeting remains globally once',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');x.store.adopt(bird(2),'二号');patch(x,s=>{Object.assign(s.birds[0],{mood:20,hunger:0,water:0,food:10,waterStock:10});});
 const act=a=>x.store.care(bird(1).id,a).bird.mood;
 assert.equal(act('feed'),35);assert.equal(act('water'),40);assert.equal(act('feed'),45);assert.equal(act('water'),50);x.advance(1000);assert.equal(act('feed'),50);assert.equal(act('water'),50);assert.equal(current(x).lastCompanionAt,x.now());assert.equal(act('clean'),55);assert.equal(act('clean'),55);assert.equal(act('greet'),65);
 assert.throws(()=>x.store.care(bird(2).id,'greet'),/已经打过招呼/);assert.equal(x.store.snapshot().birds[1].mood,80);assert.equal(x.store.snapshot().wallet.balance,10);
});
test('full food or water consumes no stock, changes no mood and does not count as companionship',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');patch(x,s=>Object.assign(s.birds[0],{hunger:100,water:100,mood:20}));const start=current(x).lastCompanionAt;x.advance(60000);
 for(const action of ['feed','water']){const result=x.store.care(bird(1).id,action);assert.equal(result.changed,false);assert.equal(result.bird.mood,20);assert.equal(result.bird.lastCompanionAt,start);assert.match(result.message,/已经吃饱|喝够/);}
 assert.equal(current(x).food,3);assert.equal(current(x).waterStock,3);assert.equal(x.store.snapshot().wallet.balance,8);assert.equal(x.store.read().daily['2026-11-01'].mood,undefined);
});
test('non-companion actions never refresh the companion clock, while valid capped care still does',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');const at=current(x).lastCompanionAt;x.advance(60000);x.store.care(bird(1).id,'rename','新名字');x.store.care(bird(1).id,'supply');x.store.select(bird(1).id);x.store.adopt(bird(1),'不覆盖');x.store.care(bird(1).id,'enter');assert.equal(current(x).lastCompanionAt,at);assert.equal(current(x).mood,80);
 x.store.care(bird(1).id,'clean');x.advance(60000);const result=x.store.care(bird(1).id,'clean');assert.equal(result.bird.mood,95);assert.equal(result.bird.lastCompanionAt,x.now());
});
test('cry is consumed only by explicit enter, per bird per day, and never counts as companionship',()=>{
 const x=setup();x.store.adopt(bird(1),'一号');x.store.adopt(bird(2),'二号');patch(x,s=>s.birds.forEach(b=>b.mood=30));const originalAt=x.now();
 x.store.snapshot();x.store.wardrobe();assert.equal(x.store.read().birds[0].cryShownDate,null);assert.equal(x.store.care(bird(1).id,'enter').cry,true);assert.equal(x.store.care(bird(1).id,'enter').cry,false);assert.equal(x.store.care(bird(2).id,'enter').cry,true);assert.equal(current(x).mood,30);assert.equal(current(x).lastCompanionAt,originalAt);assert.equal(x.store.read().daily['2026-11-01'],undefined);
 x.advance(11*60000);assert.equal(x.store.care(bird(1).id,'enter').cry,true);patch(x,s=>s.birds[1].mood=31);assert.equal(x.store.care(bird(2).id,'enter').cry,false);
});
test('write failure never confirms pet, care, cry, adoption or settlement and preserves previous bytes',()=>{
 const cases=[x=>x.store.pet(bird(1).id,req(1)),x=>x.store.care(bird(1).id,'feed'),x=>x.store.care(bird(1).id,'enter'),x=>x.store.adopt(bird(2),'第二只'),x=>{x.advance(27*HOUR);x.store.snapshot();}];
 for(const operation of cases){const x=setup();x.store.adopt(bird(1),'团团');patch(x,s=>s.birds[0].mood=20);const original=x.data.get(GUEST_KEY);x.break();assert.throws(()=>operation(x),/缓存保存失败/);assert.equal(x.data.get(GUEST_KEY),original);}
 const x=setup();x.store.adopt(bird(1),'团团');patch(x,s=>s.birds[0].food=0);const original=x.data.get(GUEST_KEY);assert.throws(()=>x.store.care(bird(1).id,'feed'),/补给不足/);assert.equal(x.data.get(GUEST_KEY),original);
});
test('nickname validation, unknown bird and corrupt caches never silently overwrite existing data',()=>{
 const x=setup();assert.throws(()=>x.store.adopt(bird(1),'1234567'),/1–6/);assert.throws(()=>x.store.care(bird(1).id,'feed'),/先碰一碰/);x.data.set(GUEST_KEY,'bad-json');assert.throws(()=>x.store.snapshot(),/不会自动覆盖/);assert.equal(x.data.get(GUEST_KEY),'bad-json');
 const y=setup();y.store.adopt(bird(1),'团团');patch(y,s=>s.birds[0].mood='bad');const original=y.data.get(GUEST_KEY);assert.throws(()=>y.store.snapshot(),/不会自动覆盖/);assert.equal(y.data.get(GUEST_KEY),original);
});
test('damaged needs, inventory and settlement clock never overwrite the original cache',()=>{
 for(const [key,values] of Object.entries({hunger:['broken',null,-1,101,1.5],water:['broken',null,-1,101,1.5],food:['2',null,-1,1.5],waterStock:['2',null,-1,1.5],settledAt:['broken',null,-1,1.5]})){
  for(const invalid of values){const x=setup();x.store.adopt(bird(1),'团团');patch(x,s=>s.birds[0][key]=invalid);const original=x.data.get(GUEST_KEY);x.advance(HOUR);
   assert.throws(()=>x.store.snapshot(),error=>error.code==='CACHE_INVALID',key+'='+String(invalid));
   assert.throws(()=>x.store.care(bird(1).id,'clean'),error=>error.code==='CACHE_INVALID',key+'='+String(invalid));
   assert.equal(x.data.get(GUEST_KEY),original,key+'='+String(invalid));
  }
 }
});
test('photo rewards still deduplicate original and request and stop at three daily points',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');assert.equal(x.store.photoReward('photo1','hash1'),1);assert.equal(x.store.photoReward('photo1','hash1'),1);assert.equal(x.store.photoReward('photo2','hash1'),0);assert.equal(x.store.photoReward('photo3','hash3'),1);assert.equal(x.store.photoReward('photo4','hash4'),1);assert.equal(x.store.photoReward('photo5','hash5'),0);assert.equal(x.store.snapshot().wallet.balance,8);assert.equal(current(x).mood,80);
});
test('local skin exchange still charges once and equips only an adopted bird',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');for(let i=0;i<25;i++){if(i&&i%10===0)x.advance(DAY);else x.advance(31000);x.store.pet(bird(1).id,req(i));}assert.equal(x.store.snapshot().wallet.balance,30);x.store.redeem('lake_glow','redeem-request-0001');assert.equal(x.store.snapshot().wallet.balance,0);assert(x.store.redeem('lake_glow','redeem-request-0001').replayed);x.store.equip(bird(1).id,'lake_glow');assert.equal(x.store.wardrobe().outfits[0].visualKey,'lake');x.store.equip(bird(1).id,null);assert.equal(x.store.wardrobe().outfits[0].skinId,null);assert.throws(()=>x.store.equip(bird(2).id,'lake_glow'),/先碰一碰/);
});

test('Huangying outfits unlock once, are shared, and keep per-bird wear across reload',()=>{
 const factoryBird={...bird(1),skinId:'factory_yellow'},x=setup();x.store.adopt(factoryBird,'一号');x.store.adopt(bird(2),'二号');patch(x,s=>s.balance=100);
 const first=x.store.redeem('huangying_osmanthus','outfit-osmanthus-request-01');assert.equal(first.entry.delta,-30);
 assert.equal(x.store.snapshot().wallet.balance,70);assert.equal(x.store.redeem('huangying_osmanthus','outfit-osmanthus-request-01').replayed,true);
 assert.equal(x.store.snapshot().wallet.balance,70);assert.throws(()=>x.store.redeem('huangying_osmanthus','outfit-osmanthus-request-02'),/已经拥有/);
 x.store.equip(bird(1).id,'huangying_osmanthus');x.store.equip(bird(2).id,'huangying_osmanthus');
 assert.throws(()=>x.store.equip(bird(1).id,'huangying_moon'),/尚未兑换/);
 x.store.redeem('huangying_moon','outfit-moon-request-0001');x.store.equip(bird(1).id,'huangying_moon');assert.equal(x.store.snapshot().wallet.balance,0);
 const restored=createGuestStore({getItem:key=>x.data.get(key)||null,setItem:(key,value)=>x.data.set(key,value)},{clock:()=>x.now(),profile:'normal'});
 assert.deepEqual(restored.wardrobe().outfits.map(o=>[o.skinId,o.visualKey]),[['huangying_moon','huangying_moon'],['huangying_osmanthus','huangying_osmanthus']]);
 assert.equal(restored.wardrobe().skins.find(s=>s.id==='huangying_moon').owned,true);
 restored.equip(bird(1).id,null);assert.deepEqual(restored.wardrobe().outfits.map(o=>o.skinId),[null,'huangying_osmanthus']);
 assert.equal(restored.snapshot().birds[0].skinId,factoryBird.skinId,'equipping never changes the factory skin');
});
test('outfit writes fail safely and unknown catalog IDs cannot be redeemed or equipped',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');patch(x,s=>s.balance=30);const before=x.data.get(GUEST_KEY);
 x.break();assert.throws(()=>x.store.redeem('huangying_sakura','outfit-sakura-request-01'),/缓存保存失败/);assert.equal(x.data.get(GUEST_KEY),before);
 x.repair();x.store.redeem('huangying_sakura','outfit-sakura-request-01');const owned=x.data.get(GUEST_KEY);
 x.break();assert.throws(()=>x.store.equip(bird(1).id,'huangying_sakura'),/缓存保存失败/);assert.equal(x.data.get(GUEST_KEY),owned);x.repair();
 patch(x,s=>s.skins.push('unknown_legacy_asset'));const preserved=x.data.get(GUEST_KEY);
 for(const invalid of ['unknown_legacy_asset','',undefined,{}])assert.throws(()=>x.store.equip(bird(1).id,invalid),/装饰不存在/);
 assert.throws(()=>x.store.redeem('unknown_legacy_asset','outfit-unknown-request-01'),/装饰不存在/);assert.equal(x.data.get(GUEST_KEY),preserved);
});

test('new birds start clean and old caches without a poop schedule never gain historical droppings',()=>{
 const x=setup();x.store.adopt({...bird(1),poopDueAt:0},'团团');
 assert.equal(current(x).poopDueAt,null,'public bird metadata cannot seed local droppings');
 patch(x,s=>{delete s.birds[0].poopDueAt;s.birds[0].cleanedAt='2026-10-01T00:00:00.000Z';});
 const old=x.data.get(GUEST_KEY),writes=x.writes;x.advance(60000);
 assert.equal(current(x).poopDueAt,undefined);assert.equal(x.data.get(GUEST_KEY),old);assert.equal(x.writes,writes);
 x.store.care(bird(1).id,'feed');assert.equal(current(x).poopDueAt,x.now()+60000);
});

test('successful feeding schedules exactly sixty seconds in either profile and cleaning respects the boundary',()=>{
 assert.equal(GUEST_RULES.poopDelayMs,60000);
 for(const profile of ['normal','exhibition']){
  const x=setup(profile);x.store.adopt(bird(1),'团团');
  const due=x.now()+60000,feed=x.store.care(bird(1).id,'feed');
  assert.equal(feed.changed,true);assert.equal(feed.bird.poopDueAt,due);
  const wallet=x.store.snapshot().wallet.balance,ledger=x.store.read().ledger;
  x.advance(59999);assert.equal(x.store.care(bird(1).id,'clean').bird.poopDueAt,due,'cleaning cannot cancel future digestion');
  x.advance(1);const cleaned=x.store.care(bird(1).id,'clean');
  assert.equal(cleaned.bird.poopDueAt,null);assert.equal(cleaned.bird.cleanedAt,new Date(x.now()).toISOString());
  assert.equal(cleaned.message,'小窝打扫干净啦');assert.equal(x.store.snapshot().wallet.balance,wallet);assert.deepEqual(x.store.read().ledger,ledger);
  assert.equal(x.store.care(bird(1).id,'clean').bird.poopDueAt,null,'cleaning twice cannot create another dropping');
 }
});

test('repeated feeds preserve the first pending or visible dropping and a fresh feed after cleaning starts a new cycle',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');patch(x,s=>Object.assign(s.birds[0],{hunger:0,food:10}));
 const first=x.store.care(bird(1).id,'feed').bird.poopDueAt;
 x.advance(30000);assert.equal(x.store.care(bird(1).id,'feed').bird.poopDueAt,first,'a second serving must not delay the first dropping');
 x.advance(30000);assert.equal(x.store.care(bird(1).id,'feed').bird.poopDueAt,first,'visible droppings do not accumulate a second queued serving');
 x.store.care(bird(1).id,'clean');assert.equal(current(x).poopDueAt,null);
 const next=x.store.care(bird(1).id,'feed');assert.equal(next.changed,true);assert.equal(next.bird.poopDueAt,x.now()+60000);
});

test('full feeding, insufficient food, water and other care never schedule droppings',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');patch(x,s=>Object.assign(s.birds[0],{hunger:100,water:0}));
 assert.equal(x.store.care(bird(1).id,'feed').changed,false);assert.equal(current(x).poopDueAt,null);
 x.store.care(bird(1).id,'water');x.store.care(bird(1).id,'clean');x.store.care(bird(1).id,'supply');
 x.store.care(bird(1).id,'greet');x.store.care(bird(1).id,'rename','圆圆');x.store.pet(bird(1).id,req(999));
 assert.equal(current(x).poopDueAt,null);
 patch(x,s=>Object.assign(s.birds[0],{hunger:0,food:0}));const raw=x.data.get(GUEST_KEY);
 assert.throws(()=>x.store.care(bird(1).id,'feed'),e=>e.code==='NO_STOCK');assert.equal(x.data.get(GUEST_KEY),raw);
});

test('each bird retains its own schedule through selection, reload, offline time and cross-day cleaning',()=>{
 const x=setup();x.store.adopt(bird(1),'一号');x.store.adopt(bird(2),'二号');
 const first=x.store.care(bird(1).id,'feed').bird.poopDueAt;x.advance(10000);
 const second=x.store.care(bird(2).id,'feed').bird.poopDueAt;
 x.store.select(bird(1).id);x.store.select(bird(2).id);x.advance(2*DAY);
 const restored=createGuestStore({getItem:k=>x.data.get(k)||null,setItem:(k,v)=>x.data.set(k,v)},{clock:()=>x.now(),profile:'normal'});
 assert.deepEqual(restored.snapshot().birds.map(b=>b.poopDueAt),[first,second]);
 restored.care(bird(2).id,'clean');assert.deepEqual(restored.snapshot().birds.map(b=>b.poopDueAt),[first,null]);
 assert.equal(restored.snapshot().wallet.balance,5);assert.equal(restored.snapshot().birds[0].name,'一号');
});

test('storage failures never confirm a new schedule or hide an existing dropping',()=>{
 const x=setup();x.store.adopt(bird(1),'团团');const beforeFeed=x.data.get(GUEST_KEY);
 x.break();assert.throws(()=>x.store.care(bird(1).id,'feed'),e=>e.code==='CACHE_FULL');assert.equal(x.data.get(GUEST_KEY),beforeFeed);
 x.repair();x.advance(1000);const due=x.store.care(bird(1).id,'feed').bird.poopDueAt;
 x.advance(60000);const beforeClean=x.data.get(GUEST_KEY);x.break();
 assert.throws(()=>x.store.care(bird(1).id,'clean'),e=>e.code==='CACHE_FULL');assert.equal(x.data.get(GUEST_KEY),beforeClean);
 x.repair();assert.equal(current(x).poopDueAt,due);assert.equal(x.store.care(bird(1).id,'clean').bird.poopDueAt,null);
});

test('damaged optional poop timestamps reject reads and care without overwriting the cache',()=>{
 for(const invalid of ['0',-1,0.5,true,[],{},Number.MAX_SAFE_INTEGER+1]){
  const x=setup();x.store.adopt(bird(1),'团团');patch(x,s=>s.birds[0].poopDueAt=invalid);const raw=x.data.get(GUEST_KEY);
  for(const operation of [()=>x.store.snapshot(),()=>x.store.care(bird(1).id,'feed'),()=>x.store.care(bird(1).id,'clean')])assert.throws(operation,e=>e.code==='CACHE_INVALID');
  assert.equal(x.data.get(GUEST_KEY),raw);
 }
 const x=setup();x.store.adopt(bird(1),'团团');patch(x,s=>s.birds[0].poopDueAt=0);
 assert.equal(current(x).poopDueAt,0,'the epoch is a valid nonnegative persisted timestamp');
 assert.equal(x.store.care(bird(1).id,'clean').bird.poopDueAt,null);
});
