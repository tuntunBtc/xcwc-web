'use strict';

const store = require('../../utils/store');
const safeArea = require('../../utils/safe-area');
const tabBar = require('../../utils/tab-bar');
const collectionMedia = require('../../utils/collection-media');
const { ERROR_TEXT } = require('../../utils/nest-rules');

// 六城顺序、英文名、简介与雪碧图格位对齐网页端 src/city/city.js 的 cityCollectionCities，
// 也对应需求基线「城市页毛绒视觉与六城列表」：杭州/苏州/南京/上海/西安/武汉，三列两行，
// 筛选后保留原有相对顺序。
const CITIES = Object.freeze([
    { id: 'hz', code: 'hangzhou', name: '杭州', en: 'HANGZHOU', line: '一湖烟雨，半城诗意', artLeft: '0%', artTop: '0%' },
    { id: 'sz', code: 'suzhou', name: '苏州', en: 'SUZHOU', line: '一窗园林，一梦江南', artLeft: '-100%', artTop: '0%' },
    { id: 'nj', code: 'nanjing', name: '南京', en: 'NANJING', line: '金陵秋色，满城故事', artLeft: '-200%', artTop: '0%' },
    { id: 'sh', code: 'shanghai', name: '上海', en: 'SHANGHAI', line: '江风拂过，灯火可亲', artLeft: '0%', artTop: '-100%' },
    { id: 'xa', code: 'xian', name: '西安', en: 'XIAN', line: '长安一眼，千年回响', artLeft: '-100%', artTop: '-100%' },
    { id: 'wh', code: 'wuhan', name: '武汉', en: 'WUHAN', line: '江城花开，等你而来', artLeft: '-200%', artTop: '-100%' },
]);

const POINTS_RULES = '有效抚摸每次 +1 叽分，间隔 30 秒。每天前 3 张不同原图的合照各可获得 1 叽分，重复原图不计分。本机互动奖励共用每日额度，按北京时间结算。';

// 与 city.wxss 的 .hero-stage 高度保持一致：底图层 = 状态栏安全区 + 主视觉区。
// 两者用同一个数，插入画与下方卡片区之间才不会出现缝隙或重叠。
const HERO_STAGE_RPX = 519;

const HANGZHOU_EMPTY = '尚未领取杭州小鸟。碰一碰已建档的实体小黄莺并打开链接，即可领取。';
const OTHER_CITY_EMPTY = '本机还没有领取这座城的小鸟。';

// 本机模型保存一只小鸟及其已核验的城市。不凭编码前缀推断城市。
function unlockedCityCodes(snapshot) {
    return snapshot && snapshot.hasBird && CITIES.some(function (city) { return city.code === snapshot.cityCode; })
        ? [snapshot.cityCode] : [];
}

function readStatusBarHeight() {
    try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        if (info && Number.isFinite(info.statusBarHeight) && info.statusBarHeight >= 0) return info.statusBarHeight;
    } catch (error) {
        // 旧基础库取不到高度时保留常见的状态栏高度。
    }
    return 20;
}

Page({
    data: {
        topInset: 176,
        statusBarHeight: 20,
        statusBarCovered: false,
        citySprite: '',
        artworkLoading: false,
        artworkFailed: false,
        storageUnavailable: false,
        // 上半部分底图层总高度：安全区 + 主视觉区，onLoad 按真实 inset 重算。
        heroSceneHeight: 176 + HERO_STAGE_RPX,
        // 弹层顶部：H5 的 dialog 距顶 24px（≈40rpx）；自定义导航下再下移状态栏安全区，
        // 避免被右上角系统胶囊压住。
        sheetTop: 40,
        // 可用高度 = 视口 - 状态栏/胶囊 - 弹层上边距 - 自定义底栏(约 190rpx) - 余量。
        sheetMaxHeight: 1300,
        birdName: '我的小鸟',
        points: 0,
        cityTotal: CITIES.length,
        filter: 'all',
        visibleCities: [],
        unlockedCount: 0,
        lockedCount: CITIES.length,
        progressText: '0 / ' + CITIES.length,
        progressPercent: '0.00',
        showEmpty: false,
        emptyTitle: '旅程才刚刚开始',
        emptyDescription: '碰一碰实体小鸟并领取后，回来收集这座城。',
        sheetVisible: false,
        sheetKind: '',
        sheetCityName: '',
        sheetHasBird: false,
        sheetBirdName: '',
        sheetEmptyText: HANGZHOU_EMPTY,
        walletTitle: '本机叽分',
        walletRulesFirst: false,
        walletRulesOpen: false,
        walletLocalNoteOpen: false,
        pointsRules: POINTS_RULES,
        pointsRulesExtra: '服装换装本期暂未开放；叽分不提供充值。',
        todayPoints: 0,
        dailyLimit: 10,
        ledger: [],
    },

    onLoad() {
        this.updateLayout();
    },

    onResize() {
        this.updateLayout();
    },

    onPageScroll(event) {
        const statusBarCovered = event.scrollTop > 0;
        if (statusBarCovered !== this.data.statusBarCovered) this.setData({ statusBarCovered });
    },

    updateLayout() {
        const inset = safeArea.readTopInsetRpx();
        const viewport = safeArea.readViewportRpx();
        const sheetTop = inset + 40;
        this.setData({
            topInset: inset,
            statusBarHeight: readStatusBarHeight(),
            heroSceneHeight: inset + HERO_STAGE_RPX,
            sheetTop: sheetTop,
            sheetMaxHeight: Math.max(0, viewport - sheetTop - 200),
        });
    },

    onShow() {
        this.pageVisible = true;
        tabBar.syncSelected(this, 1);
        this.loadCityArtwork();
        // 切回城市 tab 时重新读取本机记录；全程只读，不发叽分、不领取小鸟。
        this.render();
    },

    onHide() {
        this.pageVisible = false;
        this.handleCloseSheet();
    },

    onUnload() {
        this.unloaded = true;
    },

    loadCityArtwork() {
        if (this.unloaded || this.data.citySprite) return;
        if (this.artworkPending) return this.artworkPending;
        this.setData({ artworkLoading: true });
        this.artworkPending = Promise.resolve().then(() => collectionMedia.load()).catch(() => null).then(media => {
            this.artworkPending = null;
            if (this.unloaded) return;
            const citySprite = media && media.citySprite || '';
            this.setData({ citySprite, artworkLoading: false, artworkFailed: !citySprite });
        });
        return this.artworkPending;
    },

    // 筛选值显式传入，不依赖 setData 更新 this.data 的时序。
    render(requestedFilter) {
        const result = store.snapshot();
        const snapshot = result.data ? result.data.snapshot : null;
        const filter = requestedFilter || this.pendingCityFilter || this.data.filter;
        if (!snapshot) {
            this.pendingCityFilter = filter;
            this.setData({ storageUnavailable: true });
            return false;
        }
        this.pendingCityFilter = null;
        this.snapshot = snapshot;
        const unlocked = unlockedCityCodes(snapshot);
        const unlockedCount = unlocked.length;
        const lockedCount = CITIES.length - unlockedCount;
        const filtered = CITIES.filter(function (city) {
            if (filter === 'unlocked') return unlocked.indexOf(city.code) !== -1;
            if (filter === 'locked') return unlocked.indexOf(city.code) === -1;
            return true;
        });
        const lastRow = Math.floor((filtered.length - 1) / 3);
        const visible = filtered.map(function (city, index) {
            const isUnlocked = unlocked.indexOf(city.code) !== -1;
            return Object.assign({}, city, {
                status: isUnlocked ? 'unlocked' : 'locked',
                statusText: isUnlocked ? '本机已解锁' : '尚未领取',
                rowEnd: index % 3 === 2,
                rowLast: Math.floor(index / 3) === lastRow,
            });
        });
        const complete = filter === 'locked' && unlockedCount === CITIES.length;
        this.setData({
            storageUnavailable: false,
            filter: filter,
            birdName: snapshot.hasBird ? snapshot.nickname : '我的小鸟',
            points: snapshot.points,
            visibleCities: visible,
            unlockedCount: unlockedCount,
            lockedCount: lockedCount,
            progressText: unlockedCount + ' / ' + CITIES.length,
            progressPercent: (unlockedCount / CITIES.length * 100).toFixed(2),
            showEmpty: visible.length === 0,
            emptyTitle: complete ? '城市已全部解锁' : '旅程才刚刚开始',
            emptyDescription: complete
                ? '六座城市都已收进手账，去看看陪你走过这些城市的小鸟吧。'
                : '碰一碰实体小鸟并领取后，回来收集这座城。',
        });
        return true;
    },

    handleFilter(event) {
        const dataset = event && event.currentTarget ? event.currentTarget.dataset : null;
        const next = dataset && dataset.filter ? dataset.filter : 'all';
        if (next !== 'all' && next !== 'unlocked' && next !== 'locked') return;
        this.render(next);
    },

    handleShowAll() {
        this.render('all');
    },

    retryCityData() {
        this.render();
    },

    handleCity(event) {
        const dataset = event && event.currentTarget ? event.currentTarget.dataset : null;
        const id = dataset ? dataset.id : '';
        const city = CITIES.filter(function (item) { return item.id === id; })[0];
        if (!city) return;
        if (!this.render()) {
            wx.showToast({ title: ERROR_TEXT.STORAGE_UNAVAILABLE, icon: 'none' });
            return;
        }
        const snapshot = this.snapshot;
        const hasBird = unlockedCityCodes(snapshot).indexOf(city.code) !== -1;
        this.setData({
            sheetVisible: true,
            sheetKind: 'birds',
            sheetCityName: city.name,
            sheetHasBird: hasBird,
            sheetBirdName: hasBird ? snapshot.nickname : '',
            sheetEmptyText: city.code === 'hangzhou' ? HANGZHOU_EMPTY : OTHER_CITY_EMPTY,
        });
    },

    handlePoints() {
        this.openWallet(false);
    },

    handlePointsRules() {
        this.openWallet(true);
    },

    openWallet(rulesFirst) {
        if (!this.render()) {
            wx.showToast({ title: ERROR_TEXT.STORAGE_UNAVAILABLE, icon: 'none' });
            return;
        }
        const snapshot = this.snapshot;
        this.setData({
            sheetVisible: true,
            sheetKind: 'wallet',
            walletTitle: rulesFirst ? '叽分获取规则' : '本机叽分',
            walletRulesFirst: rulesFirst,
            walletRulesOpen: rulesFirst,
            walletLocalNoteOpen: false,
            points: snapshot.points,
            todayPoints: snapshot.todayPoints,
            dailyLimit: snapshot.dailyLimit,
            ledger: snapshot.ledger,
        });
    },

    handleToggleRules() {
        this.setData({ walletRulesOpen: !this.data.walletRulesOpen });
    },

    handleToggleLocalNote() {
        this.setData({ walletLocalNoteOpen: !this.data.walletLocalNoteOpen });
    },

    handleCloseSheet() {
        this.setData({ sheetVisible: false, sheetKind: '' });
    },

    handleProfile() {
        this.switchShortcut('/pages/profile/profile', '我的页面暂时打不开，请重试', tabBar.requestProfileBirds);
    },

    // 对应网页端详情弹层里的「去小窝」。
    handleVisitBird() {
        this.switchShortcut('/pages/index/index', '小窝暂时打不开，请重试');
    },

    switchShortcut(url, failureText, prepareHandoff) {
        if (this.shortcutPending || this.unloaded) return;
        this.shortcutPending = true;
        const cancelHandoff = prepareHandoff && prepareHandoff();
        const fail = () => {
            if (cancelHandoff) cancelHandoff();
            if (this.pageVisible && !this.unloaded) wx.showToast({ title: failureText, icon: 'none' });
        };
        const complete = () => { this.shortcutPending = false; };
        try {
            wx.switchTab({ url, fail, complete });
        } catch (error) {
            complete();
            fail();
        }
    },

    noop() {},
});
