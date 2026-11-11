'use strict';

// 与网页端 src/checkin-model.mjs / src/checkin-page.js 对齐的纯规则模块。
// 不依赖 wx、DOM 或 Canvas，可以在 Node 下直接单测。画布坐标固定 1000×1010，
// 与 H5 完全一致，因此拖动、缩放、构图的数值可以直接互相比对。
var MAX_BIRDS = 3;
var ALBUM_LIMIT = 30;
var CANVAS_W = 1000;
var CANVAS_H = 1010;
var FRAME = { x: 38, y: 38, w: 924, h: 812 };

var STYLES = [
    { id: 'natural', name: '清新自然', filter: 'none' },
    { id: 'film', name: '暖阳胶片', filter: 'sepia(.28) saturate(.85) contrast(.93)' },
    { id: 'soft', name: '柔和风景', filter: 'saturate(.75) brightness(1.09)' },
    { id: 'mono', name: '黑白记忆', filter: 'grayscale(1) contrast(.9)' },
];

function chooseBird(selected, id, birds) {
    var found = null;
    for (var i = 0; i < birds.length; i += 1) {
        if (birds[i].id === id) found = birds[i];
    }
    if (!found || !found.adopted) return { selected: selected, error: '这只小鸟还未领养' };
    var at = selected.indexOf(id);
    if (at >= 0) {
        var next = [];
        for (var j = 0; j < selected.length; j += 1) if (j !== at) next.push(selected[j]);
        return { selected: next, error: '' };
    }
    if (selected.length >= MAX_BIRDS) return { selected: selected, error: '最多选择 3 只小鸟一起合照' };
    return { selected: selected.concat([id]), error: '' };
}

function sortedBirds(birds) {
    return birds.slice().sort(function (a, b) { return Number(b.adopted) - Number(a.adopted); });
}

function sortedMemories(entries) {
    return entries.slice().sort(function (a, b) {
        return (b.createdAt - a.createdAt) || String(b.id).localeCompare(String(a.id));
    });
}

function arrangement(ids) {
    var centers = ids.length === 1 ? [735] : ids.length === 2 ? [515, 790] : [285, 550, 810];
    var size = ids.length === 1 ? 34 : ids.length === 2 ? 28 : 24;
    var out = {};
    for (var i = 0; i < ids.length; i += 1) {
        out[ids[i]] = { cx: centers[i], cy: 850 - size * 6.3, size: size };
    }
    return out;
}

function rectFor(pose, ratio) {
    var r = ratio || 1;
    var w = pose.size * 12.6;
    var h = w * r;
    return { x: pose.cx - w / 2, y: pose.cy - h / 2, w: w, h: h };
}

function constrain(pose, ratio) {
    var r = ratio || 1;
    pose.size = Math.max(12, Math.min(55, 812 / (12.6 * r), pose.size));
    var box = rectFor(pose, r);
    pose.cx = Math.max(38 + box.w / 2, Math.min(962 - box.w / 2, pose.cx));
    pose.cy = Math.max(38 + box.h / 2, Math.min(850 - box.h / 2, pose.cy));
    return pose;
}

// 换出镜阵容时保留已有小鸟的位置与大小，只有新加入的用默认构图。
function reconcilePoses(ids, previous) {
    var defaults = arrangement(ids);
    var out = {};
    for (var i = 0; i < ids.length; i += 1) {
        var id = ids[i];
        var old = previous && previous[id];
        out[id] = old ? { cx: old.cx, cy: old.cy, size: old.size } : defaults[id];
    }
    return out;
}

function resetPose(ids, previous, id) {
    var next = reconcilePoses(ids, previous);
    if (ids.indexOf(id) >= 0) next[id] = arrangement(ids)[id];
    return next;
}

function number(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
}

function photoPlacement(width, height, mode, horizontal, vertical) {
    var cover = mode !== 'contain';
    var scale = cover
        ? Math.max(FRAME.w / width, FRAME.h / height)
        : Math.min(FRAME.w / width, FRAME.h / height);
    var dw = width * scale;
    var dh = height * scale;
    var fraction = function (value) { return Math.max(0, Math.min(100, number(value, 0))) / 100; };
    return {
        x: FRAME.x + (FRAME.w - dw) * (cover ? fraction(horizontal) : 0.5),
        y: FRAME.y + (FRAME.h - dh) * (cover ? fraction(vertical) : 0.5),
        width: dw,
        height: dh,
        horizontal: dw > FRAME.w + 0.5,
        vertical: dh > FRAME.h + 0.5,
    };
}

// 不用 String.padStart：低版本 iOS WebView 可能没有该运行时方法。
function pad2(value) {
    return value < 10 ? '0' + value : String(value);
}

function formatDate(time) {
    var d = new Date(time);
    return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
}

function formatDateTime(time) {
    var d = new Date(time);
    return formatDate(time).slice(2) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

// H5 syncGenerate() 的按钮文案状态机；小程序用同一套判定，避免两套口径。
function generateState(s) {
    var disabled = !(s.ready && s.canvasReady && s.hasBird && s.selectedCount > 0 &&
        s.uploaded && s.dirty && s.albumAvailable && s.albumTotal < ALBUM_LIMIT &&
        !s.busy && !s.readingPhoto);
    var text = '生成并收藏';
    var canManageAlbum = false;
    if (s.busy) text = '正在收藏回忆…';
    else if (s.readingPhoto) text = '正在处理照片…';
    else if (!s.ready) text = '小鸟资料尚未准备好';
    else if (!s.hasBird || !s.selectedCount) text = '先选一只小鸟';
    else if (!s.uploaded) text = '选择照片，开启合照';
    else if (!s.canvasReady) text = s.canvasLoading ? '正在准备合照素材…' : '合照素材未就绪，请重试';
    else if (s.albumLoading) text = '正在读取相册…';
    else if (!s.albumAvailable) text = '相册暂不可用，请重试';
    else if (s.albumTotal >= ALBUM_LIMIT) {
        text = '相册已满，先管理合照';
        canManageAlbum = true;
    }
    else if (!s.dirty) text = '已收藏，调整后再合照';
    return { disabled: disabled, text: text, canManageAlbum: canManageAlbum };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Canvas 2D 的 ctx.filter 在小程序里支持不一致，改为按像素实现同样的四档风格。
// data 是 Uint8ClampedArray，返回原对象（原地修改），便于 Node 单测。
function applyFilter(data, style) {
    if (style === 0) return data;
    var i;
    var r, g, b, lum;
    for (i = 0; i < data.length; i += 4) {
        r = data[i]; g = data[i + 1]; b = data[i + 2];
        if (style === 1) {
            var sr = 0.393 * r + 0.769 * g + 0.189 * b;
            var sg = 0.349 * r + 0.686 * g + 0.168 * b;
            var sb = 0.272 * r + 0.534 * g + 0.131 * b;
            r = r * 0.72 + sr * 0.28; g = g * 0.72 + sg * 0.28; b = b * 0.72 + sb * 0.28;
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r = lum + (r - lum) * 0.85; g = lum + (g - lum) * 0.85; b = lum + (b - lum) * 0.85;
            r = (r - 128) * 0.93 + 128; g = (g - 128) * 0.93 + 128; b = (b - 128) * 0.93 + 128;
        } else if (style === 2) {
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r = (lum + (r - lum) * 0.75) * 1.09;
            g = (lum + (g - lum) * 0.75) * 1.09;
            b = (lum + (b - lum) * 0.75) * 1.09;
        } else if (style === 3) {
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r = (lum - 128) * 0.9 + 128; g = (lum - 128) * 0.9 + 128; b = (lum - 128) * 0.9 + 128;
        }
        data[i] = clamp(r, 0, 255);
        data[i + 1] = clamp(g, 0, 255);
        data[i + 2] = clamp(b, 0, 255);
    }
    return data;
}

module.exports = {
    MAX_BIRDS: MAX_BIRDS,
    ALBUM_LIMIT: ALBUM_LIMIT,
    CANVAS_W: CANVAS_W,
    CANVAS_H: CANVAS_H,
    FRAME: FRAME,
    STYLES: STYLES,
    chooseBird: chooseBird,
    sortedBirds: sortedBirds,
    sortedMemories: sortedMemories,
    arrangement: arrangement,
    rectFor: rectFor,
    constrain: constrain,
    reconcilePoses: reconcilePoses,
    resetPose: resetPose,
    photoPlacement: photoPlacement,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    generateState: generateState,
    applyFilter: applyFilter,
};
