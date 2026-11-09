import {WARDROBE_SKINS,getWardrobeSkin} from './wardrobe-catalog.mjs';
// Phase-one browser-local experience. This cache is never sent as cloud ownership.
export const GUEST_KEY='xcwc.guest.v1';
export const GUEST_RULES=Object.freeze({initialFood:3,initialWater:3,initialHunger:60,initialHydration:60,feedGain:30,waterGain:30,poopDelayMs:60000,petCooldownMs:30000,petDailyLimit:10,initialMood:80,minMood:20,maxMood:100,moodPetDailyLimit:3,moodCareDailyLimit:2});
// Keep published profiles stable: a future cadence gets a new key so old time
// can be settled with its original rules before moving to the new profile.
export const GUEST_PROFILES=Object.freeze({
 normal:Object.freeze({version:1,decayMs:3600000,hungerDecay:1,waterDecay:1,moodGraceMs:24*3600000,moodDecayMs:3*3600000,moodDecay:1}),
 exhibition:Object.freeze({version:3,decayMs:60000,hungerDecay:20,waterDecay:35,moodGraceMs:60000,moodDecayMs:30000,moodDecay:10}),
});
const previousExhibition=Object.freeze({version:1,decayMs:60000,hungerDecay:10,waterDecay:12,moodGraceMs:120000,moodDecayMs:60000,moodDecay:10});
const previousExhibitionV2=Object.freeze({version:2,decayMs:60000,hungerDecay:20,waterDecay:35,moodGraceMs:60000,moodDecayMs:30000,moodDecay:10});
const knownProfile=(name,version)=>name==='exhibition'&&version===1?previousExhibition:name==='exhibition'&&version===2?previousExhibitionV2:GUEST_PROFILES[name]?.version===version?GUEST_PROFILES[name]:null;
export const DEFAULT_GUEST_PROFILE='exhibition';
export function createGuestStore(storage,{clock=()=>Date.now(),profile=DEFAULT_GUEST_PROFILE}={}){
 if(!Object.hasOwn(GUEST_PROFILES,profile))throw Error('养成规则配置无效');
 const rules=GUEST_PROFILES[profile];
 const exhibition=profile==='exhibition';
 const day=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
 const fail=(code,message)=>{throw Object.assign(Error(message),{code})};
 const blank=()=>({version:1,careRulesVersion:1,careProfile:profile,careProfileVersion:rules.version,birds:[],balance:0,ledger:[],skins:[],requests:{},daily:{},photoHashes:[],welcome:false});
 const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 const timestamp=value=>Number.isSafeInteger(value)&&value>=0;
 const meter=value=>Number.isInteger(value)&&value>=0&&value<=100;
 function load(){
  let raw;try{raw=storage.getItem(GUEST_KEY)}catch{fail('CACHE_UNAVAILABLE','浏览器缓存不可用，请允许存储后重试')}
  if(!raw)return blank();
  try{
   const value=JSON.parse(raw);
   if(!record(value)||value.version!==1||!Array.isArray(value.birds)||!Array.isArray(value.ledger)||!Number.isSafeInteger(value.balance)||value.balance<0||!record(value.requests)||!record(value.daily)||!Array.isArray(value.skins)||!Array.isArray(value.photoHashes))throw Error();
   // Reject damaged arithmetic inputs before settlement can overwrite the cache.
   if(value.birds.some(b=>!record(b)||!meter(b.hunger)||!meter(b.water)||!timestamp(b.food)||!timestamp(b.waterStock)||!timestamp(b.settledAt)))throw Error();
   if(value.careRulesVersion!=null&&value.careRulesVersion!==1)throw Error();
   if(value.careProfile!=null&&!Object.hasOwn(GUEST_PROFILES,value.careProfile))throw Error();
   if(value.careProfileVersion!=null&&!knownProfile(value.careProfile,value.careProfileVersion))throw Error();
   if(value.careRulesVersion===1&&value.birds.some(b=>!Number.isInteger(b.mood)||b.mood<GUEST_RULES.minMood||b.mood>GUEST_RULES.maxMood||!timestamp(b.lastCompanionAt)||!timestamp(b.moodSettledAt)||(b.lastMoodPetAt!==null&&!timestamp(b.lastMoodPetAt))||(b.cryShownDate!==null&&typeof b.cryShownDate!=='string')))throw Error();
   if(value.birds.some(b=>!record(b)||['lastMoodGainAt','lastCryAt','poopDueAt'].some(key=>Object.hasOwn(b,key)&&b[key]!==null&&!timestamp(b[key]))||(Object.hasOwn(b,'cryEpisodeShown')&&typeof b.cryEpisodeShown!=='boolean')))throw Error();
   return value;
  }catch{fail('CACHE_INVALID','本机体验缓存无法读取，请先保留数据并联系支持，不会自动覆盖')}
 }
 function initializeMood(b,now,cadence=rules){b.mood=GUEST_RULES.initialMood;b.lastCompanionAt=now;b.moodSettledAt=now+cadence.moodGraceMs;b.lastMoodPetAt=null;b.cryShownDate=null;}
 function prepare(s,now){
  const previous=s.careProfileVersion==null?GUEST_PROFILES.normal:knownProfile(s.careProfile,s.careProfileVersion);
  if(s.careRulesVersion!==1){
   // Only birds present during the one-time transition inherit today's old shared claim.
   const d=s.daily[day(now)];
   if(d?.supply){d.supplies??={};for(const b of s.birds)d.supplies[b.id]=true;}
   for(const b of s.birds)initializeMood(b,now,previous);
   s.careRulesVersion=1;
  }
  for(const b of s.birds){
   const ticks=Math.max(0,Math.floor((now-b.settledAt)/previous.decayMs));
   if(ticks){b.hunger=Math.max(0,b.hunger-ticks*previous.hungerDecay);b.water=Math.max(0,b.water-ticks*previous.waterDecay);b.settledAt+=ticks*previous.decayMs;}
   // Cursor starts at the grace-period end and retains every incomplete interval.
   const steps=Math.max(0,Math.floor((now-b.moodSettledAt)/previous.moodDecayMs));
   if(steps){b.mood=Math.max(GUEST_RULES.minMood,b.mood-steps*previous.moodDecay);b.moodSettledAt+=steps*previous.moodDecayMs;}
   if(previous!==rules){b.settledAt=now;b.moodSettledAt=now+rules.moodGraceMs;}
   if(exhibition){
    b.lastMoodGainAt??=null;b.lastCryAt??=null;b.cryEpisodeShown??=false;
    if(b.mood>=50)b.cryEpisodeShown=false;
   }
  }
  s.careProfile=profile;s.careProfileVersion=rules.version;
 }
 function saveChanged(s,before){const next=JSON.stringify(s);if(next===before)return;try{storage.setItem(GUEST_KEY,next)}catch{fail('CACHE_FULL','本机缓存保存失败，本次操作未确认，请释放浏览器空间后重试')}}
 function read(){const s=load(),before=JSON.stringify(s);prepare(s,clock());saveChanged(s,before);return s;}
 function write(fn){const s=load(),before=JSON.stringify(s),now=clock();prepare(s,now);const result=fn(s,now);saveChanged(s,before);return result;}
 const mine=(s,id)=>{const b=s.birds.find(b=>b.id===id);if(!b)fail('LOCAL_BIRD_NOT_FOUND','请先碰一碰并领取这只小鸟');return b;};
 const daily=(s,now)=>s.daily[day(now)]??={};
 function points(s,delta,operation,target,now){s.balance+=delta;const entry={id:String((Number(s.ledger[0]?.id)||0)+1),operation,targetId:target,delta,balanceAfter:s.balance,createdAt:new Date(now).toISOString()};s.ledger.unshift(entry);s.ledger=s.ledger.slice(0,500);return entry;}
 function accompany(s,b,action,now){
  const d=daily(s,now);d.mood??={};const m=d.mood[b.id]??={};let gain=0;
  if(exhibition){
   if(b.lastMoodGainAt==null||now-b.lastMoodGainAt>=5000){
    if(!m.firstCompanion){gain+=10;m.firstCompanion=true;}
    gain+=({pet:10,play:10,feed:5,water:5,clean:5,greet:10})[action]||0;
    b.lastMoodGainAt=now;
   }
  }else{
   if(!m.firstCompanion){gain+=10;m.firstCompanion=true;}
   if(action==='pet'){
    if((m.pets||0)<GUEST_RULES.moodPetDailyLimit&&(b.lastMoodPetAt===null||now-b.lastMoodPetAt>=GUEST_RULES.petCooldownMs)){gain+=10;m.pets=(m.pets||0)+1;b.lastMoodPetAt=now;}
   }else{
    const limits={feed:[5,GUEST_RULES.moodCareDailyLimit],water:[5,GUEST_RULES.moodCareDailyLimit],clean:[5,1],greet:[10,1]},rule=limits[action];
    if(rule&&(m[action]||0)<rule[1]){gain+=rule[0];m[action]=(m[action]||0)+1;}
   }
  }
  b.mood=Math.min(GUEST_RULES.maxMood,b.mood+gain);
  if(exhibition&&b.mood>=50)b.cryEpisodeShown=false;
  b.lastCompanionAt=now;b.moodSettledAt=now+rules.moodGraceMs;
 }
 function snapshot(){const s=read(),now=clock(),d=s.daily[day(now)]||{};return {account:'本机体验',localMode:true,birds:s.birds,wallet:{balance:s.balance,date:day(now),earnedToday:d.pets||0,dailyLimit:GUEST_RULES.petDailyLimit,nextRewardAt:s.lastPet!=null&&now-s.lastPet<GUEST_RULES.petCooldownMs?new Date(s.lastPet+GUEST_RULES.petCooldownMs).toISOString():null},careDaily:{supplyClaimed:!!d.supplies?.[s.currentId],greeted:!!d.greeting,exhibition}};}
 function validateName(name){const n=String(name||'').trim();const count=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(n)].length:[...n].length;if(count<1||count>6)fail('INVALID_NAME','请输入 1–6 个字的小鸟昵称');}
 function adopt(bird,name){
  if(!/^[a-f0-9]{32}$/.test(bird?.id||'')||bird.active===false)fail('INVALID_BIRD','实体资料无效，不能领取');validateName(name);
  return write((s,now)=>{let b=s.birds.find(b=>b.id===bird.id);const replayed=!!b;
   if(!b){b={...bird,name:name.trim(),localOnly:true,eggStatus:'HATCHED',hunger:GUEST_RULES.initialHunger,water:GUEST_RULES.initialHydration,food:GUEST_RULES.initialFood,waterStock:GUEST_RULES.initialWater,poopDueAt:null,settledAt:now,claimedAt:new Date(now).toISOString(),equippedSkinId:null};initializeMood(b,now);s.birds.push(b);if(!s.welcome){points(s,5,'WELCOME',bird.id,now);s.welcome=true;}}
   s.currentId=b.id;return {bound:true,birdId:b.id,eggStatus:'HATCHED',localOnly:true,replayed};
  });
 }
 function care(id,action,name){return write((s,now)=>{
  const b=mine(s,id);
  if(action==='enter'){
   const cry=b.mood<=30&&(exhibition?!b.cryEpisodeShown&&(b.lastCryAt==null||now-b.lastCryAt>=120000):b.cryShownDate!==day(now));
   if(cry){b.cryShownDate=day(now);if(exhibition){b.cryEpisodeShown=true;b.lastCryAt=now;}}
   return {cry,bird:b};
  }
  const d=daily(s,now);let message='',changed=true;
  if(action==='rename'){validateName(name);b.name=name.trim();message='昵称已保存在本机';}
  else if(action==='supply'){
   d.supplies??={};
   if(exhibition){changed=b.food<3||b.waterStock<3;b.food=Math.max(3,b.food);b.waterStock=Math.max(3,b.waterStock);message=changed?'食物和水已补充至各 3 份，继续陪小鸟玩吧':'食物和水都很充足，先陪小鸟玩吧';}
   else{if(d.supplies[id])fail('ALREADY_CLAIMED','这只小鸟的今日补给已经领取啦');b.food++;b.waterStock++;message='食物 +1、水 +1，已放进这只小鸟的库存';}
   d.supplies[id]=true;
  }
  else if(action==='greet'){if(d.greeting)fail('ALREADY_CLAIMED','今天已经打过招呼啦');d.greeting=true;points(s,2,'GREETING',id,now);accompany(s,b,'greet',now);message='今日问候，叽分 +2';}
  else if(action==='feed'||action==='water'){
   const value=action==='feed'?'hunger':'water',stock=action==='feed'?'food':'waterStock';changed=b[value]<100;
   if(changed){if(b[stock]<1)fail('NO_STOCK',exhibition?'补给不足，去补给里补充食物和水吧':'补给不足，去领取今日免费补给吧');b[stock]--;b[value]=Math.min(100,b[value]+(action==='feed'?GUEST_RULES.feedGain:GUEST_RULES.waterGain));if(action==='feed'&&b.poopDueAt==null)b.poopDueAt=now+GUEST_RULES.poopDelayMs;accompany(s,b,action,now);}
   // Existing local points eligibility stays independent from actual mood gain.
   d.care??={};const flags=d.care[id]??={};flags[action]=true;
   if(flags.feed&&flags.water&&!d.careReward){d.careReward=true;points(s,3,'CARE',id,now);message=changed?'食物和水都照顾好啦，叽分 +3':(action==='feed'?'已经吃饱啦':'喝够啦')+'，今日照料叽分 +3';}
   else message=changed?(action==='feed'?'吃得香香的':'水分补充好啦'):(action==='feed'?'已经吃饱啦，留着下次吃～':'喝够啦，谢谢你～');
  }else if(action==='clean'){if(b.poopDueAt!=null&&b.poopDueAt<=now)b.poopDueAt=null;b.cleanedAt=new Date(now).toISOString();accompany(s,b,'clean',now);message='小窝打扫干净啦';}
  else if(action==='play'&&exhibition){accompany(s,b,'play',now);message='咦，你藏了什么小秘密呀？';}
  else fail('INVALID_ACTION','暂不支持该操作');
  return {message,bird:b,changed};
 });}
 function pet(id,requestId){
  if(!/^[A-Za-z0-9_-]{16,64}$/.test(requestId||''))fail('INVALID_REQUEST_ID','请求编号无效');
  return write((s,now)=>{
   const b=mine(s,id);
   if(Object.hasOwn(s.requests,requestId)){const prior=s.requests[requestId];if((prior.targetId??prior.entry?.targetId)!==id||(prior.kind&&prior.kind!=='pet'))fail('IDEMPOTENCY_CONFLICT','同一请求编号不能用于不同目标');return {...prior,reward:prior.reward??(prior.entry?.delta>0?1:0),rewardStatus:prior.rewardStatus??null,bird:b,replayed:true};}
   const d=daily(s,now);let reward=0,rewardStatus=null,entry;
   if((d.pets||0)>=GUEST_RULES.petDailyLimit)rewardStatus='DAILY_LIMIT';
   else if(s.lastPet!=null&&now-s.lastPet<GUEST_RULES.petCooldownMs)rewardStatus='COOLDOWN';
   else{reward=1;d.pets=(d.pets||0)+1;s.lastPet=now;entry=points(s,1,'PET',id,now);}
   accompany(s,b,'pet',now);
   const message=reward?'小鸟收到你的陪伴，叽分 +1':rewardStatus==='DAILY_LIMIT'?'今天的摸摸叽分已领满，陪伴仍然有效':'小鸟收到你的陪伴，稍后再领摸摸叽分';
   const saved={kind:'pet',targetId:id,reward,rewardStatus,message,...(entry?{entry}:{}),replayed:false};s.requests[requestId]=saved;return {...saved,bird:b};
  });
 }
 const skins=WARDROBE_SKINS;
 function wardrobe(){const s=read();return {skins:skins.map(b=>({...b,owned:s.skins.includes(b.id)})),outfits:s.birds.map(b=>({birdId:b.id,skinId:b.equippedSkinId,visualKey:getWardrobeSkin(b.equippedSkinId)?.visualKey||null}))};}
 function redeem(id,requestId){if(!/^[A-Za-z0-9_-]{16,64}$/.test(requestId||''))fail('INVALID_REQUEST_ID','请求编号无效');return write((s,now)=>{if(Object.hasOwn(s.requests,requestId)){const prior=s.requests[requestId];if(prior.entry?.targetId!==id)fail('IDEMPOTENCY_CONFLICT','同一请求编号不能用于不同目标');return {...prior,replayed:true};}const skin=getWardrobeSkin(id);if(!skin)fail('SKIN_NOT_FOUND','装饰不存在');if(s.skins.includes(id))fail('SKIN_ALREADY_OWNED','已经拥有这件装饰');if(s.balance<skin.price)fail('INSUFFICIENT_POINTS','叽分不足');s.skins.push(id);const result={entry:points(s,-skin.price,'REDEEM',id,now),replayed:false};s.requests[requestId]=result;return result;});}
 function equip(id,skinId){return write(s=>{const b=mine(s,id);if(skinId!==null){if(!getWardrobeSkin(skinId))fail('SKIN_NOT_FOUND','装饰不存在');if(!s.skins.includes(skinId))fail('SKIN_NOT_OWNED','尚未兑换该装饰');}b.equippedSkinId=skinId;return {birdId:id,skinId};});}
 function photoReward(id,hash){return write((s,now)=>{const request='photo:'+id;if(s.requests[request])return s.requests[request].reward;const d=daily(s,now);let reward=0;if(!s.photoHashes.includes(hash)&&(d.photos||0)<3){reward=1;d.photos=(d.photos||0)+1;s.photoHashes.push(hash);points(s,1,'CHECKIN_REWARD',id,now);}s.requests[request]={reward};return reward;});}
 return {read,snapshot,adopt,care,pet,wardrobe,redeem,equip,photoReward,select:id=>write(s=>{mine(s,id);s.currentId=id;return{id};}),ledger:before=>read().ledger.filter(e=>!before||BigInt(e.id)<BigInt(before)).slice(0,50)};
}
