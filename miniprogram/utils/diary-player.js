'use strict';

// The room remains an independent image. Only the original diary video's
// foreground is drawn here, on a transparent canvas below the page controls.
const URLS = require('./diary-urls');
const AUDIO = 'https://assets.xinchengip.com/bird/v1/oss/uploads/8e5c20d972284aa88de579a00460eee6.mp4';
const FRAME_COUNT = 241, FPS = 24, COLS = 5, PER_ATLAS = 20, FRAME_W = 360, FRAME_H = 380;
// Temporary files survive repeated plays in the same app session; still check
// each one because the platform may reclaim temporary storage at any time.
const downloaded = [];

function create(page, callbacks) {
    let canvas, ctx, audio, timer, generation = 0, shown = false, ended = false;
    let paths = [], cache = {}, loading = {}, activeDownloads = [];
    function valid(g) { return g === generation; }
    function stop() {
        generation++;
        if (timer) clearTimeout(timer);
        timer = null;
        activeDownloads.forEach(task => { try { task.abort(); } catch (_) {} });
        activeDownloads = [];
        if (audio) { try { audio.stop(); audio.destroy(); } catch (_) {} }
        audio = null;
        if (ctx && canvas) { try { ctx.clearRect(0, 0, canvas.width, canvas.height); } catch (_) {} }
        canvas = ctx = null; paths = []; cache = {}; loading = {}; shown = false; ended = false;
    }
    function downloadAll(g) {
        let cursor = 0;
        return Promise.all(Array.from({length: 1}, async () => {
            while (valid(g)) {
                const index = cursor++;
                if (index >= URLS.length) return;
                if (downloaded[index]) {
                    const exists = await new Promise(resolve => {
                        wx.getFileSystemManager().access({ path: downloaded[index], success: () => resolve(true), fail: () => resolve(false) });
                    });
                    if (exists) { paths[index] = downloaded[index]; continue; }
                }
                let failure;
                for (let attempt = 0; attempt < 3 && valid(g); attempt++) {
                    try {
                        paths[index] = await new Promise((resolve, reject) => {
                            const task = wx.downloadFile({url: URLS[index], success: r => r.statusCode === 200 ? resolve(r.tempFilePath) : reject(new Error('download failed: ' + r.statusCode + ' index ' + index)), fail: reject});
                            activeDownloads.push(task);
                        });
                        failure = null;
                        break;
                    } catch (error) {
                        failure = error;
                        if (attempt < 2 && valid(g)) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
                    }
                }
                if (failure) throw failure;
                if (!valid(g)) return;
                downloaded[index] = paths[index];
            }
        }));
    }
    function imageFor(index, g) {
        if (cache[index]) return Promise.resolve(cache[index]);
        if (loading[index]) return loading[index];
        loading[index] = new Promise((resolve, reject) => {
            if (!canvas || !paths[index] || !valid(g)) return reject(new Error('cancelled'));
            const image = canvas.createImage();
            image.onload = () => { if (!valid(g)) return reject(new Error('cancelled')); cache[index] = image; delete loading[index]; resolve(image); };
            image.onerror = () => { delete loading[index]; reject(new Error('image decode failed')); };
            image.src = paths[index];
        });
        return loading[index];
    }
    function draw(frame, image) {
        const width = canvas.width, height = canvas.height;
        const scale = Math.max(width / 540, height / 960);
        const x = (width - 540 * scale) / 2 + 116 * scale;
        const y = (height - 960 * scale) / 2 + 371 * scale;
        const pos = frame % PER_ATLAS;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, (pos % COLS) * FRAME_W, Math.floor(pos / COLS) * FRAME_H,
            FRAME_W, FRAME_H, x, y, FRAME_W * scale, FRAME_H * scale);
    }
    function fail(g) { if (!valid(g)) return; stop(); callbacks.error(); }
    function tick(g) {
        if (!valid(g) || !audio || ended) return;
        const frame = Math.max(0, Math.min(FRAME_COUNT - 1, Math.floor((audio.currentTime || 0) * FPS)));
        const index = Math.floor(frame / PER_ATLAS);
        if (!cache[index]) {
            audio.pause();
            imageFor(index, g).then(() => { if (valid(g) && audio) { draw(frame, cache[index]); audio.play(); } }).catch(() => fail(g));
            return;
        }
        draw(frame, cache[index]);
        if (index + 1 < URLS.length && !cache[index + 1]) imageFor(index + 1, g).catch(() => fail(g));
        Object.keys(cache).forEach(key => { if (+key < index - 1) delete cache[key]; });
        timer = setTimeout(() => tick(g), 20);
    }
    async function start() {
        stop();
        const g = generation;
        try {
            await downloadAll(g);
            if (!valid(g)) return;
            const node = await new Promise((resolve, reject) => {
                wx.createSelectorQuery().in(page).select('#diaryCanvas').fields({node:true,size:true}).exec(res => res && res[0] && res[0].node ? resolve(res[0]) : reject(new Error('canvas unavailable')));
            });
            if (!valid(g)) return;
            canvas = node.node; ctx = canvas.getContext('2d');
            const ratio = Math.min(3, (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 1);
            canvas.width = Math.round(node.width * ratio); canvas.height = Math.round(node.height * ratio);
            await Promise.all([imageFor(0, g), imageFor(1, g)]);
            if (!valid(g)) return;
            draw(0, cache[0]);
            audio = wx.createInnerAudioContext();
            audio.src = AUDIO; audio.loop = false;
            audio.onPlay(() => {
                if (!valid(g)) return;
                if (!shown) { shown = true; callbacks.started(); }
                if (timer) clearTimeout(timer);
                tick(g);
            });
            audio.onEnded(() => { if (!valid(g) || ended) return; ended = true; if (timer) clearTimeout(timer); callbacks.ended(); });
            audio.onError(error => { console.warn('diary audio error', error); fail(g); });
            audio.play();
        } catch (error) { console.warn('diary preparation failed', error); fail(g); }
    }
    return {start, stop};
}
module.exports = {create};
