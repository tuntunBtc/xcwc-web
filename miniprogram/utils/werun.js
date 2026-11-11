'use strict';

// 微信步数兑换的「端侧」职责边界（与后端 WxRunService 对齐）：
//   1) 隐私授权（wx.requirePrivacyAuthorize，以官方最新规范为准）→ 2) scope.werun 授权
//   3) 取 wx.getWeRunData 的密文（iv + encryptedData）→ 4) 提交后端解密结算。
// 前端【绝不】持有 session_key，也【绝不】自行解密或按步数发分；只拿服务端结算结果。
// 统一通过回调包装微信 API，兼容当前运行基础库。

const config = require('./config');
const TOKEN_KEY = 'auth_token';
let pendingLogin = null;
let pendingLogout = null;
let authGeneration = 0;

// wx 多数 API 不支持 Promise 风格，统一回调式包装。
function promisify(api, opts) {
    return new Promise(function (resolve, reject) {
        api(Object.assign({}, opts || {}, {
            success: resolve,
            fail: function (err) { reject(err || { errMsg: 'fail' }); },
        }));
    });
}

function request(opts) {
    return new Promise(function (resolve, reject) {
        wx.request(Object.assign({}, opts, {
            success: function (res) { resolve(res); },
            fail: function (err) { reject(err || { errMsg: 'network fail' }); },
        }));
    });
}

function baseUrl() {
    return (config.API_BASE || '').replace(/\/+$/, '');
}

// 微信登录：wx.login 拿 code → 后端 code2Session + 发令牌；前端只存 token，session_key 永远不下发。
function assertCurrentSession(generation) {
    if (generation !== authGeneration || pendingLogout) throw { error: 'WX_SESSION_CHANGED' };
}

function captureSessionGuard() {
    const generation = authGeneration;
    assertCurrentSession(generation);
    return () => assertCurrentSession(generation);
}

async function requestLogin(generation) {
    if (!config.API_BASE) throw { error: 'NO_ENDPOINT' };
    const login = await promisify(wx.login, {});
    assertCurrentSession(generation);
    const code = login && login.code;
    if (!code) throw { error: 'LOGIN_CODE_MISSING' };
    const res = await request({
        url: baseUrl() + '/api/auth/wx-login',
        method: 'POST',
        timeout: 10000,
        header: { 'content-type': 'application/json' },
        data: { code: code },
    });
    assertCurrentSession(generation);
    if (res.statusCode === 429) throw { error: 'RATE_LIMITED' };
    if (res.statusCode === 503) throw { error: 'NO_ENDPOINT' };
    if (res.statusCode !== 200 || !res.data || typeof res.data.token !== 'string' || !res.data.token) {
        throw { error: 'LOGIN_FAILED', status: res.statusCode };
    }
    const token = res.data.token;
    try { wx.setStorageSync(TOKEN_KEY, token); } catch (e) { /* 当前会话仍可使用 */ }
    return token;
}

function loginAndGetToken() {
    assertCurrentSession(authGeneration);
    if (!pendingLogin) {
        const login = requestLogin(authGeneration).catch(function (error) {
            throw error && error.error ? error : { error: 'LOGIN_FAILED' };
        }).finally(function () {
            if (pendingLogin === login) pendingLogin = null;
        });
        pendingLogin = login;
    }
    return pendingLogin;
}

function withLogout(logout) {
    if (!pendingLogout) {
        authGeneration += 1;
        pendingLogin = null;
        pendingLogout = logout().finally(function () { pendingLogout = null; });
    }
    return pendingLogout;
}

async function revokeToken(token) {
    const res = await request({
        url: baseUrl() + '/api/auth/logout',
        method: 'POST',
        timeout: 10000,
        header: { Authorization: 'Bearer ' + token },
    });
    if (res.statusCode !== 204 && res.statusCode !== 401) throw { error: 'LOGOUT_FAILED' };
}

async function checkServerSession(token) {
    const res = await request({
        url: baseUrl() + '/api/auth/session',
        method: 'GET',
        timeout: 5000,
        header: { Authorization: 'Bearer ' + token },
    });
    if (res.statusCode === 401 && res.data && res.data.code === 'LOGIN_REQUIRED') return false;
    if (res.statusCode === 200 && res.data && typeof res.data.expiresAt === 'string' &&
        Number.isFinite(Date.parse(res.data.expiresAt))) return true;
    return null;
}

async function sessionIsCurrent() {
    if (typeof wx.checkSession !== 'function') return true;
    try {
        await promisify(wx.checkSession, {});
        return true;
    } catch (e) {
        return false;
    }
}

async function withSession(cachedToken, action) {
    const generation = authGeneration;
    assertCurrentSession(generation);
    let token = cachedToken;
    if (!token || !(await sessionIsCurrent())) {
        assertCurrentSession(generation);
        token = await loginAndGetToken();
    }
    assertCurrentSession(generation);
    let result;
    try {
        result = await action(token);
    } catch (e) {
        assertCurrentSession(generation);
        if (!e || e.error !== 'WX_LOGIN_REQUIRED') throw e;
        token = await loginAndGetToken();
        assertCurrentSession(generation);
        result = await action(token);
    }
    assertCurrentSession(generation);
    return result;
}

function callStepPrivacyApi(api, options, fallback) {
    return promisify(api, options).catch(error => {
        const message = String((error && error.errMsg) || '');
        if (Number(error && error.errno) === 112 ||
            /privacy.*(?:not declared|not configured|api banned)|scope is not declared/i.test(message)) {
            throw { error: 'PRIVACY_UNAVAILABLE' };
        }
        throw fallback || error;
    });
}

async function encryptedSteps() {
    // 隐私授权前置：仅当小程序已在 MP 后台配置《用户隐私保护指引》且用户同意后，才能调用步数接口。
    if (typeof wx.requirePrivacyAuthorize === 'function') {
        await callStepPrivacyApi(wx.requirePrivacyAuthorize, {}, { error: 'PRIVACY_NOT_AUTHORIZED' });
    }
    const setting = await promisify(wx.getSetting, {});
    if (!setting.authSetting || !setting.authSetting['scope.werun']) {
        // scope.werun 一旦拒绝不再弹窗，需引导去设置。
        await callStepPrivacyApi(wx.authorize, { scope: 'scope.werun' }, { error: 'WERUN_DENIED', needSetting: true });
    }
    const run = await callStepPrivacyApi(wx.getWeRunData, {});
    if (!run || typeof run.encryptedData !== 'string' || !run.encryptedData ||
        typeof run.iv !== 'string' || !run.iv) throw { error: 'INVALID_STEPS' };
    return { encryptedData: run.encryptedData, iv: run.iv };
}

async function postSteps(token, endpoint, fields, checkExperience = () => {}) {
    const generation = authGeneration;
    assertCurrentSession(generation);
    checkExperience();
    const encrypted = await encryptedSteps();
    assertCurrentSession(generation);
    checkExperience();
    const res = await request({
        url: baseUrl() + endpoint,
        method: 'POST',
        timeout: 10000,
        header: { 'content-type': 'application/json', Authorization: 'Bearer ' + token },
        data: Object.assign({}, fields, encrypted),
    });
    if (res.statusCode === 200 && res.data) {
        return res.data;
    }
    if (res.statusCode === 401) throw { error: 'WX_LOGIN_REQUIRED' };
    if (res.statusCode === 400 && res.data && res.data.code === 'WERUN_DECRYPT_FAILED') {
        throw { error: 'WX_LOGIN_REQUIRED' };
    }
    if (res.statusCode === 429) throw { error: 'RATE_LIMITED' };
    const code = res.data && res.data.code;
    if (res.statusCode === 409 && (code === 'DAILY_LIMIT' || code === 'SUPPLY_DAY_CHANGED')) throw { error: code };
    if (res.statusCode === 503 && code === 'SUPPLY_DISABLED') throw { error: 'NO_ENDPOINT' };
    if ((res.statusCode === 404 && code === 'BIRD_NOT_FOUND') ||
        (res.statusCode === 410 && code === 'BIRD_INACTIVE')) throw { error: code };
    throw { error: 'REDEEM_FAILED' };
}

function redeemSteps(token, checkExperience) {
    const requestId = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
    return postSteps(token, config.STEPS_REDEEM_ENDPOINT || '/api/steps/redeem', { requestId }, checkExperience);
}

function previewSupplies(token, fields, checkExperience) {
    return postSteps(token, '/api/supplies/preview', fields, checkExperience);
}

function claimSupplies(token, fields, checkExperience) {
    return postSteps(token, '/api/supplies/claim', fields, checkExperience);
}

module.exports = { TOKEN_KEY, captureSessionGuard, loginAndGetToken, withLogout, revokeToken, checkServerSession, sessionIsCurrent, withSession, redeemSteps, previewSupplies, claimSupplies };
