'use strict';

// 自定义导航栏（navigationStyle: custom）后页面从屏幕顶端渲染，
// 需要给状态栏与右上角胶囊留出安全区。领养页与城市页共用同一换算，
// 避免两套实现在不同机型上错位。
// 统一换算成 rpx 交给 WXSS 内联 style，避免 px / rpx 在 calc 中混用。
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

// 视口高度换算成 rpx：弹层需要按「屏幕 - 状态栏 - 底栏」算可用高度，
// 否则短屏机型上内容会溢出并压到自定义 tabBar。
function readViewportRpx() {
    try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const width = info.windowWidth || 375;
        const height = info.windowHeight || 667;
        return Math.round((height * 750) / width);
    } catch (error) {
        return 1334;
    }
}

module.exports = { readTopInsetRpx: readTopInsetRpx, readViewportRpx: readViewportRpx };
