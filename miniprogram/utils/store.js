'use strict';

const createGuestStore = require('./guest-store').createGuestStore;
const config = require('./config');

// 调试期用本机存储；正式版把这里换成服务端结算适配层，页面调用方式保持不变。
const storage = {
    getStorageSync: function (key) { return wx.getStorageSync(key); },
    setStorageSync: function (key, value) { wx.setStorageSync(key, value); },
    removeStorageSync: function (key) { wx.removeStorageSync(key); },
};

module.exports = createGuestStore(storage, {
    debugSteps: config.DEBUG_TODAY_STEPS,
    rules: {
        pointsDailyLimit: config.POINTS_DAILY_LIMIT,
        stepUnit: config.STEP_UNIT,
        stepDailyCap: config.STEP_DAILY_CAP,
    },
});
