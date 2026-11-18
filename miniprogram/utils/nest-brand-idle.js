'use strict';

// 远程图集与音轨共用同一条时间线，切鸟或后台立即停止。
function createBrandIdle(page, platform, onCycleEnd) {
    let clip = null, pet = '', timer, generation = 0, active = false, playing = false;
    let visibleFrame = null, nextAt = 0, canvas, context, audio, blocked = false;
    function stop() {
        generation++;
        clearTimeout(timer);
        active = false;
        visibleFrame = null;
        if (context) context.clearRect(0, 0, canvas.width, canvas.height);
        context = canvas = null;
        if (audio) { audio.destroy(); audio = null; }
        if (playing) page.setData({ brandPlaying: false });
        playing = false;
    }
    function start() {
        const ticket = generation;
        platform.createSelectorQuery().in(page).select('#brandCanvas').fields({ node: true, size: true }).exec(result => {
            if (ticket !== generation) return;
            const node = result?.[0];
            if (!node?.node || !node.width || !node.height) { stop(); return; }
            canvas = node.node;
            canvas.width = Math.max(1, Math.round(node.width));
            canvas.height = Math.max(1, Math.round(node.height));
            context = canvas.getContext('2d');
            if (!context) { stop(); return; }
            const img = canvas.createImage();
            img.onerror = () => { if (ticket === generation) stop(); };
            img.onload = () => {
                if (ticket !== generation) return;
                const scale = Math.min(canvas.width / clip.width, canvas.height / clip.height);
                const w = clip.width * scale, h = clip.height * scale;
                let started, frame = 0;
                function end() {
                    if (ticket !== generation) return;
                    nextAt = Date.now() + 30000;
                    stop();
                    onCycleEnd();
                }
                function draw() {
                    if (generation !== ticket) return;
                    const wallTime = Date.now() - started;
                    const elapsed = audio ? audio.currentTime * 1000 : wallTime;
                    if (elapsed >= clip.durationMs || wallTime > clip.durationMs + 1500) { end(); return; }
                    const times = clip.frameTimesMs;
                    if (times) {
                        while (frame + 1 < times.length && times[frame + 1] <= elapsed) frame++;
                    } else frame = Math.min(clip.frames - 1, Math.floor(elapsed * clip.fps / 1000));
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    context.drawImage(img, (frame % clip.columns) * clip.width, Math.floor(frame / clip.columns) * clip.height,
                        clip.width, clip.height, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
                    visibleFrame = frame;
                    if (!playing) { playing = true; page.setData({ brandPlaying: true }); }
                    const next = times ? (times[frame + 1] ?? clip.durationMs) : (frame + 1) * 1000 / clip.fps;
                    timer = setTimeout(draw, Math.max(8, Math.ceil(next - elapsed)));
                }
                function begin() {
                    if (ticket !== generation || started !== undefined) return;
                    clearTimeout(timer);
                    started = Date.now();
                    nextAt = started + clip.durationMs + 30000;
                    draw();
                }
                if (!clip.audioPath) { begin(); return; }
                function onBlocked() {
                    if (ticket !== generation) return;
                    stop();
                    blocked = true;
                    page.setData({ brandBlocked: true });
                }
                try {
                    audio = platform.createInnerAudioContext();
                    audio.onPlay(begin);
                    audio.onError(onBlocked);
                    audio.onEnded(end);
                    audio.src = clip.audioPath;
                    timer = setTimeout(onBlocked, 5000);
                    audio.play();
                } catch (_) { onBlocked(); }
            };
            img.src = clip.path;
        });
    }
    function sync(bundle, petId, suspended) {
        const next = bundle?.animation;
        if (pet !== petId || clip?.path !== next?.path) {
            stop();
            pet = petId;
            clip = next;
            nextAt = 0;
            blocked = false;
            page.setData({ brandBlocked: false });
        }
        if (suspended || !clip) { if (active) stop(); return; }
        if (active || blocked) return;
        active = true;
        // Wait for WXML to create the canvas before querying its dimensions.
        timer = setTimeout(start, Math.max(0, nextAt - Date.now()));
    }
    return { sync, stop, isPlaying: () => playing, getVisibleFrame: () => visibleFrame,
        retry() { blocked = false; page.setData({ brandBlocked: false }); onCycleEnd(); },
    };
}
module.exports = { createBrandIdle };
