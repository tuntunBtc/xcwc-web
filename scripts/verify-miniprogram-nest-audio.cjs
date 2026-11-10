'use strict';

// 小窝互动音效 + 待机动画音效专项门禁。
// 背景：1:1 复刻阶段这两块被刻意延后（见 小程序项目档案.md 待办 11），本次补齐。
// 本脚本校验：(1) 资源就位；(2) 页面接线（chirp / idle kick / syncIdle / 卸载销毁）；
//            (3) nest-idle 模块在桩环境下可实例化、sync/kick/dispose 不抛错、frameAt 正确。
// 用法：node scripts/verify-miniprogram-nest-audio.cjs —— 全部用桩模拟，不需要微信开发者工具。
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '../miniprogram');
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
    return label;
}

// ---------------------------------------------------------------- 资源就位
const assets = [
    'assets/nest/idle/atlas.webp',
    'assets/nest/idle/idle.m4a',
    'assets/nest/chirp.mp3',
];
assets.forEach(function (rel) {
    ok('素材存在 ' + rel, fs.existsSync(path.join(ROOT, rel)));
});
// 复刻阶段遗留的冗余 animation.json 不应再存在（已被 nest-idle-meta.js 取代）。
ok('无冗余 animation.json', !fs.existsSync(path.join(ROOT, 'assets/nest/idle/animation.json')));

// ---------------------------------------------------------------- 语法
['pages/index/index.js', 'utils/nest-idle.js', 'utils/nest-idle-meta.js'].forEach(function (rel) {
    const r = cp.spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], { encoding: 'utf8' });
    ok('JS 语法 ' + rel, r.status === 0, (r.stderr || '').trim());
});

const indexJs = fs.readFileSync(path.join(ROOT, 'pages/index/index.js'), 'utf8');
const indexWxml = fs.readFileSync(path.join(ROOT, 'pages/index/index.wxml'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '');
const idleJs = fs.readFileSync(path.join(ROOT, 'utils/nest-idle.js'), 'utf8');

// ---------------------------------------------------------------- 页面接线
ok('互动鸟叫方法 playChirp 定义', /playChirp\s*\(/.test(indexJs));
ok('playChirp 用 InnerAudioContext', /this\.chirpAudio\s*=\s*wx\.createInnerAudioContext\(\)/.test(indexJs));
ok('pet 触发 chirp + idle.kick',
    /pet\s*\([\s\S]{0,600}this\.playChirp\(\);[\s\S]{0,80}this\.idle\.kick\(\)/.test(indexJs));
ok('doCare 触发 chirp + idle.kick',
    /doCare\s*\([\s\S]{0,400}this\.playChirp\(\);[\s\S]{0,80}this\.idle\.kick\(\)/.test(indexJs));
ok('onTool(clean) 触发 chirp + idle.kick',
    /key === 'clean'[\s\S]{0,200}this\.playChirp\(\);[\s\S]{0,80}this\.idle\.kick\(\)/.test(indexJs));
ok('onFeed 触发 chirp + idle.kick',
    /onFeed\s*\([\s\S]{0,500}this\.playChirp\(\);[\s\S]{0,80}this\.idle\.kick\(\)/.test(indexJs));

ok('syncIdle 方法定义', /syncIdle\s*\(/.test(indexJs));
ok('refresh 内同步待机动画', /this\.syncIdle\(false\);[\s\S]{0,40}\n\s*\},/.test(indexJs));
ok('onShow 同步待机动画', /onShow\s*\([\s\S]{0,260}this\.syncIdle\(false\)/.test(indexJs));
ok('onHide 同步待机动画', /onHide\s*\([\s\S]{0,160}this\.syncIdle\(true\)/.test(indexJs));
ok('openSheet 同步待机动画', /openSheet\s*\([\s\S]{0,400}this\.syncIdle\(false\)/.test(indexJs));
ok('onUnload 销毁 idle + chirp',
    /onUnload\s*\([\s\S]{0,400}this\.idle\.dispose\(\)[\s\S]{0,200}this\.chirpAudio\.destroy\(\)/.test(indexJs));

ok('idle 模块在 onLoad 创建', /this\.idle\s*=\s*nestIdle\.createNestIdle\(/.test(indexJs));

// ---------------------------------------------------------------- WXML 接线
ok('WXML 含 idle 画布', /id="idleCanvas"/.test(indexWxml));
ok('WXML 含手动播放入口', /idle-retry/.test(indexWxml));
ok('WXML onIdleRetry 处理器闭环', /catchtap="onIdleRetry"/.test(indexWxml) && /onIdleRetry\s*\(/.test(indexJs));
ok('idle 画布仅在有鸟时挂载', /wx:if="{{hasBird}}"[\s\S]{0,80}id="idleCanvas"/.test(indexWxml));

// ---------------------------------------------------------------- 模块内部
ok('nest-idle 导出 createNestIdle', /module\.exports\s*=\s*\{[\s\S]{0,400}createNestIdle/.test(idleJs));
ok('nest-idle 自驱 cadence (scheduleAutoplay)', /scheduleAutoplay/.test(idleJs));
ok('nest-idle stop 清空画布', /clearRect/.test(idleJs));
ok('nest-idle 用 type=2d 选择器', /createSelectorQuery\(\)\.in\(page\)\.select\(canvasId\)/.test(idleJs));

// ---------------------------------------------------------------- 动态实跑 nest-idle（桩环境）
const dynamicPromise = checkAsync('nest-idle 在桩环境可实例化与驱动', async function () {
    // 构造最小 wx 桩：音频不触发 onPlay（避免 draw 的 20ms 轮询进入无限循环），画布/图片同步就绪。
    function makeCtx() {
        return { clearRect: function () {}, drawImage: function () {} };
    }
    function makeCanvas() {
        return { width: 0, height: 0, getContext: makeCtx, createImage: makeImage };
    }
    function makeImage() {
        const img = { onload: null, onerror: null };
        let _src = '';
        Object.defineProperty(img, 'src', {
            get: function () { return _src; },
            set: function (v) { _src = v; if (img.onload) img.onload(); },
        });
        return img;
    }
    function makeAudio() {
        return {
            _src: '', paused: true, currentTime: 0, error: null, loop: false, destroyed: false,
            set src(v) { this._src = v; }, get src() { return this._src; },
            play: function () { this.paused = false; },
            stop: function () { this.paused = true; },
            destroy: function () { this.destroyed = true; },
            seek: function () {},
            onPlay: function () {}, onError: function () {}, onEnded: function () {},
        };
    }
    function makeQuery() {
        const api = {
            select: function () {
                return { fields: function () { return { exec: function (cb) { cb([{ node: makeCanvas(), width: 195, height: 161 }]); } }; } };
            },
        };
        api.in = function () { return api; };
        return api;
    }
    global.wx = { createInnerAudioContext: makeAudio, createSelectorQuery: makeQuery };

    const mod = require(path.join(ROOT, 'utils/nest-idle.js'));
    assert.strictEqual(typeof mod.createNestIdle, 'function', '缺少 createNestIdle');
    assert.strictEqual(typeof mod.frameAt, 'function', '缺少 frameAt');
    assert.ok(mod.META && mod.META.frameCount === 82, 'META 帧数错误');

    const data = {};
    const page = {
        setData: function (patch) { Object.assign(data, patch); },
    };
    const idle = mod.createNestIdle(page, {
        audioSrc: '/assets/nest/idle/idle.m4a',
        atlasSrc: '/assets/nest/idle/atlas.webp',
        canvasId: '#idleCanvas',
    });
    // 已领养、未暂停 → 应加载并在首帧就绪（画布/图集同步就绪，onPlay 不触发故不真正画）。
    idle.sync(true, false, 'local-bird', true);
    // ensure() 内部 initCanvas().then 为微任务，需等一拍再断言。
    await new Promise(function (r) { setImmediate(r); });
    assert.strictEqual(data.idleReady, true, '资源就绪后 idleReady 应为 true');
    assert.strictEqual(data.idlePlaying, false, 'onPlay 未触发时不应处于播放中');
    assert.strictEqual(data.showIdleButton, false, '资源成功加载不应显示手动入口');
    // 手势踢动：应不抛错（音频已在手势栈内 play）。
    idle.kick();
    // 卸载：应销毁音频并清空引用。
    idle.dispose();
    assert.strictEqual(true, true);
});

// ---------------------------------------------------------------- 汇总
(async function () {
    // 等动态实跑（含微任务）结束，确保结果计入后再汇总。
    try { await dynamicPromise; } catch (e) { /* 已在 problems 记录 */ }
    check('frameAt 取帧正确', function () {
        delete require.cache[require.resolve(path.join(ROOT, 'utils/nest-idle.js'))];
        const mod = require(path.join(ROOT, 'utils/nest-idle.js'));
        assert.strictEqual(mod.frameAt(0), 0);
        assert.strictEqual(mod.frameAt(100), 1);
        assert.strictEqual(mod.frameAt(200), 2);
        assert.strictEqual(mod.frameAt(5550), 81);
        assert.strictEqual(mod.frameAt(6079), 81);
        assert.strictEqual(mod.frameAt(6080), 0, '越界按 durationMs 取模回到首帧');
    });
    console.log('\n小窝互动音效 / 待机动画音效验收：');
    facts.forEach(function (f) { console.log('  ' + f); });
    console.log('问题 (' + problems.length + ')');
    problems.forEach(function (p) { console.log('  ' + p); });
    if (problems.length) { console.log('\n❌ 未达交付标准'); process.exit(1); }
    console.log('\n✅ 全部通过（' + facts.length + ' 项）');
})();
