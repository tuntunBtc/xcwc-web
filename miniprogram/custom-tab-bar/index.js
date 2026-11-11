'use strict';

// 与网页端 src/account-pages.css 的 .phone>.bottom 对齐：
// 960×195 毛绒底板按宽度等比铺开（750rpx - 16rpx = 734rpx → 149rpx 高），
// 四项按钮保持透明，页面自身背景从底栏透出。
// barHeight 是「底板 149rpx + Home Indicator 安全区」，只用于文档流占位；
// 底板与入口本身永远固定 149rpx 并贴窗口底边，绝不拉伸毛绒图。
// 素材来自当前 H5 构建产物 dist/assets/optimized/navigation/plush（原名去指纹）。
const ART_HEIGHT_RPX = 149;

const TABS = [
    {
        pagePath: '/pages/index/index',
        text: '小窝',
        icon: '/assets/navigation/plush/nav-home-default.webp',
        activeIcon: '/assets/navigation/plush/nav-home-active.webp',
    },
    {
        pagePath: '/pages/city/city',
        text: '城市',
        icon: '/assets/navigation/plush/nav-city-default.webp',
        activeIcon: '/assets/navigation/plush/nav-city-active.webp',
    },
    {
        pagePath: '/pages/shop/shop',
        text: '商城',
        icon: '/assets/navigation/plush/nav-shop-default.webp',
        activeIcon: '/assets/navigation/plush/nav-shop-active.webp',
    },
    {
        pagePath: '/pages/profile/profile',
        text: '我的',
        icon: '/assets/navigation/plush/nav-profile-default.webp',
        activeIcon: '/assets/navigation/plush/nav-profile-active.webp',
    },
];

function indexOfRoute(route) {
    for (let i = 0; i < TABS.length; i += 1) {
        if (TABS[i].pagePath === route) return i;
    }
    return -1;
}

function readSelectedTab(followPageStack) {
    const pages = getCurrentPages();
    for (let i = pages.length - 1; i >= 0; i -= 1) {
        const selected = indexOfRoute('/' + pages[i].route);
        if (selected >= 0 || !followPageStack) return selected;
    }
    return followPageStack ? 0 : -1;
}

function readBottomInsetRpx() {
    const FALLBACK = 0;
    try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const width = info.windowWidth || 375;
        const screenHeight = info.screenHeight || 0;
        const safeArea = info.safeArea;
        if (!safeArea || typeof safeArea.bottom !== 'number' || !screenHeight) return FALLBACK;
        const insetPx = screenHeight - safeArea.bottom;
        if (insetPx <= 0) return FALLBACK;
        return Math.round((insetPx * 750) / width);
    } catch (error) {
        return FALLBACK;
    }
}

Component({
    options: {
        styleIsolation: 'isolated',
    },

    properties: {
        followPageStack: Boolean,
    },

    data: {
        selected: 0,
        list: TABS,
        // 文档流占位高度：底板 149rpx + Home Indicator 安全区。
        barHeight: ART_HEIGHT_RPX,
        // 视觉层（底板 + 四入口）固定 149rpx，与页面其它布局解耦。
        artHeight: ART_HEIGHT_RPX,
    },

    lifetimes: {
        attached: function () {
            const safeBottom = readBottomInsetRpx();
            const selected = readSelectedTab(this.data.followPageStack);
            // 只增加占位高度，视觉层（底板 + 四入口）仍是原比例的 149rpx。
            this.setData({
                barHeight: ART_HEIGHT_RPX + safeBottom,
                selected: selected >= 0 ? selected : 0,
            });
        },
    },

    // 每个 tab 页持有各自的组件实例：即便页面未显式调用 getTabBar，
    // 页面显示时也能按当前路由自校正选中态，避免切换 tab 后高亮滞后。
    pageLifetimes: {
        show: function () {
            const selected = readSelectedTab(this.data.followPageStack);
            if (selected >= 0 && selected !== this.data.selected) {
                this.setData({ selected: selected });
            }
        },
    },

    methods: {
        switchTab: function (event) {
            const dataset = event.currentTarget.dataset;
            const url = dataset.path;
            if (indexOfRoute(url) < 0 || this.switching) return;
            const pages = getCurrentPages();
            if (pages.length && '/' + pages[pages.length - 1].route === url) return;
            this.switching = true;
            wx.switchTab({
                url: url,
                fail: function () { wx.showToast({ title: '切换失败，请重试', icon: 'none' }); },
                complete: () => { this.switching = false; },
            });
        },
    },
});
