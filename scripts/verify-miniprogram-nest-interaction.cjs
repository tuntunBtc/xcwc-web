'use strict';

// 小窝页验收：互动动效恢复 + 顶部 HUD 布局 + 背景图零改动守护。
// 背景图已由用户定稿，本脚本把定稿代码逐字节指纹化，任何改动都会失败（硬约束）。
// 运行：node scripts/verify-miniprogram-nest-interaction.cjs

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'miniprogram');
const P = function (rel) { return path.join(ROOT, rel); };
const read = function (rel) { return fs.readFileSync(P(rel), 'utf8'); };

const indexJs = read('pages/index/index.js');
const indexWxml = read('pages/index/index.wxml');
const indexWxss = read('pages/index/index.wxss');
const layoutJs = read('utils/nest-layout.js');
const idleJs = read('utils/nest-idle.js');

const facts = [];
const problems = [];
function ok(label, cond) { if (cond) facts.push('PASS ' + label); else problems.push('FAIL ' + label); }
function check(label, fn) {
    try { fn(); facts.push('PASS ' + label); }
    catch (e) { problems.push('FAIL ' + label + ' — ' + e.message); }
}
async function checkAsync(label, fn) {
    try { await fn(); facts.push('PASS ' + label); }
    catch (e) { problems.push('FAIL ' + label + ' — ' + e.message); }
}
function sha(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16); }

// ---------------------------------------------------------------- 1. 背景图零改动守护（最高优先级）
// 定稿指纹：修改前逐字节采样，任何涉及背景图的改动都会改变这些值。
const BG_BASELINE = {
    wxml: '885a54d2051581d1',
    wxss: '0468443f0349b980',
    // 只锁「背景图高度计算/返回」两处，不含 hudTop 注释区，避免调整 HUD 时假阳性。
    layoutCalc: 'fcd87a044d8fc8c6',
    layoutReturn: '26beed91a9455f81',
};

check('背景图 WXML 结构逐字节未变（page-scene / nest / scene-shade）', function () {
    const block = indexWxml.slice(indexWxml.indexOf('<!-- 全屏底图'), indexWxml.indexOf('<!-- 顶部 HUD'));
    assert.ok(block.length > 200, '未找到背景图结构块');
    assert.strictEqual(sha(block), BG_BASELINE.wxml, 'WXML 背景图结构被改动');
});

check('背景图 WXSS 规则逐字节未变（page / .page-scene / .nest / .scene-shade）', function () {
    const block = indexWxss.slice(indexWxss.indexOf('page {'), indexWxss.indexOf('/* 纹理底图'));
    assert.ok(block.length > 400, '未找到背景图样式块');
    assert.strictEqual(sha(block), BG_BASELINE.wxss, 'WXSS 背景图样式被改动');
});

check('背景图布局计算逐字节未变（tabBarHeight / pageHeight 公式）', function () {
    const block = layoutJs.slice(layoutJs.indexOf('    var tabBarHeight ='), layoutJs.indexOf('    // 短屏仍保留'));
    assert.ok(block.length > 200, '未找到布局计算块');
    assert.strictEqual(sha(block), BG_BASELINE.layoutCalc, '背景图高度计算被改动');
});

check('背景图高度返回值逐字节未变（viewportHeight / pageHeight）', function () {
    const block = layoutJs.slice(layoutJs.indexOf('        viewportHeight: viewportRpx,'), layoutJs.indexOf('        dockBottom: dockBottom,'));
    assert.ok(block.length > 40, '未找到布局返回块');
    assert.strictEqual(sha(block), BG_BASELINE.layoutReturn, '背景图高度返回值被改动');
});

check('全屏底图仍是唯一一张，且未被塞回 .nest 内', function () {
    const count = (indexWxml.match(/background\.webp/g) || []).length;
    assert.strictEqual(count, 1, 'background.webp 引用数应为 1，实际 ' + count);
    assert.ok(/<image class="page-scene"[^>]*mode="scaleToFill"/.test(indexWxml), 'page-scene 底图节点缺失或 mode 被改');
    assert.ok(/<view class="nest" style="height:\{\{layout\.pageHeight\}\}rpx">/.test(indexWxml), '.nest 节点被改');
    assert.ok(!/class="scene"/.test(indexWxml), '不应出现旧的 .scene 内嵌底图');
});

check('背景图样式关键属性保持不变', function () {
    const block = indexWxss.slice(indexWxss.indexOf('page {'), indexWxss.indexOf('/* 纹理底图'));
    assert.ok(/\.page-scene\s*\{[^}]*position:\s*fixed;/.test(block), '.page-scene 应为 fixed');
    assert.ok(/\.page-scene\s*\{[^}]*z-index:\s*0;/.test(block), '.page-scene z-index 应为 0');
    assert.ok(/\.page-scene\s*\{[^}]*pointer-events:\s*none;/.test(block), '.page-scene 应穿透点击');
    assert.ok(/\.nest\s*\{[^}]*background:\s*transparent;/.test(block), '.nest 应透明以透出底图');
    assert.ok(/page\s*\{\s*background:\s*#B7D68F;/.test(block), 'page 兜底底色被改');
});

// ---------------------------------------------------------------- 2. 互动动效：静态接线
check('syncIdle 把互动反馈期纳入暂停（feedbacking）', function () {
    assert.ok(/const feedbacking = this\.feedbackActive\(\) \|\| this\.data\.happy;/.test(indexJs), '缺少 feedbacking 判定');
    assert.ok(/this\.idle\.sync\([^)]*feedbacking/.test(indexJs), 'feedbacking 未传给 idle.sync');
});

check('showFeedback 开场即暂停待机动画，露出开心海报', function () {
    const seg = indexJs.slice(indexJs.indexOf('showFeedback(speech, duration)'), indexJs.indexOf('doCare(action'));
    assert.ok(/this\.syncIdle\(false\);/.test(seg), 'showFeedback 未调用 syncIdle(false) 让待机让位');
    assert.ok(/birdArt: '\/assets\/nest\/emotion-happy\.webp'/.test(seg), '反馈未切到开心表情海报');
});

check('三种互动都有专属动效：喂食谷粒 / 添水水滴 / 摸摸开心弹跳+爱心', function () {
    assert.ok(/triggerFeedFx\(\)/.test(indexJs), '缺喂食谷粒动效');
    assert.ok(/triggerWaterFx\(\)/.test(indexJs), '缺添水水滴动效');
    assert.ok(/doCare\(action[\s\S]{0,500}action === 'water' \? this\.triggerWaterFx\(\) : this\.triggerFeedFx\(\)|if \(action === 'water'\) this\.triggerWaterFx\(\);\s*else this\.triggerFeedFx\(\);/.test(indexJs), 'doCare 未按动作分发动效');
    assert.ok(/\.actor\.is-happy \.bird-art/.test(indexWxss) && /nest-happy/.test(indexWxss), '缺开心弹跳动画');
    assert.ok(/\.actor\.is-happy \.hearts/.test(indexWxss) && /nest-heart/.test(indexWxss), '缺爱心动画');
    assert.ok(/@keyframes nest-feed/.test(indexWxss), '缺谷粒动画');
    assert.ok(/@keyframes nest-water/.test(indexWxss), '缺水滴动画');
});

check('开心弹跳规则在呼吸规则之后，能覆盖 nest-breathe', function () {
    const breathe = indexWxss.indexOf('.actor.has-bird .bird-art');
    const happy = indexWxss.indexOf('.actor.is-happy .bird-art');
    assert.ok(breathe > 0 && happy > breathe, 'is-happy 必须定义在 has-bird 之后，否则弹跳被呼吸动画压掉');
});

check('WXML 挂载水滴动效与谷粒动效节点', function () {
    assert.ok(/wx:if="\{\{waterFxId > 0\}\}" class="water-fx"/.test(indexWxml), '缺水滴动效节点');
    assert.ok(/wx:if="\{\{feedFxId > 0\}\}" class="feed-fx"/.test(indexWxml), '缺谷粒动效节点');
    assert.ok(/class="drop d1"[\s\S]{0,120}class="drop d2"[\s\S]{0,120}class="drop d3"/.test(indexWxml), '水滴应三滴错峰');
    assert.ok(/class="hearts"/.test(indexWxml), '缺爱心节点');
});

check('动效层级高于待机画布（z-index:2），互动时不被盖住', function () {
    const z = function (sel) {
        const m = indexWxss.match(new RegExp('\\' + sel + '\\s*\\{[^}]*z-index:\\s*(\\d+)'));
        return m ? Number(m[1]) : -1;
    };
    assert.ok(z('.feed-fx') > z('.idle-canvas'), '谷粒层级应高于画布');
    assert.ok(z('.water-fx') > z('.idle-canvas'), '水滴层级应高于画布');
    assert.ok(z('.hearts') > z('.idle-canvas'), '爱心层级应高于画布');
});

check('动效计时器在 clearTimers / onHide 中被清理（E-09）', function () {
    const clearSeg = indexJs.slice(indexJs.indexOf('clearTimers()'), indexJs.indexOf('// 单次 setData'));
    assert.ok(/waterFxTimer/.test(clearSeg) && /waterFxHideTimer/.test(clearSeg), 'clearTimers 未清理水滴计时器');
    const hideSeg = indexJs.slice(indexJs.indexOf('onHide()'), indexJs.indexOf('onUnload()'));
    assert.ok(/waterFxId: 0/.test(hideSeg), 'onHide 未归零 waterFxId');
});

// ---------------------------------------------------------------- 3. 顶部 HUD 布局
check('HUD 左右贴边 12rpx、两端分布、身份卡收拢贴左上', function () {
    const hud = indexWxss.slice(indexWxss.indexOf('.hud {'), indexWxss.indexOf('.identity {'));
    assert.ok(/left:\s*12rpx;/.test(hud) && /right:\s*12rpx;/.test(hud), 'HUD 左右应为 12rpx');
    assert.ok(/justify-content:\s*space-between;/.test(hud), 'HUD 应两端分布');
    const identity = indexWxss.slice(indexWxss.indexOf('.identity {'), indexWxss.indexOf('.avatar {'));
    assert.ok(/flex:\s*0 1 auto;/.test(identity), '身份卡应收拢而非 flex:1 撑满');
    assert.ok(/max-width:\s*62%;/.test(identity), '身份卡应有 max-width 兜底长昵称');
});

check('状态条与需求气泡左边缘与 HUD 统一为 12rpx', function () {
    const status = indexWxss.slice(indexWxss.indexOf('.status {'), indexWxss.indexOf('.stat {'));
    assert.ok(/left:\s*12rpx;/.test(status) && /right:\s*12rpx;/.test(status), 'status 未对齐 12rpx');
    const needs = indexWxss.slice(indexWxss.indexOf('.needs {'), indexWxss.indexOf('.need {'));
    assert.ok(/left:\s*12rpx;/.test(needs), 'needs 未对齐 12rpx');
});

check('HUD 和上方状态元素保持定稿位置', function () {
    assert.ok(/hudTop:\s*inset \+ 8\b/.test(layoutJs), 'hudTop 应为 inset + 8');
    assert.ok(/statusTop:\s*inset \+ 128\b/.test(layoutJs), 'statusTop 必须保持 inset + 128');
    assert.ok(/needsTop:\s*inset \+ 230\b/.test(layoutJs), 'needsTop 不应被改');
    assert.ok(/toolsTop:\s*inset \+ 270\b/.test(layoutJs), 'toolsTop 不应被改');
    assert.ok(/speechTop:\s*inset \+ 330 \+ coreShift\b/.test(layoutJs), 'speechTop 不应被改');
});

check('短屏互动卡片整体在底栏上方，常规屏位置与立绘尺寸不变', function () {
    const previousWx = global.wx;
    const { readNestLayout } = require(P('utils/nest-layout.js'));
    try {
        for (const [width, height, statusBarHeight, bottomInset] of [
            [320, 568, 20, 0],
            [375, 667, 20, 0],
            [390, 680, 47, 34],
            [390, 844, 47, 34],
            [402, 874, 54, 34],
        ]) {
            global.wx = {
                getWindowInfo: () => ({
                    windowWidth: width, windowHeight: height, statusBarHeight,
                    screenHeight: height, safeArea: { bottom: height - bottomInset },
                }),
            };
            const layout = readNestLayout();
            const dockEnd = layout.pageHeight - layout.dockBottom;
            const dockStart = dockEnd - 162;
            assert.strictEqual(dockEnd, layout.viewportHeight - layout.tabBarHeight - 9);
            assert.ok(layout.actorTop + layout.actorHeight <= dockStart - 20, '立绘不能遮住照料按钮');
            if (layout.pageHeight === layout.viewportHeight - layout.tabBarHeight) {
                assert.strictEqual(layout.dockBottom, 9);
                assert.strictEqual(layout.actorHeight, 322);
                assert.strictEqual(layout.actorTop, layout.inset + 574 +
                    Math.max(0, dockStart - (layout.inset + 574 + 322) - 20));
            }
        }
    } finally {
        global.wx = previousWx;
    }
});

// ---------------------------------------------------------------- 4. 动态实跑：真实 nest-idle 在反馈期暂停后露出海报
let dynamicIdle = checkAsync('nest-idle：反馈期暂停会让 idlePlaying=false（开心海报可见）', async function () {
    function makeCtx() { return { clearRect: function () {}, drawImage: function () {} }; }
    function makeCanvas() { return { width: 0, height: 0, getContext: makeCtx, createImage: makeImage }; }
    function makeImage() {
        const img = { onload: null, onerror: null };
        let _src = '';
        Object.defineProperty(img, 'src', {
            get: function () { return _src; },
            set: function (v) { _src = v; if (img.onload) img.onload(); },
        });
        return img;
    }
    const audio = {
        _paused: true, currentTime: 0, loop: false, destroyed: false,
        set paused(v) { this._paused = v; }, get paused() { return this._paused; },
        set src(v) { this._src = v; }, get src() { return this._src; },
        play: function () { this.paused = false; this.playCount = (this.playCount || 0) + 1; },
        stop: function () { this.paused = true; },
        destroy: function () { this.destroyed = true; }, seek: function () {},
        onPlay: function () {}, onError: function () {}, onEnded: function () {},
    };
    const query = { select: function () { return { fields: function () { return { exec: function (cb) { cb([{ node: makeCanvas(), width: 195, height: 161 }]); } }; } }; } };
    query.in = function () { return query; };
    global.wx = {
        createInnerAudioContext: function () { return audio; },
        createSelectorQuery: function () { return query; },
    };
    delete require.cache[require.resolve(P('utils/nest-idle.js'))];
    const mod = require(P('utils/nest-idle.js'));
    const data = {};
    const page = { setData: function (p) { Object.assign(data, p); } };
    const idle = mod.createNestIdle(page, { audioSrc: '/x.m4a', atlasSrc: '/x.webp', canvasId: '#idleCanvas' });
    idle.sync(true, false, 'bird-1', true);
    await new Promise(function (r) { setImmediate(r); });
    // 反馈期：sync(eligible=true, suspended=true) 必须 stop → 清画布 → idlePlaying=false
    idle.sync(true, true, 'bird-1', true);
    assert.strictEqual(data.idlePlaying, false, '反馈期 idlePlaying 必须为 false，否则开心海报被隐藏');
    // 关键：互动 handler 里仍会调 idle.kick() 做手势解锁，但 kick 必须因 paused 直接短路，
    // 否则会用手势权限越过 cadence 闸门立刻重启待机音乐，把刚露出的互动动效再次盖住。
    const playsBeforeKick = audio.playCount || 0;
    idle.kick();
    assert.strictEqual(audio.playCount || 0, playsBeforeKick, '反馈期 kick 不应触发 audio.play()');
    // 反馈结束：恢复待机，但 cadence 闸门不应立刻重播造成音乐循环
    idle.sync(true, false, 'bird-1', true);
    idle.dispose();
    assert.strictEqual(audio.destroyed, true, 'dispose 应销毁音频');
});

// ---------------------------------------------------------------- 5. 动态实跑：index.js 三种互动确实触发动效字段
let dynamicPage = checkAsync('index.js：摸摸/喂食/添水分别触发 happy / feedFxId / waterFxId', async function () {
    // 用 vm 加载页面定义，注入最小依赖桩，驱动互动方法并检查 setData。
    const timers = [];
    const navigation = [];
    let pageDef = null;
    const snapshot = {
        hasBird: true, nickname: '卜叽', birdCode: 'BIRD001', points: 10, todayPoints: 0,
        dailyLimit: 10, food: 3, water: 3, satiety: 50, hydration: 50, mood: 60,
        supplyClaimed: false, todayStepClaimed: false, ledger: [],
    };
    const stubs = {
        '../../utils/store': {
            snapshot: function () { return { data: { snapshot: snapshot } }; },
            feed: function () { return { data: { changed: true } }; },
            water: function () { return { data: { changed: true } }; },
            pet: function () { return { data: { granted: 0 } }; },
            clean: function () { return { data: { changed: true } }; },
            supply: function () { return {}; }, rename: function () { return {}; },
            redeemSteps: async function () { return {}; },
        },
        '../../utils/entry': { buildAdoptUrl: function () { return '/pages/adopt/adopt'; } },
        '../../utils/config': { USE_LOCAL_FIXTURE: false, DEBUG_DEMO_BIRD_CODE: 'DEBUG' },
        '../../utils/tab-bar': { syncSelected: function () {} },
        '../../utils/nest-rules': {
            describeNestState: function () { return { needs: [], need: null, speech: '今天也很开心～', emotion: 'calm' }; },
            careCopy: function () { return { speech: '好好吃呀～', notice: '' }; },
            emotionArt: function () { return '/assets/nest/poster.webp'; },
            ERROR_TEXT: {},
        },
        '../../utils/nest-layout': { readNestLayout: function () { return { pageHeight: 1279, viewportHeight: 1428, tabBarHeight: 149, dockBottom: 9, toastBottom: 340, hudTop: 198, statusTop: 304, needsTop: 406, toolsTop: 446, speechTop: 506, claimTop: 641, actorTop: 750 }; } },
        '../../utils/nest-idle': {
            createNestIdle: function () {
                return { sync: function () {}, kick: function () {}, retry: function () {}, dispose: function () {} };
            },
        },
    };
    const sandbox = {
        Page: function (def) { pageDef = def; },
        require: function (id) { if (!(id in stubs)) throw new Error('unexpected require: ' + id); return stubs[id]; },
        console: console,
        setTimeout: function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; },
        clearTimeout: function () {}, setInterval: function () { return 1; }, clearInterval: function () {},
        Date: Date, Math: Math, Object: Object, JSON: JSON, Promise: Promise, Number: Number,
        wx: {
            onKeyboardHeightChange: function () {}, offKeyboardHeightChange: function () {},
            getWindowInfo: function () { return { windowWidth: 375, windowHeight: 812, statusBarHeight: 44, screenHeight: 812, safeArea: { bottom: 812 } }; },
            createInnerAudioContext: function () { return { stop: function () {}, play: function () {}, destroy: function () {}, set src(v) {} }; },
            navigateTo: function (options) { navigation.push(options); },
        },
    };
    vm.runInNewContext(indexJs, sandbox, { filename: 'index.js' });
    assert.ok(pageDef, '未捕获 Page 定义');

    const data = Object.assign({}, pageDef.data);
    const writes = [];
    const ctx = Object.assign({}, pageDef, {
        data: data,
        setData: function (patch) { Object.assign(data, patch); writes.push(Object.assign({}, patch)); },
    });
    // 把原型方法里的 this 固定为 ctx
    Object.keys(pageDef).forEach(function (k) { if (typeof pageDef[k] === 'function') ctx[k] = pageDef[k].bind(ctx); });

    ctx.onLoad();

    // --- 摸一摸：应触发 showFeedback（happy 延时置 true）与 syncIdle 暂停 ---
    timers.length = 0; writes.length = 0;
    const tap = (key) => ({ currentTarget: { dataset: { key: key } } });
    ctx.onDock(tap('touch'));
    const happyTimers = timers.filter(function (t) { return t.ms === 30; });
    assert.ok(happyTimers.length > 0, '摸摸应安排 happy 延时置位');
    happyTimers.forEach(function (t) { t.fn(); });
    assert.ok(writes.some(function (w) { return w.happy === true; }), '摸摸未把 happy 置 true（开心弹跳/爱心不触发）');
    assert.ok(writes.some(function (w) { return w.birdArt === '/assets/nest/emotion-happy.webp'; }), '摸摸未切开心海报');

    // --- 喂食：应触发谷粒动效，20ms 后 feedFxId=1 ---
    timers.length = 0; writes.length = 0;
    ctx.onDock(tap('feed'));
    const fxTimers = timers.filter(function (t) { return t.ms === 20; });
    assert.ok(fxTimers.length > 0, '喂食应安排谷粒动效重挂载');
    fxTimers.forEach(function (t) { t.fn(); });
    assert.ok(writes.some(function (w) { return w.feedFxId === 1; }), '喂食未触发 feedFxId=1');

    // --- 添水：应触发水滴动效，20ms 后 waterFxId=1 ---
    timers.length = 0; writes.length = 0;
    ctx.onDock(tap('water'));
    const waterTimers = timers.filter(function (t) { return t.ms === 20; });
    assert.ok(waterTimers.length > 0, '添水应安排水滴动效重挂载');
    waterTimers.forEach(function (t) { t.fn(); });
    assert.ok(writes.some(function (w) { return w.waterFxId === 1; }), '添水未触发 waterFxId=1');

    // --- 反馈期内 syncIdle 必须暂停待机（露出动效的关键）---
    // 用带 spy 的 idle 单独验证：showFeedback 之后 idle.sync 第二参应为 true
    let syncArgs = null;
    ctx.idle = { sync: function () { syncArgs = Array.prototype.slice.call(arguments); }, kick: function () {}, retry: function () {}, dispose: function () {} };
    ctx.feedback = null; data.happy = false;
    ctx.showFeedback('测试', 1600);
    assert.ok(syncArgs, 'showFeedback 未调用 idle.sync');
    assert.strictEqual(syncArgs[1], true, '反馈期 idle.sync 的 suspended 必须为 true，否则待机画布盖住动效');

    ctx.onTool(tap('checkin'));
    ctx.onTool(tap('checkin'));
    assert.strictEqual(navigation.length, 1, '跳转期间连点不可重复推入页面');
    assert.strictEqual(navigation[0].url, '/pages/photo/photo');
    navigation[0].fail();
    navigation[0].complete();
    assert.match(data.toast, /合照打卡暂时打不开/);
    ctx.onTool(tap('dress'));
    assert.strictEqual(navigation[1].url, '/pages/wardrobe/wardrobe');
    navigation[1].fail();
    navigation[1].complete();
    assert.match(data.toast, /衣橱暂时打不开/);
    ctx.onTool(tap('dress'));
    assert.strictEqual(navigation.length, 3, '失败后可重试');
});

// ---------------------------------------------------------------- 汇总
(async function () {
    try { await dynamicIdle; } catch (e) { /* 已记录 */ }
    try { await dynamicPage; } catch (e) { /* 已记录 */ }
    console.log('\n小窝页互动动效 / 顶部 HUD / 背景图守护验收：');
    facts.forEach(function (f) { console.log('  ' + f); });
    console.log('问题 (' + problems.length + ')');
    problems.forEach(function (p) { console.log('  ' + p); });
    if (problems.length) { console.log('\n❌ 未达交付标准'); process.exit(1); }
    console.log('\n✅ 全部通过（' + facts.length + ' 项）');
})();
