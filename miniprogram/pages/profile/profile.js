'use strict';

const store = require('../../utils/store');
const entry = require('../../utils/entry');
const config = require('../../utils/config');
const tabBar = require('../../utils/tab-bar');
const safeArea = require('../../utils/safe-area');
const collectionMedia = require('../../utils/collection-media');
const cloudUI = require('../../utils/cloud-ui');
const { ERROR_TEXT } = require('../../utils/nest-rules');
const { ORIOLE_AVATAR, birdAvatar } = require('../../utils/bird-preview-art');

const LOCAL_NOTE = '宠物、昵称、养成、库存和叽分保存在微信账号，登录后可换手机恢复。合照仍留在当前设备；旧体验记录隔离保留，不自动导入。';
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function formatLedgerTime(at) {
    if (typeof at !== 'number') return '';
    const d = new Date(at + BEIJING_OFFSET_MS);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 19).replace('T', ' ') : '';
}
const POINTS_RULES = '初见礼每账号一次 +5；摸摸每天最多 +10 叽分、奖励间隔 30 秒。没有奖励仍可陪伴。合照不发云端叽分，步数奖励暂未开放。';
const RESET_DESC = '只清除当前账号的云端展示缓存，随后可从服务端重新恢复。合照、旧体验记录、云端存档与权益均保留。';

function closedSheets() {
    return {
        walletVisible: false,
        resetVisible: false,
        birdsVisible: false,
        resetBusy: false,
    };
}

Page(cloudUI.page({
    data: {
        topInset: 176,
        profileBackground: '',
        artworkLoading: false,
        artworkFailed: false,
        storageUnavailable: false,
        displayName: '我的小伙伴',
        birdSubtitle: '等待第一位小伙伴',
        hasBird: false,
        avatar: ORIOLE_AVATAR,
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
        else if (stored) status = '微信已登录';
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
            wx.showToast({ title: result.error ? cloudUI.message(result.error) : action + '成功', icon: 'none' });
        }
    },

    async onPhoneLogin(event) {
        const state = store.status();
        if (!this.data.wechatLoginReady || this.data.wechatLoginBusy || state.loading || state.busy || !state.online) return;
        const detail = event && event.detail || {};
        if (typeof detail.code !== 'string' || !detail.code.trim()) {
            const denied = /deny|cancel|reject/i.test(String(detail.errMsg || ''));
            if (this.pageVisible) wx.showToast({ title: cloudUI.message(denied ? 'WX_PHONE_DENIED' : 'WX_PHONE_UNSUPPORTED'), icon: 'none' });
            return;
        }
        this.setData({ wechatLoginBusy: true });
        try {
            const result = await store.loginWithPhone(detail.code);
            if (this.unloaded) return;
            this.refreshWechatStatus();
            if (this.pageVisible) wx.showToast({ title: result.error ? cloudUI.message(result.error) : '手机号登录成功', icon: 'none' });
        } finally {
            if (!this.unloaded) this.setData({ wechatLoginBusy: false });
        }
    },

    onPhonePrivacy() {
        if (typeof wx.openPrivacyContract === 'function') {
            wx.openPrivacyContract({ fail: () => wx.showToast({ title: '暂时无法打开隐私指引，请稍后重试', icon: 'none' }) });
        } else {
            wx.showToast({ title: '请更新微信后查看隐私指引', icon: 'none' });
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
            birdSubtitle: snapshot.hasBird ? '当前陪伴 · 云端存档' : '暂无云端宠物',
            birdCount: snapshot.pets.length,
            pets: snapshot.pets.map(pet => ({ ...pet, avatar: birdAvatar(pet.birdCode) })), selectedPetId: snapshot.petId,
            avatar: snapshot.hasBird ? birdAvatar(snapshot.birdCode) : ORIOLE_AVATAR,
            birdCode: snapshot.birdCode || '',
            points: snapshot.points,
            todayPoints: snapshot.todayPoints,
            dailyLimit: snapshot.dailyLimit,
            ledger: ledger,
        });
        return true;
    },

    async onWallet() {
        if (!this.loadProfile()) {
            wx.showToast({ title: ERROR_TEXT.STORAGE_UNAVAILABLE, icon: 'none' });
            return;
        }
        this.setData(Object.assign(closedSheets(), { walletVisible: true }));
        await this.loadLedger(false);
    },

    async loadLedger(more) {
        const result = await cloudUI.run(this, () => store.history('points', more));
        if (!result) return;
        this.setData({ ledgerError: result.error ? cloudUI.message(result.error) : '', ledgerMore: !!(result.data && result.data.hasMore) });
        this.loadProfile();
    },
    onMoreLedger() { return this.loadLedger(!!this.data.ledgerMore); },
    async onSelectPet(event) {
        this.setData(closedSheets());
        await store.selectPet(event.currentTarget.dataset.id);
        this.loadProfile();
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
        const result = store.reset();
        const cleared = !result.error;
        if (!cleared) {
            this.setData({ resetBusy: false });
            wx.showToast({ title: cloudUI.message(result.error), icon: 'none' });
            return;
        }
        this.loadProfile();
        this.setData(closedSheets());
        wx.showToast({ title: '展示缓存已清除', icon: 'none' });
        store.resume();
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
}));
