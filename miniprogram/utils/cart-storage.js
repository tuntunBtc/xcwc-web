'use strict';

const KEY = 'xcwc.shop.cart.mp.v1';

function read() {
    return wx.getStorageSync(KEY);
}

function write(ids) {
    try { wx.setStorageSync(KEY, ids); return true; }
    catch (error) { return false; }
}

function clear() {
    try { wx.removeStorageSync(KEY); return true; }
    catch (error) { return false; }
}

module.exports = { read: read, write: write, clear: clear };
