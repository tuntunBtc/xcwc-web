'use strict';

const store = require('../../utils/store');
const entry = require('../../utils/entry');
const config = require('../../utils/config');
const tabBar = require('../../utils/tab-bar');
const rules = require('../../utils/nest-rules');
const nestLayout = require('../../utils/nest-layout');
const nestIdle = require('../../utils/nest-idle');
const { dayKey } = require('../../utils/guest-store');
const STATUS_REFRESH_MS = 5000;

const STEP_SUPPLY_ERROR_TEXT = Object.freeze({
    NO_ENDPOINT: '微信步数补给暂未开放。',
    NO_BIRD: '请先领养一只小鸟。',
    STOCK_FULL: '食物和水的库存已满，消耗后可以再领。',
    STORAGE_UNAVAILABLE: '本机记录暂时无法读写，请重试。',
    WERUN_DENIED: '微信运动权限未开启，开启后可重新读取步数。',
    PRIVACY_NOT_AUTHORIZED: '同意小程序隐私保护指引后，才能读取步数。',
    PRIVACY_UNAVAILABLE: rules.ERROR_TEXT.PRIVACY_UNAVAILABLE,
    WX_LOGIN_REQUIRED: '微信登录已失效，请重试。',
    WX_LOGIN_FAILED: '暂时无法完成微信登录，请重试。',
    LOGIN_FAILED: '暂时无法完成微信登录，请重试。',
    LOGIN_CODE_MISSING: '暂时无法完成微信登录，请重试。',
    RATE_LIMITED: '请求太频繁，请稍后再试。',
    SUPPLY_DAY_CHANGED: '已进入新的一天，请重新读取微信步数。',
    SUPPLY_CONTEXT_CHANGED: '本机领养记录已变化，请重新读取微信步数。',
    WX_SESSION_CHANGED: '微信登录状态已变化，请重新读取步数。',
    SUPPLY_BIRD_MISMATCH: '本机小鸟已变化，请重新读取微信步数。',
    BIRD_NOT_FOUND: '暂未找到这只小鸟的领养记录。',
    BIRD_INACTIVE: '这只小鸟的领养资料已停用。',
    INVALID_SUPPLY_RECEIPT: '补给记录暂时无法核对，请重试。',
});
function describeStepSupply(data) {
    const localClaimed = data.localClaimed === true;
    const restore = data.claimed && (data.restoreAvailable === true || !!data.receipt) && !localClaimed;
    const shortfall = Math.max(0, data.requiredSteps - data.steps);
    let note = '还差 ' + shortfall + ' 步。';
    if (localClaimed) note = '今日补给已入库。';
    else if (restore) note = '已有领取记录，可以恢复到本机。';
    else if (data.claimed) note = '这个微信账号今日已领取。';
    else if (data.claimable) note = '已达到领取目标。';
    return {
        date: data.date,
        displayedOn: dayKey(Date.now()),
        steps: data.steps,
        requiredSteps: data.requiredSteps,
        cached: data.cached === true,
        progress: Math.min(100, Math.round(data.steps / data.requiredSteps * 100)),
        note: note,
        claimed: data.claimed || localClaimed,
        restore: restore,
        canClaim: !localClaimed && (data.claimable || restore),
    };
}

// 与网页端 src/nest/template.html 的导航、工具、状态顺序一致。
// 雪碧图格位对应 H5 的 .tools .p0~p3、cards-1200 三格、hud-icons 3×2。
const TOOLS = Object.freeze([
    { key: 'clean', label: '清洁', propClass: 'prop-clean' },
    { key: 'supply', label: '补给', propClass: 'prop-supply' },
    { key: 'checkin', label: '合照打卡', propClass: 'prop-checkin' },
    { key: 'dress', label: '换装', propClass: 'prop-dress' },
]);
const DOCK = Object.freeze([
    { key: 'feed', label: '喂食', cardClass: 'card-feed' },
    { key: 'water', label: '添水', cardClass: 'card-water' },
    { key: 'touch', label: '摸摸', cardClass: 'card-touch' },
]);
const STAT_META = Object.freeze([
    { key: 'hunger', label: '饱食', iconClass: 'icon-food' },
    { key: 'water', label: '水分', iconClass: 'icon-water' },
    { key: 'mood', label: '心情', iconClass: 'icon-mood' },
]);

Page({
    data: {
        // 静态兜底：onLoad 算出真实机型数值前，首帧也能正确布局。
        layout: {
            pageHeight: 1279, viewportHeight: 1428, tabBarHeight: 149, dockBottom: 9, toastBottom: 340, actorHeight: 322,
            // 顶部组首帧按「胶囊同排」典型机型（375px / 灵动岛）给值，onLoad 立刻用真机矩形覆盖；
            // hudRight 是胶囊左侧避让量，场景主体仍沿用上面的既有兜底。
            hudTop: 124, hudRight: 184, statusTop: 244, needsTop: 346, toolsTop: 386,
            speechTop: 506, claimTop: 641, actorTop: 750,
        },
        hasBird: false,
        storageUnavailable: false,
        displayName: '等待小鸟入住',
        placeText: '⌖ 我的小窝',
        birdCodeShort: '',
        points: 0,
        todayPoints: 0,
        dailyLimit: 10,
        food: 3,
        water: 3,
        satiety: 0,
        hydration: 0,
        mood: 0,
        supplyClaimed: false,
        stepSupplyEnabled: false,
        stepSupplyStatus: null,
        stepSupplyBusy: '',
        stepSupplyNotice: '',
        stepSupplyNeedsSetting: false,
        fixtureMode: config.USE_LOCAL_FIXTURE,
        todayStepClaimed: false,
        redeeming: false,
        werunNeedsSetting: false,
        ledger: [],
        stats: [],
        needs: [],
        speech: '',
        birdArt: '/assets/nest/poster.webp',
        thirsty: false,
        happy: false,
        motionPaused: false,
        idleReady: false,
        idlePlaying: false,
        showIdleButton: false,
        toast: '',
        sheet: null,
        sheetMaskBottom: 149,        // 弹框遮罩底边：默认落在 tabBar 上沿（兜底值，onLoad 后精确化）
        keyboardHeightRpx: 0,        // 改名输入框唤起键盘时的高度（rpx），用于抬升面板
        renameValue: '',
        feedFxId: 0,                 // 喂食动效计数：每次喂食 +1，配合 wx:if 重触发谷粒动画
        waterFxId: 0,                // 添水动效计数：每次添水 +1，配合 wx:if 重触发水滴动画
        tools: TOOLS,
        dock: DOCK,
    },

    onLoad() {
        this.statusTimer = null;
        this.currentBirdCode = '';
        this.toastTimer = null;
        this.happyTimer = null;
        this.feedbackTimer = null;
        this.feedFxTimer = null;
        this.feedFxHideTimer = null;
        this.waterFxTimer = null;
        this.waterFxHideTimer = null;
        this.feedback = null;
        // 互动鸟叫 + 待机动画原声：与网页端一致，首次用户手势后自动播放待机动画并带原声，
        // 照料 / 摸摸等互动播放短鸟叫（InnerAudioContext，小程序无 Web Audio）。
        this.chirpAudio = null;
        this.idle = nestIdle.createNestIdle(this, {
            loadFiles: () => require.async('../../media/nest-idle/files.js'),
            canvasId: '#idleCanvas',
            isEligible: () => !this.feedbackActive() && !this.data.happy,
            onCycleEnd: () => this.syncIdle(false),
            onStarted: () => {},
            onBlocked: () => {},
        });
        // 改名弹框含输入框，需随键盘抬升面板；用箭头函数绑定 this 以便卸载时 off 注销（E-09）。
        this.onKeyboardHeightChange = (e) => this.handleKeyboardChange(e);
        try { wx.onKeyboardHeightChange(this.onKeyboardHeightChange); } catch (err) { /* 老基础库无此 API，忽略 */ }
        this.updateLayout();
        this.refresh();
    },

    onResize() {
        this.updateLayout();
    },

    updateLayout() {
        this.setData({ layout: nestLayout.readNestLayout() });
        this.recalcSheetMask();
    },

    onShow() {
        tabBar.syncSelected(this, 0);
        // 面板若仍打开（例如切走再切回），动画应保持暂停，不能与遮罩状态相反。
        this.setData({ motionPaused: !!this.data.sheet });
        this.refresh();
        if (this.statusTimer === null) {
            this.statusTimer = setInterval(() => this.refresh(), STATUS_REFRESH_MS);
        }
    },

    onHide() {
        this.syncIdle(true);
        this.clearTimers();
        if (this.chirpAudio) { try { this.chirpAudio.stop(); } catch (e) { /* ignore */ } }
        const request = this.stepSupplyRequest;
        const keepSupplySheet = request && request.action === 'settings' && this.isCurrentStepSupply(request);
        this.setData({
            motionPaused: true, sheet: keepSupplySheet ? this.data.sheet : null, keyboardHeightRpx: 0,
            toast: '', happy: false, feedFxId: 0, waterFxId: 0,
        });
    },

    onUnload() {
        this.stepSupplyRequest = null;
        if (this.onKeyboardHeightChange) {
            try { wx.offKeyboardHeightChange(this.onKeyboardHeightChange); } catch (err) { /* ignore */ }
        }
        this.clearTimers();
        // 销毁待机动画资源（音频 + 画布引用），避免离页后持续占用与内存泄漏。
        if (this.idle) { try { this.idle.dispose(); } catch (e) { /* ignore */ } this.idle = null; }
        if (this.chirpAudio) { try { this.chirpAudio.destroy(); } catch (e) { /* ignore */ } this.chirpAudio = null; }
    },

    clearTimers() {
        if (this.statusTimer !== null) {
            clearInterval(this.statusTimer);
            this.statusTimer = null;
        }
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
            this.toastTimer = null;
        }
        if (this.happyTimer) {
            clearTimeout(this.happyTimer);
            this.happyTimer = null;
        }
        if (this.feedbackTimer) {
            clearTimeout(this.feedbackTimer);
            this.feedbackTimer = null;
        }
        if (this.feedFxTimer) {
            clearTimeout(this.feedFxTimer);
            this.feedFxTimer = null;
        }
        if (this.feedFxHideTimer) {
            clearTimeout(this.feedFxHideTimer);
            this.feedFxHideTimer = null;
        }
        if (this.waterFxTimer) {
            clearTimeout(this.waterFxTimer);
            this.waterFxTimer = null;
        }
        if (this.waterFxHideTimer) {
            clearTimeout(this.waterFxHideTimer);
            this.waterFxHideTimer = null;
        }
        this.feedback = null;
    },

    // 单次 setData 只提交展示字段，不把整个状态对象塞进视图层（E-02）。
    refresh() {
        this.clearExpiredStepSupply();
        const result = store.snapshot();
        const s = result.data ? result.data.snapshot : null;
        if (!s) {
            this.setData({ storageUnavailable: true, speech: '本机记录暂时无法读取，请重试。' });
            this.syncIdle(true);
            return;
        }
        const state = rules.describeNestState(s, s.hasBird);
        // 交互反馈有效期内，气泡文案与开心表情不被状态刷新覆盖（对齐 H5 的 interactionEmotion）。
        const feedbackActive = !!(this.feedback && Date.now() < this.feedback.until);
        const stats = STAT_META.map(function (meta) {
            const value = meta.key === 'hunger' ? s.satiety : (meta.key === 'water' ? s.hydration : s.mood);
            const percent = s.hasBird ? Math.min(100, Math.max(0, value)) : 0;
            return {
                key: meta.key,
                label: meta.label,
                iconClass: meta.iconClass,
                text: s.hasBird ? percent + '%' : '—',
                percent: percent,
            };
        });
        const needs = state.needs.map(function (need) {
            return {
                key: need.key,
                label: need.label,
                isCurrent: need.key === state.need,
            };
        });
        const code = s.birdCode || '';
        this.currentBirdCode = code;
        this.setData({
            hasBird: s.hasBird,
            storageUnavailable: false,
            displayName: s.hasBird ? s.nickname : '等待小鸟入住',
            placeText: s.hasBird ? '⌖ 江南小窝' : '⌖ 我的小窝',
            birdCodeShort: code ? '编码 ···' + code.slice(-6) : '尚未领养',
            points: s.points,
            todayPoints: s.todayPoints,
            dailyLimit: s.dailyLimit,
            food: s.food,
            water: s.water,
            satiety: s.satiety,
            hydration: s.hydration,
            mood: s.mood,
            supplyClaimed: !!s.supplyClaimed,
            todayStepClaimed: !!s.todayStepClaimed,
            ledger: s.ledger,
            stats: stats,
            needs: needs,
            speech: feedbackActive ? this.feedback.speech : state.speech,
            birdArt: feedbackActive ? '/assets/nest/emotion-happy.webp' : rules.emotionArt(state.emotion),
            thirsty: state.emotion === 'thirsty',
        });
        // 状态刷新后同步待机动画：领养状态 / 面板开关变化都要反映到动画播放。
        this.syncIdle(false);
    },

    showToast(text) {
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }
        this.setData({ toast: text });
        const page = this;
        this.toastTimer = setTimeout(function () {
            page.setData({ toast: '' });
            page.toastTimer = null;
        }, 2200);
    },

    // 互动反馈（摸摸 / 照料 / 改名成功）有效期内的标记，用于暂停待机动画与短反馈互斥。
    feedbackActive() {
        return !!(this.feedback && Date.now() < this.feedback.until);
    },

    // 同步待机动画播放状态：已领养、页面在前台、面板未开、且「不在互动反馈期」才允许播放。
    // 关键：互动反馈（1.6s 开心表情 / happy）期间必须暂停待机动画——否则待机画布盖住立绘、
    // idlePlaying 又把静态开心海报隐藏，nest-happy 弹跳 / 爱心 / 谷粒 / 水滴这些互动动效全都看不见
    // （用户反馈「浇水、喂食、摸摸的动效没了」）。暂停时 idle.stop() 会清空画布并停音，海报恢复可见；
    // 反馈结束 refresh() 会重新 syncIdle(false) 恢复待机，且受 cadence 冷却闸门约束不会立刻重播。
    syncIdle(suspended) {
        if (!this.idle) return;
        const hasBird = this.data.hasBird;
        const birdId = hasBird ? this.currentBirdCode || 'local-bird' : null;
        const feedbacking = this.feedbackActive() || this.data.happy;
        this.idle.sync(hasBird, !!(suspended || this.data.motionPaused || this.data.storageUnavailable || feedbacking), birdId, hasBird);
    },

    // 短鸟叫：与网页端 Web Audio 合成的轻量鸟叫等价，用 InnerAudioContext 播放。
    // 仅在用户手势（摸摸 / 喂食 / 添水 / 清洁 / 补给）内触发，不阻塞主流程。
    playChirp() {
        try {
            if (!this.chirpAudio) {
                this.chirpAudio = wx.createInnerAudioContext();
                this.chirpAudio.src = '/assets/nest/chirp.mp3';
            }
            this.chirpAudio.stop();
            this.chirpAudio.play();
        } catch (error) { /* 音频不可用时主流程继续 */ }
    },

    onIdleRetry() {
        if (this.idle) this.idle.retry();
    },

    applyResult(result, action, closeSheetOnSuccess) {
        if (result.error) {
            this.showToast(rules.ERROR_TEXT[result.error] || '操作未完成');
            return false;
        }
        if (result.data && result.data.changed === false) {
            this.refresh();
            this.showToast(rules.careCopy(action, false).notice);
            return false;
        }
        const copy = rules.careCopy(action, true);
        if (copy.speech) {
            this.showFeedback(copy.speech, 1600);
        }
        this.refresh();
        if (closeSheetOnSuccess) {
            this.setData({ sheet: null, motionPaused: false });
        }
        return true;
    },

    // 对齐网页端 nest.js 的 interactionEmotion：反馈期间保留气泡与开心表情，
    // 到期后再回到状态驱动，避免 setData 与紧随的 refresh 互相覆盖。
    showFeedback(speech, duration) {
        const keep = duration || 1600;
        this.feedback = { until: Date.now() + keep, speech: speech };
        if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
        if (this.happyTimer) clearTimeout(this.happyTimer);
        this.setData({ speech: speech, birdArt: '/assets/nest/emotion-happy.webp', happy: false });
        // 互动反馈一开始就让待机动画「让位」：暂停后 idle.stop() 会清空画布、停掉原声，
        // idlePlaying 变 false，静态开心海报重新可见——nest-happy 弹跳 / 爱心 / 谷粒 / 水滴
        // 这些画在海报那一层的动效才能被看见（否则全被待机画布盖住，表现为「动效没了」）。
        // 反馈到期后的 refresh() 会再次 syncIdle(false) 恢复待机，且受 cadence 冷却闸门约束不会立刻重播。
        this.syncIdle(false);
        const page = this;
        // 下一帧再加 class，确保连续点击时动画能重新触发。
        this.happyTimer = setTimeout(function () {
            page.setData({ happy: true });
        }, 30);
        this.feedbackTimer = setTimeout(function () {
            page.feedback = null;
            page.feedbackTimer = null;
            page.happyTimer = null;
            page.setData({ happy: false });
            page.refresh();
        }, keep);
    },

    doCare(action, closeSheetOnSuccess) {
        if (!this.requireBird()) return;
        const ok = this.applyResult(action === 'feed' ? store.feed() : store.water(), action, closeSheetOnSuccess);
        if (ok) {
            // 按动作给专属反馈动效：喂食谷粒、添水水滴；摸一摸走 showFeedback 的开心弹跳 + 爱心。
            if (action === 'water') this.triggerWaterFx();
            else this.triggerFeedFx();
            this.playChirp();
            this.idle.kick();
        }
    },

    requireBird() {
        if (this.data.storageUnavailable) {
            this.refresh();
            if (this.data.storageUnavailable) {
                this.showToast(rules.ERROR_TEXT.STORAGE_UNAVAILABLE);
                return false;
            }
        }
        if (this.data.hasBird) {
            return true;
        }
        this.openSheet({ type: 'claim', title: '把伙伴带回小窝' });
        return false;
    },

    // ---------- 底部 dock ----------
    onDock(event) {
        const key = event.currentTarget.dataset.key;
        if (key === 'feed') {
            this.onFeed();
            return;
        }
        if (key === 'water') {
            this.doCare('water', false);
            return;
        }
        if (key === 'touch') {
            this.pet();
        }
    },

    pet() {
        if (!this.requireBird()) return;
        const result = store.pet();
        if (result.error) {
            this.showToast(rules.ERROR_TEXT[result.error] || '摸摸未完成');
            return;
        }
        this.showFeedback('嘿嘿，你摸摸我，我就开心啦～', 1600);
        if (result.data && result.data.granted > 0) {
            this.showToast('叽分 +' + result.data.granted);
        }
        this.playChirp();
        this.idle.kick();
        this.refresh();
    },

    onPet() {
        this.pet();
    },

    // ---------- 右侧工具 ----------
    onTool(event) {
        const key = event.currentTarget.dataset.key;
        if (key === 'clean') {
            if (!this.requireBird()) return;
            if (this.applyResult(store.clean(), 'clean', false)) {
                this.playChirp();
                this.idle.kick();
            }
            return;
        }
        if (key === 'supply') {
            this.onOpenSupply();
            return;
        }
        if (key === 'checkin') {
            // 网页端从小窝右侧「合照打卡」直达 photo 路由；此处为同一入口。
            this.openToolPage('/pages/photo/photo', '合照打卡暂时打不开，请重试');
            return;
        }
        // 网页端小窝「换装」直达 wardrobe 路由；这里是同一个独立衣橱页。
        // 该页当前为「服装展示 · 暂未开放」，与网页端保持一致，不伪造兑换或穿戴。
        if (key === 'dress') {
            this.openToolPage('/pages/wardrobe/wardrobe', '衣橱暂时打不开，请重试');
        }
    },

    openToolPage(url, errorText) {
        if (this.toolNavigationPending) return;
        this.toolNavigationPending = true;
        wx.navigateTo({
            url: url,
            fail: () => this.showToast(errorText),
            complete: () => { this.toolNavigationPending = false; },
        });
    },

    onNeed(event) {
        const key = event.currentTarget.dataset.key;
        if (!this.requireBird()) return;
        if (key === 'food' || key === 'water') {
            this.doCare(key === 'food' ? 'feed' : 'water', false);
        } else {
            this.pet();
        }
    },

    // ---------- 面板 ----------
    openSheet(sheet) {
        this.setData({ sheet: sheet, motionPaused: true });
        this.recalcSheetMask(sheet);
        // 面板打开时暂停待机动画与音效（框架层 tabBar 在下，面板在上，动画不应穿透遮罩）。
        this.syncIdle(false);
    },

    // 弹框遮罩要停靠在自定义 tabBar 上沿：框架层 tabBar 的 z-index:1000 盖不住，
    // 只能把面板整体从屏幕底部上移到 tabBarHeight 之上（与 toast/dock 规避同构）。
    // 改名时键盘覆盖底栏，面板只需要避开较高的一项。
    recalcSheetMask(sheet) {
        const target = sheet || this.data.sheet;
        const keyboard = (target && target.type === 'rename') ? (this.data.keyboardHeightRpx || 0) : 0;
        const bottom = Math.max(this.data.layout.tabBarHeight || 149, keyboard);
        if (bottom !== this.data.sheetMaskBottom) {
            this.setData({ sheetMaskBottom: bottom });
        }
    },

    handleKeyboardChange(e) {
        let rpx = 0;
        try {
            const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            const width = info.windowWidth || 375;
            rpx = Math.round((e.height * 750) / width);
        } catch (err) {
            rpx = 0;
        }
        this.setData({ keyboardHeightRpx: rpx });
        this.recalcSheetMask();
    },

    closeSheet() {
        this.setData({ sheet: null, motionPaused: false, keyboardHeightRpx: 0 });
        this.recalcSheetMask(null);
        this.refresh();
    },

    noop() {},

    onRename() {
        if (!this.requireBird()) return;
        this.setData({ renameValue: this.data.displayName });
        this.openSheet({ type: 'rename', title: '给小鸟改个名字', desc: '1–6 个字，仅保存在本机。' });
    },

    onRenameInput(event) {
        this.setData({ renameValue: event.detail.value });
    },

    onSaveRename() {
        const result = store.rename(this.data.renameValue);
        if (result.error) {
            this.showToast(rules.ERROR_TEXT[result.error] || '昵称未保存');
            return;
        }
        this.showToast('昵称已保存');
        this.setData({ sheet: null, motionPaused: false, keyboardHeightRpx: 0 });
        this.recalcSheetMask();
        this.showFeedback('新名字真好听呀～', 1600);
        this.refresh();
    },

    onWallet() {
        this.refresh();
        if (this.data.storageUnavailable) {
            this.showToast(rules.ERROR_TEXT.STORAGE_UNAVAILABLE);
            return;
        }
        this.openSheet({ type: 'wallet', title: '叽分钱包' });
    },

    onSwitch() {
        if (!this.requireBird()) return;
        this.openSheet({ type: 'switch', title: '今天，想陪谁？' });
    },

    onClaimHelp() {
        this.openSheet({ type: 'claim', title: '把伙伴带回小窝' });
    },

    onOpenSupply() {
        if (!this.requireBird()) return;
        const bridge = require('../../utils/step-supply');
        const enabled = bridge.enabled();
        const cached = enabled ? bridge.cachedPreview() : null;
        this.stepSupplyRevision = (this.stepSupplyRevision || 0) + 1;
        this.setData({
            stepSupplyEnabled: enabled,
            stepSupplyStatus: cached ? describeStepSupply(cached) : null,
            stepSupplyBusy: this.stepSupplyRequest ? this.stepSupplyRequest.action : '',
            stepSupplyNotice: '',
            stepSupplyNeedsSetting: false,
        });
        this.openSheet({ type: 'supply', title: enabled ? '微信步数补给' : '补给' });
    },

    isStepSupplySheet() {
        return this.data.stepSupplyEnabled && this.data.sheet && this.data.sheet.type === 'supply';
    },

    clearExpiredStepSupply() {
        const status = this.data.stepSupplyStatus;
        if (this.isStepSupplySheet() && status && status.displayedOn !== dayKey(Date.now())) {
            this.setData({ stepSupplyStatus: null, stepSupplyNotice: STEP_SUPPLY_ERROR_TEXT.SUPPLY_DAY_CHANGED });
        }
    },

    isCurrentStepSupply(request) {
        return this.isStepSupplySheet() && this.stepSupplyRequest === request && this.stepSupplyRevision === request.revision;
    },

    finishStepSupply(request) {
        if (this.stepSupplyRequest !== request) return;
        this.stepSupplyRequest = null;
        if (this.isStepSupplySheet()) this.setData({ stepSupplyBusy: '' });
    },

    onReadSupplySteps() {
        return this.requestStepSupply('read');
    },

    onClaimStepSupply() {
        return this.requestStepSupply('claim');
    },

    async requestStepSupply(action) {
        if (!this.isStepSupplySheet() || this.stepSupplyRequest || !this.requireBird()) return;
        this.clearExpiredStepSupply();
        const previous = this.data.stepSupplyStatus;
        if (action === 'claim' && (this.data.stepSupplyNeedsSetting || !previous || !previous.canClaim)) return;
        const startedOn = dayKey(Date.now());
        const experienceGeneration = store.getExperienceGeneration();
        const request = { action: action, revision: this.stepSupplyRevision };
        this.stepSupplyRequest = request;
        this.setData({ stepSupplyBusy: action, stepSupplyNotice: '' });
        try {
            const bridge = require('../../utils/step-supply');
            const claimToken = action === 'claim' ? store.getToken() : null;
            const result = action === 'claim' ? await bridge.claim(previous.date) : await bridge.preview();
            const today = dayKey(Date.now());
            const reread = bridge.needsNewPreview(result.error);
            const sameClaimContext = !!claimToken && claimToken === store.getToken() && startedOn === today &&
                experienceGeneration === store.getExperienceGeneration();
            const notice = STEP_SUPPLY_ERROR_TEXT[result.error] ||
                (action === 'claim' ? '补给结果暂未确认，请重试。' : '步数读取失败，请重试。');
            if (!this.isCurrentStepSupply(request)) {
                // 重新打开的面板只接收通过当前日期与身份校验的快照。
                if (this.isStepSupplySheet() && this.stepSupplyRequest === request) {
                    if (action === 'claim') this.refresh();
                    if (!result.error || reread || action === 'claim') {
                        const cached = bridge.cachedPreview();
                        const update = { stepSupplyStatus: cached ? describeStepSupply(cached) : null };
                        if (result.error === 'WERUN_DENIED' && experienceGeneration === store.getExperienceGeneration()) {
                            update.stepSupplyNeedsSetting = true;
                            update.stepSupplyNotice = notice;
                        } else if (result.error && !reread && sameClaimContext && cached && !cached.localClaimed) {
                            update.stepSupplyNotice = notice;
                        }
                        this.setData(update);
                    }
                }
                return;
            }
            if (startedOn !== today && (!result.data || result.data.date !== today)) {
                if (action === 'claim') this.refresh();
                this.setData({ stepSupplyStatus: null, stepSupplyNotice: STEP_SUPPLY_ERROR_TEXT.SUPPLY_DAY_CHANGED });
                return;
            }
            if (result.error) {
                if (!reread && claimToken && !sameClaimContext) {
                    const cached = bridge.cachedPreview();
                    this.setData({ stepSupplyStatus: cached ? describeStepSupply(cached) : null });
                    return;
                }
                if (result.error === 'ALREADY_CLAIMED' && result.data && result.data.localClaimed && previous) {
                    this.refresh();
                    this.setData({ stepSupplyStatus: Object.assign({}, previous, {
                        note: '今日补给已入库。', claimed: true, restore: false, canClaim: false,
                    }) });
                    return;
                }
                const cached = sameClaimContext && !reread ? bridge.cachedPreview() : null;
                this.setData({
                    stepSupplyStatus: reread ? null : (cached && cached.restoreAvailable ? describeStepSupply(cached) : previous),
                    stepSupplyNeedsSetting: this.data.stepSupplyNeedsSetting || result.error === 'WERUN_DENIED',
                    stepSupplyNotice: notice,
                });
                return;
            }
            const status = describeStepSupply(result.data);
            if (action === 'claim') this.refresh();
            this.setData({ stepSupplyStatus: status, stepSupplyNeedsSetting: false });
        } catch (error) {
            if (this.isCurrentStepSupply(request)) {
                this.setData({ stepSupplyNotice: action === 'claim' ? '补给结果暂未确认，请重试。' : '步数读取失败，请重试。' });
            }
        } finally {
            this.finishStepSupply(request);
        }
    },

    onSupply() {
        if (this.isStepSupplySheet() || !config.USE_LOCAL_FIXTURE || !this.requireBird()) return;
        if (this.data.supplyClaimed) {
            this.showToast('今日已补给');
            return;
        }
        const result = store.supply();
        if (result.error) {
            if (result.error === 'ALREADY_CLAIMED') this.refresh();
            this.showToast(result.error === 'ALREADY_CLAIMED' ? '今日已补给' : (rules.ERROR_TEXT[result.error] || '补给未完成'));
            return;
        }
        const { foodAdded, waterAdded } = result.data;
        if (!foodAdded && !waterAdded) {
            this.showToast('食物和水库存已满，消耗后可再领');
            return;
        }
        const additions = [];
        if (foodAdded) additions.push('食物 +1');
        if (waterAdded) additions.push('水 +1');
        this.showToast(additions.join('、'));
        this.setData({ sheet: null, motionPaused: false });
        this.showFeedback('这下可以安心玩啦～', 1600);
        this.refresh();
    },

    // 直接喂食：不再弹框，扣库存 + 饱食 +20，并播放谷粒动效与小鸟开心反馈。
    onFeed() {
        if (!this.requireBird()) return;
        const result = store.feed();
        if (!this.applyResult(result, 'feed', false)) return;
        this.triggerFeedFx();
        this.playChirp();
        this.idle.kick();
    },

    // 谷粒动效：先归零再置位，确保连续点击也能重新触发 CSS 动画（与 showFeedback 的 happy 重触发同构）。
    triggerFeedFx() {
        if (this.feedFxTimer) clearTimeout(this.feedFxTimer);
        if (this.feedFxHideTimer) clearTimeout(this.feedFxHideTimer);
        const page = this;
        this.setData({ feedFxId: 0 });
        this.feedFxTimer = setTimeout(function () {
            page.setData({ feedFxId: 1 });
            page.feedFxHideTimer = setTimeout(function () {
                page.setData({ feedFxId: 0 });
                page.feedFxHideTimer = null;
            }, 900);
            page.feedFxTimer = null;
        }, 20);
    },

    // 水滴动效：添水时水滴从鸟身上方落下、晕开并淡出（与谷粒动效同构，配合 wx:if 重挂载重复触发）。
    triggerWaterFx() {
        if (this.waterFxTimer) clearTimeout(this.waterFxTimer);
        if (this.waterFxHideTimer) clearTimeout(this.waterFxHideTimer);
        const page = this;
        this.setData({ waterFxId: 0 });
        this.waterFxTimer = setTimeout(function () {
            page.setData({ waterFxId: 1 });
            page.waterFxHideTimer = setTimeout(function () {
                page.setData({ waterFxId: 0 });
                page.waterFxHideTimer = null;
            }, 900);
            page.waterFxTimer = null;
        }, 20);
    },

    async onRedeemSteps() {
        if (this.data.redeeming || this.data.todayStepClaimed || !this.requireBird()) return;
        this.setData({ redeeming: true, werunNeedsSetting: false });
        try {
            const result = await store.redeemSteps();
            if (result.error === 'WERUN_DENIED') {
                this.setData({ werunNeedsSetting: true });
                return;
            }
            if (result.error === 'WX_LOGIN_REQUIRED') {
                this.showToast('请先在微信中授权登录');
                return;
            }
            if (result.error) {
                this.showToast(rules.ERROR_TEXT[result.error] || '兑换未完成');
                this.refresh();
                return;
            }
            const granted = (result.data && result.data.granted) || 0;
            if (config.USE_LOCAL_FIXTURE && granted > 0) {
                this.showToast('调试预览：步数兑换 · 叽分 +' + granted);
            } else {
                this.showToast(granted > 0 ? ('步数兑换 · 叽分 +' + granted) : '今日步数已兑换');
            }
            this.refresh();
        } finally {
            this.setData({ redeeming: false });
        }
    },

    onOpenWeRunSettings() {
        if (this.isStepSupplySheet()) {
            this.onOpenSupplySettings();
            return;
        }
        if (!this.data.werunNeedsSetting) return;
        if (typeof wx.openSetting !== 'function') {
            this.showToast('请从右上角菜单进入设置，开启微信运动权限');
            return;
        }
        wx.openSetting({
            success: (result) => {
                if (result.authSetting && result.authSetting['scope.werun']) {
                    this.setData({ werunNeedsSetting: false });
                    this.showToast('权限已开启，请再次点击兑换');
                }
            },
            fail: () => this.showToast('未能打开设置，请从右上角菜单进入'),
        });
    },

    onOpenSupplySettings() {
        if (!this.data.stepSupplyNeedsSetting || this.stepSupplyRequest) return;
        if (typeof wx.openSetting !== 'function') {
            this.setData({ stepSupplyNotice: '请从右上角菜单进入设置，开启微信运动权限。' });
            return;
        }
        const request = { action: 'settings', revision: this.stepSupplyRevision };
        this.stepSupplyRequest = request;
        this.setData({ stepSupplyBusy: request.action });
        const fail = () => {
            if (this.isCurrentStepSupply(request)) this.setData({ stepSupplyNotice: '未能打开设置，请从右上角菜单进入。' });
            this.finishStepSupply(request);
        };
        try {
            wx.openSetting({
                success: (result) => {
                    if (this.isCurrentStepSupply(request) && result.authSetting && result.authSetting['scope.werun']) {
                        this.setData({ stepSupplyNeedsSetting: false, stepSupplyStatus: null, stepSupplyNotice: '权限已开启，请重新读取微信步数。' });
                    }
                    this.finishStepSupply(request);
                },
                fail: fail,
            });
        } catch (error) {
            fail();
        }
    },

    goAdopt() {
        if (!config.USE_LOCAL_FIXTURE) return;
        this.setData({ sheet: null, motionPaused: false });
        wx.navigateTo({ url: entry.buildAdoptUrl(config.DEBUG_DEMO_BIRD_CODE) });
    },
});
