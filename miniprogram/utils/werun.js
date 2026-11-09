'use strict';

// 微信步数兑换的「端侧」职责边界（与后端 WxRunService 对齐）：
//   1) 隐私授权（wx.requirePrivacyAuthorize，以官方最新规范为准）→ 2) scope.werun 授权
//   3) 取 wx.getWeRunData 的密文（iv + encryptedData）→ 4) 提交后端解密结算。
// 前端【绝不】持有 session_key，也【绝不】自行解密或按步数发分；只拿服务端结算结果。
// 注意：wx.getWeRunData 官方不支持 Promise 风格，必须回调式调用。

const config = require('./config');

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
async function loginAndGetToken() {
    if (!config.API_BASE) throw { error: 'NO_ENDPOINT' };
    const login = await promisify(wx.login, {});
    const code = login && login.code;
    if (!code) throw { error: 'LOGIN_CODE_MISSING' };
    const res = await request({
        url: baseUrl() + '/api/auth/wx-login',
        method: 'POST',
        timeout: 10000,
        header: { 'content-type': 'application/json' },
        data: { code: code },
    });
    if (res.statusCode !== 200 || !res.data || !res.data.token) {
        throw { error: 'LOGIN_FAILED', status: res.statusCode };
    }
    const token = res.data.token;
    try { wx.setStorageSync('auth_token', token); } catch (e) { /* 存储异常不阻断 */ }
    return token;
}

// 兑换步数：授权 → 取密文 → 提交后端解密结算；前端只拿结果。
async function redeemSteps(token) {
    // 隐私授权前置：仅当小程序已在 MP 后台配置《用户隐私保护指引》且用户同意后，才能调用步数接口。
    if (typeof wx.requirePrivacyAuthorize === 'function') {
        await new Promise(function (resolve) {
            try { wx.requirePrivacyAuthorize({ success: resolve, fail: resolve }); }
            catch (e) { resolve(); }
        });
    }
    const setting = await promisify(wx.getSetting, {});
    if (!setting.authSetting || !setting.authSetting['scope.werun']) {
        try {
            await promisify(wx.authorize, { scope: 'scope.werun' });
        } catch (e) {
            // scope.werun 一旦拒绝不再弹窗，需引导去设置。
            throw { error: 'WERUN_DENIED', needSetting: true };
        }
    }
    const run = await promisify(wx.getWeRunData, {}); // 仅拿密文
    const clientRequestId = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
    const res = await request({
        url: baseUrl() + (config.STEPS_REDEEM_ENDPOINT || '/api/steps/redeem'),
        method: 'POST',
        timeout: 10000,
        header: { 'content-type': 'application/json', Authorization: 'Bearer ' + token },
        data: { encryptedData: run.encryptedData, iv: run.iv, requestId: clientRequestId },
    });
    if (res.statusCode === 200 && res.data) {
        return res.data; // { granted, steps, date, claimed }
    }
    if (res.statusCode === 401) throw { error: 'WX_LOGIN_REQUIRED' };
    if (res.statusCode === 429) throw { error: 'RATE_LIMITED' };
    throw { error: 'REDEEM_FAILED', status: res.statusCode, data: res.data };
}

module.exports = { loginAndGetToken: loginAndGetToken, redeemSteps: redeemSteps };
