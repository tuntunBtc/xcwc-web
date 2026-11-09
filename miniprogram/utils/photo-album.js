'use strict';

// 本机打卡相册：作品与原照片落在小程序 USER_DATA_PATH，检索资料放 storage。
// 与 H5 的 IndexedDB 本机相册等价：不上传服务器、不进账号、最多 30 张。
// 删除作品不会退回叽分，也不删除原图去重记录（与 H5 一致）。
var KEY = 'xcwc.mp.album.v1';
var LIMIT = 30;
var ID_RE = /^[a-zA-Z0-9_-]{16,64}$/;

// H5 的编辑草稿只留在宿主内存：路由往返恢复，关闭小程序不恢复。
var draft = null;

function fs() {
    return wx.getFileSystemManager();
}

function dir() {
    return wx.env.USER_DATA_PATH + '/photo';
}

function ensureDir() {
    try {
        fs().accessSync(dir());
    } catch (error) {
        try { fs().mkdirSync(dir(), true); } catch (inner) { /* 目录可能被并发创建 */ }
    }
}

function readRows() {
    var raw;
    try { raw = wx.getStorageSync(KEY); } catch (error) { return []; }
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (row) {
        return row && typeof row === 'object' && typeof row.id === 'string' && ID_RE.test(row.id);
    });
}

function writeRows(rows) {
    try { wx.setStorageSync(KEY, rows); return true; }
    catch (error) { return false; }
}

function sorted(rows) {
    return rows.slice().sort(function (a, b) {
        return (Number(b.createdAt) - Number(a.createdAt)) || String(b.id).localeCompare(String(a.id));
    });
}

function view(row) {
    return {
        id: row.id,
        label: row.label || '在路上',
        createdAt: Number(row.createdAt) || 0,
        reward: row.reward === 1 ? 1 : 0,
        image: row.image || '',
        original: row.original || '',
        birdIds: row.birdIds || [],
        styleId: row.styleId || 'natural',
    };
}

function removeFile(path) {
    if (!path) return;
    try { fs().accessSync(path); } catch (error) { return; }
    try { fs().unlinkSync(path); } catch (error) { /* 删除失败不阻断资料清理 */ }
}

function copyIntoAlbum(tempPath, name) {
    ensureDir();
    var target = dir() + '/' + name;
    removeFile(target);
    fs().copyFileSync(tempPath, target);
    return target;
}

function requestId() {
    var stamp = Date.now().toString(36);
    var random = '';
    while (random.length < 24) random += Math.floor(Math.random() * 0xffffffff).toString(36);
    return (stamp + random).replace(/[^a-zA-Z0-9_-]/g, '0').slice(0, 32);
}

// sha1 优先；低版本基础库降级为「前 64KB 的 FNV + 文件长度」，
// 仍可区分不同原图，但不会把不同文件误判成同一张。
function digestOf(path) {
    return new Promise(function (resolve) {
        var fallback = function () {
            try {
                var buffer = fs().readFileSync(path, undefined, 0, 65536);
                var bytes;
                if (typeof buffer === 'string') {
                    bytes = [];
                    for (var c = 0; c < buffer.length; c += 1) bytes.push(buffer.charCodeAt(c) & 0xff);
                } else {
                    bytes = new Uint8Array(buffer);
                }
                var hash = 0x811c9dc5;
                for (var i = 0; i < bytes.length; i += 1) {
                    hash ^= bytes[i];
                    hash = (hash * 0x01000193) >>> 0;
                }
                resolve('fnv:' + hash.toString(16) + ':' + bytes.length);
            } catch (error) {
                resolve('unknown:' + Date.now() + ':' + Math.random());
            }
        };
        if (typeof wx.getFileInfo === 'function') {
            wx.getFileInfo({
                filePath: path,
                digestAlgorithm: 'sha1',
                success: function (res) { resolve('sha1:' + res.digest); },
                fail: fallback,
            });
        } else {
            fallback();
        }
    });
}

function history() {
    return { items: sorted(readRows()).map(view), total: readRows().length, error: null };
}

function detail(id) {
    var rows = readRows();
    for (var i = 0; i < rows.length; i += 1) if (rows[i].id === id) return view(rows[i]);
    return null;
}

// create 与 H5 guest-album.js 的 create 对齐：同一 requestId 重放不重复保存、不重复发分。
function create(payload, store) {
    var id = payload && payload.id;
    if (!id || !ID_RE.test(id)) return Promise.resolve({ error: 'INVALID_REQUEST_ID', message: '请求编号无效' });
    var rows = readRows();
    var existing = null;
    for (var i = 0; i < rows.length; i += 1) if (rows[i].id === id) existing = rows[i];
    if (existing) {
        if (existing.digest !== payload.digest || existing.outputHash !== payload.outputHash) {
            return Promise.resolve({ error: 'IDEMPOTENCY_CONFLICT', message: '同一请求编号不能保存不同的作品' });
        }
        return Promise.resolve({ item: view(existing), reward: existing.reward === 1 ? 1 : 0, replayed: true, error: null });
    }
    if (rows.length >= LIMIT) return Promise.resolve({ error: 'ALBUM_FULL', message: '相册已保存 30 张，请先管理合照腾出空间' });
    if (!payload.birdIds || !payload.birdIds.length || payload.birdIds.length > 3) {
        return Promise.resolve({ error: 'INVALID_BIRDS', message: '请选择 1–3 只已领取的小鸟' });
    }
    var image = '';
    var original = '';
    try {
        image = copyIntoAlbum(payload.imagePath, 'work-' + id + '.jpg');
        original = copyIntoAlbum(payload.originalPath, 'orig-' + id + '.bin');
    } catch (error) {
        removeFile(image);
        removeFile(original);
        return Promise.resolve({ error: 'STORAGE_UNAVAILABLE', message: '本机相册保存失败，请检查手机空间后原样重试' });
    }
    var row = {
        id: id,
        label: String(payload.label || '在路上').slice(0, 20),
        createdAt: payload.createdAt || Date.now(),
        reward: 0,
        digest: payload.digest,
        outputHash: payload.outputHash || '',
        image: image,
        original: original,
        birdIds: payload.birdIds.slice(),
        styleId: payload.styleId || 'natural',
    };
    var result = store.photoReward(id, payload.digest, row.createdAt);
    if (!result.error && result.data && result.data.reward === 1) row.reward = 1;
    var next = rows.concat([row]);
    if (!writeRows(next)) {
        removeFile(image);
        removeFile(original);
        return Promise.resolve({ error: 'STORAGE_UNAVAILABLE', message: '本机相册资料写入失败，请稍后原样重试' });
    }
    return Promise.resolve({ item: view(row), reward: row.reward, replayed: false, error: null, rewardError: result.error });
}

function remove(id) {
    var rows = readRows();
    var target = null;
    var next = [];
    for (var i = 0; i < rows.length; i += 1) {
        if (rows[i].id === id) target = rows[i];
        else next.push(rows[i]);
    }
    if (!target) return { error: 'NOT_FOUND', message: '没有找到本机合照' };
    if (!writeRows(next)) return { error: 'STORAGE_UNAVAILABLE', message: '本机相册资料更新失败，请重试' };
    removeFile(target.image);
    removeFile(target.original);
    return { error: null, deleted: true };
}

function clear() {
    draft = null;
    var rows = readRows();
    for (var i = 0; i < rows.length; i += 1) {
        removeFile(rows[i].image);
        removeFile(rows[i].original);
    }
    try { wx.removeStorageSync(KEY); return true; } catch (error) { return false; }
}

function saveDraft(value) { draft = value || null; }
function readDraft() { return draft; }
function clearDraft() { draft = null; }

module.exports = {
    KEY: KEY,
    LIMIT: LIMIT,
    requestId: requestId,
    digestOf: digestOf,
    history: history,
    detail: detail,
    create: create,
    remove: remove,
    clear: clear,
    saveDraft: saveDraft,
    readDraft: readDraft,
    clearDraft: clearDraft,
};
