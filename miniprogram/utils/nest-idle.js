'use strict';

// 小窝待机动画 + 原声：移植自网页端 src/nest/nest.js 的 createNestIdle。
// 网页端用 <audio> + Canvas 2D 逐帧绘制图集，原声与 currentTime 同步；
// 小程序无 Web Audio，音频统一走 wx.createInnerAudioContext，画布用 type=2d Canvas。
// 关键语义与网页端保持一致：
//  - 首次用户手势后才能有声自动播放（iOS/Android 自动播放策略），否则保留「播放动画」入口；
//  - 一段原声播完（约 6.08s）即停，与网页端以原声音轨 ended 确认一致；
//  - 两次播放之间保持 30s 冷却（cadence），照料 / 切鸟 / 离页不把中断变成立即重播；
//  - 资源加载失败才显示「播放动画」按钮，成功加载后自动播放，不降级为静音动画。
// 画布内部分辨率按节点实际渲染尺寸设置，逐帧按 contain 居中绘制，避免与海报姿态错位或拉伸。

var META = require('./nest-idle-meta');
var FRAME_W = META.width;
var FRAME_H = META.height;
var COLUMNS = META.columns;
var GAP_MS = 30000;

function frameAt(timeMs) {
    var times = META.frameTimesMs;
    var time = Math.max(0, (Number.isFinite(timeMs) ? timeMs : 0)) % META.durationMs;
    var low = 0;
    var high = times.length;
    while (low < high) {
        var middle = (low + high) >> 1;
        if (times[middle] <= time) low = middle + 1;
        else high = middle;
    }
    return Math.max(0, low - 1);
}

function createNestIdle(page, opts) {
    var audioSrc = opts.audioSrc;
    var atlasSrc = opts.atlasSrc;
    var canvasId = opts.canvasId;
    var onStarted = opts.onStarted || function () {};
    var onCycleEnd = opts.onCycleEnd || function () {};
    var onBlocked = opts.onBlocked || function () {};
    var isEligible = opts.isEligible || function () { return true; };

    var canvas = null;
    var ctx = null;
    var atlas = null;
    var audio = null;
    var ready = false;
    var failed = false;
    var loading = false;
    var paused = true;
    var enabled = false;
    var canPrepare = false;
    var disposed = false;
    var timer = null;
    var frame = 0;
    var playGen = 0;
    var playPending = false;
    var blocked = false;
    var restart = true;
    var loadGen = 0;
    var gestureArmed = false;
    var currentBird = null;
    var cadenceNextAt = 0;
    var canvasHidden = true;

    function setUi() {
        page.setData({
            idleReady: ready,
            idlePlaying: ready && !canvasHidden,
            showIdleButton: (blocked || failed) && canPrepare && !paused,
        });
    }

    function clearTimer() {
        if (timer) { clearTimeout(timer); timer = null; }
    }

    // 一段原声播完（约 6.08s）后，保持 30s 冷却再自驱播放下一段，
    // 与网页端以原声音轨 ended 确认后进入 cadence 的语义一致；
    // 后台 / 面板打开（paused）时不排程，避免离页或弹框期间持续占用。
    // 延时取「剩余冷却」，精确在 cadence 边界自驱；由 play(false, true) 越过冷却闸门真正播放。
    function scheduleAutoplay() {
        clearTimer();
        if (!enabled || paused || !ready || !audio || disposed) return;
        var delay = Math.max(0, cadenceNextAt - Date.now());
        timer = setTimeout(function () {
            timer = null;
            if (!enabled || paused || disposed) return;
            play(false, true);
        }, delay);
    }

    function stop() {
        playGen += 1;
        playPending = false;
        clearTimer();
        // 清空画布，避免停在下一段的残帧盖住静态海报（与网页端动画结束后恢复 poster 一致）。
        if (ctx && canvas) { try { ctx.clearRect(0, 0, canvas.width, canvas.height); } catch (e) { /* ignore */ } }
        canvasHidden = true;
        if (audio) { try { audio.stop(); } catch (e) { /* ignore */ } }
        restart = true;
        setUi();
    }

    // 一轮原声自然播完的收尾：停音频 + 清画布，并进入 30s 冷却自驱下一轮。
    // 与网页端以原声音轨 ended 确认后进入 cadence 一致；且不依赖 onEnded 是否准时触发——
    // draw() 也会在 currentTime 到达 durationMs 时主动调用本函数，确保动画与音乐同步收尾，
    // 避免部分机型 onEnded / paused 翻转滞后导致「画面已停、音乐仍空转」。
    function endCycle() {
        stop();
        if (disposed) return;
        // 对齐网页端 ended()：冷却推到「现在 + gap」。started() 已在播放开始时锁到 duration+gap，
        // 取较大值后不变（即下一段允许起点 = 本段开始 + duration + gap，约等于本段结束后 30s）。
        cadenceNextAt = Math.max(cadenceNextAt, Date.now() + GAP_MS);
        onCycleEnd();
        if (!enabled || paused) return;
        scheduleAutoplay();
    }

    function draw() {
        if (!ctx || !atlas || disposed) return;
        if (paused || !enabled) { stop(); return; }
        if (!audio) { stop(); return; }
        var timeMs = audio.currentTime * 1000;
        // 以音轨 currentTime 驱动取帧；到达设计时长即结束本轮，保证动画与音乐同步收尾，
        // 不依赖 onEnded / paused 翻转是否准时（部分机型可能滞后导致音乐空转）。
        if (timeMs >= META.durationMs) { endCycle(); return; }
        if (audio.paused) { stop(); onBlocked(); return; }
        var next = frameAt(timeMs);
        if (canvasHidden || next !== frame) {
            frame = next;
            var boxW = canvas.width || FRAME_W;
            var boxH = canvas.height || FRAME_H;
            ctx.clearRect(0, 0, boxW, boxH);
            // contain 居中：与网页端海报一致，避免与小鸟立绘错位或拉伸。
            var a = FRAME_W / FRAME_H;
            var boxA = boxW / boxH;
            var dw;
            var dh;
            if (boxA > a) { dh = boxH; dw = dh * a; } else { dw = boxW; dh = dw / a; }
            var dx = (boxW - dw) / 2;
            var dy = (boxH - dh) / 2;
            ctx.drawImage(
                atlas,
                (frame % COLUMNS) * FRAME_W,
                Math.floor(frame / COLUMNS) * FRAME_H,
                FRAME_W, FRAME_H,
                dx, dy, dw, dh
            );
            canvasHidden = false;
        }
        setUi();
        timer = setTimeout(draw, 20);
    }

    function startDrawIfReady() {
        if (!ready || !audio || audio.paused || paused || !enabled) return;
        if (timer === null) draw();
    }

    // fromGesture：用户手势触发（kick/retry），可越过冷却直接播；
    // fromCadence：cadence 计时器在冷却边界触发，亦可越过冷却；二者皆非时受 cadenceNextAt 约束。
    function play(fromGesture, fromCadence) {
        if (!enabled || paused || !ready || !audio || disposed) { setUi(); return; }
        if (playPending) return setUi();
        if (blocked && !fromGesture) return setUi();
        // 先按「当前一轮正在播放」短路：进行中的一轮不受影响，避免被状态刷新掐断或重排。
        if (!audio.paused) { startDrawIfReady(); return setUi(); }
        // 冷却期内（上一段已播完 / 刚启动未满 duration+gap）：非手势、非 cadence 触发的重播一律拒绝，
        // 改为排程 cadence 计时器在剩余冷却后自驱下一轮——这是「音乐不会一直循环空转」的关键：
        // refresh()/sync 每次状态刷新都会走到这里，若无此闸门会立刻重播造成连续循环（对齐网页端 canStart 闸门）。
        if (!fromGesture && !fromCadence && Date.now() < cadenceNextAt) {
            scheduleAutoplay();
            return setUi();
        }
        if (audio.error) { try { audio.stop(); } catch (e) { /* ignore */ } }
        audio.loop = false;
        if (restart) { try { audio.seek(0); } catch (e) { /* ignore */ } restart = false; }
        playPending = true;
        blocked = false;
        var ticket = ++playGen;
        try { audio.play(); } catch (e) {
            playPending = false; blocked = true; stop(); onBlocked(); return;
        }
        audio.onPlay(function () {
            if (disposed || ticket !== playGen) return;
            playPending = false;
            if (!enabled || paused) { stop(); return; }
            // 一轮真正开始：锁定冷却到下一段允许起点（对齐网页端 started(durationMs)），
            // 即使本轮被面板/离页中断，冷却依旧生效，照料/切鸟不会把中断变成立即重播。
            cadenceNextAt = Date.now() + META.durationMs + GAP_MS;
            draw();
            onStarted();
        });
        audio.onError(function () {
            if (disposed || ticket !== playGen) return;
            playPending = false; blocked = true; stop(); onBlocked();
        });
    }

    function ensure() {
        if (disposed || !canPrepare || paused || ready || loading || (failed && !gestureArmed)) return;
        loading = true;
        failed = false;
        var ticket = ++loadGen;
        setUi();
        function failLoad() {
            if (disposed || ticket !== loadGen) return;
            failed = true;
            loading = false;
            setUi();
        }
        initCanvas().then(function (item) {
            if (disposed || ticket !== loadGen) return;
            if (!item || !item.node) { failLoad(); return; }
            canvas = item.node;
            canvas.width = Math.max(1, Math.round(item.width || FRAME_W));
            canvas.height = Math.max(1, Math.round(item.height || FRAME_H));
            ctx = canvas.getContext('2d');
            if (!ctx) { failLoad(); return; }
            var img = canvas.createImage();
            img.onload = function () {
                if (disposed || ticket !== loadGen) return;
                atlas = img;
                if (!audio) {
                    audio = wx.createInnerAudioContext();
                    audio.src = audioSrc;
                    audio.onEnded(endCycle);
                }
                ready = true;
                loading = false;
                setUi();
                apply();
            };
            img.onerror = failLoad;
            img.src = atlasSrc;
        }).catch(failLoad);
    }

    function initCanvas() {
        return new Promise(function (resolve) {
            wx.createSelectorQuery().in(page).select(canvasId).fields({ node: true, size: true }).exec(function (res) {
                resolve(res && res[0]);
            });
        });
    }

    function apply() {
        if (disposed || paused || !canPrepare) { stop(); return; }
        if (!ready) { ensure(); return; }
        if (enabled) play();
        setUi();
    }

    // 网页端 sync：切换小鸟先停、记录当前鸟；再按 eligible / suspended / prepareEligible 决定播放。
    function sync(eligible, suspended, birdId, prepareEligible) {
        if (currentBird !== birdId) { stop(); currentBird = birdId; frame = 0; blocked = false; gestureArmed = false; }
        if (canPrepare && !prepareEligible) {
            loadGen += 1;
            loading = false;
            failed = false;
            ready = false;
            canvas = null;
            ctx = null;
            atlas = null;
        }
        enabled = eligible;
        paused = suspended;
        canPrepare = prepareEligible;
        if (paused) { stop(); return; }
        apply();
        setUi();
    }

    // 用户手势：网页端在点击栈里 load() 解锁音频权限；小程序在手势内 play() 即可，
    // 这里确保资源已发起加载，并立即在手势栈内 play()，避免被自动播放策略拦截。
    function kick() {
        if (disposed || paused || !enabled || !canPrepare) return;
        gestureArmed = true;
        blocked = false;
        if (failed) failed = false;
        if (!audio) {
            audio = wx.createInnerAudioContext();
            audio.src = audioSrc;
            audio.onEnded(endCycle);
        }
        if (!ready) { ensure(); }
        // 已在冷却期内（上一段播完不足 30s）时不重播，避免照料后立刻又播。
        if (Date.now() < cadenceNextAt) return;
        play(true);
    }

    function retry() {
        if (disposed || paused || !canPrepare) return;
        gestureArmed = true;
        blocked = false;
        if (failed) failed = false;
        if (!ready) { ensure(); return; }
        play(true);
    }

    function dispose() {
        disposed = true;
        clearTimer();
        if (audio) { try { audio.destroy(); } catch (e) { /* ignore */ } audio = null; }
        atlas = null;
        canvas = null;
        ctx = null;
    }

    return {
        sync: sync,
        kick: kick,
        retry: retry,
        dispose: dispose,
        isPlaying: function () { return ready && !canvasHidden && audio && !audio.paused; },
    };
}

module.exports = { createNestIdle: createNestIdle, frameAt: frameAt, META: META };
