'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const config = require('../miniprogram/utils/config');
const store = require('../miniprogram/utils/store');
const supply = require('../miniprogram/utils/step-supply');

const originalConfig = { ...config };
const birdCode = 'HZ-HY-9000000000000000001';
const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const id = 'ab'.repeat(16);
const receipt = { id: 'receipt_0000000000001', date, birdCode, food: 1, water: 1 };

test.after(() => { Object.assign(config, originalConfig); delete global.wx; });

function fixture() {
    Object.assign(config, { API_BASE: 'https://example.invalid', USE_LOCAL_FIXTURE: false, ENABLE_WERUN_SUPPLIES: true });
    const calls = [];
    const memory = new Map([['auth_token', 'cached-token']]);
    global.wx = {
        getStorageSync(key) { return memory.get(key); },
        setStorageSync(key, value) { memory.set(key, structuredClone(value)); },
        removeStorageSync(key) { memory.delete(key); },
        getRandomValues(options) {
            assert.equal(options.length, 16);
            options.success({ randomValues: Uint8Array.from({ length: 16 }, () => 0xab).buffer });
        },
        checkSession(options) { options.success(); },
        requirePrivacyAuthorize(options) { options.success(); },
        getSetting(options) { options.success({ authSetting: { 'scope.werun': true } }); },
        authorize(options) { options.success(); },
        getWeRunData(options) { options.success({ encryptedData: 'sealed', iv: 'test-iv' }); },
        login(options) { options.success({ code: 'wx-code' }); },
        request(options) {
            calls.push(options);
            options.fail();
        },
    };
    assert.equal(supply.cachedPreview(), null);
    return { calls, memory };
}

function reading(steps, previousReceipt = null, alreadyClaimed = !!previousReceipt) {
    return { date, steps, requiredSteps: 3000, claimed: alreadyClaimed, claimable: !alreadyClaimed && steps >= 3000, receipt: previousReceipt };
}

function assertCounts(food, water) {
    const { snapshot } = store.snapshot().data;
    assert.equal(snapshot.food, food);
    assert.equal(snapshot.water, water);
    assert.equal(snapshot.points, 0);
}

let nestDefinition;
function openNestSupply() {
    if (!nestDefinition) {
        global.Page = definition => { nestDefinition = definition; };
        try { require('../miniprogram/pages/index/index'); }
        finally { delete global.Page; }
    }
    const page = {
        ...nestDefinition,
        data: structuredClone(nestDefinition.data),
        setData(update) { Object.assign(this.data, update); },
    };
    page.refresh();
    page.onOpenSupply();
    return page;
}

test('关开关、未领养和缺少同日预览时不会请求微信或服务器', async () => {
    const { calls } = fixture();
    wx.getRandomValues = () => assert.fail('不应创建安装标识');
    config.ENABLE_WERUN_SUPPLIES = false;
    assert.equal((await supply.preview()).error, 'NO_ENDPOINT');
    config.ENABLE_WERUN_SUPPLIES = true;
    assert.equal((await supply.preview()).error, 'NO_BIRD');
    store.adopt(birdCode, '小鸟');
    assert.equal((await supply.claim()).error, 'SUPPLY_DAY_CHANGED');
    assert.equal((await supply.claim(date)).error, 'WX_SESSION_CHANGED');
    assert.equal(calls.length, 0);
    assertCounts(3, 3);
});

test('同日重开可读上次步数，不会再调用微信接口或网络', async () => {
    const { calls, memory } = fixture();
    store.adopt(birdCode, '小鸟');
    const storageKeys = [...memory.keys()];
    wx.request = options => {
        calls.push(options);
        options.success({ statusCode: 200, data: { ...reading(2340), privateField: '忽略' } });
    };
    assert.equal((await supply.preview()).error, null);

    const unexpected = () => assert.fail('读取缓存不应触发微信授权、登录或请求');
    Object.assign(wx, { checkSession: unexpected, requirePrivacyAuthorize: unexpected,
        getSetting: unexpected, getWeRunData: unexpected, login: unexpected, request: unexpected });
    assert.deepEqual(supply.cachedPreview(), {
        date, steps: 2340, requiredSteps: 3000, claimed: false, claimable: false,
        restoreAvailable: false, localClaimed: false, cached: true,
    });
    assert.equal(calls.length, 1);
    assert.deepEqual([...memory.keys()], storageKeys);
    assert.equal(JSON.stringify([...memory.values()]).includes('"steps":2340'), false);
});

test('没有步数预览时仍展示今日已入库，跨日只撤下提示', t => {
    let now = Date.parse(date + 'T15:59:59Z');
    t.mock.method(Date, 'now', () => now);
    const { calls } = fixture();
    store.adopt(birdCode, '小鸟');
    assert.equal(store.applySupplyReceipt(receipt).error, null);
    const page = openNestSupply();
    assert.equal(page.data.stepSupplyStatus, null);
    assert.equal(page.data.supplyClaimed, true);
    assertCounts(4, 4);
    now += 1000;
    page.refresh();
    assert.equal(page.data.supplyClaimed, false);
    assert.equal(page.data.stepSupplyStatus, null);
    assertCounts(4, 4);
    assert.equal(calls.length, 0);
});

test('补给预览发现小鸟未建档或已停用时，清除旧的可领取状态', async () => {
    const { calls } = fixture();
    store.adopt(birdCode, '小鸟');
    const page = openNestSupply();
    let response;
    wx.request = options => {
        calls.push(options);
        options.success(response);
    };

    for (const [statusCode, code, hint] of [
        [404, 'BIRD_NOT_FOUND', '暂未找到这只小鸟的领养记录。'],
        [410, 'BIRD_INACTIVE', '这只小鸟的领养资料已停用。'],
    ]) {
        response = { statusCode: 200, data: reading(3100) };
        await page.onReadSupplySteps();
        assert.equal(page.data.stepSupplyStatus.canClaim, true);

        response = { statusCode, data: { code } };
        await page.onReadSupplySteps();
        assert.equal(page.data.stepSupplyStatus, null);
        assert.equal(page.data.stepSupplyNotice, hint);
        assert.equal(supply.cachedPreview(), null);
        const beforeClaim = calls.length;
        await page.onClaimStepSupply();
        assert.equal(calls.length, beforeClaim);
    }
    assertCounts(3, 3);
});

test('读取期间重开补给面板，微信运动拒绝后仍可打开设置并重新读取', async () => {
    const { calls } = fixture();
    store.adopt(birdCode, '小鸟');
    const page = openNestSupply();
    const authorizedSettings = wx.getSetting;
    const waitingForSettings = new Promise(resolve => { wx.getSetting = resolve; });
    wx.authorize = options => options.fail();

    const pending = page.onReadSupplySteps();
    const settings = await Promise.race([
        waitingForSettings,
        pending.then(() => assert.fail('应先等待微信运动权限结果')),
    ]);
    page.closeSheet();
    page.onOpenSupply();
    assert.equal(page.data.stepSupplyBusy, 'read');
    settings.success({ authSetting: {} });
    await pending;
    assert.equal(page.data.stepSupplyNeedsSetting, true);
    assert.equal(page.data.stepSupplyNotice, '微信运动权限未开启，开启后可重新读取步数。');
    assert.equal(page.data.stepSupplyBusy, '');
    assert.equal(page.data.stepSupplyStatus, null);
    assert.equal(calls.length, 0);

    wx.openSetting = options => {
        wx.getSetting = authorizedSettings;
        options.success({ authSetting: { 'scope.werun': true } });
    };
    page.onOpenSupplySettings();
    assert.equal(page.data.stepSupplyNeedsSetting, false);
    assert.equal(page.data.stepSupplyNotice, '权限已开启，请重新读取微信步数。');
    wx.request = options => {
        calls.push(options);
        options.success({ statusCode: 200, data: reading(3100) });
    };
    await page.onReadSupplySteps();
    assert.equal(page.data.stepSupplyStatus.canClaim, true);
    assert.equal(calls.length, 1);
});

test('补给从微信设置返回保留面板，先收到回调或先回前台都能继续', async () => {
    for (const callbackBeforeShow of [true, false]) {
        const { calls } = fixture();
        store.adopt(birdCode, '小鸟');
        const page = openNestSupply();
        page.statusTimer = null;
        const authorizedSettings = wx.getSetting;
        wx.getSetting = options => options.success({ authSetting: {} });
        wx.authorize = options => options.fail();
        await page.onReadSupplySteps();
        assert.equal(page.data.stepSupplyNeedsSetting, true);

        let settings;
        wx.openSetting = options => { settings = options; };
        page.onOpenSupplySettings();
        page.onHide();
        try {
            assert.equal(page.data.sheet.type, 'supply');
            if (!callbackBeforeShow) page.onShow();
            settings.success({ authSetting: { 'scope.werun': true } });
            if (callbackBeforeShow) page.onShow();
            assert.equal(page.data.sheet.type, 'supply');
            assert.equal(page.data.stepSupplyBusy, '');
            assert.equal(page.data.stepSupplyNeedsSetting, false);
            assert.equal(page.data.stepSupplyStatus, null);
            assert.equal(page.data.stepSupplyNotice, '权限已开启，请重新读取微信步数。');
            assert.equal(calls.length, 0);
            assertCounts(3, 3);

            wx.getSetting = authorizedSettings;
            wx.request = options => {
                calls.push(options);
                options.success({ statusCode: 200, data: reading(3100) });
            };
            await page.onReadSupplySteps();
            assert.equal(page.data.stepSupplyStatus.canClaim, true);
            assert.equal(calls.length, 1);
            assertCounts(3, 3);
        } finally {
            page.onHide();
            page.onUnload();
        }
    }
});

test('补给设置失败或权限未开启可以重试，已关闭面板不会被迟到回调打开', async () => {
    const { calls } = fixture();
    store.adopt(birdCode, '小鸟');
    const page = openNestSupply();
    page.statusTimer = null;
    wx.getSetting = options => options.success({ authSetting: {} });
    wx.authorize = options => options.fail();
    await page.onReadSupplySteps();
    let settings;
    wx.openSetting = options => { settings = options; };
    try {
        page.onOpenSupplySettings();
        page.onHide();
        settings.success({ authSetting: { 'scope.werun': false } });
        page.onShow();
        assert.equal(page.data.sheet.type, 'supply');
        assert.equal(page.data.stepSupplyBusy, '');
        assert.equal(page.data.stepSupplyNeedsSetting, true);

        page.onOpenSupplySettings();
        page.onHide();
        settings.fail();
        page.onShow();
        assert.equal(page.data.sheet.type, 'supply');
        assert.equal(page.data.stepSupplyBusy, '');
        assert.equal(page.data.stepSupplyNotice, '未能打开设置，请从右上角菜单进入。');

        page.onOpenSupplySettings();
        page.closeSheet();
        page.onHide();
        page.onShow();
        settings.success({ authSetting: { 'scope.werun': true } });
        assert.equal(page.data.sheet, null);
        assert.equal(page.stepSupplyRequest, null);
        assert.equal(calls.length, 0);

        page.onOpenSupply();
        page.onHide();
        assert.equal(page.data.sheet, null);
    } finally {
        page.onHide();
        page.onUnload();
    }
});

test('设置入口不可用时，同一面板可主动重试微信运动授权', async () => {
    const { calls } = fixture();
    store.adopt(birdCode, '小鸟');
    const page = openNestSupply();
    const authorizedSettings = wx.getSetting;
    wx.getSetting = options => options.success({ authSetting: {} });
    wx.authorize = options => options.fail();
    await page.onReadSupplySteps();
    assert.equal(page.data.stepSupplyNeedsSetting, true);
    page.onOpenSupplySettings();
    assert.match(page.data.stepSupplyNotice, /右上角菜单/);
    await page.onClaimStepSupply();
    await page.onReadSupplySteps();
    assert.equal(page.data.stepSupplyNeedsSetting, true);
    assert.match(page.data.stepSupplyNotice, /微信运动权限未开启/);
    assert.equal(calls.length, 0);

    wx.getSetting = authorizedSettings;
    wx.request = options => {
        calls.push(options);
        options.success({ statusCode: 200, data: reading(3100) });
    };
    await page.onReadSupplySteps();
    assert.equal(page.data.stepSupplyNeedsSetting, false);
    assert.equal(page.data.stepSupplyStatus.canClaim, true);
    assert.equal(page.data.stepSupplyBusy, '');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/supplies\/preview$/);
});

test('服务端停用补给后清除旧资格，恢复后可主动读取', async () => {
    const { calls } = fixture();
    store.adopt(birdCode, '小鸟');
    const page = openNestSupply();
    let response;
    wx.request = options => {
        calls.push(options);
        options.success(response);
    };

    for (const action of ['onReadSupplySteps', 'onClaimStepSupply']) {
        response = { statusCode: 200, data: reading(3100) };
        await page.onReadSupplySteps();
        assert.equal(page.data.stepSupplyStatus.canClaim, true);

        response = { statusCode: 503, data: { code: 'SUPPLY_DISABLED' } };
        await page[action]();
        assert.equal(page.data.stepSupplyStatus, null);
        assert.equal(page.data.stepSupplyNotice, '微信步数补给暂未开放。');
        assert.equal(supply.cachedPreview(), null);

        const beforeReopen = calls.length;
        page.onOpenSupply();
        assert.equal(page.data.stepSupplyEnabled, true);
        assert.equal(page.data.stepSupplyStatus, null);
        await page.onClaimStepSupply();
        assert.equal(calls.length, beforeReopen);
    }

    response = { statusCode: 200, data: reading(3100) };
    await page.onReadSupplySteps();
    assert.equal(page.data.stepSupplyStatus.canClaim, true);
    assertCounts(3, 3);
});

test('隐私接口未配置时不提交步数，清除旧资格，配置恢复后可以领取', async () => {
    const { calls } = fixture();
    store.adopt(birdCode, '小鸟');
    const page = openNestSupply();
    wx.request = options => {
        calls.push(options);
        const result = options.url.endsWith('/claim') ? reading(3100, receipt) : reading(3100);
        options.success({ statusCode: 200, data: result });
    };

    const authorizedSettings = wx.getSetting;
    for (const [method, action, error] of [
        ['requirePrivacyAuthorize', 'onReadSupplySteps', { errno: 112 }],
        ['authorize', 'onClaimStepSupply', { errMsg: 'authorize:fail scope is not declared' }],
        ['getWeRunData', 'onClaimStepSupply', { errMsg: 'getWeRunData:fail privacy api banned' }],
    ]) {
        await page.onReadSupplySteps();
        assert.equal(page.data.stepSupplyStatus.canClaim, true);
        assert.equal(supply.cachedPreview().claimable, true);
        const beforeFailure = calls.length;
        const nativeMethod = wx[method];
        if (method === 'authorize') wx.getSetting = options => options.success({ authSetting: {} });
        wx[method] = options => options.fail(error);

        await page[action]();
        assert.equal(page.data.stepSupplyStatus, null);
        assert.equal(page.data.stepSupplyNotice, '小程序暂时无法读取微信步数，请联系运营人员。');
        assert.equal(page.data.stepSupplyNeedsSetting, false);
        assert.equal(supply.cachedPreview(), null);
        page.onOpenSupply();
        assert.equal(page.data.stepSupplyStatus, null);
        await page.onClaimStepSupply();
        assert.equal(calls.length, beforeFailure);
        assertCounts(3, 3);

        wx[method] = nativeMethod;
        wx.getSetting = authorizedSettings;
    }

    await page.onReadSupplySteps();
    assert.equal(page.data.stepSupplyStatus.canClaim, true);
    await page.onClaimStepSupply();
    assert.equal(page.data.stepSupplyStatus.claimed, true);
    assert.deepEqual(calls.map(call => call.url.split('/').pop()), ['preview', 'preview', 'preview', 'preview', 'claim']);
    assertCounts(4, 4);
});

test('更换登录令牌或退出后无法恢复上个会话的步数', async () => {
    const { calls, memory } = fixture();
    store.adopt(birdCode, '小鸟');
    wx.request = options => {
        calls.push(options);
        if (options.url.endsWith('/logout')) options.success({ statusCode: 204 });
        else options.success({ statusCode: 200, data: reading(3100) });
    };
    assert.equal((await supply.preview()).error, null);
    assert.equal(supply.cachedPreview().steps, 3100);

    memory.set('auth_token', 'other-token');
    assert.equal(supply.cachedPreview(), null);
    memory.set('auth_token', 'cached-token');
    assert.equal(supply.cachedPreview(), null);

    assert.equal((await supply.preview()).error, null);
    assert.equal(supply.cachedPreview().steps, 3100);
    assert.equal((await store.logoutWechat()).error, null);
    assert.equal(supply.cachedPreview(), null);
    assert.deepEqual(calls.map(call => call.url.split('/').pop()), ['preview', 'preview', 'logout']);
});

test('退出时尚未生成安装标识的旧请求不会恢复登录，主动读取仍可重试', async t => {
    const { calls } = fixture();
    assert.equal(store.adopt(birdCode, '小鸟').error, null);
    const nativeLogin = t.mock.method(wx, 'login');
    const nativeRead = t.mock.method(wx, 'getWeRunData');
    const getRandomValues = wx.getRandomValues;
    let randomStarted;
    const started = new Promise(resolve => { randomStarted = resolve; });
    wx.getRandomValues = options => { randomStarted(options); };
    wx.request = options => {
        calls.push(options);
        if (options.url.endsWith('/logout')) options.success({ statusCode: 204 });
        else if (options.url.endsWith('/wx-login')) options.success({ statusCode: 200, data: { token: 'refreshed-token' } });
        else options.success({ statusCode: 200, data: reading(3100) });
    };

    const pending = supply.preview();
    const oldRandom = await Promise.race([
        started,
        pending.then(() => assert.fail('首次读取没有请求安装标识')),
    ]);
    assert.equal((await store.logoutWechat()).error, null);
    assert.equal(store.getToken(), '');
    getRandomValues(oldRandom);
    assert.equal((await pending).error, 'WX_SESSION_CHANGED');
    assert.equal(store.getToken(), '');
    assert.equal(store.supplyInstallationId().data.id, '');
    assert.equal(nativeLogin.mock.callCount(), 0);
    assert.equal(nativeRead.mock.callCount(), 0);
    assert.deepEqual(calls.map(call => call.url.split('/').pop()), ['logout']);

    wx.getRandomValues = getRandomValues;
    assert.equal((await supply.preview()).data.steps, 3100);
    assert.equal(nativeLogin.mock.callCount(), 1);
    assert.equal(nativeRead.mock.callCount(), 1);
    assert.deepEqual(calls.map(call => call.url.split('/').pop()), ['logout', 'wx-login', 'preview']);
});

test('清除后重新领养同一只鸟，旧请求不能生成新安装标识或读取步数', async t => {
    const { calls } = fixture();
    const adoptedAt = Date.now();
    assert.equal(store.adopt(birdCode, '小鸟', adoptedAt).error, null);
    const nativeRead = t.mock.method(wx, 'getWeRunData');
    const getRandomValues = wx.getRandomValues;
    let randomStarted;
    const started = new Promise(resolve => { randomStarted = resolve; });
    wx.getRandomValues = options => { randomStarted(options); };
    wx.request = options => {
        calls.push(options);
        options.success({ statusCode: 200, data: reading(3100) });
    };

    const pending = supply.preview();
    const oldRandom = await Promise.race([
        started,
        pending.then(() => assert.fail('首次读取没有请求安装标识')),
    ]);
    assert.equal(store.reset().error, null);
    assert.equal(store.adopt(birdCode, '小鸟', adoptedAt).error, null);
    getRandomValues(oldRandom);
    assert.equal((await pending).error, 'SUPPLY_CONTEXT_CHANGED');
    assert.equal(store.supplyInstallationId().data.id, '');
    assert.equal(nativeRead.mock.callCount(), 0);
    assert.equal(calls.length, 0);

    wx.getRandomValues = getRandomValues;
    assert.equal((await supply.preview()).data.steps, 3100);
    assert.equal(store.supplyInstallationId().data.id, id);
    assert.equal(nativeRead.mock.callCount(), 1);
    assert.deepEqual(calls.map(call => call.url.split('/').pop()), ['preview']);
});

for (const [label, endpoint, read, response, contextError] of [
    ['补给预览', 'preview', () => supply.preview(), reading(3100), 'SUPPLY_CONTEXT_CHANGED'],
    ['补给领取', 'claim', () => supply.claim(date), reading(3100, receipt), 'SUPPLY_CONTEXT_CHANGED'],
    ['步数兑换', 'redeem', () => store.redeemSteps(), { date, steps: 3100, granted: 3, claimed: true }, 'STEP_CONTEXT_CHANGED'],
]) {
    test(`${label}等待原生步数时重置，旧密文不会发送`, async () => {
        const { calls } = fixture();
        assert.equal(store.adopt(birdCode, '小鸟').error, null);
        const primeClaim = async () => {
            if (endpoint !== 'claim') return;
            wx.request = options => options.success({ statusCode: 200, data: reading(3100) });
            assert.equal((await supply.preview()).data.claimable, true);
        };
        await primeClaim();
        const getWeRunData = wx.getWeRunData;
        let nativeStarted;
        const started = new Promise(resolve => { nativeStarted = resolve; });
        wx.getWeRunData = options => { nativeStarted(options); };
        const handleRequest = options => {
            calls.push(options);
            options.success({ statusCode: 200, data: response });
        };
        wx.request = handleRequest;

        const pending = read();
        const oldNative = await Promise.race([
            started,
            pending.then(() => assert.fail('没有发起原生步数读取')),
        ]);
        assert.equal(store.reset().error, null);
        assert.equal(store.adopt(birdCode, '小鸟').error, null);
        getWeRunData(oldNative);
        assert.equal((await pending).error, contextError);
        assert.equal(calls.length, 0);
        assertCounts(3, 3);

        wx.getWeRunData = getWeRunData;
        await primeClaim();
        wx.request = handleRequest;
        assert.equal((await read()).error, null);
        assert.deepEqual(calls.map(call => call.url.split('/').pop()), [endpoint]);
    });
}

test('退出后迟到的旧步数会话不会清除新会话的预览缓存', async () => {
    const { calls } = fixture();
    assert.equal(store.adopt(birdCode, '小鸟').error, null);
    const getWeRunData = wx.getWeRunData;
    let logoutRequest;
    let steps = 2340;
    wx.request = options => {
        calls.push(options);
        if (options.url.endsWith('/logout')) logoutRequest = options;
        else if (options.url.endsWith('/wx-login')) options.success({ statusCode: 200, data: { token: 'new-token' } });
        else options.success({ statusCode: 200, data: reading(steps) });
    };
    assert.equal((await supply.preview()).error, null);
    assert.equal(supply.cachedPreview().steps, 2340);

    let nativeStarted;
    const started = new Promise(resolve => { nativeStarted = resolve; });
    wx.getWeRunData = options => { nativeStarted(options); };
    const pending = supply.preview();
    const oldNative = await Promise.race([
        started,
        pending.then(() => assert.fail('没有发起旧会话的原生步数读取')),
    ]);

    const logout = store.logoutWechat();
    assert.ok(logoutRequest);
    assert.equal(supply.cachedPreview(), null);
    logoutRequest.success({ statusCode: 204 });
    assert.equal((await logout).error, null);
    wx.getWeRunData = getWeRunData;
    steps = 3200;
    assert.equal((await supply.preview()).error, null);
    assert.equal(supply.cachedPreview().steps, 3200);

    getWeRunData(oldNative);
    assert.equal((await pending).error, 'WX_SESSION_CHANGED');
    assert.equal(supply.needsNewPreview('WX_SESSION_CHANGED'), true);
    assert.equal(supply.cachedPreview().steps, 3200);
    assert.deepEqual(calls.map(call => call.url.split('/').pop()), ['preview', 'logout', 'wx-login', 'preview']);
});

test('到北京时间零点后不再显示前一天的步数', async t => {
    const { calls } = fixture();
    const midnight = Date.parse(date + 'T16:00:00Z');
    let now = midnight - 1;
    t.mock.method(Date, 'now', () => now);
    store.adopt(birdCode, '小鸟');
    wx.request = options => {
        calls.push(options);
        options.success({ statusCode: 200, data: reading(3100) });
    };
    assert.equal((await supply.preview()).error, null);
    assert.equal(supply.cachedPreview().date, date);

    now = midnight;
    assert.equal(supply.cachedPreview(), null);
    assert.equal(calls.length, 1);
});

test('小窝补给面板跨零点清掉旧步数，旧领取按钮不触发读取', async t => {
    const { calls } = fixture();
    const midnight = Date.parse(date + 'T16:00:00Z');
    let now = midnight - 1;
    t.mock.method(Date, 'now', () => now);
    const nativeRead = t.mock.method(wx, 'getWeRunData');
    wx.request = options => {
        calls.push(options);
        options.success({ statusCode: 200, data: reading(3100) });
    };
    assert.equal(store.adopt(birdCode, '小鸟').error, null);
    const openPage = openNestSupply();
    await openPage.onReadSupplySteps();
    assert.equal(openPage.data.stepSupplyStatus.steps, 3100);
    assert.equal(openPage.data.stepSupplyStatus.canClaim, true);
    const staleTapPage = openNestSupply();
    assert.equal(staleTapPage.data.stepSupplyStatus.canClaim, true);

    now = midnight;
    openPage.refresh();
    assert.equal(openPage.data.stepSupplyStatus, null);
    assert.match(openPage.data.stepSupplyNotice, /重新读取微信步数/);

    await staleTapPage.onClaimStepSupply();
    assert.equal(staleTapPage.data.stepSupplyStatus, null);
    assert.match(staleTapPage.data.stepSupplyNotice, /重新读取微信步数/);
    assert.equal(nativeRead.mock.callCount(), 1);
    assert.deepEqual(calls.map(call => call.url.split('/').pop()), ['preview']);
});

test('跨零点收到旧步数时不恢复展示，当天步数仍可重新读取', async t => {
    const { calls } = fixture();
    const midnight = Date.parse(date + 'T16:00:00Z');
    const nextDate = new Date(midnight + 8 * 3600000).toISOString().slice(0, 10);
    let now = midnight - 1;
    t.mock.method(Date, 'now', () => now);
    assert.equal(store.adopt(birdCode, '小鸟').error, null);
    const page = openNestSupply();
    let requestStarted;
    const started = new Promise(resolve => { requestStarted = resolve; });
    wx.request = options => {
        calls.push(options);
        requestStarted(options);
    };
    const pending = page.onReadSupplySteps();
    const oldRequest = await Promise.race([
        started,
        pending.then(() => assert.fail('读取没有发出预览请求')),
    ]);

    now = midnight;
    page.refresh();
    oldRequest.success({ statusCode: 200, data: reading(3100) });
    await pending;
    assert.equal(page.data.stepSupplyStatus, null);
    assert.match(page.data.stepSupplyNotice, /重新读取微信步数/);
    assert.equal(supply.cachedPreview(), null);

    wx.request = options => {
        calls.push(options);
        options.success({ statusCode: 200, data: { ...reading(2340), date: nextDate } });
    };
    await page.onReadSupplySteps();
    assert.equal(page.data.stepSupplyStatus.date, nextDate);
    assert.equal(page.data.stepSupplyStatus.steps, 2340);
    assert.equal(page.data.stepSupplyStatus.canClaim, false);
    assert.equal(page.data.stepSupplyNotice, '');
    assert.deepEqual(calls.map(call => call.url.split('/').pop()), ['preview', 'preview']);
});

test('预览只读，达标后单独确认，按服务端凭据发放且同日只入一次', async () => {
    const { calls } = fixture();
    store.adopt(birdCode, '小鸟');
    let current = reading(2340);
    wx.request = options => { calls.push(options); options.success({ statusCode: 200, data: current }); };
    const below = await supply.preview();
    assert.equal(below.data.claimable, false);
    assert.equal(below.data.requiredSteps - below.data.steps, 660);
    assertCounts(3, 3);
    current = reading(3100);
    assert.equal((await supply.preview()).data.claimable, true);
    assertCounts(3, 3);
    current = reading(3100, receipt);
    assert.equal((await supply.claim(date)).data.localClaimed, true);
    assertCounts(4, 4);
    assert.deepEqual(supply.cachedPreview(), {
        date, steps: 3100, requiredSteps: 3000, claimed: true, claimable: false,
        restoreAvailable: true, localClaimed: true, cached: true,
    });
    assert.equal((await supply.claim(date)).error, 'ALREADY_CLAIMED');
    assert.deepEqual(calls.map(x => x.url.split('/').pop()), ['preview', 'preview', 'claim']);
    assert.deepEqual(calls[2].data, { installationId: id, birdCode, expectedDate: date, encryptedData: 'sealed', iv: 'test-iv' });
});

test('拒绝隐私或步数授权均不上传密文，会话失效只刷新一次', async () => {
    const { calls } = fixture();
    store.adopt(birdCode, '小鸟');
    wx.requirePrivacyAuthorize = options => options.fail({ errno: 104, errMsg: 'requirePrivacyAuthorize:fail privacy permission is not authorized' });
    assert.equal((await supply.preview()).error, 'PRIVACY_NOT_AUTHORIZED');
    wx.requirePrivacyAuthorize = options => options.success();
    wx.getSetting = options => options.success({ authSetting: {} });
    wx.authorize = options => options.fail({ errMsg: 'authorize:fail auth deny' });
    assert.equal((await supply.preview()).error, 'WERUN_DENIED');
    wx.authorize = options => options.success();
    const nativeRead = wx.getWeRunData;
    wx.getWeRunData = options => options.fail({ errMsg: 'getWeRunData:fail network error' });
    assert.equal((await supply.preview()).error, 'REDEEM_FAILED');
    assert.equal(calls.length, 0);
    wx.getWeRunData = nativeRead;
    wx.request = options => {
        calls.push(options);
        if (options.url.endsWith('/wx-login')) options.success({ statusCode: 200, data: { token: 'refreshed-token' } });
        else options.success({ statusCode: 401, data: { code: 'WX_SESSION_MISSING' } });
    };
    assert.equal((await supply.preview()).error, 'WX_LOGIN_REQUIRED');
    assert.deepEqual(calls.map(x => x.url.split('/').pop()), ['preview', 'wx-login', 'preview']);
    assertCounts(3, 3);
});

for (const [label, failure, expected] of [
    ['本机已替换令牌', 'storage', ['preview']],
    ['微信会话检查失败', 'checkSession', ['preview', 'wx-login']],
    ['服务器拒绝旧令牌', 'unauthorized', ['preview', 'claim', 'wx-login']],
]) {
    test(`领取补给遇到${label}，必须先重新读取新会话的步数`, async () => {
        const { calls, memory } = fixture();
        store.adopt(birdCode, '小鸟');
        const page = openNestSupply();
        wx.request = options => {
            calls.push(options);
            if (options.url.endsWith('/wx-login')) {
                options.success({ statusCode: 200, data: { token: 'replacement-token' } });
            } else if (options.url.endsWith('/claim')) {
                if (options.header.Authorization === 'Bearer cached-token') {
                    options.success({ statusCode: 401, data: { code: 'WX_SESSION_MISSING' } });
                } else {
                    options.success({ statusCode: 200, data: reading(3200, receipt) });
                }
            } else {
                options.success({ statusCode: 200, data: reading(3200) });
            }
        };
        await page.onReadSupplySteps();
        assert.equal(page.data.stepSupplyStatus.canClaim, true);
        if (failure === 'storage') memory.set('auth_token', 'replacement-token');
        if (failure === 'checkSession') wx.checkSession = options => options.fail();

        await page.onClaimStepSupply();
        assert.deepEqual(calls.map(call => call.url.split('/').pop()), expected);
        assert.equal(page.data.stepSupplyStatus, null);
        assert.match(page.data.stepSupplyNotice, /重新读取步数/);
        assert.equal(supply.cachedPreview(), null);
        assertCounts(3, 3);

        wx.checkSession = options => options.success();
        await page.onReadSupplySteps();
        assert.equal(page.data.stepSupplyStatus.canClaim, true);
        await page.onClaimStepSupply();
        assert.deepEqual(calls.slice(expected.length).map(call => call.url.split('/').pop()), ['preview', 'claim']);
        assert.ok(calls.slice(expected.length).every(call => call.header.Authorization === 'Bearer replacement-token'));
        assert.equal(page.data.stepSupplyStatus.claimed, true);
        assertCounts(4, 4);
    });
}

for (const [label, action, login] of [
    ['网络异常', 'onReadSupplySteps', options => options.fail()],
    ['缺少登录凭据', 'onClaimStepSupply', options => options.success({})],
]) {
    test(`微信登录${label}导致会话续期失败时清除旧领取资格`, async () => {
        const { calls } = fixture();
        store.adopt(birdCode, '小鸟');
        const page = openNestSupply();
        wx.request = options => {
            calls.push(options);
            options.success({ statusCode: 200, data: reading(3200) });
        };
        await page.onReadSupplySteps();
        assert.equal(page.data.stepSupplyStatus.canClaim, true);
        wx.checkSession = options => options.fail();
        wx.login = login;
        await page[action]();
        assert.equal(page.data.stepSupplyStatus, null);
        assert.match(page.data.stepSupplyNotice, /微信登录/);
        assert.equal(supply.cachedPreview(), null);
        assert.deepEqual(calls.map(call => call.url.split('/').pop()), ['preview']);
        assertCounts(3, 3);
    });
}

test('已缓存的步数遇到授权拒绝或重置后失效', async () => {
    const { calls } = fixture();
    store.adopt(birdCode, '小鸟');
    wx.request = options => {
        calls.push(options);
        options.success({ statusCode: 200, data: reading(2340) });
    };
    const allowPrivacy = wx.requirePrivacyAuthorize;
    const authorizedSettings = wx.getSetting;
    assert.equal((await supply.preview()).error, null);
    wx.requirePrivacyAuthorize = options => options.fail();
    assert.equal((await supply.preview()).error, 'PRIVACY_NOT_AUTHORIZED');
    assert.equal(supply.cachedPreview(), null);

    wx.requirePrivacyAuthorize = allowPrivacy;
    assert.equal((await supply.preview()).error, null);
    wx.getSetting = options => options.success({ authSetting: {} });
    wx.authorize = options => options.fail();
    assert.equal((await supply.preview()).error, 'WERUN_DENIED');
    assert.equal(supply.cachedPreview(), null);

    wx.getSetting = authorizedSettings;
    assert.equal((await supply.preview()).error, null);
    assert.equal(store.reset().error, null);
    store.adopt(birdCode, '新小鸟');
    assert.equal(supply.cachedPreview(), null);
    assert.equal(calls.length, 3);
});

test('旧会话的预览迟到时不显示旧资格或清除新会话步数', async () => {
    const { calls, memory } = fixture();
    store.adopt(birdCode, '小鸟');
    const page = openNestSupply();
    let previewStarted;
    const started = new Promise(resolve => { previewStarted = resolve; });
    wx.request = options => {
        calls.push(options);
        if (options.header.Authorization === 'Bearer cached-token') {
            previewStarted(options);
        } else {
            options.success({ statusCode: 200, data: reading(3200) });
        }
    };
    const pending = page.onReadSupplySteps();
    const oldRequest = await Promise.race([started, pending.then(() => assert.fail('没有发起预览请求'))]);
    memory.set('auth_token', 'replacement-token');
    assert.equal((await supply.preview()).data.steps, 3200);
    oldRequest.success({ statusCode: 200, data: reading(3100) });
    await pending;
    assert.equal(page.data.stepSupplyStatus, null);
    assert.match(page.data.stepSupplyNotice, /重新读取步数/);
    assert.equal(supply.cachedPreview().steps, 3200);
    assert.deepEqual(calls.map(call => call.url.split('/').pop()), ['preview', 'preview']);
    assertCounts(3, 3);
});

test('旧会话的领取回执迟到时不改变库存或清除新会话步数', async () => {
    const { calls, memory } = fixture();
    store.adopt(birdCode, '小鸟');
    let claimStarted;
    const started = new Promise(resolve => { claimStarted = resolve; });
    wx.request = options => {
        calls.push(options);
        if (options.url.endsWith('/claim')) {
            claimStarted(options);
        } else {
            const steps = options.header.Authorization === 'Bearer cached-token' ? 3100 : 3200;
            options.success({ statusCode: 200, data: reading(steps) });
        }
    };
    assert.equal((await supply.preview()).data.steps, 3100);
    const pending = supply.claim(date);
    const oldRequest = await Promise.race([started, pending.then(() => assert.fail('没有发起领取请求'))]);
    memory.set('auth_token', 'replacement-token');
    assert.equal((await supply.preview()).data.steps, 3200);
    oldRequest.success({ statusCode: 200, data: reading(3100, receipt) });
    assert.equal((await pending).error, 'WX_SESSION_CHANGED');
    assert.equal(supply.cachedPreview().steps, 3200);
    assert.deepEqual(calls.map(call => call.url.split('/').pop()), ['preview', 'claim', 'preview']);
    assertCounts(3, 3);
});

for (const reread of [false, true]) {
    test(`同会话领取响应超时后${reread ? '重新读取并恢复' : '直接重试'}原凭据`, async () => {
        const { calls } = fixture();
        store.adopt(birdCode, '小鸟');
        const page = openNestSupply();
        let claimed = false;
        wx.request = options => {
            calls.push(options);
            if (options.url.endsWith('/claim') && !claimed) {
                claimed = true;
                options.fail();
                return;
            }
            options.success({ statusCode: 200, data: reading(3200, claimed ? receipt : null) });
        };
        await page.onReadSupplySteps();
        await page.onClaimStepSupply();
        assert.equal(page.data.stepSupplyStatus.canClaim, true);
        assert.equal(page.data.stepSupplyNotice, '补给结果暂未确认，请重试。');
        assert.equal(supply.cachedPreview().claimable, true);
        assertCounts(3, 3);
        if (reread) {
            await page.onReadSupplySteps();
            assert.equal(page.data.stepSupplyStatus.restore, true);
            assert.equal(supply.cachedPreview().restoreAvailable, true);
        }
        await page.onClaimStepSupply();
        assert.equal(page.data.stepSupplyStatus.claimed, true);
        assert.equal(page.data.stepSupplyStatus.canClaim, false);
        assertCounts(4, 4);
        assert.deepEqual(calls.map(call => call.url.split('/').pop()),
            reread ? ['preview', 'claim', 'preview', 'claim'] : ['preview', 'claim', 'claim']);
    });
}

test('其他设备已领取的补给不能在本机再次发放', async () => {
    const { calls } = fixture();
    store.adopt(birdCode, '小鸟');
    const page = openNestSupply();
    wx.request = options => {
        calls.push(options);
        options.success({ statusCode: 200, data: reading(3200, null, true) });
    };
    await page.onReadSupplySteps();
    assert.equal(page.data.stepSupplyStatus.claimed, true);
    assert.equal(page.data.stepSupplyStatus.canClaim, false);
    await page.onClaimStepSupply();
    assert.equal((await supply.claim(date)).error, 'WX_SESSION_CHANGED');
    assert.deepEqual(calls.map(call => call.url.split('/').pop()), ['preview']);
    assertCounts(3, 3);
});

test('跨日、错鸟或清除缓存期间返回的凭据均不影响新库存', async () => {
    fixture();
    store.adopt(birdCode, '小鸟');
    const primeClaim = async () => {
        wx.request = options => options.success({ statusCode: 200, data: reading(3200) });
        assert.equal((await supply.preview()).data.claimable, true);
    };
    await primeClaim();
    wx.request = options => options.success({ statusCode: 409, data: { code: 'SUPPLY_DAY_CHANGED' } });
    assert.equal((await supply.claim(date)).error, 'SUPPLY_DAY_CHANGED');
    await primeClaim();
    wx.request = options => options.success({ statusCode: 200, data: reading(3200, { ...receipt, birdCode: 'HZ-HY-9000000000000000002' }) });
    assert.equal((await supply.claim(date)).error, 'INVALID_SUPPLY_RECEIPT');
    wx.request = options => {
        store.reset();
        store.adopt(birdCode, '新小鸟');
        options.success({ statusCode: 200, data: reading(3200, receipt) });
    };
    assert.equal((await supply.claim(date)).error, 'SUPPLY_CONTEXT_CHANGED');
    assertCounts(3, 3);
});

for (const [reopen, writeFails] of [[true, false], [true, true], [false, true]]) {
    test(`补给${reopen ? '重开面板后' : '在原面板'}${writeFails ? '写入失败' : '响应超时'}仍可确认并恢复`, async () => {
        const { calls } = fixture();
        store.adopt(birdCode, '小鸟');
        const page = openNestSupply();
        let claimStarted;
        const started = new Promise(resolve => { claimStarted = resolve; });
        wx.request = options => {
            calls.push(options);
            if (options.url.endsWith('/claim')) claimStarted(options);
            else options.success({ statusCode: 200, data: reading(3200) });
        };
        await page.onReadSupplySteps();
        const pending = page.onClaimStepSupply();
        const claim = await Promise.race([started, pending.then(() => assert.fail('没有发起领取请求'))]);
        if (reopen) {
            page.closeSheet();
            page.onOpenSupply();
        }
        const write = wx.setStorageSync;
        if (writeFails) {
            wx.setStorageSync = () => { throw new Error('模拟本机写入失败'); };
            claim.success({ statusCode: 200, data: reading(3200, receipt) });
        } else {
            claim.fail({ errMsg: '模拟服务端结算后连接断开' });
        }
        await pending;
        wx.setStorageSync = write;
        assert.equal(page.data.stepSupplyBusy, '');
        assert.equal(page.data.stepSupplyNotice, writeFails ? '本机记录暂时无法读写，请重试。' : '补给结果暂未确认，请重试。');
        assert.equal(page.data.stepSupplyStatus.canClaim, true);
        assert.equal(page.data.stepSupplyStatus.restore, writeFails);
        assertCounts(3, 3);

        wx.request = options => {
            calls.push(options);
            options.success({ statusCode: 200, data: reading(3200, receipt) });
        };
        await page.onClaimStepSupply();
        await page.onClaimStepSupply();
        assert.equal(page.data.stepSupplyStatus.canClaim, false);
        assert.deepEqual(calls.map(call => call.url.split('/').pop()), ['preview', 'claim', 'claim']);
        assertCounts(4, 4);
    });
}

for (const reopen of [false, true]) {
    test(`旧会话的补给超时不影响新会话${reopen ? '重开的' : '当前'}面板`, async () => {
        const { memory } = fixture();
        store.adopt(birdCode, '小鸟');
        const page = openNestSupply();
        let claimStarted;
        const started = new Promise(resolve => { claimStarted = resolve; });
        wx.request = options => {
            if (options.url.endsWith('/claim')) claimStarted(options);
            else {
                const steps = options.header.Authorization === 'Bearer cached-token' ? 3200 : 1700;
                options.success({ statusCode: 200, data: reading(steps) });
            }
        };
        await page.onReadSupplySteps();
        const pending = page.onClaimStepSupply();
        const claim = await Promise.race([started, pending.then(() => assert.fail('没有发起领取请求'))]);
        if (reopen) {
            page.closeSheet();
            page.onOpenSupply();
        }
        assert.equal(page.data.stepSupplyStatus.steps, 3200);
        memory.set('auth_token', 'replacement-token');
        await supply.preview();
        claim.fail({ errMsg: '模拟旧领取响应超时' });
        await pending;
        assert.equal(page.data.stepSupplyBusy, '');
        assert.equal(page.data.stepSupplyNotice, '');
        assert.equal(page.data.stepSupplyStatus.steps, 1700);
        assert.equal(page.data.stepSupplyStatus.canClaim, false);
        assertCounts(3, 3);
    });
}
