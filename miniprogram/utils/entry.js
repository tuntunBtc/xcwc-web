'use strict';

// 小程序端「带着 birdCode 进入领养页」的统一入口解析。
// 规则依据（以微信官方最新规则为准）：
//  - URL Link / URL Scheme 的 query、开发者工具自定义编译条件、wx.navigateTo 的 query
//    会作为目标页 onLoad(options) 的参数传入；
//  - 小程序码 wxacode.getUnlimited 的自定义 scene 出现在 onLoad(options.scene)，
//    scene 上限 32 个可见字符，所以小程序码里只放纯编码，不放 "birdCode=" 前缀；
//  - App.onLaunch / onShow 的 options.query 是 Record<string,string> 启动参数，
//    options.scene 是数值场景值（如 1001 / 1047 / 1286），绝不能当实体编码解析。
// 本模块只做搬运与解码，不改写已发行的实体编码本身。

var ADOPT_PAGE = 'pages/adopt/adopt';
var MAX_CODE_LENGTH = 64;

function normalize(value) {
    return String(value === null || value === undefined ? '' : value)
        .trim()
        .slice(0, MAX_CODE_LENGTH);
}

function decodeMaybe(value) {
    try {
        return decodeURIComponent(String(value));
    } catch (error) {
        return String(value);
    }
}

// 兼容三种写法：
//   "birdCode=HZ-HY-xxx"、"a=1&birdCode=HZ-HY-xxx"、
//   完整 URL 的 query（options.q）、以及 scene 里只有纯编码的 "HZ-HY-xxx"。
function pickCode(text) {
    var raw = decodeMaybe(text);
    var qIndex = raw.indexOf('?');
    var query = qIndex >= 0 ? raw.slice(qIndex + 1) : raw;
    var pairs = query.split('&');
    var bare = '';
    for (var i = 0; i < pairs.length; i += 1) {
        var pair = pairs[i];
        if (!pair) continue;
        var eq = pair.indexOf('=');
        var key = eq === -1 ? '' : pair.slice(0, eq);
        var value = eq === -1 ? pair : pair.slice(eq + 1);
        if (key === 'birdCode' || key === 'bird') return normalize(value);
        if (eq === -1 && !bare) bare = normalize(value);
    }
    return bare;
}

// 页面级入口：URL Link / URL Scheme / 自定义编译条件 / 站内跳转 / 小程序码 / 普通二维码。
function readBirdCode(options) {
    var o = options || {};
    var direct = normalize(o.birdCode || o.bird);
    if (direct) return direct;
    if (o.scene !== undefined && o.scene !== null && o.scene !== '') {
        var fromScene = pickCode(o.scene);
        if (fromScene) return fromScene;
    }
    if (o.q) {
        var fromQ = pickCode(o.q);
        if (fromQ) return fromQ;
    }
    return '';
}

// 全局启动入口：只认 App 生命周期的 options.query。
// options.scene 是数值场景值，刻意不读取，避免把 1001 之类的数字当成实体编码。
function readBirdCodeFromLaunch(options) {
    var o = options || {};
    var query = o.query || {};
    return readBirdCode({
        birdCode: query.birdCode,
        bird: query.bird,
        q: query.q,
    });
}

function buildAdoptUrl(code) {
    return '/' + ADOPT_PAGE + '?birdCode=' + encodeURIComponent(normalize(code));
}

module.exports = {
    ADOPT_PAGE: ADOPT_PAGE,
    normalizeBirdCode: normalize,
    readBirdCode: readBirdCode,
    readBirdCodeFromLaunch: readBirdCodeFromLaunch,
    buildAdoptUrl: buildAdoptUrl,
};
