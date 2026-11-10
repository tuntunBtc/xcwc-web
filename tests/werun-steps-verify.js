'use strict';

// 微信步数兑换的前端逻辑验证（Node 可独立运行，无需微信运行时）。
// 覆盖：本机 mock 结算、服务端结果镜像、幂等、store 桥接。
const assert = require('assert');

const guestStore = require('../miniprogram/utils/guest-store');
const store = require('../miniprogram/utils/store');
const config = require('../miniprogram/utils/config');

let passed = 0, failed = 0;
function check(name, fn) {
    try { fn(); passed++; console.log('PASS ' + name); }
    catch (e) { failed++; console.log('FAIL ' + name + ' -> ' + (e && e.message)); }
}

async function checkAsync(name, fn) {
    try { await fn(); passed++; console.log('PASS ' + name); }
    catch (e) { failed++; console.log('FAIL ' + name + ' -> ' + (e && e.message)); }
}

// 内存存储，便于断言状态落库结果。
function memoryStorage(initial) {
    const map = Object.assign({}, initial);
    return {
        getStorageSync: function (k) { return map[k]; },
        setStorageSync: function (k, v) { map[k] = v; },
        removeStorageSync: function (k) { delete map[k]; },
    };
}

const NOW = Date.now();
const DAY = new Date(NOW + 8 * 3600 * 1000).toISOString().slice(0, 10);

check('guest-store: 本地 mock 6800 步 -> 5 叽分（封顶 5）', function () {
    const g = guestStore.createGuestStore(memoryStorage(), {});
    g.adopt('HZ-HY-2116909225920720901', '燕叽', NOW);
    const r = g.redeemSteps(6800, NOW);
    assert.strictEqual(r.error, null, 'error 应为 null');
    assert.strictEqual(r.data.snapshot.todayStepClaimed, true, '当日应标记为已兑换');
    assert.strictEqual(r.data.snapshot.points, 5, '应发放 5 叽分');
    assert.strictEqual(r.data.granted, 5);
});

check('guest-store: 同日二次兑换 -> ALREADY_CLAIMED，不重复发分', function () {
    const g = guestStore.createGuestStore(memoryStorage(), {});
    g.adopt('HZ-HY-2116909225920720901', '燕叽', NOW);
    g.redeemSteps(6800, NOW);
    const r2 = g.redeemSteps(6800, NOW);
    assert.strictEqual(r2.error, 'ALREADY_CLAIMED');
    assert.strictEqual(g.snapshot(NOW).data.snapshot.points, 5, '积分不应累加');
});

check('guest-store: 999 步不足 1000 -> 发放 0', function () {
    const g = guestStore.createGuestStore(memoryStorage(), {});
    g.adopt('HZ-HY-2116909225920720901', '燕叽', NOW);
    const r = g.redeemSteps(999, NOW);
    assert.strictEqual(r.error, 'NO_REWARD');
    assert.strictEqual(r.data.snapshot.points, 0);
});

check('guest-store: applyServerReward 严格镜像服务端 granted=5', function () {
    const g = guestStore.createGuestStore(memoryStorage(), {});
    g.adopt('HZ-HY-2116909225920720901', '燕叽', NOW);
    const r = g.applyServerReward(5, 6800, DAY, NOW, false);
    assert.strictEqual(r.error, null);
    assert.strictEqual(r.data.snapshot.points, 5);
    assert.strictEqual(r.data.granted, 5);
});

check('guest-store: applyServerReward 幂等（同日期二次 -> ALREADY_CLAIMED）', function () {
    const g = guestStore.createGuestStore(memoryStorage(), {});
    g.adopt('HZ-HY-2116909225920720901', '燕叽', NOW);
    g.applyServerReward(5, 6800, DAY, NOW, false);
    const r2 = g.applyServerReward(5, 6800, DAY, NOW, true);
    assert.strictEqual(r2.error, 'ALREADY_CLAIMED', '应识别为已领取');
});

check('guest-store: applyServerReward 不按步数重算（granted=0 仍记录 claimed）', function () {
    const g = guestStore.createGuestStore(memoryStorage(), {});
    g.adopt('HZ-HY-2116909225920720901', '燕叽', NOW);
    const r = g.applyServerReward(0, 6800, DAY, NOW, true);
    assert.strictEqual(r.data.snapshot.todayStepClaimed, true, 'claimed 状态仍应写入');
});

check('guest-store: 跨日可再次兑换（不同 target 日期）', function () {
    const g = guestStore.createGuestStore(memoryStorage(), {});
    g.adopt('HZ-HY-2116909225920720901', '燕叽', NOW);
    g.applyServerReward(5, 6800, '2026-11-09', NOW, false);
    const r = g.applyServerReward(3, 3000, '2026-11-10', NOW, false);
    assert.strictEqual(r.error, null);
    assert.strictEqual(r.data.snapshot.points, 8, '两日积分应累加');
});

check('store: 导出 redeemSteps 且为函数', function () {
    assert.strictEqual(typeof store.redeemSteps, 'function');
});

async function runBridgeChecks() {
    const originalConfig = { USE_LOCAL_FIXTURE: config.USE_LOCAL_FIXTURE, API_BASE: config.API_BASE };
    try {
        await checkAsync('store: 显式 fixture 模式模拟兑换', async function () {
            config.USE_LOCAL_FIXTURE = true;
            global.wx = memoryStorage();
            store.adopt('TEST-WERUN-01', '小叽', NOW);
            const r = await store.redeemSteps(NOW);
            assert.strictEqual(r.error, null);
            assert.strictEqual(r.data.snapshot.todayStepClaimed, true);
            assert.strictEqual(r.data.snapshot.points, 5);
        });

        await checkAsync('store: 缺地址、拒绝授权、请求失败和无奖励均不改本机叽分', async function () {
            config.USE_LOCAL_FIXTURE = false;
            config.API_BASE = '';
            const storage = memoryStorage({ auth_token: 'test-token' });
            const unexpected = () => { throw Error('不应调用此 API'); };
            global.wx = Object.assign({}, storage, { request: unexpected, getWeRunData: unexpected });
            store.adopt('TEST-WERUN-02', '小叽', NOW);
            const before = store.snapshot(NOW).data.snapshot;
            global.wx.setStorageSync = unexpected;

            async function assertFailure(error) {
                assert.strictEqual((await store.redeemSteps(NOW)).error, error);
                assert.deepStrictEqual(store.snapshot(NOW).data.snapshot, before);
            }
            await assertFailure('NO_ENDPOINT');
            config.API_BASE = 'https://example.invalid';
            global.wx.requirePrivacyAuthorize = options => options.fail();
            global.wx.getSetting = unexpected;
            await assertFailure('PRIVACY_NOT_AUTHORIZED');
            global.wx.requirePrivacyAuthorize = options => options.success();
            global.wx.getSetting = options => options.success({ authSetting: {} });
            global.wx.authorize = options => options.fail();
            await assertFailure('WERUN_DENIED');
            global.wx.getSetting = options => options.success({ authSetting: { 'scope.werun': true } });
            global.wx.getWeRunData = options => options.success({ encryptedData: 'test', iv: 'test' });
            global.wx.request = options => options.fail();
            await assertFailure('REDEEM_FAILED');
            global.wx.request = options => options.success({ statusCode: 200, data: {} });
            await assertFailure('REDEEM_FAILED');
            global.wx.request = options => options.success({
                statusCode: 200, data: { granted: 0, steps: 700, date: DAY, claimed: false },
            });
            await assertFailure('NO_REWARD');
        });
    } finally {
        Object.assign(config, originalConfig);
        delete global.wx;
    }
}

runBridgeChecks().then(function () {
    console.log('\nTOTAL passed=' + passed + ' failed=' + failed);
    process.exitCode = failed > 0 ? 1 : 0;
});
