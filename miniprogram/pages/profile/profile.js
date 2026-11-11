'use strict';

const store = require('../../utils/store');
const photoAlbum = require('../../utils/photo-album');
const cartStorage = require('../../utils/cart-storage');
const entry = require('../../utils/entry');
const config = require('../../utils/config');
const tabBar = require('../../utils/tab-bar');
const safeArea = require('../../utils/safe-area');
const collectionMedia = require('../../utils/collection-media');
const { ERROR_TEXT } = require('../../utils/nest-rules');

const LOCAL_NOTE = '小鸟、养成、叽分和装扮仅保存在当前设备，不与云端账号同步。清除小程序数据或更换设备后不会自动恢复；请先保存重要合照。';
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function formatLedgerTime(at) {
    if (typeof at !== 'number') return '';
    const d = new Date(at + BEIJING_OFFSET_MS);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 19).replace('T', ' ') : '';
}
const POINTS_RULES = '有效抚摸每次 +1 叽分，间隔 30 秒。每天前 3 张不同原图的合照各可获得 1 叽分，重复原图不计分。本机互动奖励共用每日额度，按北京时间结算。叽分不提供充值。';
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
        profileBackground: '',
        artworkLoading: false,
        artworkFailed: false,
        storageUnavailable: false,
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
        showDemoAdopt: false,
        wechatLoginReady: false,
        wechatLoginBusy: false,
        wechatSignedIn: false,
        wechatLoginStatus: '微信登录尚未开放',
        localNoteText: LOCAL_NOTE,
        pointsRules: POINTS_RULES,
        resetDesc: RESET_DESC,
    },

    onLoad() {
        this.onResize();
        this.setData({ showDemoAdopt: !!(config.USE_LOCAL_FIXTURE && config.DEBUG_DEMO_BIRD_CODE) });
    },

    onResize() {
        this.setData({ topInset: safeArea.readTopInsetRpx() });
    },

    onShow() {
        this.pageVisible = true;
        tabBar.syncSelected(this, 3);
        this.loadProfileArtwork();
        if (tabBar.takeProfileBirds()) this.onBirds();
        else this.loadProfile();
        return this.refreshWechatStatus(true);
    },

    onHide() {
        this.pageVisible = false;
        this.wechatStatusRequest = null;
        // 离页收起浮层，避免切回来时遮罩残留（E-09）。
        this.setData(closedSheets());
    },

    onUnload() {
        this.unloaded = true;
    },

    loadProfileArtwork() {
        if (this.unloaded || this.data.profileBackground) return;
        if (this.artworkPending) return this.artworkPending;
        this.setData({ artworkLoading: true });
        this.artworkPending = Promise.resolve().then(() => collectionMedia.load()).catch(() => null).then(media => {
            this.artworkPending = null;
            if (this.unloaded) return;
            const profileBackground = media && media.profileBackground || '';
            this.setData({ profileBackground, artworkLoading: false, artworkFailed: !profileBackground });
        });
        return this.artworkPending;
    },

    async refreshWechatStatus(verify) {
        this.wechatStatusRequest = null;
        const ready = !config.USE_LOCAL_FIXTURE && !!config.API_BASE;
        const stored = ready && store.readWechatSignedIn();
        const checking = verify && stored && !this.data.wechatLoginBusy;
        let status = '使用微信账号';
        if (!ready) status = '微信登录尚未开放';
        else if (stored === null) status = '本机登录记录暂时无法读取';
        else if (checking) status = '正在验证登录状态…';
        else if (stored) status = '本机已有登录记录';
        this.setData({
            wechatLoginReady: ready,
            wechatSignedIn: stored === null ? this.data.wechatSignedIn : stored,
            wechatLoginStatus: status,
        });
        if (!checking) return;
        const request = store.verifyWechatSession();
        this.wechatStatusRequest = request;
        const result = await request;
        if (this.wechatStatusRequest !== request || this.unloaded || this.data.wechatLoginBusy) return;
        this.wechatStatusRequest = null;
        if (result === 'changed') {
            this.refreshWechatStatus();
        } else if (result === 'expired') {
            this.setData({ wechatSignedIn: false, wechatLoginStatus: '登录已过期，请重新登录' });
        } else {
            this.setData({ wechatLoginStatus: result === 'valid' ? '微信已登录' : '暂时无法验证登录状态' });
        }
    },

    async onWechatAccount() {
        if (!this.data.wechatLoginReady || this.data.wechatLoginBusy) return;
        const signedIn = store.readWechatSignedIn();
        if (signedIn === null) {
            const action = this.data.wechatSignedIn ? '退出微信登录' : '微信登录';
            this.refreshWechatStatus();
            if (this.pageVisible) wx.showToast({ title: action + '失败，请重试', icon: 'none' });
            return;
        }
        // 其他页面可能在本页显示后完成登录，旧按钮只能同步状态。
        if (signedIn !== this.data.wechatSignedIn) {
            this.refreshWechatStatus();
            return;
        }
        this.setData({ wechatLoginBusy: true });
        const result = signedIn ? await store.logoutWechat() : await store.loginWithWechat();
        if (this.unloaded) return;
        this.setData({ wechatLoginBusy: false });
        this.refreshWechatStatus();
        if (!signedIn && result.error === 'NO_ENDPOINT') {
            const title = '微信登录暂时不可用';
            this.setData({ wechatLoginStatus: title });
            if (this.pageVisible) wx.showToast({ title, icon: 'none' });
            return;
        }
        if (this.pageVisible) {
            const action = signedIn ? '退出微信登录' : '微信登录';
            wx.showToast({ title: action + (result.error ? '失败，请重试' : '成功'), icon: 'none' });
        }
    },

    loadProfile() {
        const result = store.snapshot();
        const snapshot = result && result.data ? result.data.snapshot : null;
        if (!snapshot) {
            this.setData({ storageUnavailable: true });
            return false;
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
            storageUnavailable: false,
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
        return true;
    },

    onWallet() {
        if (!this.loadProfile()) {
            wx.showToast({ title: ERROR_TEXT.STORAGE_UNAVAILABLE, icon: 'none' });
            return;
        }
        this.setData(Object.assign(closedSheets(), { walletVisible: true }));
    },

    onBirds() {
        if (!this.loadProfile()) {
            wx.showToast({ title: ERROR_TEXT.STORAGE_UNAVAILABLE, icon: 'none' });
            return;
        }
        this.setData(Object.assign(closedSheets(), { birdsVisible: true }));
    },

    onWardrobe() {
        if (this.wardrobeNavigationPending) return;
        this.wardrobeNavigationPending = true;
        this.setData(closedSheets());
        wx.navigateTo({
            url: '/pages/wardrobe/wardrobe',
            fail: () => {
                if (!this.unloaded) wx.showToast({ title: '衣橱暂时打不开，请重试', icon: 'none' });
            },
            complete: () => { this.wardrobeNavigationPending = false; },
        });
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
        if (this.homeNavigationPending || this.unloaded) return;
        this.homeNavigationPending = true;
        wx.switchTab({
            url: '/pages/index/index',
            fail: () => {
                if (this.pageVisible && !this.unloaded) wx.showToast({ title: '小窝暂时打不开，请重试', icon: 'none' });
            },
            complete: () => { this.homeNavigationPending = false; },
        });
    },

    // 预览卡无法注入启动参数，保留站内带参入口用于调试 NFC 领养页。
    goAdopt() {
        if (!this.data.showDemoAdopt) return;
        this.setData(closedSheets());
        wx.navigateTo({ url: entry.buildAdoptUrl(config.DEBUG_DEMO_BIRD_CODE) });
    },

    // 遮罩内部点击/滑动不冒泡，避免误关或滚动穿透。
    noop() {},
});
