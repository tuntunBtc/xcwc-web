'use strict';
// Only the task-owned loopback backend; real transactions, synthetic WeChat exchange.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCloudStore, SESSION_KEY } = require('../miniprogram/utils/cloud-store');
const { platform, http } = require('../tests/cloud-platform.cjs');
const BASE = 'http://127.0.0.1:18097';
const facts = [], snap = s => s.snapshot().data.snapshot;
async function good(label, fn) { await fn(); facts.push(label); console.log('PASS ' + label); }
async function api(path, body, token) {
 const r = await http({url:BASE+'/api'+path,method:body?'POST':'GET',data:body,header:Object.assign({'content-type':'application/json'},token?{Authorization:'Bearer '+token}:{})});
 assert(r.statusCode<300, path+': '+JSON.stringify(r.data)); return r.data;
}
(async()=>{
 let lose=false, blackout=false;
 const wx1=platform(async o=>{if(blackout)throw Error('network');const r=await http(o);if(lose&&o.url.endsWith('/actions')&&o.method==='POST'){lose=false;throw Error('response lost');}return r;});
 const a=createCloudStore(wx1,{API_BASE:BASE}), b=createCloudStore(platform(http),{API_BASE:BASE});
 await good('login: persistent userId, independent tokens, empty list',async()=>{assert.equal((await a.loginWithWechat()).error,null);assert.equal(snap(a).pets.length,0);assert.equal((await b.loginWithWechat()).error,null);assert.equal(snap(a).userId,snap(b).userId);assert.notEqual(a.getToken(),b.getToken());});
 const birds=await Promise.all(['HZ-HY-9000000000000000101','HZ-HY-9000000000000000102'].map(code=>api('/birds/by-code/'+code)));
 await good('real entity lookup and explicit adoption; initial 60/60/80, 3/3, welcome only once',async()=>{for(const bird of birds)assert.equal((await a.adopt(bird.id,'伙伴')).error,null);assert.equal(snap(a).pets.length,2);assert.equal(snap(a).food,3);assert.equal(snap(a).satiety,60);assert.equal(snap(a).mood,80);assert.equal(snap(a).points,5);await b.refresh();assert.equal(snap(b).pets.length,2);});
 const ids=snap(a).pets.map(p=>p.petId);
 await good('rename, feed and multiple pets isolate state by petId',async()=>{await a.selectPet(ids[0]);assert.equal((await a.rename('甲伙伴')).error,null);assert.equal((await a.feed()).error,null);assert.equal(snap(a).food,2);assert.equal(snap(a).satiety,90);assert.equal(snap(a).cleaning.status,'PENDING');await a.selectPet(ids[1]);assert.equal(snap(a).food,3);assert.equal(snap(a).nickname,'伙伴');});
 await good('water, early cleaning retains dueAt, daily supply shared across pets',async()=>{await a.selectPet(ids[0]);const due=snap(a).cleaning.dueAt;assert.equal((await a.water()).error,null);assert.equal(snap(a).water,2);assert.equal((await a.clean()).error,null);assert.equal(snap(a).cleaning.dueAt,due);assert.equal((await a.supply()).error,null);assert.equal(snap(a).food,3);await a.selectPet(ids[1]);assert.equal(snap(a).supplyClaimed,true);assert.equal((await a.supply()).data.outcome,'ALREADY_CLAIMED');assert.equal(snap(a).food,3);});
 await good('PET with zero reward is successful companionship',async()=>{assert.equal((await a.pet()).error,null);const r=await a.pet();assert.equal(r.error,null);assert.equal(r.data.reward,0);});
 await good('lost real commit response recovered via receipt exactly once',async()=>{const food=snap(a).food;lose=true;const r=await a.feed();assert.equal(r.error,null);assert.equal(r.data.replayed,true);assert.equal(snap(a).food,food-1);});
 await good('two sessions race: one commit, one version conflict; no stale click replay',async()=>{await b.selectPet(ids[1]);await a.refresh();await b.refresh();const water=snap(a).water;const results=await Promise.all([a.water(),b.water()]);assert.equal(results.filter(r=>r.error==='PET_VERSION_CONFLICT').length,1);assert.equal(results.filter(r=>!r.error).length,1);await a.refresh();await b.refresh();assert.equal(snap(a).water,water-1);assert.equal(snap(a).water,snap(b).water);});
 await good('wallet, inventory and supply histories use official endpoints',async()=>{for(const kind of ['points','inventory','claims']){const r=await a.history(kind);assert.equal(r.error,null);assert(r.data.items.length>0);if(kind==='claims'){assert.equal(r.data.items.length,1);assert.equal(r.data.items[0].petId,ids[0]);}}});
 await good('unknown request survives client restart, exact original operation retries',async()=>{blackout=true;const v=snap(a).pets.find(p=>p.petId===ids[1]).version;assert.equal((await a.rename('断线后名')).error,'RESULT_PENDING');assert.equal(snap(a).nickname,'伙伴');const restart=createCloudStore(platform(http,wx1.memory),{API_BASE:BASE});assert.equal((await restart.resume()).error,null);assert.equal(snap(restart).nickname,'断线后名');assert.equal(BigInt(snap(restart).pets.find(p=>p.petId===ids[1]).version),BigInt(v)+1n);blackout=false;await a.resume();});
 await good('cache clear and new-device login restore without entity codes',async()=>{const before=snap(a);assert.equal(a.reset().error,null);await a.resume();const fresh=createCloudStore(platform(http),{API_BASE:BASE});await fresh.loginWithWechat();assert.deepEqual(snap(fresh).pets.map(p=>[p.petId,p.nickname,p.inventory]),snap(a).pets.map(p=>[p.petId,p.nickname,p.inventory]));assert.equal(snap(fresh).points,before.points);});
 await good('second account isolated; same physical bird has independent binding',async()=>{const login=await api('/auth/register',{username:'mp_'+Date.now(),password:'isolated-test-password-42'});const identity=await api('/auth/session',null,login.token);const memory=new Map([[SESSION_KEY,{token:login.token,userId:identity.userId,expiresAt:login.expiresAt}]]);const other=createCloudStore(platform(http,memory),{API_BASE:BASE});await other.refresh();assert.equal(snap(other).pets.length,0);assert.equal((await other.adopt(birds[0].id,'独立伙伴')).error,null);assert.notEqual(snap(other).petId,ids[0]);assert.equal(snap(other).food,3);const denied=await http({url:BASE+'/api/me/pets/'+ids[0],method:'GET',header:{Authorization:'Bearer '+login.token}});assert.equal(denied.statusCode,404);await other.logoutWechat();assert.equal(snap(other).pets.length,0);});
 assert(wx1.calls.filter(c=>c.path.startsWith('/api/me/')).every(c=>/^Bearer [a-f0-9]{64}$/.test(c.header.Authorization)));
 fs.writeFileSync(path.resolve(__dirname, '../../output/miniprogram-cloud-20261111/http-report.json'),JSON.stringify({passed:facts.length,facts,apiRoot:BASE,backend:'real supplied JAR + isolated MySQL 8.4 V12',wechat:'debug exchange only',phone:'not tested'},null,2)+'\n','utf8');
})().catch(e=>{console.error(e);process.exitCode=1;});
