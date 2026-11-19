'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCloudStore, SESSION_KEY } = require('../miniprogram/utils/cloud-store');
const { platform } = require('./cloud-platform.cjs');
const A = 'a'.repeat(32), B = 'b'.repeat(32), P = '1'.repeat(32);
function fixture() {
    let identity = A, intercept;
    const pet = { petId:P, birdId:P, birdCode:'HZ-HY-fixture',nickname:'云端小鸟',active:true,version:'4',ruleVersion:'normal-v1',serverTime:'2026-11-14T00:00:00Z',businessDate:'2026-11-14',care:{satiety:60,hydration:70,mood:80},inventory:{food:2,water:3},cleaning:{status:'NONE'},supplyClaimed:false };
    const wallet = {balance:12,accountVersion:'4'};
    async function transport(o) {
        const path=new URL(o.url).pathname;
        if (path==='/bird/v1/auth/wx-login' || path==='/bird/v1/auth/wx-phone-login') return {statusCode:200,data:{userId:identity,token:identity.repeat(2),expiresAt:'2099-01-01T00:00:00Z',...(path.endsWith('phone-login')?{phoneMasked:'+86 **** 0000'}:{})}};
        if (path==='/bird/v1/auth/logout') return {statusCode:204};
        const id=o.header.Authorization.slice(7,39), items=id===A?[structuredClone(pet)]:[];
        if(path==='/bird/v1/me/pets')return{statusCode:200,data:{userId:id,items,wallet}};
        if(path==='/bird/v1/me/pets/'+P)return{statusCode:200,data:{pet:structuredClone(pet),wallet}};
        if(path==='/bird/v1/me/points')return{statusCode:200,data:{balance:12,earnedToday:0,dailyLimit:10}};
        if(path==='/bird/v1/me/birds')return{statusCode:200,data:[]};
        return{statusCode:404,data:{code:'ENDPOINT_NOT_FOUND'}};
    }
    const wx=platform(o=>intercept?intercept(o,transport):transport(o));
    const store=createCloudStore(wx,{API_BASE:'http://fixture.invalid/bird/v1'});
    return{store,wx,intercept:f=>intercept=f,identity:id=>identity=id};
}
test('phone login uses fresh independent codes and restores original user assets',async()=>{
    const f=fixture();await f.store.loginWithWechat();const before=f.store.snapshot().data.snapshot;
    await f.store.logoutWechat();f.wx.memory.set('auth_token','legacy-token');
    assert.equal((await f.store.loginWithPhone('phone-grant')).error,null);
    const after=f.store.snapshot().data.snapshot;
    assert.equal(after.userId,before.userId);assert.equal(after.petId,before.petId);assert.equal(after.food,before.food);assert.equal(after.points,before.points);
    const call=f.wx.calls.find(c=>c.path==='/bird/v1/auth/wx-phone-login');assert.deepEqual(call.data,{code:'MP_CLOUD_TEST',phoneCode:'phone-grant'});
    assert.equal(call.header.Authorization,undefined);assert.equal(f.wx.calls.filter(c=>c.path==='/bird/v1/auth/session').length,0);
    assert.equal(f.store.status().phoneMasked,'+86 **** 0000');
    const saved=f.wx.memory.get(SESSION_KEY);assert.deepEqual(Object.keys(saved).sort(),['expiresAt','phoneMasked','token','userId']);
});
test('invalid phone input does not call wx.login or reset an existing session',async()=>{
    const f=fixture();await f.store.loginWithWechat();const before=f.store.getToken();let calls=0;f.wx.login=()=>calls++;
    for(const code of [undefined,'','  ','x'.repeat(513),{phoneNumber:'19900000000'}])assert.equal((await f.store.loginWithPhone(code)).error,'WX_PHONE_CODE_INVALID');
    assert.equal(calls,0);assert.equal(f.store.getToken(),before);
});
test('invalid/replayed phone authorization never falls back to ordinary login',async()=>{
    const f=fixture();f.intercept(async o=>({statusCode:401,data:{code:'WX_PHONE_CODE_INVALID'}}));
    assert.equal((await f.store.loginWithPhone('used-code')).error,'WX_PHONE_CODE_INVALID');
    assert.equal(f.store.status().signedIn,false);assert.equal(f.wx.calls.length,1);
    assert.equal(f.wx.calls[0].path,'/bird/v1/auth/wx-phone-login');
});
test('logout rejects a late successful phone login response',async()=>{
    const f=fixture();let release,reached;const seen=new Promise(r=>reached=r);
    f.intercept(async(o,next)=>{const result=await next(o);if(o.url.endsWith('/auth/wx-phone-login')){reached();await new Promise(r=>release=r);}return result;});
    const job=f.store.loginWithPhone('phone-grant');await seen;await f.store.logoutWechat();release();
    assert.equal((await job).error,'CONTEXT_CHANGED');assert.equal(f.store.status().signedIn,false);assert.equal(f.wx.memory.get(SESSION_KEY),null);
});
test('duplicate authorization and a competing normal login do not consume another code',async()=>{
    const f=fixture();let release,reached;const seen=new Promise(r=>reached=r);
    f.intercept(async(o,next)=>{if(o.url.endsWith('/auth/wx-login')){reached();await new Promise(r=>release=r);}return next(o);});
    const ordinary=f.store.loginWithWechat();await seen;
    assert.equal((await f.store.loginWithPhone('phone-grant')).error,'BUSY');release();await ordinary;
    assert.equal(f.wx.calls.filter(c=>c.path.endsWith('phone-login')).length,0);
});
test('phone login cannot accept a response with a full phone instead of a mask',async()=>{
    const f=fixture();f.intercept(async(o,next)=>{const r=await next(o);if(o.url.endsWith('phone-login'))r.data.phoneMasked='19900000000';return r;});
    assert.equal((await f.store.loginWithPhone('phone-grant')).error,'INVALID_RESPONSE');assert.equal(f.store.status().signedIn,false);
});
test('offline phone login preserves existing account and pending state',async()=>{
    const f=fixture();await f.store.loginWithWechat();f.store.setOnline(false);const token=f.store.getToken();const count=f.wx.calls.length;
    assert.equal((await f.store.loginWithPhone('phone-grant')).error,'OFFLINE');assert.equal(f.store.getToken(),token);assert.equal(f.wx.calls.length,count);
});
