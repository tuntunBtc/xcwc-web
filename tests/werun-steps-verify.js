'use strict';

// 微信步数兑换的前端逻辑验证（Node 可独立运行，无需微信运行时）。
// 覆盖：本机 mock 结算、服务端结果镜像、幂等、store 桥接。
const assert = require('assert');

const guestStore = require('../miniprogram/utils/guest-store');
const store = require('../miniprogram/utils/store');
const config = require('../miniprogram/utils/config');
const werun = require('../miniprogram/utils/werun');

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

function authorizedStepsWx(initial, request) {
    return Object.assign(memoryStorage(initial), {
        checkSession: options => options.success(),
        getSetting: options => options.success({ authSetting: { 'scope.werun': true } }),
        getWeRunData: options => options.success({ encryptedData: 'test', iv: 'test' }),
        request,
    });
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

check('guest-store: 服务端日期决定流水及当日累计', function () {
    const g = guestStore.createGuestStore(memoryStorage(), {});
    const at = Date.parse('2026-11-10T16:00:01Z');
    g.adopt('TEST-WERUN-DATE', '小叽', at);
    const r = g.applyServerReward(5, 6800, '2026-11-10', at, true);
    assert.strictEqual(r.data.snapshot.todayPoints, 0);
    assert.strictEqual(r.data.snapshot.ledger[0].day, '2026-11-10');
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

        await checkAsync('store: 会话解密过期后只重登一次，重取密文，随后可退出', async function () {
            config.USE_LOCAL_FIXTURE = false;
            config.API_BASE = 'https://example.invalid';
            const calls = [];
            let reads = 0;
            global.wx = Object.assign(memoryStorage({ auth_token: 'old-token' }), {
                checkSession: options => options.success(),
                login: options => { calls.push('wx.login'); options.success({ code: 'test-code' }); },
                getSetting: options => options.success({ authSetting: { 'scope.werun': true } }),
                getWeRunData: options => options.success({ encryptedData: 'test-' + (++reads), iv: 'test' }),
                request: options => {
                    if (options.url.endsWith('/wx-login')) {
                        assert.deepStrictEqual(options.data, { code: 'test-code' });
                        calls.push('login');
                        return options.success({ statusCode: 200, data: { token: 'new-token' } });
                    }
                    if (options.url.endsWith('/logout')) {
                        assert.strictEqual(options.header.Authorization, 'Bearer new-token');
                        calls.push('logout');
                        return options.success({ statusCode: 204 });
                    }
                    calls.push([options.header.Authorization, options.data.encryptedData]);
                    if (reads === 1) return options.success({ statusCode: 400, data: { code: 'WERUN_DECRYPT_FAILED' } });
                    return options.success({ statusCode: 200, data: { granted: 5, steps: 6800, date: DAY, claimed: true } });
                },
            });
            assert.strictEqual((await store.redeemSteps(NOW)).error, 'NO_BIRD');
            assert.deepStrictEqual(calls, []);
            store.adopt('TEST-WERUN-03', '小叽', NOW);
            assert.strictEqual((await store.redeemSteps(NOW)).error, null);
            assert.strictEqual(store.snapshot(NOW).data.snapshot.points, 5);
            assert.strictEqual((await store.redeemSteps(NOW)).error, 'ALREADY_CLAIMED');
            assert.deepStrictEqual(await store.logoutWechat(), { error: null });
            assert.strictEqual(store.getToken(), '');
            assert.deepStrictEqual(calls, [['Bearer old-token', 'test-1'], 'wx.login', 'login', ['Bearer new-token', 'test-2'], 'logout']);
        });

        await checkAsync('store: 退出阻止旧请求重登，之后主动读取补给可正常登录', async function () {
            config.USE_LOCAL_FIXTURE = false;
            config.API_BASE = 'https://example.invalid';
            let redeemRequest;
            let logoutRequest;
            let loginCalls = 0;
            global.wx = authorizedStepsWx({ auth_token: 'old-token' }, options => {
                if (options.url.endsWith('/steps/redeem')) redeemRequest = options;
                else if (options.url.endsWith('/auth/logout')) logoutRequest = options;
                else if (options.url.endsWith('/auth/wx-login')) options.success({ statusCode: 200, data: { token: 'fresh-token' } });
                else if (options.url.endsWith('/supplies/preview')) {
                    assert.strictEqual(options.header.Authorization, 'Bearer fresh-token');
                    options.success({ statusCode: 200, data: { steps: 2340 } });
                } else throw Error('未预期的请求');
            });
            global.wx.login = options => {
                loginCalls += 1;
                options.success({ code: 'fresh-code' });
            };
            store.adopt('TEST-WERUN-LOGOUT', '小叽', NOW);
            const pending = store.redeemSteps(NOW);
            await new Promise(setImmediate);
            assert.ok(redeemRequest);
            const logout = store.logoutWechat();
            await new Promise(setImmediate);
            assert.ok(logoutRequest);
            assert.strictEqual((await store.loginWithWechat()).error, 'WX_SESSION_CHANGED');
            logoutRequest.success({ statusCode: 204 });
            assert.deepStrictEqual(await logout, { error: null });

            redeemRequest.success({ statusCode: 401 });
            assert.strictEqual((await pending).error, 'WX_SESSION_CHANGED');
            assert.strictEqual(loginCalls, 0);
            assert.strictEqual(store.getToken(), '');
            assert.strictEqual(store.snapshot(NOW).data.snapshot.points, 0);
            const preview = await werun.withSession(store.getToken(), token => werun.previewSupplies(token, {}));
            assert.deepStrictEqual(preview, { steps: 2340 });
            assert.strictEqual(loginCalls, 1);
            assert.strictEqual(store.getToken(), 'fresh-token');
        });

        await checkAsync('store: 迟到的 wx.login 回调不登录，且不清除更新的登录请求', async function () {
            const callbacks = [];
            const submitted = [];
            global.wx = Object.assign(memoryStorage(), {
                login: options => callbacks.push(options),
                request: options => {
                    submitted.push(options.data.code);
                    options.success({ statusCode: 200, data: { token: 'fresh-token' } });
                },
            });
            const stale = store.loginWithWechat();
            assert.strictEqual(callbacks.length, 1);
            assert.deepStrictEqual(await store.logoutWechat(), { error: null });
            const fresh = store.loginWithWechat();
            assert.strictEqual(callbacks.length, 2);
            callbacks[0].success({ code: 'stale-code' });
            assert.strictEqual((await stale).error, 'WX_SESSION_CHANGED');
            assert.deepStrictEqual(submitted, []);
            assert.strictEqual(store.getToken(), '');

            const shared = store.loginWithWechat();
            assert.strictEqual(callbacks.length, 2);
            callbacks[1].success({ code: 'fresh-code' });
            assert.deepStrictEqual((await Promise.all([fresh, shared])).map(result => result.error), [null, null]);
            assert.deepStrictEqual(submitted, ['fresh-code']);
            assert.strictEqual(store.getToken(), 'fresh-token');
        });

        await checkAsync('store: 退出后迟到的后端登录响应不会保存令牌', async function () {
            let loginRequest;
            global.wx = Object.assign(memoryStorage(), {
                login: options => options.success({ code: 'old-code' }),
                request: options => { loginRequest = options; },
            });
            const stale = store.loginWithWechat();
            await new Promise(setImmediate);
            assert.ok(loginRequest);
            assert.deepStrictEqual(await store.logoutWechat(), { error: null });
            loginRequest.success({ statusCode: 200, data: { token: 'late-token' } });
            assert.strictEqual((await stale).error, 'WX_SESSION_CHANGED');
            assert.strictEqual(store.getToken(), '');
        });

        await checkAsync('store: 退出后不发送迟到的微信步数密文', async function () {
            let stepCallback;
            const requests = [];
            global.wx = authorizedStepsWx({ auth_token: 'old-token' }, options => {
                requests.push(new URL(options.url).pathname);
                options.success({ statusCode: 204 });
            });
            global.wx.getWeRunData = options => { stepCallback = options; };
            store.adopt('TEST-WERUN-DATA', '小叽', NOW);
            const pending = store.redeemSteps(NOW);
            await new Promise(setImmediate);
            assert.ok(stepCallback);
            assert.deepStrictEqual(await store.logoutWechat(), { error: null });
            stepCallback.success({ encryptedData: 'late-test', iv: 'test' });
            assert.strictEqual((await pending).error, 'WX_SESSION_CHANGED');
            assert.deepStrictEqual(requests, ['/api/auth/logout']);
            assert.strictEqual(store.getToken(), '');
        });

        await checkAsync('store: 重置后重新领养时，旧步数结果不会写入本机', async function () {
            for (const code of ['TEST-WERUN-OLD', 'TEST-WERUN-NEW']) {
                let held;
                global.wx = authorizedStepsWx({ auth_token: 'test-token' }, options => { held = options; });
                store.adopt('TEST-WERUN-OLD', '小叽', NOW);
                const pending = store.redeemSteps(NOW);
                await new Promise(setImmediate);
                assert.ok(held);
                assert.strictEqual(store.reset(NOW + 1).error, null);
                assert.strictEqual(store.adopt(code, '新小叽', NOW + 2).error, null);
                held.success({ statusCode: 200, data: { granted: 2, steps: 2300, date: DAY, claimed: true } });
                assert.strictEqual((await pending).error, 'STEP_CONTEXT_CHANGED');
                const snapshot = store.snapshot(NOW + 2).data.snapshot;
                assert.strictEqual(snapshot.birdCode, code);
                assert.strictEqual(snapshot.points, 0);
                assert.strictEqual(snapshot.todayStepClaimed, false);
            }
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
