'use strict';

// 小程序打卡合照页专项门禁：静态一致性 + 纯规则 + 本机相册 + 页面状态机实跑。
// 用法：node scripts/verify-miniprogram-photo.cjs
// 所有 wx 能力用桩模拟，不联网、不读真实手机文件、不需要微信开发者工具。
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '../miniprogram');
const PAGE = path.join(ROOT, 'pages/photo');
const problems = [];
const facts = [];

function ok(label, condition, detail) {
    if (condition) facts.push('PASS ' + label);
    else problems.push('FAIL ' + label + (detail ? ' — ' + detail : ''));
}
function check(label, fn) {
    try { fn(); facts.push('PASS ' + label); }
    catch (error) { problems.push('FAIL ' + label + ' — ' + error.message); }
}
async function checkAsync(label, fn) {
    try { await fn(); facts.push('PASS ' + label); }
    catch (error) { problems.push('FAIL ' + label + ' — ' + error.message); }
}
function settle(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms || 30); }); }

// ---------------------------------------------------------------- 静态一致性
const pageFiles = ['photo.js', 'photo.wxml', 'photo.wxss', 'photo.json'];
pageFiles.forEach(function (name) {
    ok('页面文件存在 ' + name, fs.existsSync(path.join(PAGE, name)));
});
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
ok('app.json 以原路径注册 photo 普通分包', !app.pages.includes('pages/photo/photo') &&
    (app.subpackages || []).some(function (pkg) {
        return pkg.root === 'pages/photo' && !pkg.independent && pkg.pages.includes('photo');
    }));
const pageJson = JSON.parse(fs.readFileSync(path.join(PAGE, 'photo.json'), 'utf8'));
ok('自定义导航', pageJson.navigationStyle === 'custom');
ok('复用公共底栏组件', !!(pageJson.usingComponents && pageJson.usingComponents['photo-tab-bar']));
ok('底栏组件存在', fs.existsSync(path.join(ROOT, 'custom-tab-bar/index.wxml')));

['pages/photo/photo.js', 'utils/photo-model.js', 'utils/photo-album.js', 'utils/guest-store.js',
    'pages/index/index.js', 'pages/profile/profile.js'].forEach(function (rel) {
    const result = cp.spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], { encoding: 'utf8' });
    ok('JS 语法 ' + rel, result.status === 0, result.stderr.trim());
});

const wxmlRaw = fs.readFileSync(path.join(PAGE, 'photo.wxml'), 'utf8');
const wxml = wxmlRaw.replace(/<!--[\s\S]*?-->/g, '');
const wxss = fs.readFileSync(path.join(PAGE, 'photo.wxss'), 'utf8');
const js = fs.readFileSync(path.join(PAGE, 'photo.js'), 'utf8');
const banned = [/\?\./, /\?\?/, /=>/, /\{\{[^}]*\b\w+\([^}]*\}\}/];
banned.forEach(function (re, index) { ok('WXML 禁用语法 #' + index, !re.test(wxml)); });

// WXML 标签平衡（注释中的示例标签不计入）
const tagStack = [];
const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
let match;
let balanced = true;
while ((match = tagRe.exec(wxml))) {
    const closing = match[1] === '/';
    const name = match[2];
    const selfClosing = match[4] === '/';
    if (closing) {
        if (tagStack.pop() !== name) balanced = false;
    } else if (!selfClosing) {
        tagStack.push(name);
    }
}
ok('WXML 标签平衡', balanced && tagStack.length === 0, 'stack=' + tagStack.join(','));

// 事件处理函数闭环
const handlers = new Set();
const bindRe = /(?:bind|catch)(?:tap|touchstart|touchmove|touchend|touchcancel|input|change|changing|confirm|longpress)="([A-Za-z0-9_]+)"/g;
while ((match = bindRe.exec(wxml))) handlers.add(match[1]);
const missing = Array.from(handlers).filter(function (name) {
    return !new RegExp('(^|\\n)\\s*(?:async\\s+)?' + name + '\\s*\\(', 'm').test(js);
});
ok('事件处理器全部定义 (' + handlers.size + ')', missing.length === 0, missing.join(','));
ok('画布直接接收本地触点', /<canvas\b[^>]*\bbindtouchstart="onTouchStart"[^>]*>/.test(wxml));
check('小鸟横向滑动区的内边距包含在面板宽度内', function () {
    assert.match(wxml, /<scroll-view\b[^\r\n]*class="bird-scroller"[^\r\n]*scroll-x="true"/);
    const scroller = wxss.match(/\.bird-scroller\s*\{([^}]+)\}/);
    assert.ok(scroller, '缺少小鸟横向滑动区样式');
    assert.match(scroller[1], /width:\s*100%;/);
    assert.match(scroller[1], /box-sizing:\s*border-box;/);
});
check('窄屏返回及大小调节按钮保留至少 44×44px 热区', function () {
    for (const [name, actions] of [['back', ['onBack']], ['adjust-btn', ['onSmaller', 'onLarger']]]) {
        const style = wxss.match(new RegExp(`\\.${name}\\s*\\{([^}]+)\\}`));
        assert.ok(style, `缺少 .${name} 样式`);
        assert.match(style[1], /min-width:\s*44px;/);
        assert.match(style[1], /min-height:\s*44px;/);
        for (const action of actions) {
            assert.match(wxml, new RegExp(`class="${name}"\\s+bindtap="${action}"`));
        }
    }
});
check('窄屏合照编辑区的操作保留至少 44px 高度', function () {
    const controls = ['editor-summary', 'framing-picker', 'bird-picker', 'position-slider',
        'size-slider', 'reset-btn', 'download-btn', 'error-btn'];
    for (const name of controls) {
        const style = wxss.match(new RegExp(`\\.${name}(?:\\s*,\\s*\\.[\\w-]+)*\\s*\\{([^}]+)\\}`));
        assert.ok(style, `缺少 .${name} 样式`);
        assert.match(style[1], /min-height:\s*(?:44px|max\(\d+rpx,\s*44px\));/, `.${name} 高度不足`);
    }
});

// 素材引用
const refs = new Set();
const refRe = /\/(?:pages\/photo\/)?assets\/[\w\-./]+/g;
while ((match = refRe.exec(wxml + js + wxss))) {
    if (/\.(png|webp|jpg|jpeg|mp3)$/.test(match[0])) refs.add(match[0].slice(1));
}
const missingAssets = Array.from(refs).filter(function (ref) { return !fs.existsSync(path.join(ROOT, ref)); });
ok('素材引用存在 (' + refs.size + ')', missingAssets.length === 0, missingAssets.join(','));

// 小窝入口与清除缓存闭环
const indexJs = fs.readFileSync(path.join(ROOT, 'pages/index/index.js'), 'utf8');
ok('小窝合照入口跳 photo', /key === 'checkin'[\s\S]{0,160}pages\/photo\/photo/.test(indexJs));
ok('不再提示暂未接入', !/合照打卡暂未接入/.test(indexJs));
const profileJs = fs.readFileSync(path.join(ROOT, 'pages/profile/profile.js'), 'utf8');
ok('清除缓存同步清理相册', /photoAlbum\.clear\(\)/.test(profileJs));

// ---------------------------------------------------------------- 纯规则
const model = require(path.join(ROOT, 'utils/photo-model.js'));
const BIRDS = [
    { id: 'b1', name: '小黄', adopted: true },
    { id: 'b2', name: '小绿', adopted: true },
    { id: 'b3', name: '小蓝', adopted: true },
    { id: 'b4', name: '小紫', adopted: true },
    { id: 'lock', name: '未领取', adopted: false },
];
check('chooseBird 选中', function () { assert.deepStrictEqual(model.chooseBird([], 'b1', BIRDS).selected, ['b1']); });
check('chooseBird 取消', function () { assert.deepStrictEqual(model.chooseBird(['b1'], 'b1', BIRDS).selected, []); });
check('chooseBird 上限 3', (function () {
    const r = model.chooseBird(['b1', 'b2', 'b3'], 'b4', BIRDS);
    assert.strictEqual(r.error, '最多选择 3 只小鸟一起合照');
    assert.deepStrictEqual(r.selected, ['b1', 'b2', 'b3']);
}));
check('chooseBird 拒绝未领取', function () { assert.strictEqual(model.chooseBird([], 'lock', BIRDS).error, '这只小鸟还未领养'); });
check('arrangement 单鸟中心 735', function () { assert.strictEqual(model.arrangement(['b1']).b1.cx, 735); });
check('arrangement 三鸟 24%', function () { assert.strictEqual(model.arrangement(['b1', 'b2', 'b3']).b3.size, 24); });
check('rectFor 尺寸', (function () {
    const r = model.rectFor({ cx: 500, cy: 500, size: 34 }, 1);
    assert.strictEqual(r.w, 34 * 12.6);
    assert.strictEqual(r.x, 500 - r.w / 2);
}));
check('constrain 边界', (function () {
    const pose = model.constrain({ cx: -999, cy: 9999, size: 999 }, 1);
    assert.ok(pose.size <= 55 && pose.cx >= 38 && pose.cy <= 850);
}));
check('reconcilePoses 保留旧构图', (function () {
    const next = model.reconcilePoses(['b1', 'b2'], { b1: { cx: 111, cy: 222, size: 20 } });
    assert.deepStrictEqual(next.b1, { cx: 111, cy: 222, size: 20 });
    assert.strictEqual(next.b2.size, 28);
}));
check('resetPose 只复位当前鸟', (function () {
    const next = model.resetPose(['b1', 'b2'], { b1: { cx: 111, cy: 222, size: 20 }, b2: { cx: 333, cy: 444, size: 21 } }, 'b1');
    assert.strictEqual(next.b1.cx, 515);
    assert.strictEqual(next.b2.cx, 333);
}));
check('photoPlacement cover 有裁切方向', (function () {
    const frame = model.photoPlacement(4000, 1000, 'cover', 50, 50);
    assert.ok(frame.horizontal && !frame.vertical);
    assert.ok(frame.width >= 924);
}));
check('photoPlacement contain 居中不裁切', (function () {
    const frame = model.photoPlacement(1000, 1000, 'contain', 0, 100);
    assert.ok(!frame.horizontal || frame.width <= 924.5);
    assert.ok(frame.x >= 38 && frame.y >= 38);
}));
check('sortedMemories 时间倒序', (function () {
    const rows = model.sortedMemories([{ id: 'a', createdAt: 1 }, { id: 'b', createdAt: 2 }]);
    assert.strictEqual(rows[0].id, 'b');
}));
check('generateState 文案状态机', (function () {
    const base = { ready: true, canvasReady: true, canvasLoading: false, hasBird: true, selectedCount: 1,
        uploaded: true, dirty: true, albumAvailable: true, albumLoading: false, albumTotal: 0, busy: false, readingPhoto: false };
    assert.strictEqual(model.generateState(base).text, '生成并收藏');
    assert.strictEqual(model.generateState(base).disabled, false);
    assert.strictEqual(model.generateState(Object.assign({}, base, { uploaded: false })).text, '选择照片，开启合照');
    assert.strictEqual(model.generateState(Object.assign({}, base, { selectedCount: 0, hasBird: false })).text, '先选一只小鸟');
    assert.strictEqual(model.generateState(Object.assign({}, base, { dirty: false })).text, '已收藏，调整后再合照');
    assert.strictEqual(model.generateState(Object.assign({}, base, { albumTotal: 30 })).text, '相册已满，先管理合照');
    assert.strictEqual(model.generateState(Object.assign({}, base, { albumTotal: 30 })).canManageAlbum, true);
    assert.strictEqual(model.generateState(Object.assign({}, base, { albumTotal: 30, albumLoading: true })).canManageAlbum, false);
    assert.strictEqual(model.generateState(Object.assign({}, base, { busy: true })).text, '正在收藏回忆…');
    assert.strictEqual(model.generateState(Object.assign({}, base, { canvasReady: false, canvasLoading: true })).text, '正在准备合照素材…');
}));
check('applyFilter 黑白', (function () {
    const data = new Uint8ClampedArray([200, 100, 50, 255]);
    model.applyFilter(data, 3);
    assert.strictEqual(data[0], data[1]);
    assert.strictEqual(data[1], data[2]);
}));
check('applyFilter 无滤镜不改值', (function () {
    const data = new Uint8ClampedArray([10, 20, 30, 255]);
    model.applyFilter(data, 0);
    assert.deepStrictEqual(Array.from(data), [10, 20, 30, 255]);
}));
check('formatDate', function () { assert.strictEqual(model.formatDate(new Date(2026, 10, 4).getTime()), '2026.11.04'); });

// ---------------------------------------------------------------- 叽分规则
const guest = require(path.join(ROOT, 'utils/guest-store.js'));
const mem = {};
const storage = {
    getStorageSync: function (key) { return mem[key]; },
    setStorageSync: function (key, value) { mem[key] = JSON.parse(JSON.stringify(value)); },
    removeStorageSync: function (key) { delete mem[key]; },
};
const guestStore = guest.createGuestStore(storage, { debugSteps: 6800, rules: { pointsDailyLimit: 10, stepUnit: 1000, stepDailyCap: 5 } });
const T0 = Date.UTC(2026, 10, 9, 2, 0, 0);
check('合照奖励前置：先领养', function () { assert.strictEqual(guestStore.adopt('HZ-TEST-0001', '小黄', T0).error, null); });
check('新原图 +1', function () { assert.strictEqual(guestStore.photoReward('req-0000000000000001', 'sha1:a', T0).data.reward, 1); });
check('同一请求编号幂等', (function () {
    const result = guestStore.photoReward('req-0000000000000001', 'sha1:a', T0);
    assert.strictEqual(result.data.reward, 1);
    assert.strictEqual(result.data.replayed, true);
    assert.strictEqual(guestStore.snapshot(T0).data.snapshot.points, 1);
}));
check('重复原图不发分', function () { assert.strictEqual(guestStore.photoReward('req-0000000000000002', 'sha1:a', T0).data.reward, 0); });
check('第二张新原图 +1', function () { assert.strictEqual(guestStore.photoReward('req-0000000000000003', 'sha1:b', T0).data.reward, 1); });
check('第三张新原图 +1', function () { assert.strictEqual(guestStore.photoReward('req-0000000000000004', 'sha1:c', T0).data.reward, 1); });
check('每日最多 3 张', function () { assert.strictEqual(guestStore.photoReward('req-0000000000000005', 'sha1:d', T0).data.reward, 0); });
check('跨日重新可发', function () { assert.strictEqual(guestStore.photoReward('req-0000000000000006', 'sha1:d', T0 + 24 * 3600 * 1000).data.reward, 1); });
check('快照今日合照数', function () { assert.strictEqual(guestStore.snapshot(T0).data.snapshot.todayPhotos, 3); });
check('清除缓存清空合照去重', (function () {
    guestStore.reset(T0);
    const snap = guestStore.snapshot(T0).data.snapshot;
    assert.strictEqual(snap.hasBird, false);
    assert.strictEqual(snap.todayPhotos, 0);
}));

// ---------------------------------------------------------------- 页面状态机实跑
const storageMap = {};
const filesOnDisk = {};
const failedImages = new Set();
const calls = { share: 0, preview: 0, saveAlbum: 0, drawImage: 0, filterReads: 0, shutter: 0, navigateBack: 0, selector: 0 };
const previewSize = { width: 277, height: 280 };
let previewTop = 600;
let canvasAvailable = true;
let holdNextSelector = false;
let finishSelector;
const fakeCtx = {
    setTransform: function () {}, fillRect: function () {}, save: function () {}, beginPath: function () {},
    rect: function () {}, clip: function () {}, drawImage: function () { calls.drawImage += 1; },
    restore: function () {}, fillText: function () {},
    getImageData: function (x, y, w, h) { calls.filterReads += 1; return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData: function () {},
};
const fakeCanvas = {
    width: 0, height: 0,
    createImage: function () {
        const image = { width: 640, height: 584, onload: null, onerror: null, _src: '' };
        Object.defineProperty(image, 'src', {
            set: function (value) {
                image._src = value;
                setTimeout(function () {
                    const callback = failedImages.has(value) ? image.onerror : image.onload;
                    if (callback) callback();
                }, 0);
            },
            get: function () { return image._src; },
        });
        return image;
    },
    getContext: function () { return fakeCtx; },
};
const wxMock = {
    getWindowInfo: function () { return { windowWidth: 375, windowHeight: 812, screenHeight: 812, statusBarHeight: 44, safeArea: { bottom: 778 } }; },
    getMenuButtonBoundingClientRect: function () { return { top: 44, height: 32 }; },
    getStorageSync: function (key) { return storageMap[key]; },
    setStorageSync: function (key, value) { storageMap[key] = JSON.parse(JSON.stringify(value)); },
    removeStorageSync: function (key) { delete storageMap[key]; },
    getFileSystemManager: function () {
        return {
            accessSync: function (p) { if (!filesOnDisk[p]) throw new Error('ENOENT'); },
            mkdirSync: function () {},
            copyFileSync: function (src, dest) { filesOnDisk[dest] = src; },
            unlinkSync: function (p) { delete filesOnDisk[p]; },
            readFileSync: function () { return new ArrayBuffer(16); },
        };
    },
    getFileInfo: function (options) { options.success({ digest: String(options.filePath).replace(/[^a-zA-Z0-9]/g, '') }); },
    getImageInfo: function (options) { options.success({ path: options.src }); },
    createSelectorQuery: function () {
        let fields;
        return {
            in: function () { return this; },
            select: function () { return this; },
            fields: function (options) { fields = options; return this; },
            boundingClientRect: function () { fields = { size: true, rect: true }; return this; },
            exec: function (cb) {
                calls.selector += 1;
                const item = {};
                if (fields.node) item.node = fakeCanvas;
                if (fields.size) Object.assign(item, previewSize);
                if (fields.rect) Object.assign(item, { left: 0, top: previewTop });
                const result = canvasAvailable ? [item] : [];
                if (holdNextSelector) {
                    holdNextSelector = false;
                    finishSelector = function () { cb(result); };
                } else {
                    cb(result);
                }
            },
        };
    },
    canvasToTempFilePath: function (options) { options.success({ tempFilePath: '/tmp/work-' + Date.now() + '.jpg' }); },
    chooseMedia: function (options) {
        options.success({ tempFiles: [{ tempFilePath: '/tmp/photo-1.jpg', size: 100000 }] });
        options.complete();
    },
    createInnerAudioContext: function () {
        return { src: '', stop: function () {}, play: function () { calls.shutter += 1; }, destroy: function () {} };
    },
    showShareImageMenu: function (options) { calls.share += 1; options.success && options.success({}); },
    saveImageToPhotosAlbum: function (options) { calls.saveAlbum += 1; options.success({}); },
    previewImage: function () { calls.preview += 1; },
    showToast: function () {},
    showModal: function () {},
    openSetting: function () {},
    navigateBack: function () { calls.navigateBack += 1; },
    switchTab: function () {},
    navigateTo: function () {},
    env: { USER_DATA_PATH: '/user' },
};

global.wx = wxMock;
let pageConfig = null;
global.Page = function (config) { pageConfig = config; };
const pageModule = path.join(PAGE, 'photo.js');
delete require.cache[require.resolve(pageModule)];
require(pageModule);
ok('Page() 已注册', !!pageConfig && typeof pageConfig.onLoad === 'function');

function setPath(target, key, value) {
    const parts = key.split('.');
    let node = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
        if (!node[parts[i]]) node[parts[i]] = {};
        node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
}
function makePage() {
    const page = Object.assign({}, pageConfig);
    page.data = JSON.parse(JSON.stringify(pageConfig.data));
    page.setData = function (patch, cb) {
        Object.keys(patch).forEach(function (key) { setPath(page.data, key, patch[key]); });
        if (typeof cb === 'function') cb();
    };
    return page;
}

check('合照查看器在窄屏和矮屏避开胶囊与手势区，操作至少 44px', function () {
    function style(name) {
        const rule = wxss.match(new RegExp('\\.' + name + '\\s*\\{([^}]+)\\}'));
        assert.ok(rule, '缺少 .' + name + ' 样式');
        return rule[1];
    }
    const mask = style('viewer-mask');
    assert.match(mask, /position:\s*fixed;\s*left:\s*0;\s*right:\s*0;\s*top:\s*0;\s*bottom:\s*0;/);
    assert.match(wxml, /class="viewer-mask"\s+style="padding-top:\{\{topInset\}\}rpx;padding-bottom:\{\{viewerBottomInset\}\}rpx"/);
    const viewer = style('viewer');
    assert.match(viewer, /overflow-y:\s*auto;/);
    const header = style('viewer-header');
    assert.match(header, /position:\s*sticky;/);
    assert.match(header, /top:\s*0;/);
    assert.match(header, /z-index:\s*[1-9]\d*;/);
    assert.match(header, /background:\s*#f7f9ef;/i);
    const heightLimit = Number(viewer.match(/max-height:\s*(\d+)%/)[1]) / 100;
    const imageHeightRpx = Number(style('viewer-image').match(/height:\s*(\d+)rpx/)[1]);
    const close = style('viewer-close');
    assert.match(close, /min-width:\s*44px;/);
    assert.match(close, /flex-shrink:\s*0;/);
    [close, style('viewer-save'), style('other-summary'), style('other-btn')].forEach(function (rule) {
        assert.match(rule, /min-height:\s*44px;/);
    });

    const getWindowInfo = wxMock.getWindowInfo;
    const getMenuButtonBoundingClientRect = wxMock.getMenuButtonBoundingClientRect;
    const page = makePage();
    try {
        wxMock.getMenuButtonBoundingClientRect = () => ({ top: 28, height: 32 });
        for (const [width, height, bottomInset] of [[320, 568, 12], [360, 480, 0], [390, 360, 24]]) {
            wxMock.getWindowInfo = () => ({ windowWidth: width, windowHeight: height, screenHeight: height,
                statusBarHeight: 24, safeArea: { bottom: height - bottomInset } });
            page.onResize();
            const scale = width / 750;
            const top = page.data.topInset * scale;
            const bottom = page.data.viewerBottomInset * scale;
            const available = height - top - bottom;
            const viewerHeight = available * heightLimit;
            const viewerTop = top + (available - viewerHeight) / 2;
            assert.ok(viewerTop > 60, `${width}×${height} 查看器进入胶囊区`);
            assert.ok(viewerTop + viewerHeight <= height - bottomInset, `${width}×${height} 查看器进入手势区`);
            assert.ok(viewerHeight >= 88, `${width}×${height} 查看器可滚动区域过矮`);
            if (height <= 480) assert.ok(viewerHeight < imageHeightRpx * scale + 88);
        }
    } finally {
        wxMock.getWindowInfo = getWindowInfo;
        wxMock.getMenuButtonBoundingClientRect = getMenuButtonBoundingClientRect;
    }
});

check('微信隐私禁用与拒绝提示区分，取消和小程序相册权限保持原流程', function () {
    const page = makePage();
    const originalApis = {
        chooseMedia: wxMock.chooseMedia,
        saveImageToPhotosAlbum: wxMock.saveImageToPhotosAlbum,
        showShareImageMenu: wxMock.showShareImageMenu,
        showModal: wxMock.showModal,
    };
    const messages = [];
    const modals = [];
    let failure;
    page.showToast = function (message) { messages.push(message); };
    page.photoPath = '/tmp/original.jpg';
    wxMock.chooseMedia = function (options) { options.fail(failure); options.complete(); };
    wxMock.saveImageToPhotosAlbum = function (options) { options.fail(failure); };
    wxMock.showShareImageMenu = undefined;
    wxMock.showModal = function (options) { modals.push(options); };
    page.openViewer('/tmp/composite.jpg');
    try {
        for (const [method, invoke] of [['chooseMedia', () => page.onChoosePhoto()], ['saveImageToPhotosAlbum', () => page.onSavePhoto()]]) {
            for (const [message, errno, expected] of [
                ['appid privacy api banned', undefined, /联系运营人员/],
                ['api scope is not declared in the privacy agreement', 112, /联系运营人员/],
                ['user deny', 103, /稍后重试.*隐私保护指引/],
                ['user denied', 104, /稍后重试.*隐私保护指引/],
                ['cancel', undefined, null],
            ]) {
                failure = { errMsg: method + ':fail ' + message, errno };
                invoke();
                if (expected) assert.match(messages.pop(), expected);
                assert.deepStrictEqual(messages, []);
                assert.strictEqual(modals.length, 0);
            }
        }
        failure = { errMsg: 'saveImageToPhotosAlbum:fail auth deny', errno: 103 };
        page.onSavePhoto();
        assert.strictEqual(modals.length, 1);
        assert.match(modals[0].content, /小程序设置/);
        assert.strictEqual(page.photoPath, '/tmp/original.jpg');
        assert.strictEqual(page.data.viewer.image, '/tmp/composite.jpg');
    } finally {
        Object.assign(wxMock, originalApis);
    }
});

check('选图异常或空结果后能重试，迟到的旧回调不会影响新选图', function () {
    const page = makePage();
    const chooseMedia = wxMock.chooseMedia;
    const pickers = [];
    const messages = [];
    const files = [];
    page.photoPath = '/tmp/original.jpg';
    page.showToast = message => messages.push(message);
    page.readPhoto = file => files.push(file);
    try {
        wxMock.chooseMedia = () => { throw new Error('native chooser unavailable'); };
        assert.doesNotThrow(() => page.onChoosePhoto());
        assert.match(messages.pop(), /再试一次/);

        wxMock.chooseMedia = options => pickers.push(options);
        page.onChoosePhoto();
        pickers[0].success({ tempFiles: [] });
        assert.match(messages.pop(), /再试一次/);
        assert.strictEqual(files.length, 0);
        assert.strictEqual(page.photoPath, '/tmp/original.jpg');

        page.onChoosePhoto();
        pickers[0].complete();
        pickers[0].success({ tempFiles: [{ tempFilePath: '/tmp/old.jpg' }] });
        page.onChoosePhoto();
        assert.strictEqual(pickers.length, 2);
        assert.strictEqual(files.length, 0);
        pickers[1].fail({ errMsg: 'chooseMedia:fail cancel' });
        assert.deepStrictEqual(messages, []);

        page.onChoosePhoto();
        const latest = { tempFilePath: '/tmp/latest.jpg' };
        pickers[2].success({ tempFiles: [latest] });
        assert.deepStrictEqual(files, [latest]);
    } finally {
        wxMock.chooseMedia = chooseMedia;
    }
});

check('相册设置只在确认对应权限后更新提示，回到当前查看器仍需手动保存', function () {
    const page = makePage();
    const originalApis = {
        showShareImageMenu: wxMock.showShareImageMenu,
        saveImageToPhotosAlbum: wxMock.saveImageToPhotosAlbum,
        showModal: wxMock.showModal,
        openSetting: wxMock.openSetting,
        openAppAuthorizeSetting: wxMock.openAppAuthorizeSetting,
        getAppAuthorizeSetting: wxMock.getAppAuthorizeSetting,
    };
    const saves = [];
    const modals = [];
    const settings = [];
    const toasts = [];
    let systemPermission = 'authorized';
    wxMock.showShareImageMenu = undefined;
    wxMock.saveImageToPhotosAlbum = options => saves.push(options);
    wxMock.showModal = options => modals.push(options);
    wxMock.openSetting = options => settings.push({ options, kind: 'mini' });
    wxMock.openAppAuthorizeSetting = options => settings.push({ options, kind: 'system' });
    wxMock.getAppAuthorizeSetting = () => ({ albumAuthorized: systemPermission });
    page.showToast = message => toasts.push(message);
    function denySave() {
        page.onSavePhoto();
        saves[saves.length - 1].fail({ errMsg: 'saveImageToPhotosAlbum:fail auth deny' });
        modals[modals.length - 1].success({ confirm: true });
        return settings[settings.length - 1];
    }
    try {
        page.openViewer('/tmp/composite.jpg');
        const defaultHint = page.data.viewer.hint;
        const unrelatedScope = denySave();
        unrelatedScope.options.success({ authSetting: { 'scope.camera': true } });
        assert.match(page.data.viewer.hint, /小程序设置中允许保存到相册/);
        const mini = denySave();
        assert.strictEqual(mini.kind, 'mini');
        mini.options.success({ authSetting: { 'scope.writePhotosAlbum': true } });
        assert.match(page.data.viewer.hint, /权限已开启.*重新点击保存/);
        assert.strictEqual(saves.length, 2);
        assert.deepStrictEqual(toasts, []);
        page.onSavePhoto();
        saves[2].success();
        assert.strictEqual(page.data.viewer.hint, defaultHint);
        assert.deepStrictEqual(toasts, ['已保存到手机相册']);

        systemPermission = 'denied';
        const system = denySave();
        assert.strictEqual(system.kind, 'system');
        system.options.success({});
        assert.match(page.data.viewer.hint, /手机设置中允许微信访问相册/);
        assert.strictEqual(saves.length, 4);

        const granted = denySave();
        systemPermission = 'authorized';
        granted.options.success({});
        assert.match(page.data.viewer.hint, /权限已开启.*重新点击保存/);
        assert.strictEqual(saves.length, 5);

        const afterSave = denySave();
        page.onSavePhoto();
        saves[6].success();
        afterSave.options.success({ authSetting: { 'scope.writePhotosAlbum': true } });
        assert.strictEqual(page.data.viewer.hint, defaultHint);
        assert.strictEqual(saves.length, 7);

        systemPermission = 'denied';
        const stale = denySave();
        page.onCloseViewer();
        page.openViewer('/tmp/composite.jpg');
        systemPermission = 'authorized';
        stale.options.success({});
        assert.strictEqual(page.data.viewer.hint, defaultHint);
        assert.strictEqual(saves.length, 8);
    } finally {
        Object.assign(wxMock, originalApis);
    }
});

check('保存菜单和直接保存分别拦截连点，取消或失败后可以主动重试', function () {
    const page = makePage();
    const originalMenu = wxMock.showShareImageMenu;
    const originalSave = wxMock.saveImageToPhotosAlbum;
    const menus = [];
    const saves = [];
    const messages = [];
    page.showToast = message => messages.push(message);
    wxMock.showShareImageMenu = options => { menus.push(options); };
    wxMock.saveImageToPhotosAlbum = options => { saves.push(options); };
    try {
        page.openViewer('/tmp/composite.jpg');
        page.onSavePhoto();
        page.onSavePhoto();
        assert.strictEqual(menus.length, 1);
        assert.strictEqual(page.data.viewerSavePending, 'menu');
        menus[0].fail({ errMsg: 'showShareImageMenu:fail cancel' });
        assert.strictEqual(page.data.viewerSavePending, '');
        assert.strictEqual(page.data.viewer.shareMenuFailed, false);

        page.onSavePhoto();
        assert.strictEqual(menus.length, 2);
        menus[1].fail({ errMsg: 'showShareImageMenu:fail unavailable' });
        assert.strictEqual(page.data.viewer.shareMenuFailed, true);
        assert.match(page.data.viewer.hint, /再点一次直接保存/);
        assert.strictEqual(saves.length, 0);

        page.onSavePhoto();
        page.onSavePhoto();
        assert.strictEqual(page.data.viewerSavePending, 'album');
        assert.strictEqual(saves.length, 1);
        assert.strictEqual(saves[0].filePath, '/tmp/composite.jpg');
        menus[1].complete();
        assert.strictEqual(page.data.viewerSavePending, 'album');
        saves[0].fail({ errMsg: 'saveImageToPhotosAlbum:fail cancel' });
        assert.deepStrictEqual(messages, []);
        assert.strictEqual(page.data.viewerSavePending, '');

        page.onSavePhoto();
        saves[1].fail({ errMsg: 'saveImageToPhotosAlbum:fail unavailable' });
        assert.match(messages.pop(), /保存未完成/);
        page.onSavePhoto();
        assert.strictEqual(saves.length, 3);
        saves[2].success();
        assert.deepStrictEqual(messages, ['已保存到手机相册']);
        assert.strictEqual(page.data.viewerSavePending, '');
    } finally {
        wxMock.showShareImageMenu = originalMenu;
        wxMock.saveImageToPhotosAlbum = originalSave;
    }
});

check('关闭后重开同一张合照，旧保存回调不会修改新查看器', function () {
    const page = makePage();
    const originalMenu = wxMock.showShareImageMenu;
    const originalSave = wxMock.saveImageToPhotosAlbum;
    const menus = [];
    const saves = [];
    const messages = [];
    const photo = '/tmp/composite.jpg';
    page.showToast = message => messages.push(message);
    wxMock.showShareImageMenu = options => { menus.push(options); };
    wxMock.saveImageToPhotosAlbum = options => { saves.push(options); };
    try {
        page.openViewer(photo);
        page.onSavePhoto();
        page.onCloseViewer();
        page.openViewer(photo);
        page.onSavePhoto();
        assert.strictEqual(menus.length, 1);
        menus[0].fail({ errMsg: 'showShareImageMenu:fail unavailable' });
        assert.strictEqual(page.data.viewerSavePending, '');
        assert.strictEqual(page.data.viewer.shareMenuFailed, false);

        page.onSavePhoto();
        menus[0].complete();
        assert.strictEqual(page.data.viewerSavePending, 'menu');
        menus[1].complete();
        assert.strictEqual(page.data.viewerSavePending, '');

        wxMock.showShareImageMenu = undefined;
        page.onSavePhoto();
        page.onCloseViewer();
        page.openViewer(photo);
        page.onSavePhoto();
        assert.strictEqual(saves.length, 1);
        saves[0].success();
        assert.strictEqual(page.data.viewerSavePending, '');
        assert.deepStrictEqual(messages, []);

        page.onSavePhoto();
        assert.strictEqual(saves.length, 2);
        saves[0].complete();
        assert.strictEqual(page.data.viewerSavePending, 'album');
        saves[1].success();
        assert.deepStrictEqual(messages, ['已保存到手机相册']);
    } finally {
        wxMock.showShareImageMenu = originalMenu;
        wxMock.saveImageToPhotosAlbum = originalSave;
    }
});

(async function run() {
    const store = require(path.join(ROOT, 'utils/store.js'));
    store.adopt('HZ-HY-TEST-0001', '小黄');
    const page = makePage();
    page.onLoad();
    await settle();

    await checkAsync('初始：已领养 1 只、无图', function () {
        assert.strictEqual(page.data.selectedCount, 1);
        assert.strictEqual(page.data.noBirds, false);
        assert.strictEqual(page.data.birds.length, 4); // 1 已领取 + 3 未领取
        assert.strictEqual(page.data.birds[0].selected, true);
        assert.strictEqual(page.data.generateText, '选择照片，开启合照');
        assert.strictEqual(page.data.previewBadge, '示例');
        assert.ok(page.data.topInset > 0);
        assert.ok(page.data.toastBottom > 149);
    });

    await checkAsync('选择/取消小鸟与上限', function () {
        page.onBirdTap({ currentTarget: { dataset: { id: 'catalog:xiaohuangying' } } });
        assert.strictEqual(page.data.selectedCount, 1); // 未领取不可选
        page.onBirdTap({ currentTarget: { dataset: { id: page.selected[0] } } });
        assert.strictEqual(page.data.selectedCount, 0);
        page.onHide();
        page.onShow();
        assert.strictEqual(page.data.selectedCount, 0);
        assert.strictEqual(page.data.generateText, '先选一只小鸟');
        page.onBirdTap({ currentTarget: { dataset: { id: 'HZ-HY-TEST-0001' } } });
        assert.strictEqual(page.data.selectedCount, 1);
    });

    await checkAsync('空选择草稿等本机记录读通后恢复，更换领养小鸟时重新默认选中', async function () {
        await settle();
        const photoAlbum = require(path.join(ROOT, 'utils/photo-album.js'));
        const { STORAGE_KEY } = require(path.join(ROOT, 'utils/guest-store.js'));
        const read = wxMock.getStorageSync;
        const savedOwner = read(STORAGE_KEY);
        const savedDraft = photoAlbum.readDraft();
        const source = makePage();
        const abandoned = makePage();
        const recovered = makePage();
        try {
            photoAlbum.clearDraft();
            source.onLoad();
            source.onReady();
            source.onChoosePhoto();
            await settle(100);
            assert.strictEqual(source.data.uploaded, true);
            source.onBirdTap({ currentTarget: { dataset: { id: source.selected[0] } } });
            source.onUnload();
            const emptyDraft = photoAlbum.readDraft();
            assert.deepStrictEqual(emptyDraft.selected, []);

            wxMock.getStorageSync = function (key) {
                if (key === STORAGE_KEY) throw new Error('模拟本机养成缓存读取故障');
                return read(key);
            };
            abandoned.onLoad();
            abandoned.onUnload();
            assert.strictEqual(photoAlbum.readDraft(), emptyDraft);

            recovered.onLoad();
            recovered.onReady();
            assert.match(recovered.data.dataError, /暂时无法读取/);
            wxMock.getStorageSync = read;
            recovered.onRetryData();
            await settle(100);
            assert.strictEqual(recovered.data.dataError, '');
            assert.strictEqual(recovered.data.selectedCount, 0);
            assert.strictEqual(recovered.data.uploaded, true);
            assert.strictEqual(recovered.canvasReady, true);
            assert.strictEqual(recovered.data.generateText, '先选一只小鸟');
            recovered.onShow();
            assert.strictEqual(recovered.data.selectedCount, 0);

            assert.strictEqual(store.reset().error, null);
            assert.strictEqual(store.adopt('HZ-HY-TEST-NEW-BIRD', '新伙伴').error, null);
            recovered.onShow();
            assert.deepStrictEqual(recovered.selected, ['HZ-HY-TEST-NEW-BIRD']);
        } finally {
            wxMock.getStorageSync = read;
            if (recovered.birds && !recovered.unloaded) recovered.onUnload();
            wxMock.setStorageSync(STORAGE_KEY, savedOwner);
            photoAlbum.saveDraft(savedDraft);
        }
    });

    await checkAsync('首次画布节点缺失，原地重试会重新查询', async function () {
        canvasAvailable = false;
        try {
            page.toggleEditor();
            assert.strictEqual(await page.canvasPreparation, false);
            assert.match(page.data.assetError, /画布暂时不可用/);
        } finally {
            canvasAvailable = true;
        }
        const queries = calls.selector;
        assert.strictEqual(await page.onRetryAssets(), true);
        assert.strictEqual(calls.selector, queries + 1);
        assert.strictEqual(page.data.assetError, '');
        page.toggleEditor();
    });

    await checkAsync('关闭重开后，旧画布查询结果不覆盖新画布', async function () {
        holdNextSelector = true;
        canvasAvailable = false;
        page.toggleEditor();
        const oldPreparation = page.canvasPreparation;
        page.toggleEditor();
        canvasAvailable = true;
        page.toggleEditor();
        assert.strictEqual(await page.canvasPreparation, true);
        finishSelector();
        assert.strictEqual(await oldPreparation, false);
        assert.strictEqual(page.canvasReady, true);
        assert.strictEqual(page.data.assetError, '');
        page.toggleEditor();
    });

    await checkAsync('切换风格标脏并应用滤镜', async function () {
        page.toggleEditor();
        await settle(80);
        assert.strictEqual(page.data.editorOpen, true);
        assert.strictEqual(page.canvasReady, true);
        page.onStyleTap({ currentTarget: { dataset: { index: 3 } } });
        await settle(60);
        assert.strictEqual(page.data.styles[3].selected, true);
        assert.ok(calls.filterReads > 0);
        assert.ok(calls.drawImage > 0);
        page.onStyleTap({ currentTarget: { dataset: { index: 0 } } });
        await settle(60);
    });

    await checkAsync('大小滑块与复位', async function () {
        page.onSizeChange({ detail: { value: 45 } });
        await settle(60);
        assert.strictEqual(page.data.size, 45);
        page.onResetBird();
        assert.strictEqual(page.data.size, 34);
    });

    await checkAsync('离开再回来时提示消失，并显示离开前的最后一次尺寸修改', function () {
        try {
            const drawn = calls.drawImage;
            page.showToast('编辑提示');
            page.onSizeChange({ detail: { value: 45 } });
            assert.strictEqual(page.data.size, 34);
            page.onHide();
            assert.strictEqual(calls.drawImage, drawn);
            page.onShow();
            assert.deepStrictEqual({
                toast: page.data.toast,
                size: page.data.size,
                redrawn: calls.drawImage > drawn,
            }, { toast: '', size: 45, redrawn: true });
        } finally {
            page.onResetBird();
        }
    });

    await checkAsync('滚动后仍能拖动和双指缩放，取消后不残留手势', function () {
        const pose = page.poses[page.active];
        const start = { cx: pose.cx, cy: pose.cy, size: pose.size };
        function touch(identifier, x, y, scrollTop) {
            const localX = x * previewSize.width / model.CANVAS_W;
            const localY = y * previewSize.height / model.CANVAS_H;
            return { identifier, x: localX, y: localY, clientX: localX + 20, clientY: localY + 900 - scrollTop };
        }
        page.onTouchStart({ touches: [touch(1, start.cx, start.cy, 800)] });
        page.onTouchMove({ touches: [touch(1, start.cx - 30, start.cy - 25, 800)] });
        assert.ok(Math.abs(pose.cx - (start.cx - 30)) < 0.01);
        assert.ok(Math.abs(pose.cy - (start.cy - 25)) < 0.01);

        const cx = pose.cx;
        const cy = pose.cy;
        page.onTouchStart({ touches: [touch(1, cx - 30, cy, 800), touch(2, cx + 30, cy, 800)] });
        page.onTouchMove({ touches: [touch(1, cx - 36, cy, 800), touch(2, cx + 36, cy, 800)] });
        assert.ok(Math.abs(pose.size - start.size * 1.2) < 0.01);
        page.onTouchCancel();
        assert.deepStrictEqual(page.pointers, {});
        assert.strictEqual(page.gesture, null);
        page.onResetBird();
    });

    await checkAsync('视口触点按当前画布位置转换，测量期间保留最新移动', function () {
        const pose = page.poses[page.active];
        const start = { cx: pose.cx, cy: pose.cy, size: pose.size };
        function touch(identifier, x, y) {
            return {
                identifier,
                clientX: x * previewSize.width / model.CANVAS_W,
                clientY: previewTop + y * previewSize.height / model.CANVAS_H,
            };
        }
        try {
            previewTop = 140;
            holdNextSelector = true;
            page.onTouchStart({ touches: [touch(1, start.cx, start.cy)] });
            page.onTouchMove({ touches: [touch(1, start.cx - 10, start.cy - 10)] });
            page.onTouchMove({ touches: [touch(1, start.cx - 30, start.cy - 25)] });
            assert.strictEqual(pose.cx, start.cx);
            finishSelector();
            assert.ok(Math.abs(pose.cx - (start.cx - 30)) < 0.01);
            assert.ok(Math.abs(pose.cy - (start.cy - 25)) < 0.01);
            page.onTouchEnd({ touches: [], changedTouches: [touch(1, pose.cx, pose.cy)] });

            previewTop = 70;
            const { cx, cy } = pose;
            page.onTouchStart({ touches: [touch(1, cx - 30, cy), touch(2, cx + 30, cy)] });
            page.onTouchMove({ touches: [touch(1, cx - 36, cy), touch(2, cx + 36, cy)] });
            assert.ok(Math.abs(pose.size - start.size * 1.2) < 0.01);
            page.onTouchEnd({ touches: [], changedTouches: [touch(1, cx, cy), touch(2, cx, cy)] });
            assert.deepStrictEqual(page.pointers, {});
            assert.strictEqual(page.gesture, null);
        } finally {
            previewTop = 600;
            page.onTouchCancel();
            page.onResetBird();
        }
    });

    await checkAsync('视口测量返回前松手或取消，不会启动旧手势', function () {
        const pose = page.poses[page.active];
        const touch = {
            identifier: 1,
            clientX: pose.cx * previewSize.width / model.CANVAS_W,
            clientY: previewTop + pose.cy * previewSize.height / model.CANVAS_H,
        };
        for (const end of [
            () => page.onTouchEnd({ touches: [], changedTouches: [touch] }),
            () => page.onTouchCancel(),
        ]) {
            holdNextSelector = true;
            page.onTouchStart({ touches: [touch] });
            page.onTouchMove({ touches: [{ ...touch, clientX: touch.clientX - 20 }] });
            const start = { ...pose };
            end();
            finishSelector();
            assert.deepStrictEqual(pose, start);
            assert.deepStrictEqual(page.pointers, {});
            assert.strictEqual(page.gesture, null);
        }
    });

    const primaryAction = wxml.match(/<view\s+class="generate\s[^"]*"[^>]*\bbindtap="(\w+)"/)?.[1];
    const tapPrimaryAction = () => page[primaryAction]();
    await checkAsync('合照主按钮打开选图，连点只打开一次，取消后能重试', async function () {
        const chooseMedia = wxMock.chooseMedia;
        const choices = [];
        wxMock.chooseMedia = options => choices.push(options);
        try {
            assert.strictEqual(page.data.generateText, '选择照片，开启合照');
            tapPrimaryAction();
            tapPrimaryAction();
            assert.strictEqual(choices.length, 1);
            choices[0].fail({ errMsg: 'chooseMedia:fail cancel' });
            choices[0].complete();
            assert.strictEqual(page.data.uploaded, false);
            assert.strictEqual(page.data.albumTotal, 0);
            assert.strictEqual(page.data.generateText, '选择照片，开启合照');
            tapPrimaryAction();
            assert.strictEqual(choices.length, 2);
            choices[1].success({ tempFiles: [{ tempFilePath: '/tmp/valid.jpg', size: 100 }] });
            choices[1].complete();
            await settle(120);
            assert.strictEqual(page.data.uploaded, true);
            assert.strictEqual(page.data.editorOpen, true);
            assert.strictEqual(page.canvasReady, true);
            assert.strictEqual(page.data.generateText, '生成并收藏');
            assert.strictEqual(page.data.generateDisabled, false);
            assert.strictEqual(page.data.previewBadge, '编辑中');
        } finally {
            wxMock.chooseMedia = chooseMedia;
        }
    });

    await checkAsync('原生选图标为图片时允许无后缀临时路径，视频和超限图片保留原草稿', async function () {
        const photoAlbum = require(path.join(ROOT, 'utils/photo-album.js'));
        const draft = photoAlbum.readDraft();
        const next = makePage();
        next.onLoad();
        try {
            await next.readPhoto({ tempFilePath: 'wxfile://tmp_native_photo', fileType: 'image', size: 100 });
            assert.strictEqual(next.photoPath, 'wxfile://tmp_native_photo');
            assert.strictEqual(next.data.uploaded, true);
            await next.readPhoto({ tempFilePath: '/tmp/video.jpg', fileType: 'video', size: 100 });
            assert.strictEqual(next.photoPath, 'wxfile://tmp_native_photo');
            assert.match(next.data.toast, /请选择.*照片/);
            await next.readPhoto({ tempFilePath: 'wxfile://tmp_large_photo', fileType: 'image', size: 16 * 1024 * 1024 });
            assert.strictEqual(next.photoPath, 'wxfile://tmp_native_photo');
            assert.match(next.data.toast, /超过 15 MB/);
        } finally {
            next.onUnload();
            if (draft) photoAlbum.saveDraft(draft);
            else photoAlbum.clearDraft();
        }
    });

    await checkAsync('损坏替换图保留上一张照片、构图和待重试草稿', async function () {
        const oldPhoto = page.photo;
        const oldPath = page.photoPath;
        const pending = { id: 'still-pending' };
        const photoX = page.photoX;
        page.photoX = 21;
        page.pendingSubmission = pending;
        failedImages.add('/tmp/corrupt.jpg');
        try {
            const replacement = page.readPhoto({ tempFilePath: '/tmp/corrupt.jpg', size: 100 });
            page.toggleEditor();
            assert.strictEqual(page.data.editorOpen, true);
            await page.readPhoto({ tempFilePath: '/tmp/concurrent.jpg', size: 100 });
            await replacement;
            assert.strictEqual(page.photo, oldPhoto);
            assert.strictEqual(page.photoPath, oldPath);
            assert.strictEqual(page.data.uploadThumb, oldPath);
            assert.strictEqual(page.photoX, 21);
            assert.strictEqual(page.pendingSubmission, pending);
            assert.strictEqual(page.canvasReady, true);
            assert.match(page.data.toast, /照片没能打开/);
        } finally {
            failedImages.delete('/tmp/corrupt.jpg');
            page.photoX = photoX;
            page.pendingSubmission = null;
        }
    });

    await checkAsync('生成并收藏：+1 叽分、打开查看器', async function () {
        await tapPrimaryAction();
        await settle(60);
        assert.strictEqual(calls.shutter, 1);
        assert.strictEqual(page.data.albumTotal, 1);
        assert.strictEqual(page.data.albumEntries.length, 1);
        assert.strictEqual(page.data.albumEntries[0].badge, '+1 叽分');
        assert.ok(page.data.viewer && page.data.viewer.image);
        assert.ok(page.data.viewer.note.indexOf('+1 叽分') >= 0);
        assert.strictEqual(page.data.generateText, '已收藏，调整后再合照');
        assert.strictEqual(page.data.points, 1);
    });

    await checkAsync('查看器保存调用系统菜单', function () {
        page.onCloseViewer();
        assert.strictEqual(page.data.viewer, null);
        page.onMemoryTap({ currentTarget: { dataset: { id: page.data.albumEntries[0].id } } });
        page.onSavePhoto();
        assert.strictEqual(calls.share, 1);
        page.onOtherWays();
        assert.strictEqual(page.data.viewer.otherOpen, true);
        page.onPreviewImage();
        assert.strictEqual(calls.preview, 1);
        page.onCloseViewer();
    });

    await checkAsync('重复原图只收藏不发分', async function () {
        page.onLocationInput({ detail: { value: '西湖边' } });
        await settle(60);
        assert.strictEqual(page.data.generateText, '生成并收藏');
        await page.onGenerate();
        await settle(60);
        assert.strictEqual(page.data.albumTotal, 2);
        assert.strictEqual(page.data.points, 1);
        assert.ok(page.data.viewer.note.indexOf('未发叽分') < 0); // note 为“已收藏到打卡相册”
    });

    await checkAsync('删除合照保留叽分', function () {
        const id = page.data.albumEntries[0].id;
        page.onDeleteTap({ currentTarget: { dataset: { id: id } } });
        assert.strictEqual(page.data.deleteConfirm, true);
        page.onCancelDelete();
        assert.strictEqual(page.data.deleteConfirm, false);
        assert.strictEqual(page.data.albumTotal, 2);
        page.onDeleteTap({ currentTarget: { dataset: { id: id } } });
        page.onConfirmDelete();
        assert.strictEqual(page.data.deleteConfirm, false);
        assert.strictEqual(page.data.albumTotal, 1);
        assert.strictEqual(page.data.points, 1);
    });

    await checkAsync('满额主按钮进入相册管理，并滚到胶囊和固定页头下方', function () {
        const previousTotal = page.albumTotal;
        const nativeScroll = wx.pageScrollTo;
        const nativeQuery = wx.createSelectorQuery;
        const selectors = [];
        let scroll;
        wx.pageScrollTo = options => { scroll = options; };
        wx.createSelectorQuery = () => {
            const query = {
                in: () => query,
                select: selector => { selectors.push(selector); return query; },
                selectViewport: () => query,
                boundingClientRect: () => query,
                scrollOffset: () => query,
                exec: callback => callback([{ top: 240 }, { height: 72 }, { scrollTop: 600 }]),
            };
            return query;
        };
        try {
            page.albumTotal = 30;
            page.syncGenerate();
            assert.strictEqual(page.data.generateCanManageAlbum, true);
            page.onPrimaryAction();
            assert.strictEqual(page.data.albumManaging, true);
            assert.strictEqual(page.data.albumExpanded, true);
            assert.deepStrictEqual(selectors, ['.album-section', '.immersive-top']);
            assert.deepStrictEqual(scroll, { scrollTop: 760, duration: 200 });
        } finally {
            wx.pageScrollTo = nativeScroll;
            wx.createSelectorQuery = nativeQuery;
            page.albumTotal = previousTotal;
            page.setData({ albumManaging: false, albumExpanded: false });
            page.renderGallery();
            page.syncGenerate();
        }
    });

    await checkAsync('相册展开/管理/满额文案', function () {
        page.onViewAll();
        assert.strictEqual(page.data.albumExpanded, true);
        page.onManageAlbum();
        assert.strictEqual(page.data.albumManaging, true);
        page.onManageAlbum();
        assert.strictEqual(page.data.albumManaging, false);
        page.onManageFull();
        assert.strictEqual(page.data.albumManaging, true);
        assert.strictEqual(page.data.albumExpanded, true);
    });

    await checkAsync('返回与草稿', function () {
        page.saveDraft();
        const draft = require(path.join(ROOT, 'utils/photo-album.js')).readDraft();
        assert.ok(draft && draft.uploaded === true);
        page.onBack();
        assert.strictEqual(calls.navigateBack, 1);
    });

    await checkAsync('返回连点只执行一次，回小窝也失败时提示并允许重试', function () {
        const next = makePage();
        const navigateBack = wxMock.navigateBack;
        const switchTab = wxMock.switchTab;
        const backs = [];
        const tabs = [];
        const messages = [];
        wxMock.navigateBack = (options) => backs.push(options);
        wxMock.switchTab = (options) => tabs.push(options);
        next.showToast = (message) => messages.push(message);
        try {
            next.onBack();
            next.onBack();
            assert.strictEqual(backs.length, 1);
            backs[0].fail();
            assert.strictEqual(tabs[0].url, '/pages/index/index');
            next.onBack();
            assert.strictEqual(backs.length, 1);
            tabs[0].fail();
            assert.deepStrictEqual(messages, ['返回失败，请重试']);
            next.onBack();
            assert.strictEqual(backs.length, 2);
            next.unloaded = true;
            backs[1].fail();
            assert.strictEqual(tabs.length, 1);
        } finally {
            wxMock.navigateBack = navigateBack;
            wxMock.switchTab = switchTab;
        }
    });

    await checkAsync('重进页面恢复草稿与相册', async function () {
        const next = makePage();
        next.onLoad();
        await settle(60);
        assert.strictEqual(next.data.uploaded, true);
        assert.strictEqual(next.data.location, '西湖边');
        assert.strictEqual(next.data.albumTotal, 1);
        assert.ok(next.data.draftNote.indexOf('已恢复') >= 0);
        next.onUnload();
    });

    await checkAsync('折叠编辑区时直接选图也能成功', async function () {
        const photoAlbum = require(path.join(ROOT, 'utils/photo-album.js'));
        store.reset();
        photoAlbum.clear();
        store.adopt('HZ-HY-TEST-0002', '小黄');
        const fresh = makePage();
        fresh.onLoad();
        await settle(40);
        assert.strictEqual(fresh.data.editorOpen, false);
        fresh.onChoosePhoto();
        await settle(160);
        assert.strictEqual(fresh.data.uploaded, true);
        assert.strictEqual(fresh.data.editorOpen, true);
        assert.strictEqual(fresh.canvasReady, true);
        assert.strictEqual(fresh.data.generateText, '生成并收藏');
        fresh.onUnload();
    });

    await checkAsync('贴纸加载失败保留已解码照片并可重试', async function () {
        const photoAlbum = require(path.join(ROOT, 'utils/photo-album.js'));
        photoAlbum.clearDraft();
        const fresh = makePage();
        fresh.onLoad();
        failedImages.add('/pages/photo/assets/bird.webp');
        try {
            await fresh.readPhoto({ tempFilePath: '/tmp/valid.jpg', size: 100 });
            assert.strictEqual(fresh.canvasReady, false);
            assert.strictEqual(fresh.data.generateDisabled, true);
            assert.strictEqual(fresh.photoPath, '/tmp/valid.jpg');
            assert.match(fresh.data.toast, /素材暂时无法加载/);
        } finally {
            failedImages.delete('/pages/photo/assets/bird.webp');
        }
        assert.strictEqual(await fresh.onRetryAssets(), true);
        assert.strictEqual(fresh.data.generateDisabled, false);
        fresh.onUnload();
    });

    await checkAsync('离页后的旧导出回调不会重新写入已清除的草稿', async function () {
        const photoAlbum = require(path.join(ROOT, 'utils/photo-album.js'));
        const fresh = makePage();
        fresh.onLoad();
        assert.strictEqual(await fresh.prepareCanvasImages(), true);
        const exportCanvas = wxMock.canvasToTempFilePath;
        let finishExport;
        wxMock.canvasToTempFilePath = function (options) { finishExport = options.success; };
        try {
            const total = photoAlbum.history().total;
            const generating = fresh.onGenerate();
            fresh.onUnload();
            photoAlbum.clearDraft();
            finishExport({ tempFilePath: '/tmp/stale-export.jpg' });
            await generating;
            assert.strictEqual(photoAlbum.readDraft(), null);
            assert.strictEqual(photoAlbum.history().total, total);
        } finally {
            wxMock.canvasToTempFilePath = exportCanvas;
        }
    });

    await checkAsync('清除缓存清空相册文件与草稿', function () {
        const photoAlbum = require(path.join(ROOT, 'utils/photo-album.js'));
        store.reset();
        assert.strictEqual(photoAlbum.clear(), true);
        assert.strictEqual(photoAlbum.history().total, 0);
        assert.strictEqual(photoAlbum.readDraft(), null);
    });

    const failed = problems.filter(function (line) { return line.indexOf('FAIL') === 0; });
    console.log('=== 验证结果 (' + facts.length + ' 项通过) ===');
    facts.forEach(function (line) { console.log('  ' + line); });
    console.log('=== 问题 (' + failed.length + ') ===');
    if (!failed.length) console.log('  无');
    else failed.forEach(function (line) { console.log('  ! ' + line); });
    process.exitCode = failed.length ? 1 : 0;
})().catch(function (error) {
    console.error('验证脚本异常:', error);
    process.exitCode = 1;
});
