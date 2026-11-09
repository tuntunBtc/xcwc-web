'use strict';

const store = require('../../utils/store');
const entry = require('../../utils/entry');
const config = require('../../utils/config');

Page({
    data: {
        title: '我的',
        subtitle: '调试版 · 免登录 · 数据仅保存在本机',
        displayNickname: '未设置昵称',
        displayIntro: '从实体标签的跳转链接领养一只小鸟吧',
        avatarText: '?',
        points: 0,
        birdCode: '',
        todayPoints: 0,
        dailyLimit: 10,
        stepText: '未兑换',
        menuGroups: [
            {
                key: 'bird',
                items: [
                    { key: 'wardrobe', text: '我的衣橱', path: '' },
                    { key: 'album', text: '本机相册', path: '' },
                ],
            },
            {
                key: 'system',
                items: [
                    { key: 'adoptPreview', text: '预览 NFC 领养页（调试）', path: '' },
                    { key: 'reset', text: '清除本机缓存', path: '' },
                    { key: 'about', text: '关于调试版', path: '' },
                ],
            },
        ],
    },

    onShow() {
        this.loadProfile();
    },

    loadProfile() {
        const result = store.snapshot();
        const snapshot = result.data.snapshot;
        const nickname = snapshot.hasBird ? snapshot.nickname : '';
        const chars = Array.from(nickname);
        this.setData({
            displayNickname: nickname || '未设置昵称',
            displayIntro: snapshot.hasBird ? '实体编码 ' + snapshot.birdCode : '从实体标签的跳转链接领养一只小鸟吧',
            avatarText: chars.length > 0 ? chars[0] : '?',
            points: snapshot.points,
            birdCode: snapshot.birdCode,
            todayPoints: snapshot.todayPoints,
            dailyLimit: snapshot.dailyLimit,
            stepText: snapshot.todayStepClaimed ? '今日已兑换' : '今日未兑换',
        });
    },

    handleMenuTap(event) {
        const dataset = event && event.currentTarget ? event.currentTarget.dataset : null;
        const groupIndex = Number(dataset ? dataset.group : -1);
        const itemIndex = Number(dataset ? dataset.index : -1);
        const group = this.data.menuGroups[groupIndex];
        const menuItem = group && Array.isArray(group.items) ? group.items[itemIndex] : null;
        if (!menuItem) {
            return;
        }
        if (menuItem.key === 'adoptPreview') {
            // 调试期用示例编码模拟 NFC 链接带参进入领养页。
            wx.navigateTo({ url: entry.buildAdoptUrl(config.DEBUG_DEMO_BIRD_CODE) });
            return;
        }
        if (menuItem.key === 'reset') {
            this.confirmReset();
            return;
        }
        if (menuItem.key === 'about') {
            wx.showModal({
                title: '关于调试版',
                content: '本机数据、免登录、商城仅展示；微信步数为模拟数据，正式版由服务端结算。',
                showCancel: false,
            });
            return;
        }
        wx.showToast({ title: '该功能暂未接入', icon: 'none' });
    },

    confirmReset() {
        const page = this;
        wx.showModal({
            title: '清除本机缓存',
            content: '将删除本机领养、叽分、养成与步数兑换记录，且无法恢复。确认继续？',
            confirmText: '确认清除',
            success(res) {
                if (!res.confirm) {
                    return;
                }
                store.reset();
                page.loadProfile();
                wx.showToast({ title: '已清除', icon: 'none' });
            },
        });
    },
});
