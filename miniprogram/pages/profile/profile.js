'use strict';

const store = require('../../utils/store');
const photoAlbum = require('../../utils/photo-album');
const cartStorage = require('../../utils/cart-storage');
const entry = require('../../utils/entry');
const config = require('../../utils/config');
const tabBar = require('../../utils/tab-bar');
const safeArea = require('../../utils/safe-area');

// 文案按小程序调试期实际能力写：本机单鸟、叽分只在本机结算、换装未接入。
// 不照搬 H5 的「初见礼 / 每日问候 / 合照奖励」，避免展示本机并不存在的奖励。
const LOCAL_NOTE = '小鸟、养成、叽分和装扮仅保存在当前设备，不与云端账号同步。清除小程序数据或更换设备后不会自动恢复；请先保存重要合照。';

function formatLedgerTime(at) {
    if (!at) {
        return '';
    }
    const d = new Date(at);
    const pad = function (n) { return String(n); };
    return pad(d.getFullYear()) + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}
const POINTS_RULES = '首次领取初见礼 +5，仅一次；每日问候 +2；同一天给同一只小鸟喂食和添水，照料奖励 +3，每天一次。有效抚摸 +1，间隔 30 秒，本机每日最多 10 次。每日最多 3 张新原图合照各 +1，重复原图只保存、不加分。每日额度按北京时间结算，各项奖励独立计算。服装换装本期暂未开放；叽分不提供充值。';
const RESET_DESC = '将删除本机的小鸟领取记录、昵称、养成状态、叽分及流水、装扮、购物车，以及相册中的原图和作品。';

function closedSheets() {
    return {
        walletVisible: false,
        resetVisible: false,
        birdsVisible: false,
        resetBusy: false,
    };
}

Page({
    data: {
        topInset: 176,
        displayName: '我的小伙伴',
        birdSubtitle: '等待第一位小伙伴',
        hasBird: false,
        birdCount: 0,
        birdCode: '',
        points: 0,
        todayPoints: 0,
        dailyLimit: 10,
        ledger: [],
        walletVisible: false,
        resetVisible: false,
        birdsVisible: false,
        localNoteOpen: false,
        rulesOpen: false,
        resetBusy: false,
        localNoteText: LOCAL_NOTE,
        pointsRules: POINTS_RULES,
        resetDesc: RESET_DESC,
    },

    onLoad() {
        // 自定义导航下页面从屏幕顶端渲染，状态栏与胶囊区由共享模块换算。
        this.setData({ topInset: safeArea.readTopInsetRpx() });
    },

    onShow() {
        tabBar.syncSelected(this, 3);
        this.loadProfile();
    },

    onHide() {
        // 离页收起浮层，避免切回来时遮罩残留（E-09）。
        this.setData(closedSheets());
    },

    onUnload() {
        this.setData(closedSheets());
    },

    loadProfile() {
        const result = store.snapshot();
        const snapshot = result && result.data ? result.data.snapshot : null;
        if (!snapshot) {
            return;
        }
        const ledger = (snapshot.ledger || []).map(function (item) {
            return {
                id: item.id,
                dayText: formatLedgerTime(item.at) || '本机记录',
                note: item.note,
                amountText: item.amountText,
                balanceText: '变动后余额 ' + (item.balanceAfter != null ? item.balanceAfter : ''),
            };
        });
        this.setData({
            hasBird: !!snapshot.hasBird,
            displayName: snapshot.hasBird ? snapshot.nickname : '我的小伙伴',
            birdSubtitle: snapshot.hasBird ? '当前陪伴 · 本机保存' : '等待第一位小伙伴',
            birdCount: snapshot.hasBird ? 1 : 0,
            birdCode: snapshot.birdCode || '',
            points: snapshot.points,
            todayPoints: snapshot.todayPoints,
            dailyLimit: snapshot.dailyLimit,
            ledger: ledger,
        });
    },

    onWallet() {
        this.setData(Object.assign(closedSheets(), { walletVisible: true }));
    },

    onBirds() {
        this.setData(Object.assign(closedSheets(), { birdsVisible: true }));
    },

    onWardrobe() {
        // 网页端「我的 → 我的衣橱」与小窝「换装」共用 wardrobe 路由，
        // 不再用页内浮层，统一跳独立衣橱页（当前为服装展示 · 暂未开放）。
        this.setData(closedSheets());
        wx.navigateTo({ url: '/pages/wardrobe/wardrobe' });
    },

    onReset() {
        this.setData(Object.assign(closedSheets(), { resetVisible: true }));
    },

    closeSheets() {
        this.setData(closedSheets());
    },

    toggleLocalNote() {
        this.setData({ localNoteOpen: !this.data.localNoteOpen });
    },

    toggleRules() {
        this.setData({ rulesOpen: !this.data.rulesOpen });
    },

    confirmReset() {
        if (this.data.resetBusy) {
            return;
        }
        this.setData({ resetBusy: true });
        // 相册先保留未删文件的索引以便重试，再清除购物车和养成记录。
        const cleared = photoAlbum.clear() && cartStorage.clear() && !store.reset().error;
        if (!cleared) {
            this.setData({ resetBusy: false });
            wx.showToast({ title: '清除未完成，请重试', icon: 'none' });
            return;
        }
        this.loadProfile();
        this.setData(closedSheets());
        wx.showToast({ title: '已清除', icon: 'none' });
    },

    goHome() {
        this.setData(closedSheets());
        wx.switchTab({ url: '/pages/index/index' });
    },

    // 预览卡无法注入启动参数，保留站内带参入口用于调试 NFC 领养页。
    goAdopt() {
        this.setData(closedSheets());
        wx.navigateTo({ url: entry.buildAdoptUrl(config.DEBUG_DEMO_BIRD_CODE) });
    },

    // 遮罩内部点击/滑动不冒泡，避免误关或滚动穿透。
    noop() {},
});
