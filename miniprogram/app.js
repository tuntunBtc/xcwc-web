'use strict';

var entry = require('./utils/entry');

function supportsNativeRelaunch() {
    if (typeof wx.onAppRoute !== 'function' || typeof wx.getAppBaseInfo !== 'function') return false;
    // 更早的基础库也可能存在 onAppRoute，但路由参数格式未受官方文档保证。
    var parts = ((wx.getAppBaseInfo() || {}).SDKVersion || '').split('.');
    var major = Number(parts[0]);
    var minor = Number(parts[1]);
    var patch = Number(parts[2]);
    return major > 3 || (major === 3 && (minor > 5 || (minor === 5 && patch >= 5)));
}

App({
    globalData: {
        appName: '卜叽岛 · 小鸟伙伴',
        versionStage: '小程序调试版：免登录、本机数据、商城仅展示',
    },

    onLaunch: function (options) {
        this.observesNativeRelaunch = supportsNativeRelaunch();
        if (this.observesNativeRelaunch) {
            var app = this;
            wx.onAppRoute(function (route) {
                // 扫码等外部入口热启动会自动重载页面，普通切回前台不触发此路由。
                if (route.openType === 'autoReLaunch' && route.path && !route.notFound) {
                    app.handleEntry(route, true);
                }
            });
        }
        this.handleEntry(options);
    },

    onShow: function (options) {
        // 有可靠的路由事件时只用它处理热启动，避免 onShow 与自动重载先后转发同一入口。
        if (!this.observesNativeRelaunch) this.handleEntry(options);
    },

    handleEntry: function (options, forceForward) {
        var code = entry.readBirdCodeFromLaunch(options);
        var path = ((options && options.path) || '').replace(/^\//, '');
        // 直接打开领养页时，微信把本次 query 交给该页。空链接不能借用上次编码。
        if (!code || path === entry.ADOPT_PAGE) {
            this.forwardedEntry = null;
            return;
        }

        // 生命周期可能重复提供相同参数。微信重载入口或用户主动重试时才允许再次转发。
        var signature = path + ':' + code;
        if (!forceForward && this.forwardedEntry && this.forwardedEntry.signature === signature) return;
        var request = { signature: signature };
        this.forwardedEntry = request;

        var url = entry.buildAdoptUrl(code);
        var app = this;
        // onLaunch 时页面栈可能尚未建立，放到下一轮事件循环；失败再重开页面兜底。
        setTimeout(function () {
            if (app.forwardedEntry !== request) return;
            wx.navigateTo({
                url: url,
                fail: function () {
                    if (app.forwardedEntry !== request) return;
                    wx.reLaunch({
                        url: url,
                        fail: function () {
                            if (app.forwardedEntry !== request) return;
                            wx.showModal({
                                title: '暂时无法打开领养页',
                                content: '请检查网络后重试。',
                                confirmText: '重试',
                                success: function (result) {
                                    if (result.confirm && app.forwardedEntry === request) {
                                        app.handleEntry(options, true);
                                    }
                                },
                            });
                        },
                    });
                },
            });
        }, 0);
    },
});
