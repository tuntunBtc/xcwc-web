'use strict';

// 分包需要一个页面入口，意外直接打开时回到小窝。
Page({
    onLoad() {
        wx.switchTab({ url: '/pages/index/index' });
    },
});
