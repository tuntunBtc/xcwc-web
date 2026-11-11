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
// 顶部 HUD 抬到与右上角胶囊同一水平带时需要的几何常量。
var HUD_HEIGHT_RPX = 91;       // .identity height，与 index.wxss 保持一致
var MENU_GAP_RPX = 32;         // HUD 右边界与胶囊左边缘的呼吸间隙；叽分卡不贴胶囊、略靠中间
var STATUS_BAR_GAP_RPX = 24;   // HUD 顶与状态栏底的最小间隙（小屏胶囊靠上时不贴时间/信号）
var HUD_MIN_WIDTH_RPX = 390;   // 身份卡 + 钱包 + gap 所需最小宽度，避免窄屏挤压到文字
var HUD_FALLBACK_TOP = 8;      // 读不到胶囊时沿用旧的 inset + 8
var HUD_FALLBACK_RIGHT = 12;   // 读不到胶囊时沿用旧的左右贴边

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

// 自定义导航（navigationStyle: custom）下右上角胶囊由系统渲染在页面之上。
// 把 HUD 抬到胶囊同排时，必须按真实胶囊矩形留出右侧空白，否则钱包会被胶囊盖住；
// 不同机型（刘海 / 灵动岛 / 安卓）胶囊 top 与 left 差异很大，不能写死数值。
// 读不到就返回 null，让 readNestLayout 完整回退到旧的 inset + 8 布局。
function readMenuRect() {
    try {
        var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        var width = info.windowWidth || 375;
        if (!width || !wx.getMenuButtonBoundingClientRect) return null;
        var menu = wx.getMenuButtonBoundingClientRect();
        if (!menu) return null;
        var top = menu.top;
        var height = menu.height;
        var left = menu.left;
        if (typeof top !== 'number' || typeof height !== 'number' || typeof left !== 'number' ||
            height <= 0 || top < 0 || left <= 0 || left >= width) return null;
        var scale = 750 / width;
        return {
            statusBarRpx: Math.round((info.statusBarHeight || 20) * scale),
            topRpx: Math.round(top * scale),
            heightRpx: Math.round(height * scale),
            leftRpx: Math.round(left * scale),
        };
    } catch (error) {
        return null;
    }
}

function readNestLayout() {
    var inset = readTopInset();
    // HUD 定位：有胶囊矩形时抬到胶囊同排并避让；无胶囊信息时保持旧位置。
    var menu = readMenuRect();
    var hudTop;
    var hudRight;
    if (menu) {
        // 与胶囊垂直居中；下限不侵入状态栏（时间 / 信号）区域。
        var centered = menu.topRpx - Math.round((HUD_HEIGHT_RPX - menu.heightRpx) / 2);
        hudTop = Math.max(menu.statusBarRpx + STATUS_BAR_GAP_RPX, centered);
        // 右边界取「胶囊左边缘 - 间隙」，并保证两枚卡片仍有最小可用宽度。
        var avoidRight = 750 - menu.leftRpx + MENU_GAP_RPX;
        hudRight = Math.max(HUD_FALLBACK_RIGHT,
            Math.min(avoidRight, 750 - HUD_FALLBACK_RIGHT - HUD_MIN_WIDTH_RPX));
    } else {
        hudTop = inset + HUD_FALLBACK_TOP;
        hudRight = HUD_FALLBACK_RIGHT;
    }
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
        // 顶部信息组（HUD / 状态条 / 需求气泡 / 工具列）作为一整组上移：
        // 全部锚定 hudTop，彼此间距与旧版（inset+8 / +128 / +230 / +270）完全一致，
        // 所以 HUD 抬到胶囊同排后不会出现「上面贴顶、下面脱节」的大空档。
        // 对话气泡、领取入口、立绘与 dock 属场景主体，仍按 inset 定位保持不动。
        hudTop: hudTop,
        hudRight: hudRight,                    // 胶囊左边缘避让，内联覆盖 WXSS 的 right:12rpx
        statusTop: hudTop + 120,               // HUD 底(+91) 后再留 29rpx
        needsTop: hudTop + 222,
        toolsTop: hudTop + 262,
        speechTop: inset + 330 + coreShift,    // 44cqw + core-shift
        claimTop: inset + 465 + coreShift,     // 62cqw + core-shift
        actorTop: actorTop,
    };
}

module.exports = {
    DESIGN_HEIGHT_RPX: DESIGN_HEIGHT_RPX,
    TAB_BAR_ART_RPX: TAB_BAR_ART_RPX,
    HUD_HEIGHT_RPX: HUD_HEIGHT_RPX,
    HUD_MIN_WIDTH_RPX: HUD_MIN_WIDTH_RPX,
    MENU_GAP_RPX: MENU_GAP_RPX,
    STATUS_BAR_GAP_RPX: STATUS_BAR_GAP_RPX,
    HUD_FALLBACK_TOP: HUD_FALLBACK_TOP,
    HUD_FALLBACK_RIGHT: HUD_FALLBACK_RIGHT,
    readNestLayout: readNestLayout,
};
