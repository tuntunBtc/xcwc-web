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
let experienceGeneration = 0;

function readToken() {
    return wx.getStorageSync(werun.TOKEN_KEY) || '';
}

function getToken() {
    try { return readToken(); }
    catch (e) { return ''; }
}

function readWechatSignedIn() {
    try { return !!readToken(); }
    catch (e) { return null; }
}

async function verifyWechatSession() {
    try {
        const token = readToken();
        if (!token) return 'changed';
        const assertCurrent = werun.captureSessionGuard();
        const valid = await werun.checkServerSession(token).catch(() => null);
        assertCurrent();
        if (readToken() !== token) return 'changed';
        if (valid === null) return 'unknown';
        if (valid) return 'valid';
        wx.removeStorageSync(werun.TOKEN_KEY);
        return 'expired';
    } catch (e) {
        return e && e.error === 'WX_SESSION_CHANGED' ? 'changed' : 'unknown';
    }
}

async function loginWithWechat() {
    if (config.USE_LOCAL_FIXTURE || !config.API_BASE) return { error: 'NO_ENDPOINT' };
    try {
        const token = await werun.loginAndGetToken();
        if (getToken() !== token) return { error: 'STORAGE_UNAVAILABLE' };
        return { error: null, data: { signedIn: true } };
    } catch (e) {
        return { error: (e && e.error) || 'LOGIN_FAILED' };
    }
}

async function logoutWechat() {
    if (config.USE_LOCAL_FIXTURE || !config.API_BASE) return { error: 'NO_ENDPOINT' };
    return werun.withLogout(async function () {
        let token;
        try { token = readToken(); }
        catch (e) { return { error: 'STORAGE_UNAVAILABLE' }; }
        if (!token) return { error: null };
        try { await werun.revokeToken(token); }
        catch (e) { return { error: 'LOGOUT_FAILED' }; }
        try {
            if (readToken() === token) wx.removeStorageSync(werun.TOKEN_KEY);
        }
        catch (e) { return { error: 'STORAGE_UNAVAILABLE' }; }
        return { error: null };
    });
}

function redemptionFailure(at, error) {
    return { error: error, data: g.snapshot(at).data };
}

function reset(now) {
    const result = g.reset(now);
    if (!result.error) experienceGeneration += 1;
    return result;
}

function getExperienceGeneration() { return experienceGeneration; }

// 仅在显式调试模式下模拟兑换，真实模式只镜像服务端结算。
async function redeemSteps(now) {
    const at = (typeof now === 'number') ? now : Date.now();
    if (config.USE_LOCAL_FIXTURE) {
        return g.redeemSteps(config.DEBUG_TODAY_STEPS, at);
    }
    if (!config.API_BASE) return redemptionFailure(at, 'NO_ENDPOINT');
    const current = g.snapshot(at);
    if (current.error) return current;
    if (!current.data.snapshot.hasBird) return redemptionFailure(at, 'NO_BIRD');
    if (current.data.snapshot.todayStepClaimed) return redemptionFailure(at, 'ALREADY_CLAIMED');
    const generation = experienceGeneration;
    const checkExperience = () => {
        if (generation !== experienceGeneration) throw { error: 'STEP_CONTEXT_CHANGED' };
    };
    let res;
    try {
        res = await werun.withSession(getToken(), token => werun.redeemSteps(token, checkExperience));
    } catch (e) {
        return redemptionFailure(at, (e && e.error) || 'REDEEM_FAILED');
    }
    if (generation !== experienceGeneration) return redemptionFailure(at, 'STEP_CONTEXT_CHANGED');
    if (!res || res.error || !Number.isInteger(res.granted) || res.granted < 0 ||
        !Number.isInteger(res.steps) || res.steps < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(res.date) ||
        typeof res.claimed !== 'boolean') {
        return redemptionFailure(at, (res && res.error) || 'REDEEM_FAILED');
    }
    if (!res.granted && !res.claimed) return redemptionFailure(at, 'NO_REWARD');
    return g.applyServerReward(res.granted, res.steps, res.date, at, res.claimed);
}

module.exports = Object.assign({}, g, { reset, getExperienceGeneration, redeemSteps, getToken, readWechatSignedIn, verifyWechatSession, loginWithWechat, logoutWechat });
