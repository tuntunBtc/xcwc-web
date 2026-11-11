'use strict';

// 小程序领养入口使用 code，同时兼容已发行链接中的 birdCode 和 bird。
// 规则依据（以微信官方最新规则为准）：
//  - URL Link / URL Scheme 的 query、开发者工具自定义编译条件、wx.navigateTo 的 query
//    会作为目标页 onLoad(options) 的参数传入；
//  - 小程序码 wxacode.getUnlimited 的自定义 scene 出现在 onLoad(options.scene)，
//    scene 上限 32 个可见字符，所以小程序码里只放纯编码，不放 "birdCode=" 前缀；
//  - App.onLaunch / onShow 的 options.query 是 Record<string,string> 启动参数，
//    options.scene 是数值场景值（如 1001 / 1047 / 1286），绝不能当实体编码解析。
// 本模块只做搬运与解码，不改写已发行的实体编码本身。

var ADOPT_PAGE = 'pages/adopt/adopt';
var CODE_QUERY_KEYS = ['code', 'birdCode', 'bird'];
var MAX_CODE_LENGTH = 64;

function normalize(value) {
    var code = typeof value === 'string' ? value.trim() : '';
    return code.length <= MAX_CODE_LENGTH && /^[A-Za-z0-9_-]+$/.test(code) ? code : '';
}

function decodeMaybe(value) {
    try {
        return decodeURIComponent(String(value));
    } catch (error) {
        return String(value);
    }
}

function pickQueryCode(query) {
    var pairs = query.split('&');
    var codes = [];
    for (var i = 0; i < pairs.length; i += 1) {
        var pair = pairs[i];
        if (!pair) continue;
        var eq = pair.indexOf('=');
        if (eq < 0) continue;
        var key = decodeMaybe(pair.slice(0, eq));
        if (CODE_QUERY_KEYS.indexOf(key) >= 0) codes.push(decodeMaybe(pair.slice(eq + 1)));
    }
    return codes.length === 1 ? normalize(codes[0]) : '';
}

// scene 是独立参数，支持纯编码和旧 query 写法，不使用 URL 的片段分隔规则。
function readSceneCode(scene) {
    var raw = scene.indexOf('=') >= 0 ? scene : decodeMaybe(scene);
    if (raw.indexOf('=') >= 0) return pickQueryCode(raw);
    return /^\d+$/.test(raw) ? '' : normalize(raw);
}

// 普通二维码的 q 参数承载完整 URL。兼容未编码 URL 和原有 query 写法。
function readQrCode(value) {
    var raw = String(value).split('#')[0];
    if (raw.indexOf('?') === -1 && raw.indexOf('=') === -1) raw = decodeMaybe(raw).split('#')[0];
    var qIndex = raw.indexOf('?');
    return pickQueryCode(qIndex >= 0 ? raw.slice(qIndex + 1) : raw);
}

// 页面级入口：URL Link / URL Scheme / 自定义编译条件 / 站内跳转 / 小程序码 / 普通二维码。
function readBirdCode(options) {
    var o = options || {};
    var keys = CODE_QUERY_KEYS.filter(function (key) { return o[key] !== undefined; });
    if (keys.length) return keys.length === 1 ? normalize(o[keys[0]]) : '';
    if (typeof o.scene === 'string' && o.scene) {
        var fromScene = readSceneCode(o.scene);
        if (fromScene) return fromScene;
    }
    if (o.q) {
        return readQrCode(o.q);
    }
    return '';
}

// 全局启动入口：只认 App 生命周期的 options.query。
// options.scene 是数值场景值，刻意不读取，避免把 1001 之类的数字当成实体编码。
function readBirdCodeFromLaunch(options) {
    var o = options || {};
    return readBirdCode(o.query);
}

function buildAdoptUrl(code) {
    return '/' + ADOPT_PAGE + '?code=' + encodeURIComponent(normalize(code));
}

function isManufacturingCode(code) {
    if (typeof code !== 'string' || code.length > 32 || !/^[A-Z]{2}-[A-Z][A-Z0-9]{1,7}-[1-9][0-9]{0,18}$/.test(code)) return false;
    var id = code.slice(code.lastIndexOf('-') + 1);
    return id.length < 19 || id <= '9223372036854775807';
}

module.exports = {
    ADOPT_PAGE: ADOPT_PAGE,
    normalizeBirdCode: normalize,
    readBirdCode: readBirdCode,
    readBirdCodeFromLaunch: readBirdCodeFromLaunch,
    buildAdoptUrl: buildAdoptUrl,
    isManufacturingCode: isManufacturingCode,
};
