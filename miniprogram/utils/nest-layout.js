'use strict';

// 小窝页沉浸式布局换算。
// 网页端 src/nest/nest.css 用 480px 产品容器 + cqw/cqh 容器查询定位；
// 小程序没有 cqw，按 480px → 750rpx（1px = 1.5625rpx，1cqw = 7.5rpx）换算，
// 由 JS 算出各叠层的 top 数值交给 WXSS 内联 style，避免 px/rpx 混算。
// 只依赖共享模块的 readTopInsetRpx（城市页也在用），带兜底以免并发改动影响本页。
var safeArea = require('./safe-area');

var DESIGN_HEIGHT_RPX = 1103;  // .nest min-height: 147cqw → 147 × 7.5
var TAB_BAR_ART_RPX = 149;     // custom-tab-bar 的 960×195 毛绒底板等比高度
var DOCK_GAP_RPX = 9;
var DOCK_HEIGHT_RPX = 162;     // .dock button clamp(72px,21.6cqw,104px) → 162rpx
var BIRD_HEIGHT_RPX = 322;     // --bird-size clamp(140px,43cqw,214px) → 43cqw

function readTopInset() {
    try {
        if (safeArea && typeof safeArea.readTopInsetRpx === 'function') {
            return safeArea.readTopInsetRpx();
        }
    } catch (error) {
        // 落到兜底值
    }
    return 176;
}

// 与 custom-tab-bar/index.js 的 readBottomInsetRpx 保持一致。
function readBottomInset(info, width) {
    try {
        var screenHeight = info.screenHeight || 0;
        var area = info.safeArea;
        if (!area || typeof area.bottom !== 'number' || !screenHeight) return 0;
        var insetPx = screenHeight - area.bottom;
        return insetPx > 0 ? Math.round((insetPx * 750) / width) : 0;
    } catch (error) {
        return 0;
    }
}

function readNestLayout() {
    var inset = readTopInset();
    var viewportRpx = DESIGN_HEIGHT_RPX;
    var bottomInset = 0;
    try {
        var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        var width = info.windowWidth || 375;
        var height = info.windowHeight || 667;
        viewportRpx = Math.round((height * 750) / width);
        bottomInset = readBottomInset(info, width);
    } catch (error) {
        viewportRpx = DESIGN_HEIGHT_RPX;
    }
    var tabBarHeight = TAB_BAR_ART_RPX + bottomInset;
    // custom-tab-bar 会在文档流末尾注入一个等高 spacer；页面高度需扣掉它，
    // 否则 .nest + spacer 会多出整条底栏高度，出现无谓滚动。
    var pageHeight = Math.max(inset + DESIGN_HEIGHT_RPX, viewportRpx - tabBarHeight);
    // 短屏仍保留场景最小高度，只补上超出可见区的部分。
    var dockBottom = DOCK_GAP_RPX + Math.max(0, pageHeight - (viewportRpx - tabBarHeight));
    // H5 的 --core-shift 在高屏时下移气泡与小鸟，使小鸟脚部始终落在 dock 上方。
    var dockTop = pageHeight - dockBottom - DOCK_HEIGHT_RPX;
    var birdNaturalBottom = inset + 574 + BIRD_HEIGHT_RPX;
    var coreShift = Math.max(0, dockTop - birdNaturalBottom - 20);
    var actorBottom = dockTop - 20;
    var actorTop = Math.min(inset + 574 + coreShift, Math.max(inset + 450, actorBottom - BIRD_HEIGHT_RPX), actorBottom - 1);
    var actorHeight = Math.min(BIRD_HEIGHT_RPX, actorBottom - actorTop);
    return {
        inset: inset,
        tabBarHeight: tabBarHeight,
        // 全屏底图用整个视口高度；内容区 pageHeight 仍扣掉底栏占位，
        // 这样透明底栏背后也是同一张图，且 .nest + spacer 不会多出滚动。
        viewportHeight: viewportRpx,
        pageHeight: pageHeight,
        dockBottom: dockBottom,
        // toast 是 position:fixed，坐标系是「视口」而非 .nest；自定义 tabBar 也是
        // fixed 且 z-index:1000，必须把整条底栏高度加回来，否则 toast 会被底栏盖住。
        toastBottom: tabBarHeight + DOCK_GAP_RPX + DOCK_HEIGHT_RPX + 20,
        actorHeight: actorHeight,
        // HUD 贴近安全区下沿：让左上角身份卡真正「靠左上方、贴边」，
        // 同时把 HUD 底边（+91rpx）与 statusTop(+128) 的间距从 15rpx 拉开到 29rpx，
        // 避免两条胶囊挤在一起，保持上方状态条的位置。
        hudTop: inset + 8,                     // top: 14px 基线，上收 14rpx 贴边
        statusTop: inset + 128,                // top: 82px
        needsTop: inset + 230,                 // .needs top: 147px
        toolsTop: inset + 270,                 // max(140px, 36cqw) → 36cqw
        speechTop: inset + 330 + coreShift,    // 44cqw + core-shift
        claimTop: inset + 465 + coreShift,     // 62cqw + core-shift
        actorTop: actorTop,
    };
}

module.exports = {
    DESIGN_HEIGHT_RPX: DESIGN_HEIGHT_RPX,
    TAB_BAR_ART_RPX: TAB_BAR_ART_RPX,
    readNestLayout: readNestLayout,
};
