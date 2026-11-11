'use strict';

// 商城页沉浸式顶部几何：与小窝 utils/nest-layout.js 同一套「按真实胶囊矩形避让」口径。
// 品牌条是一个整体（背景图 + 字 + 购物车图标），只允许一个等比 scale，
// 不允许只改宽度把粉色毛毡压扁。WXSS 用 transform:scale + transform-origin:0 0
// 渲染，故此处只输出缩放系数与左上角坐标，不输出缩放后的宽高。
var safeArea = require('./safe-area');

var MASTHEAD_WIDTH_RPX = 726;   // 750 - 左右各 12rpx，与原 .masthead 流内宽度一致
var MASTHEAD_HEIGHT_RPX = 128;  // 原 .masthead 高度
var LEFT_MARGIN_RPX = 12;
var MENU_GAP_RPX = 24;          // 品牌条右边界与胶囊左边缘的呼吸间隙
var STATUS_BAR_GAP_RPX = 24;    // 品牌条顶部与状态栏底的最小间隙
var HEADER_BOTTOM_GAP_RPX = 12; // 品牌条底与轮播之间的留白
var MIN_SCALE = 0.5;            // 极端窄屏兜底，正常机型不会触发
var MAX_SCALE = 1;

// 读不到胶囊矩形（老基础库 / 部分安卓）时按 375px 参考机型的胶囊位置换算。
var REF_MENU_LEFT_PX = 289;
var REF_MENU_TOP_PX = 53;
var REF_MENU_HEIGHT_PX = 27;

function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
}

function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value) && value >= 0;
}

// 纯函数：不依赖 wx，便于 Node 里按机型矩阵做几何验收。
function computeShopLayout(input) {
    input = input || {};
    var width = input.windowWidth > 0 ? input.windowWidth : 375;
    var height = input.windowHeight > 0 ? input.windowHeight : 667;
    var statusBar = isFiniteNumber(input.statusBarHeight) ? input.statusBarHeight : 20;
    var topInset = input.topInset > 0 ? input.topInset : 176;
    var unit = 750 / width;                       // 1px → 多少 rpx
    var viewportHeight = Math.round(height * unit);
    var statusBarRpx = Math.round(statusBar * unit);

    var menu = input.menu;
    var hasMenu = !!(menu && isFiniteNumber(menu.left) && isFiniteNumber(menu.top) &&
        isFiniteNumber(menu.height) && menu.height > 0 && menu.left > 0 && menu.left < width);
    var menuLeftRpx, menuTopRpx, menuHeightRpx;
    if (hasMenu) {
        menuLeftRpx = Math.round(menu.left * unit);
        menuTopRpx = Math.round(menu.top * unit);
        menuHeightRpx = Math.round(menu.height * unit);
    } else {
        menuLeftRpx = Math.round(REF_MENU_LEFT_PX * unit);
        menuTopRpx = Math.round(REF_MENU_TOP_PX * unit);
        menuHeightRpx = Math.round(REF_MENU_HEIGHT_PX * unit);
    }

    // 等比缩放：可用宽度 = 胶囊左缘 - 左留白 - 呼吸间隙。
    var available = menuLeftRpx - LEFT_MARGIN_RPX - MENU_GAP_RPX;
    var scale = clamp(available / MASTHEAD_WIDTH_RPX, MIN_SCALE, MAX_SCALE);
    scale = Math.round(scale * 1000) / 1000;
    var scaledWidth = MASTHEAD_WIDTH_RPX * scale;
    var scaledHeight = MASTHEAD_HEIGHT_RPX * scale;
    // 缩放系数被下限截断时仍要保证右边界不越过胶囊。
    var mastheadLeft = Math.max(0, Math.round(menuLeftRpx - MENU_GAP_RPX - scaledWidth));

    // 与胶囊垂直居中；下限不侵入状态栏（时间 / 信号）。
    var centered = menuTopRpx - (scaledHeight - menuHeightRpx) / 2;
    var mastheadTop = Math.max(statusBarRpx + STATUS_BAR_GAP_RPX, Math.round(centered));
    // 占位高度既覆盖系统安全区，又保证轮播不会顶到品牌条。
    var headerSpace = Math.max(topInset, Math.ceil(mastheadTop + scaledHeight + HEADER_BOTTOM_GAP_RPX));

    return {
        viewportHeight: viewportHeight,
        headerSpace: headerSpace,
        mastheadLeft: mastheadLeft,
        mastheadTop: mastheadTop,
        mastheadScale: scale,
        // 仅供验收脚本核对，不参与页面渲染。
        menuLeftRpx: menuLeftRpx,
        menuTopRpx: menuTopRpx,
        menuHeightRpx: menuHeightRpx,
        statusBarRpx: statusBarRpx,
        hasMenu: hasMenu,
    };
}

function readShopLayout() {
    var info = { windowWidth: 375, windowHeight: 667, statusBarHeight: 20 };
    try {
        var raw = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        if (raw) {
            info.windowWidth = raw.windowWidth || info.windowWidth;
            info.windowHeight = raw.windowHeight || info.windowHeight;
            info.statusBarHeight = raw.statusBarHeight || info.statusBarHeight;
        }
    } catch (error) {
        // 用兜底机型参数
    }
    var menu = null;
    try {
        if (wx.getMenuButtonBoundingClientRect) menu = wx.getMenuButtonBoundingClientRect();
    } catch (error) {
        menu = null;
    }
    var topInset = 176;
    try {
        topInset = safeArea.readTopInsetRpx();
    } catch (error) {
        // 用兜底安全区
    }
    return computeShopLayout({
        windowWidth: info.windowWidth,
        windowHeight: info.windowHeight,
        statusBarHeight: info.statusBarHeight,
        topInset: topInset,
        menu: menu,
    });
}

module.exports = {
    MASTHEAD_WIDTH_RPX: MASTHEAD_WIDTH_RPX,
    MASTHEAD_HEIGHT_RPX: MASTHEAD_HEIGHT_RPX,
    LEFT_MARGIN_RPX: LEFT_MARGIN_RPX,
    MENU_GAP_RPX: MENU_GAP_RPX,
    STATUS_BAR_GAP_RPX: STATUS_BAR_GAP_RPX,
    HEADER_BOTTOM_GAP_RPX: HEADER_BOTTOM_GAP_RPX,
    computeShopLayout: computeShopLayout,
    readShopLayout: readShopLayout,
};
