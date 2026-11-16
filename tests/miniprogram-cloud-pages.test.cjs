'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../miniprogram');
function harness(name) {
    const P = '1'.repeat(32), Q = '2'.repeat(32), U = 'a'.repeat(32);
    let generation = 0, operation;
    const calls = [], listeners = new Set();
    const state = {hasBird:true, petId:P,userId:U,birdId:P,birdCode:'HZ-HY-9000000000000000101',nickname:'甲',cityCode:'hangzhou',food:3,water:3,satiety:60,hydration:60,mood:80,points:5,todayPoints:0,dailyLimit:10,ledger:[],pets:[{petId:P,birdId:P,nickname:'甲',birdCode:'HZ-HY-9000000000000000101'},{petId:Q,birdId:Q,nickname:'乙'}],cleaning:{status:'NONE'}};
    const st={userId:U,signedIn:true,canOperate:true,online:true,synced:true};
    const store={snapshot:()=>({error:null,data:{snapshot:structuredClone(state)}}),status:()=>st,
      getExperienceGeneration:()=>generation, subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},resume:async()=>({error:null}),
      readWechatSignedIn:()=>true,verifyWechatSession:async()=>'valid',history:async()=>({error:null,data:{items:[],hasMore:false}}),
      reset:()=>{calls.push('cache-reset');return {error:null};},
      selectPet:async id=>{generation++;state.petId=id;state.nickname=state.pets.find(p=>p.petId===id).nickname;listeners.forEach(f=>f());return{error:null};},
      feed:()=>{calls.push('FEED');return new Promise(r=>operation=r);},
      water:()=>{calls.push('WATER');return Promise.resolve({error:null,data:{outcome:'SUCCEEDED',changed:true}});},
      pet:async()=>({error:null,data:{reward:0,granted:0,outcome:'SUCCEEDED'}}),
      clean:async()=>({error:null,data:{outcome:'SUCCEEDED'}}),
      rename:async value=>{state.nickname=value;calls.push(['RENAME',value]);return{error:null,data:{outcome:'SUCCEEDED'}};},
      supply:async()=>{state.supplyClaimed=true;return {error:null,data:{outcome:'SUCCEEDED'}};},
      adopt:async(id,nickname)=>{calls.push(['ADOPT',id,nickname]);return {error:null,data:{}};},
      photoReward:()=>({error:null,data:{reward:0}})};
    let definition;
    const wx={showToast:opts=>calls.push(['toast',opts.title]),getWindowInfo:()=>({windowWidth:375,windowHeight:812,screenHeight:812,statusBarHeight:44,safeArea:{bottom:778}}),onKeyboardHeightChange(){},offKeyboardHeightChange(){},getStorageSync(){},setStorageSync(){},
      reLaunch:opts=>calls.push(['navigate',opts.url]),switchTab:opts=>calls.push(['navigate',opts.url]),
      request:opts=>{calls.push(['GET',opts.url]);queueMicrotask(()=>opts.success({statusCode:200,data:{id:Q,birdCode:'HZ-HY-9000000000000000102',active:true,name:'公开实体',cityName:'杭州',cityCode:'hangzhou',typeName:'小黄莺',skinName:'黄色'}}));}};
    const cache=new Map();
    function load(file) {
      if(file.endsWith('/utils/store.js')) return store;
      if(file.endsWith('/utils/config.js')) return {API_BASE:'http://isolated.invalid',USE_LOCAL_FIXTURE:false};
      if(file.endsWith('/utils/nest-idle.js')) return {createNestIdle:()=>({sync(){},kick(){},dispose(){},stop(){}})};
      if(file.endsWith('/utils/collection-media.js')) return {load:async()=>({profileBackground:'/x.webp',citySprite:'/x.webp'})};
      if(cache.has(file))return cache.get(file).exports;
      const module={exports:{}};cache.set(file,module);
      const localRequire=rel=>load(path.resolve(path.dirname(file),rel)+(path.extname(rel)?'':'.js'));
      vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:localRequire,Page:d=>definition=d,wx,getCurrentPages:()=>[],setTimeout,clearTimeout,setInterval,clearInterval,console,Uint8Array},{filename:file});return module.exports;
    }
    load(path.join(ROOT,'pages',name,name+'.js'));
    const page=Object.assign({},definition,{data:structuredClone(definition.data),setData(values){Object.assign(this.data,values);}});
    return {page,state,store,calls,wx,settle:()=>new Promise(r=>setTimeout(r,0)),complete:r=>operation(r),P,Q};
}
test('nest waits for service success before food/animation feedback; no reward claimed for zero PET',async()=>{
 const h=harness('index');h.page.onLoad();h.page.onShow();
 try {const pending=h.page.onFeed();assert.equal(h.page.data.food,3);assert.equal(h.page.data.feedFxId,0);h.state.food=2;h.complete({error:null,data:{outcome:'SUCCEEDED',changed:true}});await pending;assert.equal(h.page.data.food,2);await h.page.pet();assert(!h.calls.some(c=>Array.isArray(c)&&/叽分 \+/.test(c[1])));}finally{h.page.onHide();h.page.onUnload();}
});
test('nest discards feedback after page hidden; supports switch and asynchronous rename',async()=>{
 const h=harness('index');h.page.onLoad();h.page.onShow();const p=h.page.onFeed();h.page.onHide();h.complete({error:null,data:{outcome:'SUCCEEDED',changed:true}});await p;assert.equal(h.page.data.feedFxId,0);
 h.page.onShow();await h.page.onSelectPet({currentTarget:{dataset:{id:h.Q}}});assert.equal(h.page.data.displayName,'乙');h.page.data.renameValue='新名字';await h.page.onSaveRename();assert.equal(h.page.data.displayName,'新名字');h.page.onHide();h.page.onUnload();
});
test('adoption uses verified birdId, permits second bird, never adopts just by opening NFC link',async()=>{
 const h=harness('adopt');h.state.pets=h.state.pets.slice(0,1);h.page.onLoad({code:'HZ-HY-9000000000000000102'});h.page.onShow();await h.settle();
 assert.equal(h.page.data.ready,true);assert.equal(h.page.data.alreadyHaveBird,false);assert.equal(h.calls.filter(c=>c[0]==='ADOPT').length,0);
 h.page.handleInput({detail:{value:'新伙伴'}});await h.page.handleAdopt();assert.deepEqual(h.calls.find(c=>c[0]==='ADOPT'),['ADOPT',h.Q,'新伙伴']);h.page.onUnload();
});
test('profile renders multiple birds and cache clear never removes photos or old guest state',async()=>{
 const h=harness('profile');h.page.onLoad();h.page.onShow();await h.settle();assert.equal(h.page.data.birdCount,2);await h.page.onSelectPet({currentTarget:{dataset:{id:h.Q}}});assert.equal(h.page.data.displayName,'乙');h.page.confirmReset();assert(h.calls.includes('cache-reset'));h.page.onHide();h.page.onUnload();
});
test('NFC parameter compatibility unchanged and no code is required for cloud restore',()=>{
 const entry=require('../miniprogram/utils/entry');const code='HZ-HY-9000000000000000101';
 for(const key of ['code','birdCode','bird'])assert.equal(entry.readBirdCode({[key]:code}),code);
 assert.equal(entry.readBirdCode({scene:encodeURIComponent('code='+code)}),code);assert.equal(entry.readBirdCode({}), '');
});
test('local photos and drafts are scoped by userId; legacy album is preserved and no cloud reward is called', async()=>{
 let user='a'.repeat(32), rewards=0;const rows=new Map([['xcwc.mp.album.v1',[{id:'legacy_photo_123456',reward:1}]]]);const files=new Map();
 const store={status:()=>({userId:user}),snapshot:()=>({error:null,data:{snapshot:{pets:[{petId:'1'.repeat(32)}]}}}),photoReward:()=>{rewards++;return {error:null,data:{reward:0}};}};
 const fileSystem={accessSync(){},mkdirSync(){},copyFileSync(source,target){files.set(target,source);},unlinkSync(p){files.delete(p);}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(ROOT,'utils/photo-album.js'),'utf8'),{module,require:()=>store,wx:{env:{USER_DATA_PATH:'/local'},getFileSystemManager:()=>fileSystem,getStorageSync:k=>rows.get(k),setStorageSync:(k,v)=>rows.set(k,v)},console});
 const album=module.exports;album.saveDraft({photo:'a'});assert.equal(album.history().total,0);
 const result=await album.create({id:'local_photo_123456',digest:'digest',outputHash:'output',imagePath:'/tmp/image',originalPath:'/tmp/original',birdIds:['1'.repeat(32)]},store);
 assert.equal(result.error,null);assert.equal(result.reward,0);assert.equal(album.history().total,1);assert.equal(rewards,1);
 user='b'.repeat(32);assert.equal(album.history().total,0);assert.equal(album.readDraft(),null);album.saveDraft({photo:'b'});
 user='a'.repeat(32);assert.equal(album.history().total,1);assert.equal(album.readDraft().photo,'a');assert.equal(rows.get('xcwc.mp.album.v1')[0].reward,1);
 assert([...files.keys()].every(p=>p.includes('/cloud-photo/'+user+'/')));
});

test('profile phone authorization handles denial, old payloads, duplicate taps and success',async()=>{
 const h=harness('profile');h.store.readWechatSignedIn=()=>false;h.store.status().signedIn=false;h.page.onLoad();h.page.onShow();await h.settle();
 let count=0,finish;h.store.loginWithPhone=code=>{assert.equal(code,'verified-phone-code');count++;return new Promise(r=>finish=r);};
 await h.page.onPhoneLogin({detail:{errMsg:'getPhoneNumber:fail user deny'}});assert.equal(count,0);assert(h.calls.some(c=>c[0]==='toast'&&c[1].includes('未授权手机号')));
 await h.page.onPhoneLogin({detail:{errMsg:'getPhoneNumber:ok',encryptedData:'legacy'}});assert.equal(count,0);
 const job=h.page.onPhoneLogin({detail:{code:'verified-phone-code'}});await h.page.onPhoneLogin({detail:{code:'duplicate'}});assert.equal(count,1);assert.equal(h.page.data.wechatLoginBusy,true);
 h.store.readWechatSignedIn=()=>true;finish({error:null});await job;assert.equal(h.page.data.wechatSignedIn,true);assert.equal(h.page.data.wechatLoginBusy,false);assert(h.calls.some(c=>c[0]==='toast'&&c[1]==='手机号登录成功'));
 h.page.onHide();h.page.onUnload();
});
test('profile uses a native phone authorization button and privacy contract entry',()=>{
 const xml=fs.readFileSync(path.join(ROOT,'pages/profile/profile.wxml'),'utf8');
 assert.match(xml,/<button[^>]*open-type="getPhoneNumber"[^>]*bindgetphonenumber="onPhoneLogin"/);
 const h=harness('profile');let opened=0;h.wx.openPrivacyContract=()=>opened++;h.page.onPhonePrivacy();assert.equal(opened,1);
});
