'use strict';

const createGuestStore = require('./guest-store').createGuestStore;
const config = require('./config');
const werun = require('./werun');

// 调试期用本机存储；正式版把 award/redeemSteps 的结算移到服务端，页面调用方式保持不变。
const storage = {
    getStorageSync: function (key) { return wx.getStorageSync(key); },
    setStorageSync: function (key, value) { wx.setStorageSync(key, value); },
    removeStorageSync: function (key) { wx.removeStorageSync(key); },
};

const g = createGuestStore(storage, {
    debugSteps: config.DEBUG_TODAY_STEPS,
    rules: {
        pointsDailyLimit: config.POINTS_DAILY_LIMIT,
        stepUnit: config.STEP_UNIT,
        stepDailyCap: config.STEP_DAILY_CAP,
    },
});

function getToken() {
    try { return wx.getStorageSync('auth_token') || wx.getStorageSync('token') || ''; }
    catch (e) { return ''; }
}

// 无后端/调试模式下，回退到本机 mock 结算（可被篡改，仅调试用），并标记为离线预览。
function degradedMock(at, err) {
    const mock = g.redeemSteps(config.DEBUG_TODAY_STEPS, at);
    mock.data.snapshot = Object.assign({}, mock.data.snapshot, { degraded: true });
    mock.degraded = true;
    mock.error = (err && err.error) || 'OFFLINE';
    return mock;
}

// 步数兑换：调试/未配置后端 → 本机 mock；否则严格以服务端结算结果为准（前端不再重算步数）。
async function redeemSteps(now) {
    const at = (typeof now === 'number') ? now : Date.now();
    if (config.USE_LOCAL_FIXTURE || !config.API_BASE) {
        return g.redeemSteps(config.DEBUG_TODAY_STEPS, at);
    }
    let token = getToken();
    if (!token) {
        try { token = await werun.loginAndGetToken(); }
        catch (e) { return degradedMock(at, e); }
    }
    let res;
    try {
        res = await werun.redeemSteps(token);
    } catch (e) {
        if (e && e.error === 'WX_LOGIN_REQUIRED') {
            try { token = await werun.loginAndGetToken(); res = await werun.redeemSteps(token); }
            catch (e2) { return degradedMock(at, e2); }
        } else {
            return degradedMock(at, e);
        }
    }
    if (!res || res.error) {
        return { error: (res && res.error) || 'REDEEM_FAILED', data: { snapshot: g.snapshot(at).data.snapshot } };
    }
    // 服务端结果为唯一可信来源；前端只镜像，不重算。
    return g.applyServerReward(res.granted || 0, res.steps || 0, res.date, at, res.claimed === true);
}

module.exports = Object.assign({}, g, { redeemSteps: redeemSteps, getToken: getToken });
