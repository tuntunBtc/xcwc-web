'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../miniprogram');
function harness(name, config = {}) {
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
      if(file.endsWith('/utils/config.js')) return {API_BASE:'http://isolated.invalid/bird/v1',USE_LOCAL_FIXTURE:false,...config};
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
function sparkState(overrides = {}) {
    return { status: 'UNLIT', level: 0, affinity: 0, effectiveToday: false, frozenLevel: 0, recoveryProgress: 0,
        recoveryDeadline: null, ...overrides };
}

test('spark presentation distinguishes readiness, recovery, tiers, and unavailable data', () => {
    const { presentSpark } = require('../miniprogram/pages/index/spark');
    const ready = { signedIn: true, online: true, synced: true };
    const present = data => presentSpark({ hasBird: true, spark: sparkState(data) }, ready);
    assert.equal(present().badge, '待点亮');
    for (const [level, tier] of [[1, 1], [6, 1], [7, 2], [29, 2], [30, 3], [99, 3], [100, 4], [365, 4]]) {
        const view = present({ status: 'ACTIVE', level, affinity: level });
        assert.equal(view.tier, tier);
        assert.equal(view.badge, level > 99 ? 'Lv.99+' : 'Lv.' + level);
        assert.equal(view.spark.level, level);
        assert.equal(view.action, 'pet');
        assert.equal(view.dim, false);
    }
    assert.equal(present({ status: 'ACTIVE', level: 8, effectiveToday: true }).action, '');
    const resume = { level: 5, frozenLevel: 5, affinity: 6, recoveryDeadline: '2026-11-20' };
    const recoverable = present({ ...resume, status: 'RECOVERABLE' });
    assert.equal(recoverable.badge, '可恢复');
    assert.equal(recoverable.dim, true);
    assert.match(recoverable.deadline, /11 月 20 日结束前开始/);
    const recovering = present({ ...resume, status: 'RECOVERING', recoveryProgress: 2, effectiveToday: true });
    assert.equal(recovering.badge, '恢复 2/3');
    assert.equal(recovering.action, '');
    assert.match(recovering.deadline, /已开始，继续陪伴/);
    assert.match(recovering.message, /明天继续/);
    assert.equal(present({ ...resume, status: 'RECOVERING', recoveryProgress: 1 }).action, 'pet');
    assert.equal(present({ status: 'EXPIRED', affinity: 6 }).button, '摸摸，重新点亮');
    assert.equal(presentSpark({ hasBird: true, spark: null }, ready).mode, 'unavailable');
    const previousBird = { hasBird: true, spark: sparkState({ level: 6, affinity: 6 }) };
    for (const state of [{ signedIn: false }, { online: false }, { error: 'INVALID_RESPONSE' }]) {
        assert.equal(presentSpark(previousBird, { ...ready, ...state }).spark, null);
    }
});

test('spark CTA closes the sheet, uses one existing pet action, and merges the bird response with confirmed rewards', async () => {
    const h = harness('index');
    const angryArt = '/assets/nest/emotion-angry.webp';
    let requests = 0;
    h.state.spark = sparkState();
    h.store.pet = async () => {
        requests++;
        assert.equal(h.page.data.sheet, null);
        h.state.spark = sparkState({ status: 'ACTIVE', level: 1, affinity: 1, effectiveToday: true });
        return { error: null, data: { outcome: 'SUCCEEDED', replayed: false, granted: 1, sparkEvent: 'LIT' } };
    };
    h.page.onLoad();
    h.page.onShow();
    try {
        h.page.showFeedback('脚脚痒痒', 2000, angryArt);
        h.page.onOpenSpark();
        assert.equal(h.page.data.sheet.type, 'spark');
        assert.equal(h.page.data.sparkDisplay.badge, '待点亮');
        await Promise.all([h.page.onSparkAction(), h.page.onSparkAction()]);
        assert.equal(requests, 1);
        assert.equal(h.page.data.birdArt, angryArt);
        assert.match(h.page.data.toast, /嘿嘿.*点亮啦.*叽分 \+1/);
        assert.equal(h.page.data.sparkDisplay.badge, 'Lv.1');
        h.page.onOpenSpark();
        await h.page.onSparkAction();
        assert.equal(requests, 1);
    } finally {
        h.page.onHide();
        h.page.onUnload();
    }
});

test('spark notice follows the confirmed clean transition and suppresses replayed or stale transitions', async () => {
    const h = harness('index');
    h.state.spark = sparkState({ status: 'ACTIVE', level: 6, affinity: 6 });
    h.page.onLoad();
    h.page.onShow();
    const clean = () => h.page.onTool({ currentTarget: { dataset: { key: 'clean' } } });
    try {
        await clean();
        assert.equal(h.page.data.speech, '小窝打扫干净啦');
        assert.equal(h.page.data.toast, '');
        assert.equal(h.page.data.sparkDisplay.badge, 'Lv.6');
        h.store.clean = async () => {
            h.state.spark = sparkState({ status: 'ACTIVE', level: 7, affinity: 7, effectiveToday: true });
            return { error: null, data: { outcome: 'SUCCEEDED', sparkEvent: 'LEVELED' } };
        };
        await clean();
        assert.match(h.page.data.toast, /Lv.7，亲密度 \+1/);
        assert.equal(h.page.data.sparkDisplay.tier, 2);
        assert.equal(h.page.confirmedSparkNotice({ data: { replayed: true, sparkEvent: 'LEVELED' } }), '');
        h.store.status().synced = false;
        h.page.refresh();
        assert.equal(h.page.confirmedSparkNotice({ data: { sparkEvent: 'LEVELED' } }), '');
    } finally {
        h.page.onHide();
        h.page.onUnload();
    }
});

test('spark entry catches only its own tap and uses the existing sheet', () => {
    const xml = fs.readFileSync(path.join(ROOT, 'pages/index/index.wxml'), 'utf8');
    assert.match(xml, /class="identity" bindtap="onSwitch"/);
    assert.match(xml, /class="identity-text" catchtap="onRename"/);
    assert.match(xml, /class="companion spark-entry"[^>]*catchtap="onOpenSpark"/);
    assert.match(xml, /class="sheet-primary spark-action" catchtap="onSparkAction"/);
});
test('adoption uses verified birdId, permits second bird, never adopts just by opening NFC link',async()=>{
 const code='HZ-HY-9000000000000000102';
 const h=harness('adopt',{DEVICE_SANDBOX_TEST:true,DEBUG_DEMO_BIRD_CODE:code,DEBUG_DEMO_BIRD:{id:'obsolete',name:'旧示例'}});
 h.state.pets=h.state.pets.slice(0,1);h.page.onLoad({code,testBird:'1'});h.page.onShow();await h.settle();
 assert.equal(h.page.data.birdName,'公开实体');
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
 assert.equal(album.recoverPending(store).error,null);
 album.saveDraft({pendingSubmission:{id:result.item.id}});
 assert.equal(album.remove(result.item.id).error,null);
 assert.equal(album.readDraft().pendingSubmission,null);
 assert.equal(album.history().total,0);
 user='b'.repeat(32);assert.equal(album.readDraft().photo,'b');

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

test('小窝游客可关闭登录提示，登录失败可重试，成功后返回小窝不再提示', async () => {
    const h = harness('index');
    const { page, store } = h;
    const status = store.status();
    status.signedIn = false;
    let finishLogin;
    let attempts = 0;
    store.loginWithWechat = () => {
        attempts++;
        return new Promise(resolve => { finishLogin = resolve; });
    };
    page.onLoad();
    page.onShow();
    try {
        assert.equal(page.data.sheet.type, 'login');
        page.closeSheet();
        page.refresh();
        page.onHide();
        page.onShow();
        assert.equal(page.data.sheet, null);
        const cancelled = page.onNestLogin();
        await page.onNestLogin();
        assert.equal(attempts, 1);
        finishLogin({ error: 'LOGIN_FAILED' });
        await cancelled;
        assert.equal(page.data.nestLoginBusy, false);
        assert.equal(page.data.sheet, null);
        const retry = page.onNestLogin();
        assert.equal(attempts, 2);
        status.signedIn = true;
        finishLogin({ error: null });
        await retry;
        page.onHide();
        page.onShow();
        assert.equal(page.data.sheet, null);
        assert.equal(page.data.cloudStatus.signedIn, true);
    } finally {
        page.onHide();
        page.onUnload();
    }
});


test('小窝 AR 入口位于合照下方并打开原生 AR 页', async () => {
    const { page, wx } = harness('index');
    const urls = [];
    wx.navigateTo = options => { urls.push(options.url); options.complete(); };
    assert.deepEqual(Array.from(page.data.tools, tool => tool.key), ['clean', 'supply', 'checkin', 'ar', 'video']);
    await page.onTool({ currentTarget: { dataset: { key: 'ar' } } });
    assert.deepEqual(urls, ['/pages/nest-ar/nest-ar']);
});

test('测试领养共用显示与跳转条件，普通小窝保留领取说明', () => {
    const code = 'HZ-HY-18679';
    const preview = harness('index', { DEVICE_SANDBOX_TEST: true, DEBUG_DEMO_BIRD_CODE: code });
    const urls = [];
    preview.wx.navigateTo = options => { urls.push(options.url); options.complete(); };
    assert.equal(preview.page.data.testBirdAdoption, true);
    preview.page.goAdopt();
    assert.deepEqual(urls, ['/pages/adopt/adopt?code=' + code]);
    const ordinary = harness('index', { DEBUG_DEMO_BIRD_CODE: code });
    assert.equal(ordinary.page.data.testBirdAdoption, false);
    ordinary.page.goAdopt();
    assert.equal(ordinary.page.data.sheet.type, 'claim');
});

test('独立候选同时区分两只测试鸟，桂花鸟不会使用小黄莺立绘、动画或合照贴图', async () => {
    const oriole = 'HZ-HY-9000000000000000101';
    const osmanthus = 'HZ-GH-9000000000000000102';
    const config = { DEVICE_SANDBOX_TEST: true, DEBUG_DEMO_BIRD_CODE: oriole, DEBUG_OSMANTHUS_BIRD_CODE: osmanthus };
    const { page, state, wx, Q } = harness('index', config);
    state.pets[1].birdCode = osmanthus;
    state.pets[1].nickname = '桂花鸟';
    const urls = [];
    wx.navigateTo = opts => { urls.push(opts.url); opts.complete(); };
    page.onLoad();
    page.onShow();
    try {
        assert.deepEqual(Array.from(page.data.testAdoptions, item => [item.name, item.owned]), [['西湖小黄莺', true], ['桂花鸟', true]]);
        page.goAdopt({ currentTarget: { dataset: { key: 'osmanthus' } } });
        page.goAdopt({ currentTarget: { dataset: { key: 'oriole' } } });
        assert.deepEqual(urls, ['/pages/adopt/adopt?code=' + osmanthus, '/pages/adopt/adopt?code=' + oriole]);
        await page.onSelectPet({ currentTarget: { dataset: { id: Q } } });
        state.birdCode = osmanthus;
        page.refresh();
        assert.equal(page.data.displayName, '桂花鸟');
        assert.equal(page.data.packagedIdle, false);
        assert.match(page.data.birdArt, /osmanthus-preview/);
        assert.match(page.data.avatar, /osmanthus-preview/);
        page.showFeedback('桂花鸟开心了');
        assert.match(page.data.birdArt, /osmanthus-preview/);
    } finally {
        page.onHide();
        page.onUnload();
    }

    const photo = harness('photo', config);
    photo.state.pets[0].birdCode = osmanthus;
    photo.page.onLoad();
    photo.page.loadBirds();
    assert.equal(photo.page.data.birds.find(item => item.id === photo.P).osmanthus, true);
    assert.equal(photo.page.data.selectedCount, 0);
    photo.page.onBirdTap({ currentTarget: { dataset: { id: photo.P } } });
    assert.equal(photo.page.data.selectedCount, 0);
    photo.page.onUnload();
});

test('小窝拖动只移动当前小鸟，轻点仍走原摸摸入口', () => {
    const { page, state, Q } = harness('index');
    page.onLoad();
    page.onShow();
    try {
        let taps = 0;
        page.requireBird = () => true;
        page.pet = () => { taps++; };
        const touch = (x, y, identifier = 1) => ({
            touches: [{ clientX: x, clientY: y, identifier }],
        });

        page.onBirdTouchStart(touch(150, 400));
        page.onBirdTouchMove(touch(154, 400));
        page.onBirdTouchEnd();
        page.onPet();
        assert.equal(taps, 1);
        assert.equal(page.data.birdOffsetX, 0);

        page.onBirdTouchStart(touch(150, 400));
        page.onBirdTouchMove(touch(180, 380, 2));
        assert.equal(page.data.birdOffsetX, 0);
        page.onBirdTouchMove(touch(180, 380));
        assert.deepEqual([page.data.birdOffsetX, page.data.birdOffsetY], [60, -40]);
        page.onBirdTouchMove(touch(900, -900));
        assert.equal(page.data.birdOffsetX, 180);
        assert.ok(page.data.birdOffsetY >= page.data.layout.birdDragMinY);
        page.onBirdTouchEnd();
        page.onPet();
        assert.equal(taps, 1);

        page.onBirdTouchStart(touch(200, 390));
        page.onBirdTouchMove({ touches: [...touch(190, 380).touches, ...touch(195, 375, 2).touches] });
        page.onPet();
        assert.equal(taps, 1);
        page.onBirdTouchStart(touch(200, 390));
        page.onBirdTouchEnd();
        page.onPet();
        assert.equal(taps, 2);

        state.petId = Q;
        page.refresh();
        assert.deepEqual([page.data.birdOffsetX, page.data.birdOffsetY], [0, 0]);
    } finally {
        page.onHide();
        page.onUnload();
    }
});
