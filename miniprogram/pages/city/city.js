'use strict';

const store = require('../../utils/store');
const safeArea = require('../../utils/safe-area');
const tabBar = require('../../utils/tab-bar');

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

// 调试期规则文案按本小程序 guest-store 的实际能力写，不沿用网页端「问候 / 合照」等
// 本端尚未实现的奖励，也不宣称云端钱包或跨设备同步。
const POINTS_RULES = '摸摸小鸟每次 +1 叽分，30 秒冷却；每日叽分上限 10。微信步数每 1000 步可兑换 1 叽分，每日最多 5（调试期为模拟数据，正式版由服务端结算）。叽分只保存在本机，不充值、不提现、不跨设备同步。网页端的问候、合照、装扮等规则在小程序端尚未接入，不会据此发放叽分。叽分不设到期，也不能兑换食物、饮水、孵化或城市基础权益。';

// 与 city.wxss 的 .hero-stage 高度保持一致：底图层 = 状态栏安全区 + 主视觉区。
// 两者用同一个数，插入画与下方卡片区之间才不会出现缝隙或重叠。
const HERO_STAGE_RPX = 519;

const HANGZHOU_EMPTY = '尚未领取杭州小鸟。碰一碰已建档的实体小黄莺并打开链接，即可领取。';
const OTHER_CITY_EMPTY = '这座城的小鸟暂未开放，敬请期待。';

// 调试期本机模型只有一只已领取并孵化的小黄莺（杭州）。
// 不根据编码前缀推断城市，不凭打开页面解锁、发鸟蛋或发放叽分；
// 正式版应由服务端按账号绑定关系返回可解锁城市。
function unlockedCityCodes(snapshot) {
    return snapshot && snapshot.hasBird ? ['hangzhou'] : [];
}

Page({
    data: {
        topInset: 176,
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
        const inset = safeArea.readTopInsetRpx();
        const viewport = safeArea.readViewportRpx();
        const sheetTop = inset + 40;
        this.setData({
            topInset: inset,
            heroSceneHeight: inset + HERO_STAGE_RPX,
            sheetTop: sheetTop,
            sheetMaxHeight: Math.max(600, viewport - sheetTop - 200),
        });
        this.render();
    },

    onShow() {
        tabBar.syncSelected(this, 1);
        // 切回城市 tab 时重新读取本机记录；全程只读，不发叽分、不领取小鸟。
        this.render();
    },

    // 筛选值显式传入，不依赖 setData 更新 this.data 的时序。
    render(requestedFilter) {
        const result = store.snapshot();
        const snapshot = result.data ? result.data.snapshot : null;
        this.snapshot = snapshot;
        const unlocked = unlockedCityCodes(snapshot);
        const unlockedCount = unlocked.length;
        const lockedCount = CITIES.length - unlockedCount;
        const filter = requestedFilter || this.data.filter;
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
            filter: filter,
            birdName: snapshot && snapshot.hasBird ? snapshot.nickname : '我的小鸟',
            points: snapshot ? snapshot.points : 0,
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

    handleCity(event) {
        const dataset = event && event.currentTarget ? event.currentTarget.dataset : null;
        const id = dataset ? dataset.id : '';
        const city = CITIES.filter(function (item) { return item.id === id; })[0];
        if (!city) return;
        const snapshot = this.snapshot;
        const hasBird = city.code === 'hangzhou' && !!(snapshot && snapshot.hasBird);
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
        const snapshot = this.snapshot || (store.snapshot().data || {}).snapshot || {};
        this.setData({
            sheetVisible: true,
            sheetKind: 'wallet',
            walletTitle: rulesFirst ? '叽分获取规则' : '本机叽分',
            walletRulesFirst: rulesFirst,
            walletRulesOpen: rulesFirst,
            walletLocalNoteOpen: false,
            todayPoints: snapshot.todayPoints || 0,
            dailyLimit: snapshot.dailyLimit || 10,
            ledger: snapshot.ledger || [],
        });
    },

    handleToggleRules() {
        this.setData({ walletRulesOpen: !this.data.walletRulesOpen });
    },

    handleToggleLocalNote() {
        this.setData({ walletLocalNoteOpen: !this.data.walletLocalNoteOpen });
    },

    // 调试期没有公开目录接口（等备案域名 + request 合法域名）。
    // 保留网页端同款「重新读取目录」入口，但明确提示未接入，不伪造读取成功或生成小鸟。
    handleRetryCatalog() {
        wx.showToast({ title: '公开目录待接入，本机伙伴仍可查看', icon: 'none' });
    },

    handleCloseSheet() {
        this.setData({ sheetVisible: false, sheetKind: '' });
    },

    // 网页端顶部入口进入「我的小鸟」列表（flock）；小程序暂无该页，
    // 先落到「我的」，保留真实昵称与叽分入口，不新增虚构页面。
    handleProfile() {
        wx.switchTab({ url: '/pages/profile/profile' });
    },

    // 对应网页端详情弹层里的「去小窝」。
    handleVisitBird() {
        this.setData({ sheetVisible: false, sheetKind: '' });
        wx.switchTab({ url: '/pages/index/index' });
    },

    noop() {},
});
