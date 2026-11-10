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

function redemptionFailure(at, error) {
    return { error: error, data: g.snapshot(at).data };
}

// 仅在显式调试模式下模拟兑换，真实模式只镜像服务端结算。
async function redeemSteps(now) {
    const at = (typeof now === 'number') ? now : Date.now();
    if (config.USE_LOCAL_FIXTURE) {
        return g.redeemSteps(config.DEBUG_TODAY_STEPS, at);
    }
    if (!config.API_BASE) return redemptionFailure(at, 'NO_ENDPOINT');
    let token = getToken();
    if (!token) {
        try { token = await werun.loginAndGetToken(); }
        catch (e) { return redemptionFailure(at, (e && e.error) || 'LOGIN_FAILED'); }
    }
    let res;
    try {
        res = await werun.redeemSteps(token);
    } catch (e) {
        if (e && e.error === 'WX_LOGIN_REQUIRED') {
            try { token = await werun.loginAndGetToken(); res = await werun.redeemSteps(token); }
            catch (e2) { return redemptionFailure(at, (e2 && e2.error) || 'REDEEM_FAILED'); }
        } else {
            return redemptionFailure(at, (e && e.error) || 'REDEEM_FAILED');
        }
    }
    if (!res || res.error || !Number.isInteger(res.granted) || res.granted < 0 ||
        !Number.isInteger(res.steps) || res.steps < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(res.date) ||
        typeof res.claimed !== 'boolean') {
        return redemptionFailure(at, (res && res.error) || 'REDEEM_FAILED');
    }
    if (!res.granted && !res.claimed) return redemptionFailure(at, 'NO_REWARD');
    return g.applyServerReward(res.granted, res.steps, res.date, at, res.claimed);
}

module.exports = Object.assign({}, g, { redeemSteps: redeemSteps, getToken: getToken });
