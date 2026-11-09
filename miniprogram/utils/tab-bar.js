'use strict';

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

module.exports = { syncSelected: syncSelected };
