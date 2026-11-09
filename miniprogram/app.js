'use strict';

var entry = require('./utils/entry');

App({
    globalData: {
        appName: '卜叽岛 · 小鸟伙伴',
        versionStage: '小程序调试版：免登录、本机数据、商城仅展示',
        // 最近一次从跳转凭证带进来的实体编码，供领养页在缺少页面参数时兜底读取。
        entryBirdCode: '',
    },

    onLaunch: function (options) {
        // 冷启动全局只触发一次：允许把带码入口转发到领养页。
        this.handleEntry(options, true);
    },

    onShow: function (options) {
        // 从后台切前台时启动 query 可能仍在，这里只记录编码，绝不重复跳转，
        // 避免用户每次切回小程序都被弹回领养页。
        this.handleEntry(options, false);
    },

    handleEntry: function (options, allowRedirect) {
        var code = entry.readBirdCodeFromLaunch(options);
        if (!code) return;
        this.globalData.entryBirdCode = code;
        if (!allowRedirect) return;

        // URL Link / Scheme 的 path 已指向领养页时，参数会由页面 onLoad 直接接收，无需转发。
        var path = (options && options.path) || '';
        if (path.indexOf(entry.ADOPT_PAGE) !== -1) return;

        var url = entry.buildAdoptUrl(code);
        // onLaunch 时页面栈可能尚未建立，放到下一轮事件循环；失败再重开页面兜底。
        setTimeout(function () {
            wx.navigateTo({
                url: url,
                fail: function () {
                    wx.reLaunch({ url: url });
                },
            });
        }, 0);
    },
});
