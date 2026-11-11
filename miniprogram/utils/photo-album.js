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

function parseRows(raw) {
    if (raw === undefined || raw === null || raw === '') return [];
    if (!Array.isArray(raw) || !raw.every(function (row) {
        return row && typeof row === 'object' && typeof row.id === 'string' && ID_RE.test(row.id) &&
            (!row.stage || row.stage === 'files-pending' || row.stage === 'reward-pending' || row.stage === 'delete-pending');
    })) return null;
    return raw;
}

function readRows() {
    try { return parseRows(wx.getStorageSync(KEY)); } catch (error) { return null; }
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
        pendingDeletion: row.stage === 'delete-pending',
    };
}

function fileMissing(error) {
    return error && (error.code === 'ENOENT' || /\bENOENT\b|no such file or directory/i.test(String(error.errMsg || error.message || error)));
}

function visibleInAlbum(row) {
    if (row.stage === 'files-pending') return false;
    if (row.stage !== 'delete-pending') return true;
    // 原图未能删除时，保留仍可查看的合照。合照文件已移除则不显示失效卡片。
    try { fs().accessSync(row.image); }
    catch (error) { return !fileMissing(error); }
    return true;
}

function removeFile(path) {
    if (!path) return true;
    try { fs().unlinkSync(path); return true; }
    catch (error) { return fileMissing(error); }
}

function removeFiles(row) {
    // 原图删除失败时保留仍在相册里展示的作品，用户可以继续查看和重试。
    return removeFile(row.original) && removeFile(row.image);
}

function copyIntoAlbum(tempPath, target) {
    ensureDir();
    if (!removeFile(target)) throw new Error('无法重新保存本机文件');
    fs().copyFileSync(tempPath, target);
}

function requestId() {
    var stamp = Date.now().toString(36);
    var random = '';
    while (random.length < 24) random += Math.floor(Math.random() * 0xffffffff).toString(36);
    return (stamp + random).replace(/[^a-zA-Z0-9_-]/g, '0').slice(0, 32);
}

// SHA-1 优先，旧基础库沿用前 64KB 的指纹。读取失败时返回空值，不能按新原图发分。
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
                resolve(bytes.length ? 'fnv:' + hash.toString(16) + ':' + bytes.length : '');
            } catch (error) {
                resolve('');
            }
        };
        if (typeof wx.getFileInfo === 'function') {
            wx.getFileInfo({
                filePath: path,
                digestAlgorithm: 'sha1',
                success: function (res) {
                    if (res && typeof res.digest === 'string' && res.digest) resolve('sha1:' + res.digest);
                    else fallback();
                },
                fail: fallback,
            });
        } else {
            fallback();
        }
    });
}

function history() {
    var rows = readRows();
    if (!rows) return { items: [], total: 0, error: 'STORAGE_UNAVAILABLE' };
    var visible = rows.filter(visibleInAlbum);
    return { items: sorted(visible).map(view), total: visible.length, error: null };
}

function detail(id) {
    var rows = readRows() || [];
    for (var i = 0; i < rows.length; i += 1) {
        if (rows[i].id === id && visibleInAlbum(rows[i])) return view(rows[i]);
    }
    return null;
}

function storageError(message) {
    return { error: 'STORAGE_UNAVAILABLE', message: message };
}

function replaceRow(rows, updated) {
    return rows.map(function (row) { return row.id === updated.id ? updated : row; });
}

function finishReward(rows, row, store, replayed) {
    try {
        fs().accessSync(row.image);
        fs().accessSync(row.original);
    } catch (error) {
        return storageError('本机照片不可用，收藏结果尚未确认');
    }
    var result = store.photoReward(row.id, row.digest, row.createdAt);
    if (result.error) return storageError('合照已保存，叽分尚未确认，请原样重试');
    var completed = Object.assign({}, row, { reward: result.data && result.data.reward === 1 ? 1 : 0 });
    delete completed.stage;
    if (!writeRows(replaceRow(rows, completed))) return storageError('合照已保存，收藏结果尚未确认，请原样重试');
    return { item: view(completed), reward: completed.reward, replayed: replayed, error: null };
}

function recoverPending(store) {
    var rows = readRows();
    if (!rows) return storageError('本机相册读取失败，请重试');
    var draftId = draft && draft.pendingSubmission && draft.pendingSubmission.id;
    var pending = rows.filter(function (row) {
        return row.stage === 'reward-pending' || row.stage === 'delete-pending' ||
            (row.stage === 'files-pending' && row.id !== draftId);
    });
    var firstError = null;
    for (var i = 0; i < pending.length; i += 1) {
        var row = pending[i];
        // 文件阶段的请求仅能由原编辑草稿重试。草稿已丢弃时清理未提交的作品。
        var result = row.stage === 'reward-pending' ? finishReward(rows, row, store, true) : remove(row.id);
        if (result.error && !firstError) firstError = result;
        rows = readRows();
        if (!rows) return storageError('本机相册读取失败，请重试');
    }
    return firstError || { error: null };
}

// create 与 H5 guest-album.js 的 create 对齐：同一 requestId 重放不重复保存、不重复发分。
function create(payload, store) {
    var id = payload && payload.id;
    if (!id || !ID_RE.test(id)) return Promise.resolve({ error: 'INVALID_REQUEST_ID', message: '请求编号无效' });
    var rows = readRows();
    if (!rows) return Promise.resolve(storageError('本机相册读取失败，请原样重试'));
    var existing = rows.find(function (row) { return row.id === id; });
    if (existing) {
        if (existing.stage === 'delete-pending') {
            return Promise.resolve({ error: 'DELETE_PENDING', message: '这张合照正在删除，请先重试读取相册' });
        }
        if (existing.digest !== payload.digest || (existing.outputHash || '') !== (payload.outputHash || '')) {
            return Promise.resolve({ error: 'IDEMPOTENCY_CONFLICT', message: '同一请求编号不能保存不同的作品' });
        }
        if (!existing.stage) return Promise.resolve({ item: view(existing), reward: existing.reward === 1 ? 1 : 0, replayed: true, error: null });
        if (existing.stage === 'reward-pending') return Promise.resolve(finishReward(rows, existing, store, true));
    }
    if (!existing && rows.length >= LIMIT) return Promise.resolve({ error: 'ALBUM_FULL', message: '相册已保存 30 张，请先管理合照腾出空间' });
    if (!Array.isArray(payload.birdIds) || !payload.birdIds.length || payload.birdIds.length > 3 ||
        new Set(payload.birdIds).size !== payload.birdIds.length) {
        return Promise.resolve({ error: 'INVALID_BIRDS', message: '请选择 1–3 只已领取的小鸟' });
    }
    // 与 H5 一致：提交时二次核对出镜小鸟仍是本机已领取实体，不按前缀推断。
    var snapshot = store.snapshot();
    if (snapshot.error) return Promise.resolve(storageError('本机领取记录读取失败，请原样重试'));
    var state = snapshot.data ? snapshot.data.snapshot : null;
    var ownedId = state && state.hasBird ? (state.birdCode || 'local-bird') : '';
    if (!ownedId || payload.birdIds.some(function (id) { return id !== ownedId; })) {
        return Promise.resolve({ error: 'INVALID_BIRDS', message: '本机领取记录已变化，请重新选择小鸟' });
    }
    var row = existing || {
        id: id,
        label: String(payload.label || '在路上').slice(0, 20),
        createdAt: payload.createdAt || Date.now(),
        reward: 0,
        digest: payload.digest,
        outputHash: payload.outputHash || '',
        image: dir() + '/work-' + id + '.jpg',
        original: dir() + '/orig-' + id + '.bin',
        birdIds: payload.birdIds.slice(),
        styleId: payload.styleId || 'natural',
        stage: 'files-pending',
    };
    // 先保留索引再写文件，失败时仍有文件路径供重试或清理。
    if (!existing) {
        rows = rows.concat([row]);
        if (!writeRows(rows)) return Promise.resolve(storageError('本机相册资料写入失败，请原样重试'));
    }
    try {
        copyIntoAlbum(payload.imagePath, row.image);
        copyIntoAlbum(payload.originalPath, row.original);
    } catch (error) {
        if (removeFiles(row)) writeRows(rows.filter(function (item) { return item.id !== id; }));
        return Promise.resolve(storageError('本机相册保存失败，请检查手机空间后原样重试'));
    }
    row = Object.assign({}, row, { stage: 'reward-pending' });
    rows = replaceRow(rows, row);
    if (!writeRows(rows)) return Promise.resolve(storageError('本机相册资料写入失败，请原样重试'));
    return Promise.resolve(finishReward(rows, row, store, false));
}

function remove(id) {
    var rows = readRows();
    if (!rows) return storageError('本机相册读取失败，请重试');
    var target = null;
    var next = [];
    for (var i = 0; i < rows.length; i += 1) {
        if (rows[i].id === id) target = rows[i];
        else next.push(rows[i]);
    }
    if (!target) return { error: 'NOT_FOUND', message: '没有找到本机合照' };
    if (target.stage !== 'delete-pending') {
        var pending = Object.assign({}, target, { stage: 'delete-pending' });
        if (!writeRows(replaceRow(rows, pending))) return storageError('本机相册无法记录删除操作，请重试');
    }
    // 删除已记录，旧草稿不再重放这条收藏请求。
    if (draft && draft.pendingSubmission && draft.pendingSubmission.id === id) {
        draft = Object.assign({}, draft, { pendingSubmission: null });
    }
    if (!removeFiles(target)) {
        return Object.assign(storageError('本机照片未完全删除，请重试'), { pendingDeletion: true });
    }
    if (!writeRows(next)) {
        return Object.assign(storageError('本机相册资料更新失败，请重试'), { pendingDeletion: true, workDeleted: true });
    }
    return { error: null, deleted: true };
}

function clear() {
    try {
        // 读取失败和索引损坏分开处理。前者无法安全记录删除，后者仍可用相册目录清理。
        var rows = parseRows(wx.getStorageSync(KEY));
        var fileSystem = fs();
        var recursive = typeof fileSystem.rmdirSync === 'function';
        if (!rows && !recursive) return false;
        if (rows && rows.some(function (row) { return row.stage !== 'delete-pending'; })) {
            // 递归删除也可能只完成一部分。先登记状态，保留剩余文件的索引供重试。
            var pending = rows.map(function (row) { return Object.assign({}, row, { stage: 'delete-pending' }); });
            if (!writeRows(pending)) return false;
        }
        if (rows && rows.length) draft = null;
        if (recursive) {
            // 仅删除相册自有目录，覆盖旧版本遗留的无索引文件。
            try { fileSystem.rmdirSync(dir(), true); }
            catch (error) { if (!fileMissing(error)) return false; }
        } else {
            var removed = true;
            for (var i = 0; i < rows.length; i += 1) {
                if (!removeFiles(rows[i])) removed = false;
            }
            if (!removed) return false;
        }
        draft = null;
        wx.removeStorageSync(KEY);
        return true;
    } catch (error) {
        return false;
    }
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
    recoverPending: recoverPending,
    remove: remove,
    clear: clear,
    saveDraft: saveDraft,
    readDraft: readDraft,
    clearDraft: clearDraft,
};
