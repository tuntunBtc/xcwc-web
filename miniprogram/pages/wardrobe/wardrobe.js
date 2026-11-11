'use strict';

// 网页端 ?page=wardrobe（src/account-pages.js 的 feltWardrobeContent + src/wardrobe-felt.css）。
// 当前网页端版本为「服装展示 · 暂未开放」，需求基线 2026-11-05 明确
// 「衣橱只显示当前角色和可见缩略，全部服装继续暂未开放」。
// 本页严格对齐该效果：不兑换、不穿戴、不扣叽分、不写任何装扮状态。
const catalog = require('./wardrobe-catalog');
const safeArea = require('../../utils/safe-area');

// H5 .account-wardrobe-felt::after 用 repeat-y 铺下段草地；
// WXSS 没有 background-repeat，改用有限张 image 纵向拼接，超出由容器裁掉。
// 单张 900×823 在 750rpx 宽下约 686rpx 高，8 张 ≈ 5488rpx，足够覆盖
// 8 套服装（4 行约 1800rpx）+ hero + 说明 + 安全区的最长页面。
const LOWER_TILES = [0, 1, 2, 3, 4, 5, 6, 7];

// H5 的 grid-template-columns:1fr 1fr + gap:9px；WXSS 的 nth-child 在部分
// 基础库表现不一致，故在 JS 里预先算出左右列 class，与商城页做法一致。
const OUTFITS = catalog.OUTFITS.map(function (item, index) {
    return {
        id: item.id,
        name: item.name,
        thumb: item.thumb,
        isLeft: index % 2 === 0,
    };
});

Page({
    data: {
        topInset: 176,
        outfits: OUTFITS,
        outfitCount: OUTFITS.length,
        lowerTiles: LOWER_TILES,
    },

    onLoad() {
        this.onResize();
    },

    onResize() {
        // 自定义导航下页面从屏幕顶端渲染，状态栏 + 胶囊区由共享模块换算。
        this.setData({ topInset: safeArea.readTopInsetRpx() });
    },

    // 网页端 .account-back 的 data-go="back"：回到来源页（小窝或「我的」）。
    onBack() {
        if (this.backPending) return;
        this.backPending = true;
        const callbacks = {
            fail: () => wx.showToast({ title: '返回失败，请重试', icon: 'none' }),
            complete: () => { this.backPending = false; },
        };
        const pages = getCurrentPages();
        if (pages.length > 1) {
            wx.navigateBack(callbacks);
            return;
        }
        // 直接以本页为启动页（预览卡 / 编译条件）时没有上一页，回到小窝。
        wx.switchTab({ url: '/pages/index/index', ...callbacks });
    },

    // 网页端当前卡片按钮为 disabled 且无状态变更；这里保留同样的禁用视觉，
    // 点击只给出网页端既有的 pageNotice('换装功能本期暂未开放') 同款提示，
    // 不执行兑换/试穿、不读写叽分与穿戴记录。
    onOutfitTap() {
        wx.showToast({ title: catalog.CLOSED_NOTICE, icon: 'none', duration: 1800 });
    },
});
