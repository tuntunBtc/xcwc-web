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
            showIdleButton: blocked && canPrepare && !paused,
        });
    }

    function clearTimer() {
        if (timer) { clearTimeout(timer); timer = null; }
    }

    // 一段原声播完（约 6.08s）后，保持 30s 冷却再自驱播放下一段，
    // 与网页端以原声音轨 ended 确认后进入 cadence 的语义一致；
    // 后台 / 面板打开（paused）时不排程，避免离页或弹框期间持续占用。
    function scheduleAutoplay() {
        clearTimer();
        if (!enabled || paused || !ready || !audio || disposed) return;
        timer = setTimeout(function () {
            timer = null;
            if (!enabled || paused || disposed) return;
            play(false);
        }, GAP_MS);
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

    function draw() {
        if (!ctx || !atlas || disposed) return;
        if (paused || !enabled) { stop(); return; }
        if (!audio || audio.paused) { stop(); onBlocked(); return; }
        var next = frameAt(audio.currentTime * 1000);
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

    function play(fromGesture) {
        if (!enabled || paused || !ready || !audio || disposed) { setUi(); return; }
        if (playPending) return setUi();
        if (blocked && !fromGesture) return setUi();
        if (!audio.paused) { startDrawIfReady(); return setUi(); }
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
        initCanvas().then(function (ok) {
            if (!ok || disposed || ticket !== loadGen) return;
            var img = canvas.createImage();
            img.onload = function () {
                if (disposed || ticket !== loadGen) return;
                atlas = img;
                if (!audio) {
                    audio = wx.createInnerAudioContext();
                    audio.src = audioSrc;
                    audio.onEnded(function () {
                        if (!enabled || paused || disposed) return;
                        stop();
                        cadenceNextAt = Date.now() + GAP_MS;
                        onCycleEnd();
                        scheduleAutoplay();
                    });
                }
                ready = true;
                loading = false;
                setUi();
                apply();
            };
            img.onerror = function () {
                if (disposed || ticket !== loadGen) return;
                failed = true;
                loading = false;
                setUi();
            };
            img.src = atlasSrc;
        });
    }

    function initCanvas() {
        return new Promise(function (resolve) {
            wx.createSelectorQuery().in(page).select(canvasId).fields({ node: true, rect: true }).exec(function (res) {
                var item = res && res[0];
                if (item && item.node) {
                    canvas = item.node;
                    var w = Math.max(1, Math.round(item.width || FRAME_W));
                    var h = Math.max(1, Math.round(item.height || FRAME_H));
                    canvas.width = w;
                    canvas.height = h;
                    ctx = canvas.getContext('2d');
                    resolve(true);
                } else {
                    resolve(false);
                }
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
            audio.onEnded(function () {
                if (!enabled || paused || disposed) return;
                stop();
                cadenceNextAt = Date.now() + GAP_MS;
                onCycleEnd();
                scheduleAutoplay();
            });
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
