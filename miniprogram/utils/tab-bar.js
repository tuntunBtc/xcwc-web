'use strict';

let pendingProfileBirds = null;

// switchTab 不接收页面参数。把入口留给目标页的下一次 onShow 消费。
function requestProfileBirds() {
    function cancel() {
        if (pendingProfileBirds === cancel) pendingProfileBirds = null;
    }
    pendingProfileBirds = cancel;
    return cancel;
}

function takeProfileBirds() {
    const requested = !!pendingProfileBirds;
    pendingProfileBirds = null;
    return requested;
}

// 自定义 tabBar 在 WebView 下由 getTabBar() 直接返回实例，
// 在 Skyline 下改为回调传入；两种形态都在这里兼容。
function syncSelected(page, index) {
    if (!page || typeof page.getTabBar !== 'function') return;
    const apply = function (tabBar) {
        if (tabBar && typeof tabBar.setData === 'function') {
            tabBar.setData({ selected: index });
        }
    };
    let instance = null;
    try {
        instance = page.getTabBar(apply);
    } catch (error) {
        instance = null;
    }
    if (instance && typeof instance.setData === 'function') apply(instance);
}

module.exports = { syncSelected, requestProfileBirds, takeProfileBirds };
