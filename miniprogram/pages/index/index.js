'use strict';

const store = require('../../utils/store');
const entry = require('../../utils/entry');
const config = require('../../utils/config');

const ERROR_TEXT = {
    NO_BIRD: '请先领养一只小鸟',
    COOLDOWN: '小鸟还在回味，稍等一下',
    DAILY_LIMIT: '今日叽分已达上限',
    NO_FOOD: '食物不够了',
    NO_WATER: '水不够了',
    INVALID_STEPS: '步数数据不可用',
    ALREADY_CLAIMED: '今日步数已经兑换过',
    NO_REWARD: '今日暂无可兑换叽分',
    STORAGE_UNAVAILABLE: '本机数据读取失败',
};

Page({
    data: {
        viewState: 'loading',
        heroTitle: '小窝',
        petButtonText: '摸摸 +1 叽分',
        ledger: [],
        hasBird: false,
    },

    onShow() {
        this.refresh();
    },

    refresh() {
        const result = store.snapshot();
        const snapshot = result.data.snapshot;
        const petButtonText = snapshot.canPet
            ? '摸摸 +1 叽分'
            : (snapshot.petWaitSeconds > 0 ? '冷却 ' + String(snapshot.petWaitSeconds) + ' 秒' : '今日已达上限');
        this.setData(Object.assign({}, snapshot, {
            viewState: result.error ? 'error' : (snapshot.hasBird ? 'ready' : 'empty'),
            heroTitle: snapshot.hasBird ? snapshot.nickname : '还没有小鸟',
            petButtonText: petButtonText,
            stepRedeemDisabled: snapshot.stepEarnable <= 0,
            errorMessage: result.error ? (ERROR_TEXT[result.error] || '请重试') : '',
        }));
    },

    applyResult(result) {
        if (result.error) {
            wx.showToast({ title: ERROR_TEXT[result.error] || '操作未完成', icon: 'none' });
        }
        this.refresh();
    },

    handlePet() {
        this.applyResult(store.pet());
    },

    handleFeed() {
        this.applyResult(store.feed());
    },

    handleWater() {
        this.applyResult(store.water());
    },

    handleClean() {
        this.applyResult(store.clean());
    },

    handleRedeemSteps() {
        // 调试期使用 config.DEBUG_TODAY_STEPS 模拟「服务端已解密的当日步数」。
        this.applyResult(store.redeemSteps(require('../../utils/config').DEBUG_TODAY_STEPS));
    },

    handleCheckin() {
        wx.showToast({ title: '合照打卡暂未接入', icon: 'none' });
    },

    handleRetry() {
        this.refresh();
    },

    goAdopt() {
        // 调试期用示例编码模拟 NFC 链接带参进入领养页，便于在预览卡中直接查看；
        // 正式版入口来自 URL Link / URL Scheme / 小程序码，不在站内写死编码。
        wx.navigateTo({ url: entry.buildAdoptUrl(config.DEBUG_DEMO_BIRD_CODE) });
    },
});
