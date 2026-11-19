'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const entry = require('../miniprogram/utils/entry');
const config = require('../miniprogram/utils/config');
const store = require('../miniprogram/utils/store');
const guest = require('../miniprogram/utils/guest-store');
const collectionMedia = require('../miniprogram/utils/collection-media');

const code = 'SZ-TEST-1';
const nextCode = 'HZ-TEST-2';
const publicBird = { id: 'synthetic-test-bird', active: true, birdCode: code, name: '苏州小鸟', typeName: '城市伙伴', cityName: '苏州', cityCode: 'suzhou', skinName: '金色' };

function fixture(t, realMode = true) {
    const originalConfig = { API_BASE: config.API_BASE, USE_LOCAL_FIXTURE: config.USE_LOCAL_FIXTURE };
    Object.assign(config, { API_BASE: realMode ? 'https://fixture.invalid/' : '', USE_LOCAL_FIXTURE: !realMode });
    const storage = new Map();
    const requests = [];
    const nav = [];
    const notices = [];
    global.getCurrentPages = () => [{ route: 'pages/adopt/adopt' }];
    global.wx = {
        request(options) {
            const request = { options, aborted: false };
            requests.push(request);
            return { abort() { request.aborted = true; } };
        },
        getStorageSync(key) { return structuredClone(storage.get(key)); },
        setStorageSync(key, value) { storage.set(key, structuredClone(value)); },
        removeStorageSync(key) { storage.delete(key); },
        getWindowInfo() { return { windowWidth: 390, windowHeight: 844, screenHeight: 844, statusBarHeight: 47, safeArea: { bottom: 810 } }; },
        showToast(options) { notices.push(options.title); },
        navigateTo(options) { nav.push(options); },
        switchTab(options) { nav.push(options); },
        reLaunch(options) { nav.push(options); },
    };
    t.after(() => Object.assign(config, originalConfig));
    return { storage, requests, nav, notices };
}

function instance(path, globalName) {
    let definition;
    global[globalName] = (value) => { definition = value; };
    delete require.cache[require.resolve(path)];
    require(path);
    return Object.assign({}, definition, definition.methods, {
        data: structuredClone(definition.data || {}),
        setData(patch) { Object.assign(this.data, patch); },
    });
}

function adoptPage(t, options) {
    const page = instance('../miniprogram/pages/adopt/adopt', 'Page');
    page.onLoad(options);
    t.after(() => page.onUnload());
    return page;
}

test('领养入口解析接受当前直达、编码二维码及 scene，拒绝重复、伪编码和全局场景值', () => {
    assert.equal(entry.readBirdCode({ code }), code);
    assert.equal(entry.readBirdCode({ birdCode: code }), code);
    assert.equal(entry.readBirdCode({ bird: code }), code);
    assert.equal(entry.readBirdCode({ scene: encodeURIComponent('code=' + code) }), code);
    assert.equal(entry.readBirdCode({ scene: encodeURIComponent('birdCode=' + code) }), code);
    assert.equal(entry.readBirdCode({ scene: code }), code);
    assert.equal(entry.readBirdCode({ scene: code + '#batch' }), '');
    assert.equal(entry.readBirdCode({ scene: encodeURIComponent(code + '#batch') }), '');
    assert.equal(entry.readBirdCode({ scene: 'birdCode=' + code + '#batch' }), '');
    assert.equal(entry.readBirdCode({ scene: 'birdCode=' + code + '&x=?' }), code);
    assert.equal(entry.readBirdCode({ scene: 'birdCode=' + code + '&bird=' + nextCode }), '');
    assert.equal(entry.readBirdCode({ q: encodeURIComponent('https://fixture.invalid/register.html?birdCode=' + code + '#test') }), code);
    assert.equal(entry.readBirdCode({ q: 'https://fixture.invalid/register.html?birdCode=SZ%2DTEST%2D1' }), code);
    assert.equal(entry.readBirdCode({ q: 'https://fixture.invalid/register.html?code=SZ%2DTEST%2D1' }), code);
    assert.equal(entry.readBirdCode({ q: 'code=' + code + '&code=' + nextCode }), '');
    assert.equal(entry.readBirdCode({ q: 'bird=' + code }), code);
    assert.equal(entry.readBirdCode({ q: 'unrelated' }), '');
    assert.equal(entry.readBirdCode({ q: 'https://fixture.invalid/register.html?birdCode=' + code + '&bird=' + nextCode }), '');
    assert.equal(entry.readBirdCode({ birdCode: code, bird: nextCode }), '');
    assert.equal(entry.readBirdCode({ code, birdCode: nextCode }), '');
    assert.equal(entry.readBirdCodeFromLaunch({ query: { code } }), code);
    assert.equal(entry.readBirdCode({ birdCode: 'Z'.repeat(65) }), '');
    assert.equal(entry.readBirdCodeFromLaunch({ scene: 1047 }), '');
    assert.equal(entry.buildAdoptUrl(code), '/pages/adopt/adopt?code=SZ-TEST-1');
    assert.equal(entry.isManufacturingCode('HZ-TEST-9223372036854775808'), false);
});

test('启动带码兼容跳转只执行一次，后续热启动可带新码', async (t) => {
    const { nav } = fixture(t);
    wx.getAppBaseInfo = () => ({ SDKVersion: '3.5.4' });
    wx.onAppRoute = () => { assert.fail('早期基础库的路由事件没有稳定的参数格式'); };
    const app = instance('../miniprogram/app', 'App');
    const first = { path: 'pages/index/index', query: { code } };
    app.onLaunch(first);
    app.onShow(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(nav.map((item) => item.url), [entry.buildAdoptUrl(code)]);
    app.onShow({ path: 'pages/index/index', query: { birdCode: nextCode } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(nav.map((item) => item.url), [entry.buildAdoptUrl(code), entry.buildAdoptUrl(nextCode)]);
    app.onShow({ path: entry.ADOPT_PAGE, query: { birdCode: code } });
    app.onShow({ path: 'pages/index/index', query: {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(nav.length, 2);
});

test('微信热扫码重载可再次转发同码，普通恢复和旧回调不会重复跳转', async (t) => {
    const { nav } = fixture(t);
    let onRoute;
    wx.getAppBaseInfo = () => ({ SDKVersion: '3.5.5' });
    wx.onAppRoute = (listener) => { onRoute = listener; };
    const app = instance('../miniprogram/app', 'App');
    const first = { path: 'pages/index/index', query: { birdCode: code }, scene: 1047 };
    app.onLaunch(first);
    app.onShow(first);
    onRoute({ ...first, openType: 'appLaunch' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(nav.length, 1);

    app.onShow(first);
    onRoute({ ...first, openType: 'reLaunch' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(nav.length, 1);

    app.onShow(first);
    onRoute({ ...first, openType: 'autoReLaunch' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(nav.map((item) => item.url), [entry.buildAdoptUrl(code), entry.buildAdoptUrl(code)]);
    nav[0].fail();
    assert.equal(nav.length, 2);

    onRoute({ ...first, path: entry.ADOPT_PAGE, openType: 'autoReLaunch' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(nav.length, 2);
});

test('有原生路由事件时，先后到达的热启动 onShow 与路由仅转发一次', async (t) => {
    const { nav } = fixture(t);
    let onRoute;
    wx.getAppBaseInfo = () => ({ SDKVersion: '3.18.0' });
    wx.onAppRoute = (listener) => { onRoute = listener; };
    const app = instance('../miniprogram/app', 'App');
    app.onLaunch({ path: 'pages/index/index', query: {} });
    const first = { path: 'pages/index/index', query: { birdCode: code }, scene: 1047 };
    const second = { ...first, query: { code: nextCode } };

    app.onShow(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(nav.length, 0);
    onRoute({ ...first, openType: 'autoReLaunch' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(nav.map((item) => item.url), [entry.buildAdoptUrl(code)]);

    onRoute({ ...second, openType: 'autoReLaunch' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    app.onShow(second);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(nav.map((item) => item.url), [entry.buildAdoptUrl(code), entry.buildAdoptUrl(nextCode)]);
});

test('领养入口两次跳转都失败时可重试原编码，取消不触发重复跳转', async (t) => {
    const { nav } = fixture(t);
    const dialogs = [];
    wx.showModal = (options) => dialogs.push(options);
    const app = instance('../miniprogram/app', 'App');
    const first = { path: 'pages/index/index', query: { birdCode: code } };
    app.onLaunch(first);
    app.onShow(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(nav.length, 1);

    nav[0].fail();
    assert.equal(nav[1].url, entry.buildAdoptUrl(code));
    nav[1].fail();
    assert.equal(dialogs.length, 1);
    assert.equal(dialogs[0].confirmText, '重试');
    dialogs[0].success({ confirm: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(nav.length, 3);
    assert.equal(nav[2].url, entry.buildAdoptUrl(code));

    nav[2].fail();
    nav[3].fail();
    assert.equal(dialogs.length, 2);
    dialogs[1].success({ cancel: true });
    app.onShow(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(nav.length, 4);
});

test('新扫码和直达领养使之前的跳转错误和重试失效', async (t) => {
    const { nav } = fixture(t);
    const dialogs = [];
    let onRoute;
    wx.getAppBaseInfo = () => ({ SDKVersion: '3.18.0' });
    wx.onAppRoute = (listener) => { onRoute = listener; };
    wx.showModal = (options) => dialogs.push(options);
    const app = instance('../miniprogram/app', 'App');
    const first = { path: 'pages/index/index', query: { birdCode: code } };
    const second = { ...first, query: { birdCode: nextCode }, openType: 'autoReLaunch' };
    app.onLaunch(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    nav[0].fail();
    nav[1].fail();

    onRoute(second);
    dialogs[0].success({ confirm: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(nav.map((item) => item.url), [entry.buildAdoptUrl(code), entry.buildAdoptUrl(code), entry.buildAdoptUrl(nextCode)]);

    nav[2].fail();
    onRoute({ ...second, path: entry.ADOPT_PAGE });
    nav[3].fail();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(dialogs.length, 1);
    assert.equal(nav.length, 4);
});

test('正式领养用已核验实体资料，保存一次且城市解锁与返回依据真实资料', (t) => {
    const { requests, storage } = fixture(t);
    const page = adoptPage(t, { code });
    assert.equal(page.data.buttonDisabled, true);
    page.handleAdopt();
    assert.equal(storage.has(guest.STORAGE_KEY), false);
    assert.equal(requests[0].options.url, 'https://fixture.invalid/api/birds/by-code/' + code);
    assert.equal(requests[0].options.method, 'GET');
    requests[0].options.success({ statusCode: 200, data: publicBird });
    assert.equal(page.data.birdName, publicBird.name);
    assert.equal(page.data.cityText, publicBird.cityName);
    assert.equal(page.data.skinText, publicBird.skinName);
    assert.equal(page.data.buttonDisabled, false);
    page.handleInput({ detail: { value: '   ' } });
    page.handleAdopt();
    assert.match(page.data.validation, /1–6/);
    assert.equal(storage.has(guest.STORAGE_KEY), false);
    page.handleInput({ detail: { value: '一二三四五🐦尾' } });
    assert.equal(page.data.nicknameInput, '一二三四五🐦');
    page.handleAdopt();
    const first = structuredClone(storage.get(guest.STORAGE_KEY));
    page.handleAdopt();
    assert.deepEqual(storage.get(guest.STORAGE_KEY), first);
    assert.equal(store.adopt(code, '另一名称').data.replayed, true);
    assert.equal(store.adopt(nextCode, '第二只').error, 'BIRD_ALREADY_PRESENT');
    assert.equal(store.snapshot().data.snapshot.cityCode, 'suzhou');
    assert.deepEqual(storage.get(guest.STORAGE_KEY), first);
    const city = instance('../miniprogram/pages/city/city', 'Page');
    city.onLoad();
    city.onShow();
    city.handleFilter({ currentTarget: { dataset: { filter: 'unlocked' } } });
    assert.deepEqual(city.data.visibleCities.map((item) => item.code), ['suzhou']);
    city.handleCity({ currentTarget: { dataset: { id: 'sz' } } });
    assert.equal(city.data.sheetHasBird, true);
    assert.equal(city.data.sheetBirdName, '一二三四五🐦');
    city.onHide();
    assert.equal(city.data.sheetVisible, false);
    const revisit = adoptPage(t, { birdCode: code });
    requests[1].options.success({ statusCode: 200, data: publicBird });
    assert.equal(revisit.data.alreadyMine, true);
    assert.equal(revisit.data.nicknameInput, '一二三四五🐦');
});

test('领养页随机取名与手动输入各自更新昵称，直到确认才保存', (t) => {
    const { requests, storage } = fixture(t);
    const page = adoptPage(t, { birdCode: code });
    page.handleRandom();
    assert.equal(page.data.nicknameInput, '');

    requests[0].options.success({ statusCode: 200, data: publicBird });
    page.handleRandom();
    const firstSuggestion = page.data.nicknameInput;
    assert.ok(firstSuggestion && firstSuggestion !== publicBird.name);
    page.handleInput({ detail: { value: '自己取名' } });
    assert.equal(page.data.nicknameInput, '自己取名');
    page.handleRandom();
    assert.ok(![firstSuggestion, '自己取名'].includes(page.data.nicknameInput));
    assert.equal(storage.has(guest.STORAGE_KEY), false);

    page.handleAdopt();
    const nickname = store.snapshot().data.snapshot.nickname;
    const revisit = adoptPage(t, { birdCode: code });
    requests[1].options.success({ statusCode: 200, data: publicBird });
    revisit.handleRandom();
    assert.equal(revisit.data.nicknameInput, nickname);
    assert.equal(store.snapshot().data.snapshot.nickname, nickname);
});

test('重复扫码领养时回小窝防连点，跳转失败可重试且保留原小鸟', (t) => {
    const { requests, storage, nav, notices } = fixture(t);
    assert.equal(store.adopt(code, '已经领养', Date.now(), 'suzhou').error, null);
    const before = storage.get(guest.STORAGE_KEY);
    for (const scannedCode of [code, nextCode]) {
        const page = adoptPage(t, { birdCode: scannedCode });
        requests.at(-1).options.success({ statusCode: 200, data: { ...publicBird, birdCode: scannedCode } });
        assert.equal(page.data.alreadyMine, scannedCode === code);
        assert.equal(page.data.alreadyHaveBird, scannedCode !== code);
        assert.equal(page.data.buttonText, '回小窝，看看它');

        const previous = nav.length;
        page.handleAdopt();
        page.handleAdopt();
        assert.equal(nav.length, previous + 1);
        assert.equal(nav.at(-1).url, '/pages/index/index');
        nav.at(-1).fail();
        assert.equal(notices.at(-1), '小窝暂时打不开，请重试');
        assert.equal(page.data.buttonText, '回小窝，看看它');
        page.handleAdopt();
        assert.equal(nav.length, previous + 2);
    }
    assert.deepEqual(storage.get(guest.STORAGE_KEY), before);
});

test('领养页返回上一页失败可重试，没有上一页时回小窝', (t) => {
    const { nav, notices } = fixture(t);
    let pageStack = [{ route: 'pages/index/index' }, { route: entry.ADOPT_PAGE }];
    global.getCurrentPages = () => pageStack;
    wx.navigateBack = (options) => nav.push(options);
    const page = adoptPage(t, {});
    assert.equal(page.data.showBackLink, true);

    page.handleBack();
    page.handleBack();
    assert.equal(nav.length, 1);
    assert.equal(nav[0].delta, 1);
    nav[0].fail();
    assert.equal(notices.at(-1), '暂时无法返回，请重试');

    pageStack = [{ route: entry.ADOPT_PAGE }];
    page.handleBack();
    assert.equal(nav.length, 2);
    assert.equal(nav[1].url, '/pages/index/index');
    page.onUnload();
    nav[1].fail();
    assert.equal(notices.length, 1);
});

test('直达领养页只在出错时提供回小窝入口，临时错误可原地重试', (t) => {
    const { requests, storage, nav, notices } = fixture(t);
    const view = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/adopt/adopt.wxml'), 'utf8');
    assert.match(view, /<view wx:if="\{\{showBackLink \|\| \(notice && noticeKind === 'error'\)\}\}" class="back-link" bindtap="handleBack">\s*<text>\{\{showBackLink \? '返回上一页' : '回小窝'\}\}<\/text>/);
    const canLeave = ({ data }) => data.showBackLink || !!(data.notice && data.noticeKind === 'error');
    const missing = adoptPage(t, {});
    const invalid = adoptPage(t, { birdCode: 'INVALID' });
    assert.equal(canLeave(missing), true);
    assert.equal(canLeave(invalid), true);
    assert.equal(requests.length, 0);

    for (const statusCode of [404, 410, 503]) {
        const page = adoptPage(t, { birdCode: code });
        assert.equal(canLeave(page), false);
        requests.at(-1).options.success({ statusCode });
        assert.equal(canLeave(page), true);
        assert.equal(page.data.retryVisible, statusCode === 503);
        assert.equal(page.data.buttonDisabled, true);
        if (statusCode === 503) {
            page.handleRetry();
            assert.equal(canLeave(page), false);
            requests.at(-1).options.success({ statusCode: 200, data: publicBird });
            assert.equal(page.data.ready, true);
            assert.equal(canLeave(page), false);
        }
    }

    missing.handleBack();
    missing.handleBack();
    assert.deepEqual(nav.map(({ url }) => url), ['/pages/index/index']);
    nav[0].fail();
    assert.equal(notices.at(-1), '小窝暂时打不开，请重试');
    missing.handleBack();
    assert.equal(nav.length, 2);
    assert.equal(storage.has(guest.STORAGE_KEY), false);
});

test('新领养已经保存但回小窝失败时可重试，且不重新领取', async (t) => {
    const { requests, storage, nav, notices } = fixture(t);
    const page = adoptPage(t, { birdCode: code });
    requests[0].options.success({ statusCode: 200, data: publicBird });
    page.handleAdopt();
    const saved = storage.get(guest.STORAGE_KEY);
    assert.ok(saved);
    page.handleBack();
    assert.equal(nav.length, 0);

    await new Promise((resolve) => setTimeout(resolve, 650));
    assert.equal(nav.length, 1);
    nav[0].fail();
    assert.equal(notices.at(-1), '小窝暂时打不开，请重试');
    assert.equal(page.data.submitting, false);
    assert.equal(page.data.alreadyMine, true);
    assert.equal(page.data.buttonText, '回小窝，看看它');
    page.handleAdopt();
    assert.equal(nav.length, 2);
    assert.deepEqual(storage.get(guest.STORAGE_KEY), saved);
});

test('正式领养缺参、未建档、停用、错码、超时和过期响应都不能创建本机小鸟', (t) => {
    const { requests, storage } = fixture(t);
    global.getApp = () => ({ globalData: { entryBirdCode: code } });
    const page = adoptPage(t, {});
    assert.equal(page.data.buttonDisabled, true);
    assert.equal(requests.length, 0);
    page.entryOptions = { birdCode: code };
    for (const response of [
        { statusCode: 404 },
        { statusCode: 410 },
        { statusCode: 200, data: { ...publicBird, active: false } },
        { statusCode: 200, data: { ...publicBird, birdCode: nextCode } },
        { statusCode: 503 },
    ]) {
        page.load();
        requests.at(-1).options.success(response);
        assert.equal(page.data.buttonDisabled, true);
        page.handleAdopt();
    }
    page.handleRetry();
    requests.at(-1).options.fail({ errMsg: 'request:fail timeout' });
    assert.equal(page.data.retryVisible, true);
    page.handleRetry();
    const stale = requests.at(-1);
    page.entryOptions = { birdCode: nextCode };
    page.load();
    assert.equal(stale.aborted, true);
    stale.options.success({ statusCode: 200, data: publicBird });
    assert.equal(page.data.birdCode, nextCode);
    assert.equal(page.data.buttonDisabled, true);
    assert.equal(storage.has(guest.STORAGE_KEY), false);
});

test('城市与我的钱包按当前本机记录展示，底栏切换失败不误高亮', (t) => {
    const { storage, nav, notices } = fixture(t, false);
    const at = Date.parse('2026-11-10T16:05:06Z');
    store.adopt(code, '西湖小鸟', at);
    store.pet(at + 1);
    assert.ok(storage.has(guest.STORAGE_KEY));
    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    profile.onLoad();
    profile.onShow();
    assert.equal(profile.data.ledger[0].dayText, '2026-11-11 00:05:06');
    assert.equal(profile.data.wechatLoginReady, false);
    assert.equal(profile.data.wechatLoginStatus, '微信登录尚未开放');
    const tab = instance('../miniprogram/custom-tab-bar/index', 'Component');
    tab.data.selected = 3;
    const event = { currentTarget: { dataset: { path: '/pages/city/city', index: '1' } } };
    tab.switchTab(event);
    tab.switchTab(event);
    assert.equal(nav.length, 1);
    nav[0].fail();
    nav[0].complete();
    assert.equal(notices.at(-1), '切换失败，请重试');
    assert.equal(tab.data.selected, 3);
    tab.switchTab(event);
    assert.equal(nav.length, 2);
    global.getCurrentPages = () => [{ route: 'pages/city/city' }];
    tab.pageLifetimes.show.call(tab);
    assert.equal(tab.data.selected, 1);
});

test('城市与我的快捷跳转防连点，失败后保留小鸟详情供重试', (t) => {
    const { nav, notices } = fixture(t, false);
    assert.equal(store.adopt(code, '苏州小鸟', Date.now(), 'suzhou').error, null);
    const city = instance('../miniprogram/pages/city/city', 'Page');
    city.onShow();
    city.handleCity({ currentTarget: { dataset: { id: 'sz' } } });
    assert.equal(city.data.sheetHasBird, true);

    city.handleVisitBird();
    city.handleVisitBird();
    assert.deepEqual(nav.map(item => item.url), ['/pages/index/index']);
    assert.equal(city.data.sheetVisible, true);
    nav[0].fail();
    nav[0].complete();
    assert.equal(city.data.sheetVisible, true);
    assert.equal(notices.at(-1), '小窝暂时打不开，请重试');
    city.handleVisitBird();
    assert.equal(nav.length, 2);
    city.onHide();
    nav[1].complete();
    assert.equal(city.data.sheetVisible, false);

    city.onShow();
    city.handleProfile();
    city.handleProfile();
    assert.equal(nav.length, 3);
    assert.equal(nav[2].url, '/pages/profile/profile');
    nav[2].fail();
    nav[2].complete();
    assert.equal(notices.at(-1), '我的页面暂时打不开，请重试');
    city.handleProfile();
    assert.equal(nav.length, 4);
    city.onHide();
    nav[3].fail();
    nav[3].complete();
    assert.equal(notices.length, 2);

    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    profile.onShow();
    profile.onBirds();
    profile.goHome();
    profile.goHome();
    assert.equal(nav.length, 5);
    assert.equal(nav[4].url, '/pages/index/index');
    assert.equal(profile.data.birdsVisible, true);
    nav[4].fail();
    nav[4].complete();
    assert.equal(profile.data.birdsVisible, true);
    assert.equal(notices.at(-1), '小窝暂时打不开，请重试');
    profile.goHome();
    assert.equal(nav.length, 6);
    profile.onHide();
    nav[5].complete();
    assert.equal(profile.data.birdsVisible, false);
});

test('城市当前小鸟直达我的小鸟，切换失败或普通进入我的不自动展开', (t) => {
    const { nav, notices, storage } = fixture(t, false);
    assert.equal(store.adopt(code, '苏州小鸟', Date.now(), 'suzhou').error, null);
    const saved = structuredClone(storage.get(guest.STORAGE_KEY));
    const city = instance('../miniprogram/pages/city/city', 'Page');
    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    city.onShow();

    city.handleProfile();
    assert.equal(nav[0].url, '/pages/profile/profile');
    city.onHide();
    profile.onShow();
    nav[0].complete();
    assert.equal(profile.data.birdsVisible, true);
    assert.equal(profile.data.displayName, '苏州小鸟');

    profile.onHide();
    profile.onShow();
    assert.equal(profile.data.birdsVisible, false);
    profile.onHide();
    city.onShow();

    city.handleProfile();
    nav[1].fail();
    nav[1].complete();
    profile.onShow();
    assert.equal(profile.data.birdsVisible, false);
    profile.onHide();

    const switchTab = wx.switchTab;
    wx.switchTab = () => { throw Error('切换暂时不可用'); };
    city.handleProfile();
    wx.switchTab = switchTab;
    assert.equal(notices.at(-1), '我的页面暂时打不开，请重试');
    profile.onShow();
    assert.equal(profile.data.birdsVisible, false);
    profile.onHide();

    city.handleProfile();
    assert.equal(nav.length, 3);
    nav[2].complete();
    profile.onShow();
    assert.equal(profile.data.birdsVisible, true);
    assert.deepEqual(storage.get(guest.STORAGE_KEY), saved);
});

test('我的衣橱阻止重复跳转，失败提示后可重试', (t) => {
    const { nav, notices } = fixture(t, false);
    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    profile.onWallet();
    profile.onWardrobe();
    profile.onWardrobe();
    assert.equal(profile.data.walletVisible, false);
    assert.deepEqual(nav.map((item) => item.url), ['/pages/wardrobe/wardrobe']);

    nav[0].fail();
    nav[0].complete();
    assert.deepEqual(notices, ['衣橱暂时打不开，请重试']);

    profile.onWardrobe();
    profile.onWardrobe();
    assert.equal(nav.length, 2);
    assert.equal(nav[1].url, '/pages/wardrobe/wardrobe');
    nav[1].complete();
    profile.onWardrobe();
    assert.equal(nav.length, 3);
    assert.equal(notices.length, 1);
});

for (const [route, label, loadArtwork, imageField, asset, dataField, expected] of [
    ['city', '城市插图', 'loadCityArtwork', 'citySprite', '/media/collection/cities.webp', 'birdName', '苏州小鸟'],
    ['profile', '我的背景', 'loadProfileArtwork', 'profileBackground', '/media/collection/profile.webp', 'displayName', '苏州小鸟'],
]) {
    test(`${label}读取失败后原地重试，切回也可重试且不重复加载`, async t => {
        fixture(t, false);
        assert.equal(store.adopt(code, '苏州小鸟', Date.now(), 'suzhou').error, null);
        const attempts = [];
        t.mock.method(collectionMedia, 'load', () => new Promise((resolve, reject) => { attempts.push({ resolve, reject }); }));
        const modulePath = `../miniprogram/pages/${route}/${route}`;
        const page = instance(modulePath, 'Page');
        page.onLoad();
        page.onShow();
        const initial = page[loadArtwork]();
        assert.equal(page[loadArtwork](), initial);
        await Promise.resolve();
        assert.equal(attempts.length, 1);
        attempts[0].resolve(null);
        await initial;
        assert.equal(page.data[imageField], '');
        assert.equal(page.data.artworkFailed, true);
        assert.equal(page.data.artworkLoading, false);
        assert.equal(page.data[dataField], expected);
        if (route === 'city') assert.equal(page.data.visibleCities.length, 6);

        const retry = page[loadArtwork]();
        assert.equal(page.data.artworkLoading, true);
        assert.equal(page[loadArtwork](), retry);
        await Promise.resolve();
        assert.equal(attempts.length, 2);
        attempts[1].resolve({ [imageField]: asset });
        await retry;
        assert.equal(page.data[imageField], asset);
        assert.equal(page.data.artworkFailed, false);
        page.onShow();
        await Promise.resolve();
        assert.equal(attempts.length, 2);

        const next = instance(modulePath, 'Page');
        next.onLoad();
        next.onShow();
        const failed = next[loadArtwork]();
        await Promise.resolve();
        attempts[2].reject(new Error('图片读取失败'));
        await failed;
        next.onHide();
        next.onShow();
        const reopened = next[loadArtwork]();
        await Promise.resolve();
        assert.equal(attempts.length, 4);
        next.onUnload();
        attempts[3].resolve({ [imageField]: asset });
        await reopened;
        assert.equal(next.data[imageField], '');

        const markup = fs.readFileSync(path.join(__dirname, `../miniprogram/pages/${route}/${route}.wxml`), 'utf8');
        assert.ok(markup.includes(`wx:if="{{artworkFailed}}" class="artwork-retry" disabled="{{artworkLoading}}" bindtap="${loadArtwork}"`));
    });
}

test('停留在城市页跨北京时间零点，再打开钱包读取当日额度和最新流水', (t) => {
    const { storage } = fixture(t, false);
    let now = Date.parse('2026-11-10T15:59:58Z');
    const clock = Date.now;
    Date.now = () => now;
    t.after(() => { Date.now = clock; });
    assert.equal(store.adopt(code, '苏州小鸟', now, 'suzhou').error, null);
    assert.equal(store.pet(now).error, null);
    const city = instance('../miniprogram/pages/city/city', 'Page');
    city.onLoad();
    city.onShow();
    city.handlePoints();
    assert.equal(city.data.todayPoints, 1);
    assert.equal(city.data.points, 1);
    city.handleCloseSheet();

    now = Date.parse('2026-11-10T16:00:01Z');
    const before = structuredClone(storage.get(guest.STORAGE_KEY));
    city.handlePointsRules();
    assert.equal(city.data.sheetVisible, true);
    assert.equal(city.data.walletRulesOpen, true);
    assert.equal(city.data.todayPoints, 0);
    assert.equal(city.data.points, 1);
    assert.equal(city.data.ledger[0].day, '2026-11-10');
    assert.deepEqual(storage.get(guest.STORAGE_KEY), before);
    city.handleCloseSheet();

    now += 30000;
    assert.equal(store.pet(now).error, null);
    city.handlePoints();
    assert.equal(city.data.points, 2);
    assert.equal(city.data.todayPoints, 1);
    assert.equal(city.data.ledger[0].day, '2026-11-11');
});

test('城市钱包读不到本机记录时提示重试，恢复后可正常打开', (t) => {
    const { notices } = fixture(t, false);
    assert.equal(store.adopt(code, '苏州小鸟', Date.now(), 'suzhou').error, null);
    assert.equal(store.pet().error, null);
    const city = instance('../miniprogram/pages/city/city', 'Page');
    city.onLoad();
    city.onShow();
    assert.equal(city.data.points, 1);

    const read = wx.getStorageSync;
    wx.getStorageSync = () => { throw Error('读本机缓存失败'); };
    city.handlePoints();
    assert.equal(city.data.sheetVisible, false);
    assert.equal(notices.at(-1), '本机数据暂时无法读写，请重试');
    assert.equal(city.data.points, 1);
    wx.getStorageSync = read;

    city.handlePoints();
    assert.equal(city.data.sheetVisible, true);
    assert.equal(city.data.points, 1);
    assert.equal(city.data.ledger.length, 1);
});

test('城市冷启动与切页读取失败不会误报未领养，重试保留筛选并恢复详情', (t) => {
    const { storage, notices } = fixture(t, false);
    assert.equal(store.adopt(code, '苏州小鸟', Date.now(), 'suzhou').error, null);
    const saved = structuredClone(storage.get(guest.STORAGE_KEY));
    const read = wx.getStorageSync;
    let failRead = true;
    wx.getStorageSync = (key) => {
        if (failRead && key === guest.STORAGE_KEY) throw Error('读本机缓存失败');
        return read(key);
    };
    const city = instance('../miniprogram/pages/city/city', 'Page');
    const suzhou = { currentTarget: { dataset: { id: 'sz' } } };
    const unlocked = { currentTarget: { dataset: { filter: 'unlocked' } } };

    city.onShow();
    assert.equal(city.data.storageUnavailable, true);
    assert.equal(city.data.showEmpty, false);
    city.handleFilter(unlocked);
    failRead = false;
    city.retryCityData();
    assert.equal(city.data.storageUnavailable, false);
    assert.equal(city.data.filter, 'unlocked');
    assert.equal(city.data.progressText, '1 / 6');
    assert.deepEqual(city.data.visibleCities.map(item => item.id), ['sz']);

    failRead = true;
    city.onHide();
    city.onShow();
    assert.equal(city.data.storageUnavailable, true);
    assert.equal(city.data.progressText, '1 / 6');
    assert.deepEqual(city.data.visibleCities.map(item => item.id), ['sz']);
    city.handleCity(suzhou);
    assert.equal(city.data.sheetVisible, false);
    assert.equal(notices.at(-1), '本机数据暂时无法读写，请重试');

    failRead = false;
    city.handleCity(suzhou);
    assert.equal(city.data.storageUnavailable, false);
    assert.equal(city.data.filter, 'unlocked');
    assert.equal(city.data.sheetHasBird, true);
    assert.equal(city.data.sheetBirdName, '苏州小鸟');
    assert.deepEqual(storage.get(guest.STORAGE_KEY), saved);

    city.handleCloseSheet();
    assert.equal(store.reset().error, null);
    city.retryCityData();
    assert.equal(city.data.storageUnavailable, false);
    assert.equal(city.data.showEmpty, true);
    assert.equal(city.data.progressText, '0 / 6');
});

test('我的小鸟读取失败时保留已知记录，恢复后点原入口读取真实资料', (t) => {
    const { storage, notices } = fixture(t, false);
    assert.equal(store.adopt(code, '苏州小鸟', Date.now(), 'suzhou').error, null);
    const saved = structuredClone(storage.get(guest.STORAGE_KEY));
    const read = wx.getStorageSync;
    let failRead = true;
    wx.getStorageSync = (key) => {
        if (failRead && key === guest.STORAGE_KEY) throw Error('读本机缓存失败');
        return read(key);
    };
    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    profile.onShow();
    assert.equal(profile.data.storageUnavailable, true);
    profile.onBirds();
    assert.equal(profile.data.birdsVisible, false);
    assert.equal(notices.at(-1), '本机数据暂时无法读写，请重试');

    failRead = false;
    profile.onBirds();
    assert.equal(profile.data.storageUnavailable, false);
    assert.equal(profile.data.birdsVisible, true);
    assert.equal(profile.data.hasBird, true);
    assert.equal(profile.data.birdCode, code);
    profile.closeSheets();

    failRead = true;
    profile.onBirds();
    assert.equal(profile.data.birdsVisible, false);
    assert.equal(profile.data.storageUnavailable, true);
    assert.equal(profile.data.displayName, '苏州小鸟');
    assert.deepEqual(storage.get(guest.STORAGE_KEY), saved);

    failRead = false;
    assert.equal(store.reset().error, null);
    profile.onBirds();
    assert.equal(profile.data.storageUnavailable, false);
    assert.equal(profile.data.birdsVisible, true);
    assert.equal(profile.data.hasBird, false);
});

test('停留在我的页面跨北京时间零点，再打开钱包读取当日额度和最新流水', (t) => {
    const { storage } = fixture(t, false);
    let now = Date.parse('2026-11-10T15:59:58Z');
    const clock = Date.now;
    Date.now = () => now;
    t.after(() => { Date.now = clock; });
    assert.equal(store.adopt(code, '苏州小鸟', now, 'suzhou').error, null);
    assert.equal(store.pet(now).error, null);
    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    profile.onLoad();
    profile.onShow();
    assert.equal(profile.data.todayPoints, 1);

    now = Date.parse('2026-11-10T16:00:01Z');
    const before = structuredClone(storage.get(guest.STORAGE_KEY));
    profile.onWallet();
    assert.equal(profile.data.walletVisible, true);
    assert.equal(profile.data.todayPoints, 0);
    assert.equal(profile.data.points, 1);
    assert.equal(profile.data.ledger[0].dayText, '2026-11-10 23:59:58');
    assert.deepEqual(storage.get(guest.STORAGE_KEY), before);
    profile.closeSheets();

    now += 30000;
    assert.equal(store.pet(now).error, null);
    profile.onWallet();
    assert.equal(profile.data.points, 2);
    assert.equal(profile.data.todayPoints, 1);
    assert.equal(profile.data.ledger[0].dayText, '2026-11-11 00:00:31');
});

test('我的钱包读不到本机记录时提示重试，恢复后可正常打开', (t) => {
    const { notices } = fixture(t, false);
    assert.equal(store.adopt(code, '苏州小鸟', Date.now(), 'suzhou').error, null);
    assert.equal(store.pet().error, null);
    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    profile.onLoad();
    profile.onShow();
    assert.equal(profile.data.points, 1);

    const read = wx.getStorageSync;
    wx.getStorageSync = () => { throw Error('读本机缓存失败'); };
    profile.onWallet();
    assert.equal(profile.data.walletVisible, false);
    assert.equal(notices.at(-1), '本机数据暂时无法读写，请重试');
    assert.equal(profile.data.points, 1);
    wx.getStorageSync = read;

    profile.onWallet();
    assert.equal(profile.data.walletVisible, true);
    assert.equal(profile.data.points, 1);
    assert.equal(profile.data.ledger.length, 1);
});

test('小窝打开钱包时刷新跨日额度，并保留本机余额与流水', (t) => {
    const { storage } = fixture(t, false);
    let now = Date.parse('2026-11-10T15:59:58Z');
    const clock = Date.now;
    Date.now = () => now;
    t.after(() => { Date.now = clock; });
    assert.equal(store.adopt(code, '苏州小鸟', now, 'suzhou').error, null);
    assert.equal(store.pet(now).error, null);
    const nest = instance('../miniprogram/pages/index/index', 'Page');
    nest.refresh();
    assert.equal(nest.data.todayPoints, 1);

    now += 3000;
    const before = structuredClone(storage.get(guest.STORAGE_KEY));
    nest.onWallet();
    assert.equal(nest.data.sheet.type, 'wallet');
    assert.equal(nest.data.todayPoints, 0);
    assert.equal(nest.data.points, 1);
    assert.equal(nest.data.ledger.length, 1);
    assert.deepEqual(storage.get(guest.STORAGE_KEY), before);
});

test('小窝钱包读不到本机记录时提示重试，恢复后区分真实余额和空钱包', (t) => {
    fixture(t, false);
    assert.equal(store.adopt(code, '苏州小鸟', Date.now(), 'suzhou').error, null);
    assert.equal(store.pet().error, null);
    const nest = instance('../miniprogram/pages/index/index', 'Page');
    t.after(() => nest.clearTimers());

    const read = wx.getStorageSync;
    wx.getStorageSync = () => { throw Error('读本机缓存失败'); };
    nest.onWallet();
    assert.equal(nest.data.sheet, null);
    assert.equal(nest.data.storageUnavailable, true);
    assert.equal(nest.data.toast, '本机数据暂时无法读写，请重试');
    wx.getStorageSync = read;

    nest.onWallet();
    assert.equal(nest.data.sheet.type, 'wallet');
    assert.equal(nest.data.storageUnavailable, false);
    assert.equal(nest.data.points, 1);
    assert.equal(nest.data.ledger.length, 1);
    nest.closeSheet();

    assert.equal(store.reset().error, null);
    nest.onWallet();
    assert.equal(nest.data.sheet.type, 'wallet');
    assert.equal(nest.data.points, 0);
    assert.equal(nest.data.ledger.length, 0);
});

test('短窗口调整时城市钱包留在胶囊下方和底栏上方，已打开内容仍保留', (t) => {
    fixture(t, false);
    let width = 402;
    let height = 874;
    wx.getWindowInfo = () => ({ windowWidth: width, windowHeight: height, statusBarHeight: 47 });
    wx.getMenuButtonBoundingClientRect = () => ({ top: 58, height: 32 });
    const city = instance('../miniprogram/pages/city/city', 'Page');
    city.onLoad();
    city.handlePoints();
    city.handleToggleRules();

    for (const [w, h] of [[390, 360], [600, 400], [320, 568], [402, 874]]) {
        width = w;
        height = h;
        city.onResize();
        const scale = width / 750;
        const { sheetTop, sheetMaxHeight, walletRulesOpen, sheetKind } = city.data;
        assert.ok(sheetTop * scale > 90, `${width}×${height} 胶囊避让`);
        assert.ok(sheetMaxHeight > 0, `${width}×${height} 保留可滚动内容`);
        assert.ok((sheetTop + sheetMaxHeight) * scale <= height - 149 * scale, `${width}×${height} 底栏避让`);
        assert.equal(sheetKind, 'wallet');
        assert.equal(walletRulesOpen, true);
    }
});

test('城市页仅在滚离顶部后遮住状态栏背景，滚动期间只更新一次', (t) => {
    fixture(t, false);
    const city = instance('../miniprogram/pages/city/city', 'Page');
    city.onLoad();
    assert.equal(city.data.statusBarHeight, 47);
    assert.equal(city.data.statusBarCovered, false);

    const changes = [];
    city.setData = function (patch) {
        Object.assign(this.data, patch);
        if ('statusBarCovered' in patch) changes.push(patch.statusBarCovered);
    };
    for (const scrollTop of [0, -10, 0, 1, 50, 240]) city.onPageScroll({ scrollTop });
    assert.deepEqual(changes, [true]);
    wx.getWindowInfo = () => ({ windowWidth: 390, windowHeight: 360, statusBarHeight: 0 });
    city.onResize();
    assert.equal(city.data.statusBarHeight, 0);
    assert.equal(city.data.statusBarCovered, true);
    for (const scrollTop of [0, -10, 0]) city.onPageScroll({ scrollTop });
    assert.deepEqual(changes, [true, false]);

    const directory = path.join(__dirname, '../miniprogram/pages/city');
    const wxml = fs.readFileSync(path.join(directory, 'city.wxml'), 'utf8');
    const wxss = fs.readFileSync(path.join(directory, 'city.wxss'), 'utf8');
    assert.match(wxml, /wx:if="\{\{statusBarCovered && statusBarHeight > 0\}\}" class="status-bar-cover" style="height:\{\{statusBarHeight\}\}px"/);
    assert.match(wxss, /\.status-bar-cover \{[^}]*position:\s*fixed;[^}]*pointer-events:\s*none;/);
});

test('我的三个弹层保留滚动容器，旋转后继续避让胶囊和底栏', (t) => {
    fixture(t, false);
    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    profile.onLoad();
    profile.onWallet();
    profile.toggleRules();
    wx.getWindowInfo = () => ({ windowWidth: 390, windowHeight: 360, statusBarHeight: 47 });
    wx.getMenuButtonBoundingClientRect = () => ({ top: 58, height: 32 });
    profile.onResize();
    assert.ok(profile.data.topInset * 390 / 750 > 90);
    assert.equal(profile.data.walletVisible, true);
    assert.equal(profile.data.rulesOpen, true);
    profile.onReset();
    assert.equal(profile.data.walletVisible, false);
    assert.equal(profile.data.resetVisible, true);
    profile.closeSheets();
    assert.equal(profile.data.resetVisible, false);
    profile.onBirds();
    assert.equal(profile.data.birdsVisible, true);

    const directory = path.join(__dirname, '../miniprogram/pages/profile');
    const wxml = fs.readFileSync(path.join(directory, 'profile.wxml'), 'utf8');
    const wxss = fs.readFileSync(path.join(directory, 'profile.wxss'), 'utf8');
    assert.equal([...wxml.matchAll(/<view class="overlay"[^>]+padding-top:\{\{topInset\}\}rpx/g)].length, 3);
    assert.equal([...wxml.matchAll(/<view class="overlay-backdrop" bindtap="closeSheets" catchtouchmove="noop"/g)].length, 3);
    assert.equal([...wxml.matchAll(/<scroll-view class="sheet-body[^\"]*" scroll-y="true"/g)].length, 3);
    assert.match(wxss, /\.overlay \{[^}]*padding-bottom:\s*149rpx/);
    assert.match(wxss, /\.sheet \{[^}]*max-height:\s*100%/);
    assert.match(wxss, /\.sheet-close \{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px/);
});

test('我的微信登录和退出只在配置后按需执行，失败可重试且退出保留小鸟', async (t) => {
    const { requests, notices } = fixture(t);
    let logins = 0;
    global.wx.login = (callbacks) => { logins += 1; callbacks.success({ code: 'synthetic-login-code' }); };
    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    store.adopt(code, '离线伙伴');
    profile.onLoad();
    profile.onShow();
    assert.equal(profile.data.wechatLoginReady, true);
    assert.equal(profile.data.showDemoAdopt, false);
    assert.equal(requests.length, 0);
    const first = profile.onWechatAccount();
    await profile.onWechatAccount();
    assert.equal(profile.data.wechatLoginBusy, true);
    assert.equal(logins, 1);
    assert.match(requests[0].options.url, /\/api\/auth\/wx-login$/);
    requests[0].options.fail({ errMsg: 'network error' });
    await first;
    assert.equal(profile.data.wechatSignedIn, false);
    assert.equal(notices.at(-1), '微信登录失败，请重试');

    const unavailable = profile.onWechatAccount();
    await Promise.resolve();
    requests[1].options.success({ statusCode: 503, data: { code: 'WX_LOGIN_UNCONFIGURED' } });
    await unavailable;
    assert.equal(profile.data.wechatLoginStatus, '微信登录暂时不可用');
    assert.equal(profile.data.wechatSignedIn, false);
    assert.equal(notices.at(-1), '微信登录暂时不可用');

    const retry = profile.onWechatAccount();
    await Promise.resolve();
    requests[2].options.success({ statusCode: 200, data: { token: 'synthetic-token' } });
    await retry;
    assert.equal(profile.data.wechatSignedIn, true);
    assert.equal(notices.at(-1), '微信登录成功');
    const logout = profile.onWechatAccount();
    assert.match(requests[3].options.url, /\/api\/auth\/logout$/);
    requests[3].options.success({ statusCode: 204 });
    await logout;
    assert.equal(profile.data.wechatSignedIn, false);
    assert.equal(notices.at(-1), '退出微信登录成功');
    assert.equal(store.snapshot().data.snapshot.nickname, '离线伙伴');
});

test('其他页面改变微信登录状态后，旧按钮只同步状态，不执行相反操作', async (t) => {
    const { requests, notices } = fixture(t);
    let logins = 0;
    wx.login = (callbacks) => { logins += 1; callbacks.success({ code: 'synthetic-login-code' }); };
    const login = store.loginWithWechat();
    await Promise.resolve();
    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    profile.onLoad();
    profile.onShow();
    assert.equal(profile.data.wechatSignedIn, false);
    requests[0].options.success({ statusCode: 200, data: { token: 'synthetic-token' } });
    assert.equal((await login).error, null);

    const oldLoginButton = profile.onWechatAccount();
    assert.equal(requests.length, 1);
    await oldLoginButton;
    assert.equal(profile.data.wechatSignedIn, true);
    assert.equal(store.getToken(), 'synthetic-token');

    const logout = store.logoutWechat();
    requests[1].options.success({ statusCode: 204 });
    assert.equal((await logout).error, null);
    const oldLogoutButton = profile.onWechatAccount();
    assert.equal(logins, 1);
    await oldLogoutButton;
    assert.equal(profile.data.wechatSignedIn, false);
    assert.equal(store.getToken(), '');
    assert.equal(requests.length, 2);
    assert.equal(notices.length, 0);
});

test('我的进入前台验证微信会话，过期后由用户点击重新登录', async (t) => {
    const { storage, requests } = fixture(t);
    let logins = 0;
    wx.login = (callbacks) => { logins += 1; callbacks.success({ code: 'synthetic-login-code' }); };
    store.adopt(code, '离线伙伴');
    storage.set('auth_token', 'saved-token');
    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    profile.onLoad();
    profile.onShow();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.method, 'GET');
    assert.match(requests[0].options.url, /\/api\/auth\/session$/);
    assert.equal(requests[0].options.header.Authorization, 'Bearer saved-token');
    requests[0].options.success({ statusCode: 200, data: { username: 'fixture-user', expiresAt: '2099-01-01T00:00:00Z' } });
    await new Promise(setImmediate);
    assert.equal(profile.data.wechatSignedIn, true);
    assert.equal(profile.data.wechatLoginStatus, '微信已登录');

    profile.onHide();
    profile.onShow();
    requests[1].options.success({ statusCode: 401, data: { code: 'LOGIN_REQUIRED' } });
    await new Promise(setImmediate);
    assert.equal(storage.has('auth_token'), false);
    assert.equal(profile.data.wechatSignedIn, false);
    assert.equal(profile.data.wechatLoginStatus, '登录已过期，请重新登录');
    assert.equal(logins, 0);
    assert.equal(requests.length, 2);

    const login = profile.onWechatAccount();
    await new Promise(setImmediate);
    assert.equal(logins, 1);
    assert.match(requests[2].options.url, /\/api\/auth\/wx-login$/);
    requests[2].options.success({ statusCode: 200, data: { token: 'renewed-token' } });
    await login;
    assert.equal(storage.get('auth_token'), 'renewed-token');
    assert.equal(profile.data.wechatSignedIn, true);
    assert.equal(store.snapshot().data.snapshot.nickname, '离线伙伴');
});

test('无法验证微信会话时保留原登录记录并允许下次前台重试', async (t) => {
    const { storage, requests } = fixture(t);
    storage.set('auth_token', 'saved-token');
    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    profile.onLoad();
    const failures = [
        { statusCode: 404 },
        { statusCode: 502 },
        { statusCode: 401, data: { code: 'UNEXPECTED_RESPONSE' } },
        { statusCode: 200, data: {} },
        null,
    ];
    for (const [index, response] of failures.entries()) {
        profile.onShow();
        assert.equal(requests.length, index + 1);
        if (response) requests[index].options.success(response);
        else requests[index].options.fail({ errMsg: 'request:fail timeout' });
        await new Promise(setImmediate);
        assert.equal(storage.get('auth_token'), 'saved-token');
        assert.equal(profile.data.wechatSignedIn, true);
        assert.equal(profile.data.wechatLoginStatus, '暂时无法验证登录状态');
        profile.onHide();
    }
});

test('旧微信会话的迟到过期响应不删除新令牌或覆盖前台状态', async (t) => {
    const { storage, requests } = fixture(t);
    storage.set('auth_token', 'older-token');
    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    profile.onLoad();
    profile.onShow();
    profile.onHide();
    storage.set('auth_token', 'newer-token');
    profile.onShow();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].options.header.Authorization, 'Bearer newer-token');
    requests[1].options.success({ statusCode: 200, data: { username: 'fixture-user', expiresAt: '2099-01-01T00:00:00Z' } });
    await new Promise(setImmediate);
    requests[0].options.success({ statusCode: 401, data: { code: 'LOGIN_REQUIRED' } });
    await new Promise(setImmediate);
    assert.equal(storage.get('auth_token'), 'newer-token');
    assert.equal(profile.data.wechatSignedIn, true);
    assert.equal(profile.data.wechatLoginStatus, '微信已登录');
});

test('微信退出前后遇到令牌读取异常会提示重试并保留原记录', async (t) => {
    const { storage, requests, notices } = fixture(t);
    const token = 'synthetic-token';
    storage.set('auth_token', token);
    const profile = instance('../miniprogram/pages/profile/profile', 'Page');
    profile.onLoad();
    profile.onShow();
    assert.equal(profile.data.wechatSignedIn, true);
    requests[0].options.success({ statusCode: 200, data: { username: 'fixture-user', expiresAt: '2099-01-01T00:00:00Z' } });
    await new Promise(setImmediate);

    const read = wx.getStorageSync;
    let failTokenRead = true;
    let failNextTokenRead = false;
    wx.getStorageSync = (key) => {
        if (key === 'auth_token' && (failTokenRead || failNextTokenRead)) {
            failNextTokenRead = false;
            throw Error('cache temporarily unavailable');
        }
        return read(key);
    };

    await profile.onWechatAccount();
    assert.equal(notices.at(-1), '退出微信登录失败，请重试');
    assert.equal(requests.length, 1);
    assert.equal(storage.get('auth_token'), token);
    assert.equal(profile.data.wechatSignedIn, true);
    assert.equal(profile.data.wechatLoginStatus, '本机登录记录暂时无法读取');
    await profile.onWechatAccount();
    assert.equal(requests.length, 1);
    failTokenRead = false;

    const logout = profile.onWechatAccount();
    assert.equal(requests[1].options.header.Authorization, 'Bearer ' + token);
    failNextTokenRead = true;
    requests[1].options.success({ statusCode: 204 });
    await logout;
    assert.equal(notices.at(-1), '退出微信登录失败，请重试');
    assert.equal(storage.get('auth_token'), token);
    assert.equal(profile.data.wechatSignedIn, true);

    const retry = profile.onWechatAccount();
    requests[2].options.success({ statusCode: 401 });
    await retry;
    assert.equal(notices.at(-1), '退出微信登录成功');
    assert.equal(storage.has('auth_token'), false);
    assert.equal(profile.data.wechatSignedIn, false);
});

test('微信退出请求和本机删除失败均可重试，迟到回执不清除已替换的令牌', async (t) => {
    const { storage, requests } = fixture(t);
    const token = 'synthetic-token';
    storage.set('auth_token', token);

    const failedRequest = store.logoutWechat();
    requests[0].options.fail({ errMsg: 'network error' });
    assert.deepEqual(await failedRequest, { error: 'LOGOUT_FAILED' });
    assert.equal(storage.get('auth_token'), token);

    const remove = wx.removeStorageSync;
    wx.removeStorageSync = () => { throw Error('cache temporarily unavailable'); };
    const failedRemoval = store.logoutWechat();
    requests[1].options.success({ statusCode: 204 });
    assert.deepEqual(await failedRemoval, { error: 'STORAGE_UNAVAILABLE' });
    assert.equal(storage.get('auth_token'), token);
    wx.removeStorageSync = remove;

    const retry = store.logoutWechat();
    requests[2].options.success({ statusCode: 401 });
    assert.deepEqual(await retry, { error: null });
    assert.equal(storage.has('auth_token'), false);

    storage.set('auth_token', token);
    const delayed = store.logoutWechat();
    storage.set('auth_token', 'replacement-token');
    requests[3].options.success({ statusCode: 204 });
    assert.deepEqual(await delayed, { error: null });
    assert.equal(storage.get('auth_token'), 'replacement-token');
});
