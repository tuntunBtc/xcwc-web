'use strict';

const manifest = require('./release-images-manifest');
const MAX_ACTIVE = 4;
const ARTWORK_WAIT_MS = 3500;
const ARTWORK_RENDER_TIMEOUT_MS = 12000;
const CACHE_GRACE_MS = 24 * 60 * 60 * 1000;
const GENERATED_VERSION = /^(?:fixture-)?[a-f0-9]{20}$/;
const entries = manifest.files;
const cached = new Map();
const queue = [];
let active = 0;
let rootReady;
let sequence = 0;

function cacheRoot() {
    if (typeof manifest.version !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(manifest.version) ||
        !wx.env || typeof wx.env.USER_DATA_PATH !== 'string' || !wx.env.USER_DATA_PATH) {
        throw new Error('小程序图片缓存不可用');
    }
    return wx.env.USER_DATA_PATH + '/xcwc-release-images/' + manifest.version;
}

function entryFor(path) {
    return Object.prototype.hasOwnProperty.call(entries, path) ? entries[path] : null;
}

function fsCall(method, options) {
    return new Promise((resolve, reject) => {
        const fs = wx.getFileSystemManager();
        fs[method](Object.assign({}, options, { success: resolve, fail: reject }));
    });
}

async function pruneImageVersions(root) {
    const current = manifest.version;
    if (!GENERATED_VERSION.test(current)) return;
    const base = root.slice(0, root.lastIndexOf('/'));
    const fixture = current.startsWith('fixture-');
    const { files } = await fsCall('readdir', { dirPath: base });
    if (!Array.isArray(files)) return;
    const siblings = files.filter(name => typeof name === 'string' && name !== current &&
        GENERATED_VERSION.test(name) && name.startsWith('fixture-') === fixture);
    if (siblings.length < 2) return;

    const versions = [];
    for (const name of siblings) {
        const path = base + '/' + name;
        const { stats } = await fsCall('stat', { path }).catch(() => ({}));
        if (stats && typeof stats.isDirectory === 'function' && stats.isDirectory() &&
            Number.isFinite(stats.lastModifiedTime) && stats.lastModifiedTime > 0) {
            const time = stats.lastModifiedTime;
            versions.push({ path, modified: time < 1e12 ? time * 1000 : time });
        }
    }
    versions.sort((a, b) => b.modified - a.modified);
    const cutoff = Date.now() - CACHE_GRACE_MS;
    // 保留最近一个旧版本；近一天写过的目录也留给可能仍在使用的预览。
    for (const version of versions.slice(1)) {
        if (version.modified < cutoff) {
            await fsCall('rmdir', { dirPath: version.path, recursive: true }).catch(() => {});
        }
    }
}

function ensureRoot(root) {
    if (!rootReady) {
        rootReady = pruneImageVersions(root).catch(() => {})
            .then(() => fsCall('mkdir', { dirPath: root, recursive: true })
                .catch(() => fsCall('access', { path: root })))
            .catch(error => { rootReady = undefined; throw error; });
    }
    return rootReady;
}

function pump() {
    while (active < MAX_ACTIVE && queue.length) {
        active += 1;
        queue.shift()();
    }
}

function schedule(task, priority) {
    return new Promise((resolve, reject) => {
        const run = () => {
            const done = () => { active -= 1; pump(); };
            Promise.resolve().then(task).then(
                result => { done(); resolve(result); },
                error => { done(); reject(error); }
            );
        };
        if (priority) queue.unshift(run);
        else queue.push(run);
        pump();
    });
}

function isWebp(bytes, size) {
    if (bytes.length < 12) return false;
    const header = String.fromCharCode.apply(null, bytes.subarray(0, 4)) +
        String.fromCharCode.apply(null, bytes.subarray(8, 12));
    const riffSize = bytes[4] + bytes[5] * 256 + bytes[6] * 65536 + bytes[7] * 16777216;
    return header === 'RIFFWEBP' && riffSize + 8 === size;
}

async function isValid(path, size) {
    try {
        const { stats } = await fsCall('stat', { path });
        if (!stats || stats.size !== size || (typeof stats.isFile === 'function' && !stats.isFile())) return false;
        const { data } = await fsCall('readFile', { filePath: path, position: 0, length: 12 });
        return isWebp(new Uint8Array(data), size);
    } catch (error) {
        return false;
    }
}

async function extract(root, entry, refresh) {
    const target = root + '/' + entry.name;
    if (!refresh && await isValid(target, entry.size)) return target;

    const { data } = await fsCall('readFile', { filePath: entry.source });
    const bytes = new Uint8Array(data);
    if (bytes.length !== entry.size || !isWebp(bytes, entry.size)) throw new Error('小程序图片包校验失败');

    const temporary = target + '.' + Date.now().toString(36) + '-' + (++sequence) + '.tmp';
    try {
        await fsCall('writeFile', { filePath: temporary, data });
        try {
            await fsCall('rename', { oldPath: temporary, newPath: target });
        } catch (error) {
            if (!refresh && await isValid(target, entry.size)) return target;
            await fsCall('unlink', { filePath: target }).catch(() => {});
            await fsCall('rename', { oldPath: temporary, newPath: target });
        }
        return target;
    } finally {
        await fsCall('unlink', { filePath: temporary }).catch(() => {});
    }
}

function readEntry(root, path, priority, refresh = false) {
    const entry = entryFor(path);
    if (!entry || !/^[a-z0-9_-]+\.webp$/i.test(entry.name) ||
        typeof entry.source !== 'string' || !/^[a-z0-9_./-]+\.bin$/i.test(entry.source) ||
        entry.source.split('/').some(part => !part || part === '.' || part === '..') ||
        !Number.isSafeInteger(entry.size) || entry.size < 12) {
        throw new Error('小程序图片清单无效');
    }
    const previous = cached.get(entry.name);
    if (!previous || refresh) {
        const extractEntry = () => schedule(() => extract(root, entry, refresh), priority);
        const pending = (previous ? previous.then(extractEntry, extractEntry) : extractEntry()).catch(error => {
            if (cached.get(entry.name) === pending) cached.delete(entry.name);
            throw error;
        });
        cached.set(entry.name, pending);
    }
    return cached.get(entry.name);
}

async function prepare(paths, priority = false) {
    const root = cacheRoot();
    if (paths.length) await ensureRoot(root);
    await Promise.all(Array.from(new Set(paths)).map(path => readEntry(root, path, priority)));
    return root;
}

async function resolve(path) {
    const entry = entryFor(path);
    if (!entry) return path;
    const root = await prepare([path]);
    return root + '/' + entry.name;
}

async function refresh(path) {
    const root = cacheRoot();
    await ensureRoot(root);
    return readEntry(root, path, false, true);
}

function waitForArtwork(instance) {
    if (instance.releaseImagesDisposed || instance.data.releaseArtworkState !== 'loading' ||
        instance.data.releaseImageState === 'failed') return Promise.resolve();
    if (!instance.releaseArtworkWait) {
        instance.releaseArtworkWait = new Promise(resolve => {
            const timer = setTimeout(() => finishArtwork(instance), ARTWORK_WAIT_MS);
            instance.finishReleaseArtwork = () => { clearTimeout(timer); resolve(); };
        });
    }
    return instance.releaseArtworkWait;
}

function finishArtwork(instance) {
    if (!instance.finishReleaseArtwork) return;
    const finish = instance.finishReleaseArtwork;
    instance.finishReleaseArtwork = null;
    finish();
}

async function preparePageImages(instance, paths, lead, onLeadReady) {
    if (lead.length && !instance.data.releaseLeadReady) {
        // 主图读取失败时，仍让已单独准备的商品封面使用同一缓存目录。
        if (!instance.data.releaseImageRoot) instance.setData({ releaseImageRoot: cacheRoot() });
        const root = await prepare(lead, true);
        if (instance.releaseImagesDisposed) return root;
        instance.setData({ releaseImageRoot: root, releaseLeadReady: true }, () => onLeadReady?.(instance));
    }
    return prepare(paths);
}

function showImages(instance, paths, lead = [], onLeadReady) {
    if (instance.releaseImagesDisposed || instance.releaseImagesPending || instance.releaseArtworkResetting ||
        instance.data.releaseImageState === 'ready') return;
    instance.setData({ releaseImageState: 'loading' });
    instance.releaseImagesPending = preparePageImages(instance, paths, lead, onLeadReady).then(root => {
        instance.releaseImagesPending = null;
        if (!instance.releaseImagesDisposed) {
            instance.setData({ releaseImageRoot: root, releaseImageState: 'ready' }, () => onLeadReady?.(instance));
        }
    }, () => {
        instance.releaseImagesPending = null;
        if (!instance.releaseImagesDisposed) instance.setData({ releaseImageState: 'failed' });
        finishArtwork(instance);
    });
}

function mediaData(data) {
    return Object.assign({}, data, { releaseImageRoot: '', releaseImageState: 'loading' });
}

function invoke(handler, instance, args) {
    return typeof handler === 'function' ? handler.apply(instance, args) : undefined;
}

function page(definition, paths, artwork) {
    const slots = Object.keys(artwork || {});
    const lead = slots.map(slot => artwork[slot]);
    const carousel = slots.length === 1 && slots[0] === 'hero-image' && definition.data?.banners?.length > 1;

    function activeBanner(instance) {
        return Number(instance.data.bannerIndex) || 0;
    }

    function stopArtworkWatch(instance) {
        if (instance.releaseArtworkTimer == null) return;
        clearTimeout(instance.releaseArtworkTimer);
        instance.releaseArtworkTimer = null;
    }

    function failArtwork(instance, failedPaths) {
        stopArtworkWatch(instance);
        instance.releaseArtworkFailed = failedPaths;
        instance.setData({ releaseArtworkState: 'failed' });
        finishArtwork(instance);
    }

    function watchArtwork(instance) {
        if (!instance.releaseArtworkVisible || instance.releaseImagesDisposed || !instance.data.releaseLeadReady ||
            instance.data.releaseArtworkState !== 'loading' || instance.releaseArtworkTimer != null) return;
        const index = carousel ? activeBanner(instance) : 0;
        if (index > 0 && instance.data.releaseImageState !== 'ready') return;
        instance.releaseArtworkTimer = setTimeout(() => {
            instance.releaseArtworkTimer = null;
            if (!instance.releaseArtworkVisible || instance.releaseImagesDisposed || instance.data.releaseArtworkState !== 'loading') return;
            if (carousel) {
                if (activeBanner(instance) === index) recordBanner(instance, index, 'failed');
                return;
            }
            const missing = slots.filter(slot => !instance.releaseArtworkLoaded?.has(slot)).map(slot => artwork[slot]);
            if (missing.length) failArtwork(instance, missing);
        }, ARTWORK_RENDER_TIMEOUT_MS);
    }

    function syncBanner(instance) {
        const index = activeBanner(instance);
        const state = instance.releaseBannerStates?.get(index) || 'loading';
        stopArtworkWatch(instance);
        if (state === 'failed') {
            failArtwork(instance, [instance.data.banners[index]?.image]);
        } else {
            if (instance.data.releaseArtworkState !== state) instance.setData({ releaseArtworkState: state });
            if (state === 'ready') finishArtwork(instance);
            else watchArtwork(instance);
        }
    }

    function recordBanner(instance, index, state) {
        if (!instance.releaseBannerStates) instance.releaseBannerStates = new Map();
        instance.releaseBannerStates.set(index, state);
        if (index === activeBanner(instance) && instance.releaseArtworkVisible) syncBanner(instance);
    }

    function currentArtworkDataset(instance, event) {
        const dataset = event?.currentTarget?.dataset;
        if (instance.releaseImagesDisposed || instance.releaseArtworkResetting || !instance.data.releaseLeadReady ||
            dataset?.releaseEpoch == null || Number(dataset.releaseEpoch) !== instance.data.releaseArtworkEpoch) return null;
        return dataset;
    }

    function observeBanner(instance, event, state) {
        const dataset = currentArtworkDataset(instance, event);
        if (dataset?.releaseBanner == null) return;
        const index = Number(dataset.releaseBanner);
        if (Number.isInteger(index) && instance.data.banners[index]) recordBanner(instance, index, state);
    }

    function showPage(instance) {
        if (artwork) {
            instance.releaseArtworkVisible = true;
            if (carousel) syncBanner(instance);
            else watchArtwork(instance);
        }
        showImages(instance, paths, lead, watchArtwork);
    }

    const wrapped = Object.assign({}, definition, {
        data: mediaData(definition.data),
        onLoad(...args) {
            const result = invoke(definition.onLoad, this, args);
            showPage(this);
            return result;
        },
        onShow(...args) {
            const result = invoke(definition.onShow, this, args);
            showPage(this);
            return result;
        },
        onUnload(...args) {
            this.releaseImagesDisposed = true;
            stopArtworkWatch(this);
            finishArtwork(this);
            return invoke(definition.onUnload, this, args);
        },
        retryReleaseImages() { showImages(this, paths, lead); },
    });
    if (!artwork) return wrapped;

    function activeSlot(instance, event) {
        const slot = currentArtworkDataset(instance, event)?.releaseArtwork;
        return instance.data.releaseArtworkState === 'loading' && slots.includes(slot) ? slot : null;
    }

    return Object.assign(wrapped, {
        data: Object.assign(wrapped.data, { releaseLeadReady: false, releaseArtworkState: 'loading', releaseArtworkEpoch: 0 }),
        ...(carousel ? Object.fromEntries(['handleSlide', 'handleDot'].map(method => [method, function (...args) {
            const index = activeBanner(this);
            const result = invoke(definition[method], this, args);
            if (activeBanner(this) !== index) syncBanner(this);
            return result;
        }])) : {}),
        onHide(...args) {
            this.releaseArtworkVisible = false;
            stopArtworkWatch(this);
            return invoke(definition.onHide, this, args);
        },
        onReleaseArtworkLoad(event) {
            const size = event?.detail || {};
            if (!(size.width > 0 && size.height > 0)) return;
            if (carousel) { observeBanner(this, event, 'ready'); return; }
            const slot = activeSlot(this, event);
            if (!slot) return;
            if (!this.releaseArtworkLoaded) this.releaseArtworkLoaded = new Set();
            this.releaseArtworkLoaded.add(slot);
            if (this.releaseArtworkLoaded.size === slots.length) {
                stopArtworkWatch(this);
                this.setData({ releaseArtworkState: 'ready' });
                finishArtwork(this);
            }
        },
        onReleaseArtworkError(event) {
            if (carousel) { observeBanner(this, event, 'failed'); return; }
            const slot = activeSlot(this, event);
            if (!slot) return;
            failArtwork(this, [artwork[slot]]);
        },
        async retryReleaseImages() {
            if (this.releaseArtworkResetting || this.releaseImagesDisposed) return;
            if (this.data.releaseArtworkState !== 'failed') {
                showImages(this, paths, lead, watchArtwork);
                return;
            }
            this.releaseArtworkResetting = true;
            const failedPaths = new Set(this.releaseArtworkFailed);
            await this.releaseImagesPending;
            if (this.releaseImagesDisposed) return;
            const root = this.data.releaseImageRoot;
            for (const failedPath of failedPaths) {
                const failed = entryFor(failedPath);
                if (!failed) continue;
                cached.delete(failed.name);
                await fsCall('unlink', { filePath: root + '/' + failed.name }).catch(() => {});
            }
            if (this.releaseImagesDisposed) return;
            this.releaseArtworkLoaded = null;
            this.releaseArtworkFailed = null;
            this.releaseBannerStates = null;
            this.setData({ releaseArtworkState: 'loading', releaseImageState: 'loading', releaseLeadReady: false,
                releaseArtworkEpoch: this.data.releaseArtworkEpoch + 1 }, () => {
                this.releaseArtworkResetting = false;
                showImages(this, paths, lead, watchArtwork);
            });
        },
    });
}

function component(definition, paths) {
    const lifetimes = definition.lifetimes || {};
    const pageLifetimes = definition.pageLifetimes || {};
    return Object.assign({}, definition, {
        data: mediaData(definition.data),
        lifetimes: Object.assign({}, lifetimes, {
            attached(...args) {
                const result = invoke(lifetimes.attached || definition.attached, this, args);
                showImages(this, paths);
                return result;
            },
            detached(...args) {
                this.releaseImagesDisposed = true;
                return invoke(lifetimes.detached || definition.detached, this, args);
            },
        }),
        pageLifetimes: Object.assign({}, pageLifetimes, {
            show(...args) {
                const result = invoke(pageLifetimes.show, this, args);
                showImages(this, paths);
                return result;
            },
        }),
        methods: Object.assign({}, definition.methods, {
            retryReleaseImages() { showImages(this, paths); },
        }),
    });
}

module.exports = { prepare, resolve, refresh, page, component, waitForArtwork };
