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
var TOOL_HEIGHT_RPX = 84;      // .tool 的原有视觉高度，热区另有 44px 下限
var TOOL_GAP_RPX = 8;          // .tools 的相邻按钮间距
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
            rightInsetRpx: typeof menu.right === 'number' && menu.right <= width && menu.right > left
                ? Math.round((width - menu.right) * scale) : null,
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
    // 仅移动顶部信息与状态行；其余锚点沿用原布局，避免牵动工具列等元素。
    var alignedHudTop = menu ? Math.max(0, menu.topRpx - Math.round((HUD_HEIGHT_RPX - menu.heightRpx) / 2)) : hudTop;
    var statusAnchorTop = menu ? Math.max(menu.statusBarRpx, menu.topRpx - Math.round((HUD_HEIGHT_RPX - menu.heightRpx) / 2)) : hudTop;
    var viewportRpx = DESIGN_HEIGHT_RPX;
    var screenViewportRpx = 0;
    var bottomInset = 0;
    var width = 375;
    try {
        var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        width = info.windowWidth || 375;
        var height = info.windowHeight || 667;
        viewportRpx = Math.round((height * 750) / width);
        bottomInset = readBottomInset(info, width);
        // 只有手机端用物理屏幕高度补足底栏区域。电脑端的 screenHeight 可能指显示器。
        var device = wx.getDeviceInfo ? wx.getDeviceInfo() : info;
        if (device && /^(ios|android|ohos)$/.test(device.platform) && Number.isFinite(info.screenHeight)) {
            var screenTop = Number.isFinite(info.screenTop) ? Math.max(0, info.screenTop) : 0;
            var screenViewport = info.screenHeight - screenTop;
            if (screenViewport > height) screenViewportRpx = Math.ceil(screenViewport * 750 / width);
        }
    } catch (error) {
        // 保留已取得的窗口尺寸，旧基础库或缺少设备信息时沿用窗口高度。
    }
    var tabBarHeight = TAB_BAR_ART_RPX + bottomInset;
    var sceneHeight = Math.max(viewportRpx, screenViewportRpx);
    var lavenderScale = Math.max(750 / 1080, sceneHeight / 1920);
    // 1080 × 2400 空房中，定稿鸟的脚底为 (540, 1770)，立绘 595.5 × 555。
    // 跟随底图 aspectFill 的缩放与居中裁切，长屏、短屏共用同一块地毯落点。
    var tallScale = Math.max(750 / 1080, sceneHeight / 2400);
    var tallLeft = (750 - 1080 * tallScale) / 2 + (540 - 595.5 / 2) * tallScale;
    var tallTop = (sceneHeight - 2400 * tallScale) / 2 + (1770 - 555) * tallScale;
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
    var speechTop = inset + 330 + coreShift;
    var toolHeight = Math.max(TOOL_HEIGHT_RPX, Math.ceil(44 * 750 / width));
    // 清洁、补给、合照打卡、AR、播放共用一列。短屏为照料区留出空间。
    var toolsHeight = 5 * toolHeight + 4 * TOOL_GAP_RPX;
    var toolsTop = Math.max(hudTop + 222, Math.min(hudTop + 262, dockTop - toolsHeight - TOOL_GAP_RPX));
    return {
        inset: inset,
        tabBarHeight: tabBarHeight,
        // 底图单独覆盖手机端可能被窗口高度排除的透明底栏区。
        sceneHeight: sceneHeight,
        viewportHeight: viewportRpx,
        pageHeight: pageHeight,
        dockBottom: dockBottom,
        // toast 是 position:fixed，坐标系是「视口」而非 .nest；自定义 tabBar 也是
        // fixed 且 z-index:1000，必须把整条底栏高度加回来，否则 toast 会被底栏盖住。
        toastBottom: tabBarHeight + DOCK_GAP_RPX + DOCK_HEIGHT_RPX + 20,
        // 第 4 张背景的桂花鸟按标注圈定位，脚底约在 1080 × 1920 场景的 (546, 1439)。
        // 立绘、触摸区域和脚下投影随房间的 aspectFill 裁切同步缩放。
        diaryActorLeft: Math.round((750 - 1080 * lavenderScale) / 2 + 247 * lavenderScale),
        diaryActorTop: Math.round((sceneHeight - 1920 * lavenderScale) / 2 + 965 * lavenderScale),
        diaryActorWidth: Math.round(598 * lavenderScale),
        diaryActorHeight: Math.round(485 * lavenderScale),
        tallOsmanthusStyle: 'left:' + tallLeft + 'rpx;top:' + tallTop + 'rpx;width:' + (595.5 * tallScale) + 'rpx;height:' + (555 * tallScale) + 'rpx;',
        actorHeight: actorHeight,
        // 顶部信息组锚定 hudTop，短屏允许工具列在组内上移避让 dock。
        // 对话气泡、领取入口、立绘与 dock 属场景主体，仍按 inset 定位保持不动。
        hudTop: alignedHudTop,
        hudLeft: menu && menu.rightInsetRpx !== null ? Math.max(0, menu.rightInsetRpx - 8) : 12,
        hudRight: hudRight,                    // 胶囊左边缘避让，内联覆盖 WXSS 的 right:12rpx
        statusTop: statusAnchorTop + 100,        // 状态行贴近顶部信息组
        needsTop: hudTop + 222,
        toolsTop: toolsTop,
        speechTop: speechTop,                  // 44cqw + core-shift
        claimTop: inset + 465 + coreShift,     // 62cqw + core-shift
        actorTop: actorTop,
        birdDragMinY: Math.min(0, hudTop + 222 - actorTop),
        birdDragMaxY: Math.max(0, dockTop - actorTop - actorHeight - 6),
        rpxPerPixel: 750 / width,
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
