'use strict';

const store = require('../../utils/store');
const entry = require('../../utils/entry');

// 与网页端 src/adopt/v1/adopt.js 的 adoptionV1Defaults / suggestions 对齐。
// 调试期不联网，使用本机展示资料；正式版由 GET /api/birds/by-code/{birdCode} 读取，
// 并按需求基线处理缺码、停用实体、查询失败与编码不一致，不伪造读取结果。
const DEFAULT_BIRD = Object.freeze({
    name: '西湖小黄莺',
    city: '杭州',
    style: '西湖小黄莺',
    skin: '绿色',
    nickname: '西湖小黄莺',
});
const TRAITS = ['温柔治愈', '热爱旅行', '好奇探索'];
const SUGGESTIONS = ['湖小叽', '西湖团团', '小桂', '啾啾', '慢慢'];

const ERROR_TEXT = {
    INVALID_CODE: '实体编码不可用，请从标签链接重新进入',
    INVALID_NICKNAME: '昵称需为 1–6 个字符',
    STORAGE_UNAVAILABLE: '本机数据写入失败，请重试',
};

// 入口参数统一交给 utils/entry.js 解析：
// URL Link / URL Scheme 的 query、自定义编译条件、站内跳转、小程序码 scene、二维码 q。
// 不改写已发行实体编码本身，只做参数搬运。
function readEntryBirdCode(options) {
    let code = entry.readBirdCode(options);
    if (code) return code;
    // 兼容「启动 path 不是领养页、但启动 query 带编码」的兜底场景。
    try {
        const app = getApp();
        return entry.normalizeBirdCode(app && app.globalData ? app.globalData.entryBirdCode : '');
    } catch (error) {
        return '';
    }
}

function chars(value) {
    return Array.from(String(value || ''));
}

// 领养页使用自定义导航栏：页面从屏幕顶端开始渲染，需为状态栏与右上角胶囊留出安全区。
// 统一换算成 rpx 交给 WXSS 内联 style，避免 px / rpx 在 calc 中混用带来的兼容问题。
function readTopInsetRpx() {
    const FALLBACK = 176;
    try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const width = info.windowWidth || 375;
        const statusBar = info.statusBarHeight || 20;
        let bottom = statusBar + 44;
        if (wx.getMenuButtonBoundingClientRect) {
            const menu = wx.getMenuButtonBoundingClientRect();
            if (menu && typeof menu.top === 'number' && typeof menu.height === 'number') {
                bottom = Math.max(bottom, menu.top + menu.height);
            }
        }
        const safePx = Math.min(Math.max(bottom + 8, 44), 160);
        return Math.round((safePx * 750) / width);
    } catch (error) {
        return FALLBACK;
    }
}

Page({
    data: {
        topInset: 176,
        showBackLink: false,
        birdCode: '',
        ready: false,
        alreadyMine: false,
        birdName: DEFAULT_BIRD.name,
        cityText: DEFAULT_BIRD.city,
        styleText: DEFAULT_BIRD.style,
        skinText: DEFAULT_BIRD.skin,
        traits: TRAITS,
        nicknameInput: '',
        validation: '',
        heading: '给小鸟取个名字吧～',
        buttonText: '读取资料后可领取',
        buttonDisabled: true,
        notice: '',
        noticeKind: 'info',
        actionNote: '调试版：本机展示资料，不联网、不发鸟蛋；正式版由实体资料接口读取。',
    },

    onLoad(options) {
        this.entryOptions = options || {};
        // NFC 直达领养页时页面栈只有 1 层，不需要任何返回入口；
        // 仅当从站内页面跳入时，在页面底部保留一个不显眼的退出口（顶部保持纯净）。
        this.setData({
            topInset: readTopInsetRpx(),
            showBackLink: getCurrentPages().length > 1,
        });
        this.load();
    },

    load() {
        const code = readEntryBirdCode(this.entryOptions);
        const result = store.snapshot();
        const snapshot = result.data ? result.data.snapshot : null;
        const alreadyMine = !!(snapshot && snapshot.hasBird && snapshot.birdCode === code && code);
        const ready = !!code;

        this.randomIndex = 0;
        this.setData({
            birdCode: code,
            ready: ready,
            alreadyMine: alreadyMine,
            birdName: ready ? DEFAULT_BIRD.name : '等待识别',
            cityText: ready ? DEFAULT_BIRD.city : '城市资料待确认',
            styleText: ready ? DEFAULT_BIRD.style : '款式待确认',
            skinText: ready ? DEFAULT_BIRD.skin : '出厂肤色待确认',
            nicknameInput: alreadyMine
                ? (snapshot.nickname || DEFAULT_BIRD.nickname)
                : (ready ? DEFAULT_BIRD.nickname : ''),
            validation: '',
            heading: alreadyMine ? '它已经住进你的小窝啦' : '给小鸟取个名字吧～',
            buttonText: alreadyMine
                ? '回小窝，看看它'
                : (ready ? '孵化并领养' : '读取资料后可领取'),
            buttonDisabled: !ready,
            notice: ready ? '' : '请碰一碰实体小鸟并打开系统弹出的链接。',
            noticeKind: ready ? 'info' : 'error',
        });
    },

    handleRetry() {
        this.load();
        wx.showToast({ title: '已重新读取本机资料', icon: 'none' });
    },

    handleBack() {
        if (getCurrentPages().length > 1) {
            wx.navigateBack({ delta: 1 });
            return;
        }
        wx.reLaunch({ url: '/pages/index/index' });
    },

    handleInput(event) {
        this.setData({ nicknameInput: event.detail.value, validation: '' });
    },

    handleRandom() {
        if (!this.data.ready || this.data.alreadyMine) {
            return;
        }
        const list = SUGGESTIONS;
        const index = this.randomIndex || 0;
        this.randomIndex = index + 1;
        this.setData({ nicknameInput: list[index % list.length], validation: '' });
    },

    handleAdopt() {
        if (!this.data.ready) {
            wx.showToast({ title: '请先从实体标签链接进入', icon: 'none' });
            return;
        }
        if (this.data.alreadyMine) {
            wx.reLaunch({ url: '/pages/index/index' });
            return;
        }
        const nickname = String(this.data.nicknameInput || '').trim();
        const parts = chars(nickname);
        if (parts.length < 1 || parts.length > 6) {
            this.setData({ validation: '请输入 1–6 个字，也可以使用随机取名。' });
            return;
        }
        const result = store.adopt(this.data.birdCode, nickname);
        if (result.error) {
            wx.showToast({ title: ERROR_TEXT[result.error] || '领养未完成', icon: 'none' });
            return;
        }
        wx.showToast({ title: '已保存到本机', icon: 'success' });
        setTimeout(function () {
            wx.reLaunch({ url: '/pages/index/index' });
        }, 600);
    },
});
