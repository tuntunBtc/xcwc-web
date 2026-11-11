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
    'media/nest-idle/atlas.webp',
    'media/nest-idle/idle.m4a',
    'assets/nest/chirp.mp3',
];
const idleFiles = require(path.join(ROOT, 'media/nest-idle/files.js'));
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
assets.forEach(function (rel) {
    ok('素材存在 ' + rel, fs.existsSync(path.join(ROOT, rel)));
});
ok('待机素材不再进入主包', !fs.existsSync(path.join(ROOT, 'assets/nest/idle')));
ok('待机分包含入口且未设预下载', (app.subpackages || app.subPackages || []).some((item) =>
    item.root === 'media/nest-idle' && item.pages.includes('anchor')) &&
    !Object.values(app.preloadRule || {}).some((rule) => (rule.packages || []).some((name) =>
        name === 'media/nest-idle' || name === 'nest-idle-media')));

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
ok('onShow 刷新状态并同步待机动画', /onShow\s*\([\s\S]{0,260}this\.refresh\(\)/.test(indexJs));
ok('onHide 同步待机动画', /onHide\s*\([\s\S]{0,160}this\.syncIdle\(true\)/.test(indexJs));
ok('openSheet 同步待机动画', /openSheet\s*\([\s\S]{0,400}this\.syncIdle\(false\)/.test(indexJs));
ok('onUnload 销毁 idle + chirp',
    /onUnload\s*\([\s\S]{0,400}this\.idle\.dispose\(\)[\s\S]{0,200}this\.chirpAudio\.destroy\(\)/.test(indexJs));

ok('idle 模块在 onLoad 创建', /this\.idle\s*=\s*nestIdle\.createNestIdle\(/.test(indexJs));
ok('待机素材经异步分包模块加载', /loadFiles:\s*\(\)\s*=>\s*require\.async\('\.\.\/\.\.\/media\/nest-idle\/files\.js'\)/.test(indexJs));

// ---------------------------------------------------------------- WXML 接线
ok('WXML 含 idle 画布', /id="idleCanvas"/.test(indexWxml));
ok('WXML 含手动播放入口', /idle-retry/.test(indexWxml));
ok('WXML onIdleRetry 处理器闭环', /catchtap="onIdleRetry"/.test(indexWxml) && /onIdleRetry\s*\(/.test(indexJs));
ok('idle 画布仅在有鸟时挂载', /wx:if="{{hasBird}}"[\s\S]{0,80}id="idleCanvas"/.test(indexWxml));
// 问题①：待机动画播放时应隐藏静态表情海报，避免动画小鸟与表情海报重叠。
ok('WXML 待机播放时隐藏静态表情海报（避免与动画重叠）',
    /class="bird-art \{\{idlePlaying \? 'is-hidden' : ''\}\}"/.test(indexWxml));

// ---------------------------------------------------------------- 模块内部
ok('nest-idle 导出 createNestIdle', /module\.exports\s*=\s*\{[\s\S]{0,400}createNestIdle/.test(idleJs));
ok('nest-idle 自驱 cadence (scheduleAutoplay)', /scheduleAutoplay/.test(idleJs));
ok('nest-idle stop 清空画布', /clearRect/.test(idleJs));
ok('nest-idle 用 type=2d 选择器', /createSelectorQuery\(\)\.in\(page\)\.select\(canvasId\)/.test(idleJs));
// 问题②：动画与音乐同步收尾——draw 在 currentTime 到达时长时主动结束本轮，不依赖 onEnded 是否准时；
// 本轮 onEnded 必须停音，旧轮回调不能打断新一轮。
ok('nest-idle 以 currentTime 到达时长收尾（动画与音乐同步停止）', /timeMs >= META\.durationMs/.test(idleJs));
ok('nest-idle onEnded 使用本轮播放票据并与其他监听一起解绑',
    /function ended\(\)[\s\S]{0,160}ticket !== playGen[\s\S]{0,90}endCycle\(\)/.test(idleJs) &&
    /audio\.onEnded\(ended\)/.test(idleJs) && /audio\.offEnded\(playHandlers\.ended\)/.test(idleJs));
ok('nest-idle 存在 endCycle 收尾函数', /function endCycle\(\)/.test(idleJs));
// 问题③（本次）：音乐一直循环空转——根因是 play(false) 被 refresh/sync 频繁调用却不过 cadence 闸门。
// 修复：play 增加冷却闸门（非手势、非 cadence 触发且处于冷却期则拒绝重播），对齐网页端 canStart 闸门。
ok('nest-idle play 含 cadence 冷却闸门（防止 refresh 频繁重播空转）',
    /function play\(fromGesture, fromCadence\)[\s\S]{0,560}Date\.now\(\) < cadenceNextAt[\s\S]{0,120}scheduleAutoplay\(\)/.test(idleJs));
ok('nest-idle play 正在播放时短路（不掐断进行中的一轮）',
    /function play\(fromGesture, fromCadence\)[\s\S]{0,260}!audio\.paused\) \{ startDrawIfReady\(\); return setUi\(\); \}/.test(idleJs));
ok('nest-idle scheduleAutoplay 越过冷却闸门 play(false, true)',
    /play\(false, true\)/.test(idleJs));
ok('nest-idle 播放开始锁定冷却 started(durationMs+gap)',
    /cadenceNextAt = Date\.now\(\) \+ META\.durationMs \+ GAP_MS/.test(idleJs));

// ---------------------------------------------------------------- 动态实跑 nest-idle（桩环境）
// 注意：两个动态测试共享 global.wx 桩，必须顺序执行（不在顶层并发启动），
// 否则后一个会把 global.wx 覆盖，导致前一个桩环境里音频未被创建。
function makeTestAudio() {
    const listeners = { play: new Set(), error: new Set(), ended: new Set() };
    return {
        paused: true, currentTime: 0, error: null, loop: false, destroyed: false,
        _playCalls: 0, _stopCalls: 0, listeners,
        play() { this.paused = false; this._playCalls += 1; },
        stop() { this.paused = true; this._stopCalls += 1; },
        destroy() { this.destroyed = true; },
        seek(seconds) { this.currentTime = seconds; },
        onPlay(fn) { listeners.play.add(fn); },
        offPlay(fn) { listeners.play.delete(fn); },
        onError(fn) { listeners.error.add(fn); },
        offError(fn) { listeners.error.delete(fn); },
        onEnded(fn) { listeners.ended.add(fn); },
        offEnded(fn) { listeners.ended.delete(fn); },
        emit(name) { for (const callback of Array.from(listeners[name])) callback(); },
    };
}

async function runDynamicIdle() {
    const meta = require(path.join(ROOT, 'utils/nest-idle-meta.js'));
    const audios = [];
    // 构造最小 wx 桩：画布/图片同步就绪；音频 play 仅翻转 paused，onPlay/onEnded 由测试手动触发，
    // 以便精确验证「到达时长即停音」与「本轮 onEnded 停音」。
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
        const a = makeTestAudio();
        audios.push(a);
        return a;
    }
    let mounted = false;
    function makeQuery() {
        const api = {
            select: function () {
                return { fields: function (fields) {
                    assert.strictEqual(fields.size, true, '需明确查询画布宽高');
                    return { exec: function (cb) { cb(mounted ? [{ node: makeCanvas(), width: 195, height: 161 }] : [null]); } };
                } };
            },
        };
        api.in = function () { return api; };
        return api;
    }
    global.wx = { createInnerAudioContext: makeAudio, createSelectorQuery: makeQuery };

    delete require.cache[require.resolve(path.join(ROOT, 'utils/nest-idle.js'))];
    const mod = require(path.join(ROOT, 'utils/nest-idle.js'));
    assert.strictEqual(typeof mod.createNestIdle, 'function', '缺少 createNestIdle');
    assert.strictEqual(typeof mod.frameAt, 'function', '缺少 frameAt');
    assert.ok(mod.META && mod.META.frameCount === 82, 'META 帧数错误');

    const data = {};
    const page = { setData: function (patch) { Object.assign(data, patch); } };
    let packageAttempts = 0;
    const idle = mod.createNestIdle(page, {
        loadFiles() {
            packageAttempts += 1;
            return packageAttempts === 1 ? Promise.reject(new Error('分包加载失败')) : Promise.resolve(idleFiles);
        },
        canvasId: '#idleCanvas',
    });
    try {
        idle.sync(true, false, 'local-bird', true);
        await new Promise(function (r) { setImmediate(r); });
        assert.strictEqual(data.idleReady, false, 'Canvas 尚未挂载时保留静态画面');
        assert.strictEqual(data.showIdleButton, true, 'Canvas 查找失败时提供重试入口');
        assert.strictEqual(packageAttempts, 0, '画布未就绪时不加载待机分包');
        mounted = true;
        idle.retry();
        await new Promise(function (r) { setImmediate(r); });
        assert.strictEqual(data.showIdleButton, true, '分包加载失败时可以主动重试');
        assert.strictEqual(audios.length, 0, '分包失败不启动音频');
        idle.sync(true, false, 'local-bird', true);
        await new Promise(function (r) { setImmediate(r); });
        assert.strictEqual(packageAttempts, 1, '状态刷新不循环重试分包');
        idle.retry();
        await new Promise(function (r) { setImmediate(r); });
        assert.strictEqual(data.idleReady, true, '资源就绪后 idleReady 应为 true');
        assert.strictEqual(data.idlePlaying, false, '尚未播放不应处于播放中');
        assert.strictEqual(data.showIdleButton, false, '资源成功加载不应显示手动入口');
        const audio = audios[audios.length - 1];
        assert.strictEqual(audio.src, idleFiles.audioSrc, '音轨从待机分包加载');
        assert.deepStrictEqual(Object.values(audio.listeners).map(items => items.size), [1, 1, 1], '只注册本轮的监听');

        // 手势踢动：应不抛错（音频在手势栈内 play，但桩环境不触发 onPlay，故未真正绘制）。
        idle.kick();
        assert.strictEqual(data.idlePlaying, false, 'onPlay 未触发时不应进入播放中');

        // 关键验证①：模拟音轨播放到末尾（currentTime 到达时长），手动触发 onPlay 让 draw 走一帧——
        // draw 应在 timeMs >= durationMs 时调用 endCycle，从而停掉音频（而非「画面停、音乐空转」）。
        audio.currentTime = meta.durationMs / 1000;
        audio.emit('play');              // 触发一次 draw → endCycle
        await new Promise(function (r) { setTimeout(r, 60); }); // 让潜在的 20ms 轮询自然消亡
        assert.ok(audio._stopCalls >= 1, '到达时长后必须调用 audio.stop() 停音');
        assert.strictEqual(data.idlePlaying, false, '收尾后画布应隐藏（动画消失）');
        assert.strictEqual(data.idleReady, true, '收尾后资源仍就绪');

        // 关键验证②：下一轮的 onEnded 路径也必须停音。
        idle.retry();
        audio.emit('play');
        assert.strictEqual(data.idlePlaying, true);
        audio._stopCalls = 0;
        audio.emit('ended');
        assert.ok(audio._stopCalls >= 1, 'onEnded 必须调用 audio.stop() 停音');
        assert.deepStrictEqual(Object.values(audio.listeners).map(items => items.size), [0, 0, 0], '自然结束后没有残留监听');
    } finally {
        idle.dispose();
        const audio = audios[audios.length - 1];
        assert.strictEqual(audio.destroyed, true, '卸载应销毁音频上下文');
    }

    // 下载尚未结束就切到后台时，完成回调不能创建音频或隐藏海报。
    let resolveFiles;
    const suspended = mod.createNestIdle(page, {
        loadFiles: () => new Promise((resolve) => { resolveFiles = resolve; }),
        canvasId: '#idleCanvas',
    });
    try {
        suspended.sync(true, false, 'local-bird', true);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(typeof resolveFiles, 'function');
        const count = audios.length;
        suspended.sync(true, true, 'local-bird', true);
        resolveFiles(idleFiles);
        await new Promise((resolve) => setImmediate(resolve));
        assert.strictEqual(data.idleReady, false);
        assert.strictEqual(data.idlePlaying, false);
        assert.strictEqual(audios.length, count, '分包在后台加载完成不创建音频');
    } finally {
        suspended.dispose();
    }
}

// ---------------------------------------------------------------- 动态实跑：cadence 冷却闸门（防止音乐空转循环）
async function runDynamicCadence() {
    const meta = require(path.join(ROOT, 'utils/nest-idle-meta.js'));
    const realNow = Date.now;
    let fakeNow = realNow();
    Date.now = function () { return fakeNow; };
    const audios = [];
    function makeCtx() { return { clearRect: function () {}, drawImage: function () {} }; }
    function makeCanvas() { return { width: 0, height: 0, getContext: makeCtx, createImage: makeImage }; }
    function makeImage() {
        const img = { onload: null, onerror: null }; let _src = '';
        Object.defineProperty(img, 'src', { get: function () { return _src; }, set: function (v) { _src = v; if (img.onload) img.onload(); } });
        return img;
    }
    function makeAudio() {
        const a = makeTestAudio();
        audios.push(a); return a;
    }
    function makeQuery() { const api = { select: function () { return { fields: function () { return { exec: function (cb) { cb([{ node: makeCanvas(), width: 195, height: 161 }]); } }; } }; } }; api.in = function () { return api; }; return api; }
    global.wx = { createInnerAudioContext: makeAudio, createSelectorQuery: makeQuery };
    try {
        delete require.cache[require.resolve(path.join(ROOT, 'utils/nest-idle.js'))];
        const mod = require(path.join(ROOT, 'utils/nest-idle.js'));
        const data = {};
        const page = { setData: function (patch) { Object.assign(data, patch); } };
        const idle = mod.createNestIdle(page, { loadFiles: () => Promise.resolve(idleFiles), canvasId: '#idleCanvas' });
        try {
            idle.sync(true, false, 'local-bird', true);
            await new Promise(function (r) { setImmediate(r); });
            const audio = audios[audios.length - 1];
            // 手势启动第一轮（play(true) 越过冷却闸门）。
            idle.kick();
            assert.strictEqual(audio._playCalls, 1, '手势应触发一次 play');
            // 模拟音轨真正开始 → 锁定冷却到下一段允许起点（started: durationMs+gap）。
            audio.emit('play');
            assert.deepStrictEqual(Object.values(audio.listeners).map(items => items.size), [1, 1, 1]);
            const expectedCooldownEnd = fakeNow + meta.durationMs + 30000;
            // 模拟本轮自然结束（onEnded）→ endCycle 收尾停音。
            audio.currentTime = meta.durationMs / 1000;
            audio.emit('ended');
            assert.strictEqual(audio._stopCalls >= 1, true, '收尾应停音');
            assert.strictEqual(audio.paused, true, '收尾后音频应暂停');
            // —— 冷却期内（仍处于 durationMs+gap 之内）：模拟多次 refresh/sync（页面每次状态刷新都走这里）。
            for (let i = 0; i < 10; i++) { idle.sync(true, false, 'local-bird', true); }
            assert.strictEqual(audio._playCalls, 1, '冷却期内多次 sync/refresh 不应重播（这是「音乐一直循环空转」的根因已修复）');
            // 让潜在 draw 轮询自然消亡。
            await new Promise(function (r) { setTimeout(r, 80); });
            // —— 冷却结束之后：再 sync 一次，应启动下一轮（play 调用次数 +1）。
            fakeNow = expectedCooldownEnd + 100;
            idle.sync(true, false, 'local-bird', true);
            assert.strictEqual(audio._playCalls, 2, '冷却结束后 sync 应启动下一轮');
            audio.emit('play');
            for (let i = 0; i < 12; i++) {
                const previousCallbacks = Object.values(audio.listeners).flatMap(items => Array.from(items));
                idle.sync(true, true, 'local-bird', true);
                idle.sync(true, false, 'local-bird', true);
                assert.strictEqual(data.idlePlaying, false, '快速切回时冷却仍生效');
                assert.deepStrictEqual(Object.values(audio.listeners).map(items => items.size), [0, 0, 0]);
                fakeNow += meta.durationMs + 30001;
                idle.sync(true, false, 'local-bird', true);
                audio.emit('play');
                for (const previousCallback of previousCallbacks) previousCallback();
                assert.strictEqual(data.idlePlaying, true, '旧轮回调不能中止新一轮');
                assert.deepStrictEqual(Object.values(audio.listeners).map(items => items.size), [1, 1, 1]);
            }
            idle.dispose();
            assert.deepStrictEqual(Object.values(audio.listeners).map(items => items.size), [0, 0, 0], '卸载后没有残留监听');
        } finally {
            idle.dispose();
        }
    } finally {
        Date.now = realNow;
    }
}

function runCareLifecycle() {
    const actualNow = Date.now;
    const actualSetInterval = global.setInterval;
    const actualClearInterval = global.clearInterval;
    const actualWx = global.wx;
    const actualPage = global.Page;
    let now = actualNow();
    let tick = null;
    let page;
    const storage = new Map();
    const chirp = makeTestAudio();
    global.wx = {
        getStorageSync: key => storage.get(key),
        setStorageSync: (key, value) => storage.set(key, value),
        createInnerAudioContext: () => chirp,
    };
    global.Page = definition => { page = definition; };
    Date.now = () => now;
    global.setInterval = (callback, delay) => {
        assert.strictEqual(delay, 5000);
        tick = callback;
        return 1;
    };
    global.clearInterval = () => { tick = null; };
    try {
        const store = require(path.join(ROOT, 'utils/store.js'));
        const layout = require(path.join(ROOT, 'utils/nest-layout.js'));
        require(path.join(ROOT, 'pages/index/index.js'));
        page.setData = patch => Object.assign(page.data, patch);
        page.onLoad();
        page.idle = { sync() {}, kick() {}, dispose() {} };
        store.adopt('TEST-NEST-01', '小叽', now);
        store.feed(now);
        store.feed(now);
        store.water(now);
        store.water(now);
        page.onShow();
        assert.strictEqual(page.data.satiety, 100);
        assert.strictEqual(page.data.hydration, 100);
        assert.strictEqual(typeof tick, 'function');
        assert.strictEqual(store.feed(now).data.changed, false);
        assert.strictEqual(store.water(now).data.changed, false);
        assert.strictEqual(store.snapshot(now).data.snapshot.food, 1);
        assert.strictEqual(store.snapshot(now).data.snapshot.water, 1);
        now += 60 * 1000;
        assert.strictEqual(page.data.satiety, 100, '模拟页面还没收到下一次定时刷新');
        page.onFeed();
        assert.strictEqual(store.snapshot(now).data.snapshot.food, 0, '喂食使用衰减后的饱食值');
        assert.strictEqual(chirp.paused, false, '成功喂食播放短鸟叫');
        now += 60 * 1000;
        tick();
        assert.strictEqual(page.data.satiety, 92);
        page.setData({ happy: true, feedFxId: 1, toast: '叽分 +1' });
        page.onHide();
        assert.strictEqual(tick, null, '页面隐藏后停止状态刷新');
        assert.deepStrictEqual([page.data.happy, page.data.feedFxId, page.data.toast], [false, 0, '']);
        assert.strictEqual(chirp.paused, true, '切页时停止短鸟叫');
        page.onShow();
        assert.strictEqual(chirp.paused, true, '切回时不会自动播放上一次短鸟叫');
        page.doCare('water', false);
        assert.strictEqual(chirp.paused, false, '切回后仍能播放新的互动音效');
        page.onUnload();
        assert.strictEqual(chirp.destroyed, true, '卸载后销毁互动音频');
        assert.ok(layout.readNestLayout().pageHeight > 0);
    } finally {
        if (page) page.clearTimers();
        global.wx = actualWx;
        global.Page = actualPage;
        Date.now = actualNow;
        global.setInterval = actualSetInterval;
        global.clearInterval = actualClearInterval;
    }
}

// ---------------------------------------------------------------- 汇总
(async function () {
    // 两个动态测试顺序执行（共享 global.wx 桩，不能并发），确保结果计入后再汇总。
    await checkAsync('nest-idle 在桩环境可实例化、驱动且收尾停音', runDynamicIdle);
    await checkAsync('nest-idle cadence 闸门：冷却期内 refresh 不重播、冷却后才播下一轮', runDynamicCadence);
    check('前台刷新、满值保护及离页清理', runCareLifecycle);
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
