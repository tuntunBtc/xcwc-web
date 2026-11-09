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
ok('app.json 注册 photo 页', app.pages.indexOf('pages/photo/photo') >= 0);
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

// 素材引用
const refs = new Set();
const refRe = /(?:\/assets\/[\w\-./]+)/g;
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
const calls = { share: 0, preview: 0, saveAlbum: 0, drawImage: 0, filterReads: 0, shutter: 0, navigateBack: 0 };
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
                setTimeout(function () { if (image.onload) image.onload(); }, 0);
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
        return {
            in: function () { return this; },
            select: function () { return this; },
            fields: function () { return this; },
            exec: function (cb) { cb([{ node: fakeCanvas, left: 0, top: 0, width: 277, height: 280 }]); },
        };
    },
    canvasToTempFilePath: function (options) { options.success({ tempFilePath: '/tmp/work-' + Date.now() + '.jpg' }); },
    chooseMedia: function (options) { options.success({ tempFiles: [{ tempFilePath: '/tmp/photo-1.jpg', size: 100000 }] }); },
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
        page.onBirdTap({ currentTarget: { dataset: { id: 'HZ-HY-TEST-0001' } } });
        assert.strictEqual(page.data.selectedCount, 1);
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

    await checkAsync('选图后画布就绪、按钮可点', async function () {
        page.onChoosePhoto();
        await settle(120);
        assert.strictEqual(page.data.uploaded, true);
        assert.strictEqual(page.data.editorOpen, true);
        assert.strictEqual(page.canvasReady, true);
        assert.strictEqual(page.data.generateText, '生成并收藏');
        assert.strictEqual(page.data.generateDisabled, false);
        assert.strictEqual(page.data.previewBadge, '编辑中');
    });

    await checkAsync('生成并收藏：+1 叽分、打开查看器', async function () {
        await page.onGenerate();
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
        page.onConfirmDelete();
        assert.strictEqual(page.data.deleteConfirm, false);
        assert.strictEqual(page.data.albumTotal, 1);
        assert.strictEqual(page.data.points, 1);
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
