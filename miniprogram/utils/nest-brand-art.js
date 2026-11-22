'use strict';
const { apiRoot, assetUrl } = require('./api-root');

const REQUIRED = ['normal', 'happy', 'angry'];
const OPTIONAL = ['hungry', 'thirsty', 'lonely'];
const INDEX = 'xcwc.nest.brand.art.v2';
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ROLES = 8;
const owned = /^bundle-[a-z0-9]+-[a-z0-9]+$/;
let sequence = 0;
let cache;
function disk(platform) {
    if (cache) return cache;
    const fs = platform.getFileSystemManager();
    const root = platform.env.USER_DATA_PATH + '/xcwc-nest-brand-v1';
    try { fs.accessSync(root); } catch (_) { fs.mkdirSync(root, true); }
    const stored = platform.getStorageSync(INDEX);
    let entries = Array.isArray(stored) ? stored.filter(e => e && owned.test(e.dir) && e.bundle?.paths) : [];
    function remove(dir) {
        if (owned.test(dir)) try { fs.rmdirSync(root + '/' + dir, true); } catch (_) { /* Already gone. */ }
    }
    for (const dir of fs.readdirSync(root)) if (!entries.some(e => e.dir === dir)) remove(dir);
    const pins = new Map();
    const retired = new Set();
    cache = { fs, root, remove,
        hold(bundle) {
            const dir = bundle?.paths.normal.split('/').slice(-2)[0];
            if (!owned.test(dir)) return () => {};
            pins.set(dir, (pins.get(dir) || 0) + 1);
            return () => {
                const count = pins.get(dir) - 1;
                if (count) pins.set(dir, count);
                else {
                    pins.delete(dir);
                    if (retired.delete(dir)) remove(dir);
                }
            };
        },
        read(key) {
            const entry = entries.find(e => e.key === key);
            if (!entry) return null;
            const bundle = entry.bundle;
            try {
                for (const path of new Set([...Object.values(bundle.paths), ...[bundle.background, bundle.animation?.path, bundle.animation?.audioPath].filter(Boolean)])) {
                    if (!path.startsWith(root + '/' + entry.dir + '/')) return null;
                    fs.accessSync(path);
                }
                return bundle;
            } catch (_) { return null; }
        },
        install(key, dir, bytes, bundle) {
            const next = [{key, dir, bytes, bundle}];
            let total = bytes;
            for (const e of entries) if (e.key !== key && next.length < MAX_ROLES && total + e.bytes <= MAX_BYTES) {
                next.push(e); total += e.bytes;
            }
            platform.setStorageSync(INDEX, next);
            const old = entries;
            entries = next;
            for (const e of old) if (!next.some(n => n.dir === e.dir)) {
                if (pins.has(e.dir)) retired.add(e.dir);
                else remove(e.dir);
            }
        },
    };
    return cache;
}

function call(platform, method, options) {
    return new Promise((resolve, reject) => platform[method]({
        ...options, success: resolve, fail: reject,
    }));
}

async function checkImage(platform, path, asset) {
    let size;
    try {
        size = await call(platform, 'getImageInfo', { src: path });
    } catch (error) {
        // Some WeChat renderers support WebP in canvas but not in getImageInfo.
        if (asset.mime !== 'image/webp' || !platform.createOffscreenCanvas) throw error;
        const canvas = platform.createOffscreenCanvas({ type: '2d', width: 1, height: 1 });
        size = await new Promise((resolve, reject) => {
            const image = canvas.createImage();
            const timer = setTimeout(() => reject(Error('image decode timeout')), 5000);
            image.onload = () => { clearTimeout(timer); resolve({ width: image.width, height: image.height }); };
            image.onerror = () => { clearTimeout(timer); reject(Error('invalid WebP')); };
            image.src = path;
        });
    }
    if (size.width !== asset.width || size.height !== asset.height) throw Error('invalid image dimensions');
}

async function prepare(platform, base, role, previous, storage, current) {
    const response = await call(platform, 'request', {
        url: apiRoot(base) + '/content/characters/' + encodeURIComponent(role), timeout: 8000,
    });
    const doc = response.data;
    if (response.statusCode !== 200 || !doc?.releaseId || doc.character?.id !== role) throw Error('invalid character');
    if (previous?.releaseId === doc.releaseId && previous.backgroundResolved) return previous;
    const look = doc.appearances.find(item => item.characterId === role && item.id === doc.character.defaultAppearanceId);
    const paths = {};
    const assets = new Map(doc.assets.map(asset => [asset.id, asset]));
    const previousFiles = previous ? [...Object.values(previous.paths), previous.background, previous.animation?.path, previous.animation?.audioPath].filter(Boolean) : [];
    const files = new Map();
    const dir = 'bundle-' + Date.now().toString(36) + '-' + (++sequence).toString(36);
    const folder = storage.root + '/' + dir;
    let bytes = 0;
    storage.fs.mkdirSync(folder);
    async function file(id, sound = false) {
        if (!current()) throw Error('selection changed');
        const asset = assets.get(id);
        if (!asset || !/^[a-f0-9]{32}$/.test(id) || asset.url !== '/bird/v1/content/assets/' + id) throw Error('invalid asset');
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/mp4': 'm4a' }[asset.mime];
        if (!extension || (extension === 'm4a') !== sound) throw Error('unexpected asset type');
        if (!files.has(id)) files.set(id, (async () => {
            const name = id + '.' + extension;
            const existing = previousFiles.find(path => path.endsWith('/' + name));
            let source = existing;
            if (!source) {
                const result = await call(platform, 'downloadFile', { url: assetUrl(asset.url), timeout: 12000 });
                if (result.statusCode !== 200 || !result.tempFilePath) throw Error('asset unavailable');
                source = result.tempFilePath;
            }
            const size = storage.fs.statSync(source).size;
            if (size !== asset.size_bytes || bytes + size > MAX_BYTES) throw Error('invalid bundle size');
            const path = folder + '/' + name;
            await call(storage.fs, 'copyFile', { srcPath: source, destPath: path });
            if (!existing && !sound) await checkImage(platform, path, asset);
            bytes += size;
            return path;
        })());
        return files.get(id);
    }
    try {
        for (const state of REQUIRED) paths[state] = await file(look.slots[state]);
        for (const state of OPTIONAL) {
            const id = look.slots[state];
            paths[state] = id ? await file(id).catch(() => paths.normal) : paths.normal;
        }
        let animation = null;
        if (look.animation) {
            const { assetId, columns, rows, frames, fps } = look.animation;
            const asset = assets.get(assetId);
            if (![columns, rows, frames, fps].every(n => Number.isInteger(n) && n > 0) ||
                columns > 64 || rows > 64 || fps > 30 || frames > Math.min(512, columns * rows) ||
                !asset || asset.width % columns || asset.height % rows) throw Error('invalid sprite grid');
            const { frameTimesMs, durationMs, audioAssetId } = look.animation;
            const timed = frameTimesMs != null || durationMs != null || audioAssetId != null;
            if (timed && (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > 120000 ||
                !Array.isArray(frameTimesMs) || frameTimesMs.length !== frames || frameTimesMs[0] !== 0 ||
                frameTimesMs.some((t, i) => !Number.isInteger(t) || t >= durationMs || (i && t <= frameTimesMs[i - 1])))) {
                throw Error('invalid sprite timeline');
            }
            const path = await file(assetId);
            const audioPath = audioAssetId ? await file(audioAssetId, true) : '';
            animation = { path, audioPath, atlasHash: asset.sha256, columns, frames, fps, durationMs: durationMs || frames * 1000 / fps,
                frameTimesMs, width: asset.width / columns, height: asset.height / rows };
        }
        const configuredBackground = doc.character.backgroundAssetId;
        const defaultBackground = doc.pages?.find(page => page.id === 'nestDefault')?.backgroundAssetId;
        const backgroundId = configuredBackground || defaultBackground;
        let background = '';
        let backgroundResolved = true;
        if (backgroundId) {
            try {
                background = await file(backgroundId);
            } catch {
                backgroundResolved = false;
                if (configuredBackground && defaultBackground && defaultBackground !== configuredBackground) {
                    background = await file(defaultBackground).catch(() => '');
                }
            }
        }
        const bundle = { releaseId: doc.releaseId, paths, animation, background, backgroundResolved };
        if (!current()) throw Error('selection changed');
        storage.install(base + '/' + role, dir, bytes, bundle);
        return bundle;
    } catch (error) {
        storage.remove(dir);
        throw error;
    }
}

function createBrandArt(platform, apiBase, onChange) {
    const base = (apiBase || '').replace(/\/+$/, '');
    let key, ticket = 0, retryAt = 0, value = null;
    function select(pet, view) {
        const role = pet?.characterId;
        const next = apiRoot(base) && /^[a-zA-Z0-9_-]{1,32}$/.test(role || '') ? [view, pet.petId, role, pet.contentVersion || ''].join('|') : '';
        if (next === key && Date.now() < retryAt) return value;
        const issued = ++ticket;
        key = next;
        retryAt = Infinity;
        const cacheKey = base + '/' + role;
        let storage;
        try { if (next) storage = disk(platform); } catch (_) { /* Retain packaged art when storage is unavailable. */ }
        value = storage ? storage.read(cacheKey) : null;
        if (storage) prepare(platform, base, role, value, storage, () => issued === ticket).then(bundle => {
            if (issued !== ticket) return;
            if (!bundle.backgroundResolved) retryAt = Date.now() + 30000;
            if (value !== bundle) {
                value = bundle;
                onChange();
            }
        }).catch(() => {
            if (issued === ticket) retryAt = Date.now() + 30000;
        });
        return value;
    }
    let displayed, release;
    function display(bundle) {
        if (displayed === bundle) return;
        if (release) release();
        displayed = bundle;
        release = bundle && cache?.hold(bundle);
    }
    return { select, display, suspend() { ++ticket; key = undefined; } };
}
module.exports = { createBrandArt };
