'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const album = require('../miniprogram/utils/photo-album');
const guest = require('../miniprogram/utils/guest-store');
const cart = require('../miniprogram/utils/cart-storage');

const now = Date.now();
const birdCode = 'SYNTHETIC_TEST_BIRD';
const requestId = 'photo-storage-fixture';
const work = '/mock/photo/work-' + requestId + '.jpg';
const original = '/mock/photo/orig-' + requestId + '.bin';

function fixture({ recursive = false } = {}) {
    album.clearDraft();
    const values = new Map();
    const files = new Set(['/tmp/work', '/tmp/original']);
    const faults = { read: null, write: null, unlink: null, rmdir: false, albumWriteAt: 0, albumWrites: 0 };
    const notices = [];
    global.wx = {
        env: { USER_DATA_PATH: '/mock' },
        getStorageSync(key) {
            if (faults.read === key) throw new Error('read denied');
            return structuredClone(values.get(key));
        },
        setStorageSync(key, value) {
            if (key === album.KEY) faults.albumWrites += 1;
            if (faults.write === key || (key === album.KEY && faults.albumWrites === faults.albumWriteAt)) throw new Error('quota exceeded');
            values.set(key, structuredClone(value));
        },
        removeStorageSync(key) { values.delete(key); },
        getFileSystemManager() {
            const fs = {
                accessSync(path) { if (!files.has(path)) throw new Error('ENOENT'); },
                mkdirSync(path) { files.add(path); },
                copyFileSync(source, target) {
                    if (!files.has(source)) throw new Error('ENOENT');
                    files.add(target);
                },
                unlinkSync(path) {
                    if (faults.unlink === path) throw new Error('permission denied');
                    if (!files.delete(path)) throw new Error('ENOENT');
                },
            };
            if (recursive) {
                fs.rmdirSync = function (path, withChildren) {
                    assert.equal(path, '/mock/photo');
                    assert.equal(withChildren, true);
                    if (faults.rmdir) throw new Error('permission denied');
                    if (!files.has(path)) throw new Error('ENOENT');
                    for (const file of files) {
                        if (file === path || file.startsWith(path + '/')) files.delete(file);
                    }
                };
            }
            return fs;
        },
        showToast(options) { notices.push(options.title); },
    };
    const store = guest.createGuestStore(wx);
    assert.equal(store.adopt(birdCode, '测试鸟', now).error, null);
    const payload = { id: requestId, imagePath: '/tmp/work', originalPath: '/tmp/original', birdIds: [birdCode], digest: 'original-hash', outputHash: 'output-hash', createdAt: now };
    return { values, files, faults, store, payload, notices };
}

function pageFrom(modulePath) {
    let definition;
    global.Page = (value) => { definition = value; };
    delete require.cache[require.resolve(modulePath)];
    require(modulePath);
    return Object.assign({}, definition, {
        data: structuredClone(definition.data),
        setData(patch) { Object.assign(this.data, patch); },
    });
}

test('读取养成缓存失败时，读取和操作都返回错误并保留原数据', () => {
    const { values, faults, store } = fixture();
    const originalState = structuredClone(values.get(guest.STORAGE_KEY));
    faults.read = guest.STORAGE_KEY;
    for (const result of [store.snapshot(now), store.feed(now), store.adopt('OTHER_TEST', '另一只', now)]) {
        assert.equal(result.error, 'STORAGE_UNAVAILABLE');
        assert.equal(result.data.saved, false);
    }
    faults.read = null;
    assert.deepEqual(values.get(guest.STORAGE_KEY), originalState);
});

test('不识别的养成缓存结构或版本不会被新的养成操作覆盖', () => {
    const { values, store } = fixture();
    for (const raw of ['corrupt', [], { version: 2, points: 7 }]) {
        values.set(guest.STORAGE_KEY, raw);
        assert.equal(store.snapshot(now).error, 'STORAGE_UNAVAILABLE');
        assert.equal(store.feed(now).error, 'STORAGE_UNAVAILABLE');
        assert.deepEqual(values.get(guest.STORAGE_KEY), raw);
    }
});

test('保存相册索引失败时先保持零叽分，原样重试只保存和发分一次', async () => {
    const { files, faults, store, payload } = fixture();
    faults.albumWriteAt = 2;
    assert.equal((await album.create(payload, store)).error, 'STORAGE_UNAVAILABLE');
    assert.equal(store.snapshot(now).data.snapshot.points, 0);
    assert.equal(album.history().total, 0);
    assert.equal(files.has(work), true);
    assert.equal((await album.create(payload, store)).reward, 1);
    assert.equal((await album.create(payload, store)).replayed, true);
    assert.equal(album.history().total, 1);
    assert.equal(store.snapshot(now).data.snapshot.points, 1);
});

test('叽分已写入但最终索引失败时，重新打开相册可恢复结果且不重复发分', async () => {
    const { faults, store, payload } = fixture();
    faults.albumWriteAt = 3;
    assert.equal((await album.create(payload, store)).error, 'STORAGE_UNAVAILABLE');
    assert.equal(store.snapshot(now).data.snapshot.points, 1);
    assert.equal(album.recoverPending(store).error, null);
    assert.equal(album.detail(requestId).reward, 1);
    assert.equal(store.snapshot(now).data.snapshot.points, 1);
});

test('缺少文件的待恢复作品不会阻断后续作品恢复或得到叽分', async () => {
    const { values, files, faults, store, payload } = fixture();
    faults.write = guest.STORAGE_KEY;
    assert.equal((await album.create(payload, store)).error, 'STORAGE_UNAVAILABLE');
    files.delete(work);
    faults.write = null;
    faults.albumWriteAt = faults.albumWrites + 3;
    const healthy = { ...payload, id: 'photo-storage-fixture-two', digest: 'original-hash-two' };
    assert.equal((await album.create(healthy, store)).error, 'STORAGE_UNAVAILABLE');
    assert.equal(album.recoverPending(store).error, 'STORAGE_UNAVAILABLE');
    assert.equal(values.get(album.KEY).find((row) => row.id === healthy.id).stage, undefined);
    assert.equal(album.detail(healthy.id).reward, 1);
    assert.equal(store.snapshot(now).data.snapshot.points, 1);
});

test('未提交的文件保留给当前草稿重试，草稿丢弃后释放相册容量', async () => {
    const { values, files, faults, store, payload } = fixture();
    faults.albumWriteAt = 2;
    assert.equal((await album.create(payload, store)).error, 'STORAGE_UNAVAILABLE');
    album.saveDraft({ pendingSubmission: { id: requestId } });
    assert.equal(album.recoverPending(store).error, null);
    assert.equal(files.has(original), true);
    album.clearDraft();
    assert.equal(album.recoverPending(store).error, null);
    assert.equal(files.has(original), false);
    assert.equal(files.has(work), false);
    assert.equal(values.get(album.KEY).length, 0);
    assert.equal(store.snapshot(now).data.snapshot.points, 0);
});

test('相册读取失败时保护旧索引，旧合照删除失败后可继续清除原图', async () => {
    const { values, files, faults, store, payload } = fixture();
    assert.equal((await album.create(payload, store)).error, null);
    const oldRows = structuredClone(values.get(album.KEY));
    faults.read = album.KEY;
    assert.equal(album.history().error, 'STORAGE_UNAVAILABLE');
    assert.equal((await album.create(payload, store)).error, 'STORAGE_UNAVAILABLE');
    assert.equal(album.clear(), false);
    faults.read = null;
    assert.deepEqual(values.get(album.KEY), oldRows);
    faults.unlink = original;
    assert.equal(album.remove(requestId).error, 'STORAGE_UNAVAILABLE');
    assert.equal(album.history().total, 1);
    assert.equal(files.has(original), true);
    assert.equal(files.has(work), false);
    faults.unlink = null;
    assert.equal(album.remove(requestId).deleted, true);
    assert.equal(files.has(original), false);
    assert.equal(album.history().total, 0);
});

test('我的清除失败时保留重试入口，成功后已打开的商城重读空购物车', async () => {
    const { files, faults, store, payload, notices } = fixture();
    assert.equal((await album.create(payload, store)).error, null);
    assert.equal(cart.write(['hangzhou-xihu']), true);
    const shop = pageFrom('../miniprogram/pages/shop/shop');
    shop.onLoad();
    assert.equal(shop.data.cartCount, 1);
    const profile = pageFrom('../miniprogram/pages/profile/profile');
    profile.onReset();
    faults.unlink = original;
    profile.confirmReset();
    assert.equal(notices.at(-1), '清除未完成，请重试');
    assert.equal(profile.data.resetVisible, true);
    assert.equal(album.history().total, 1);
    assert.equal(files.has(original), true);
    assert.equal(store.snapshot(now).data.snapshot.hasBird, true);
    faults.unlink = null;
    profile.confirmReset();
    assert.equal(notices.at(-1), '已清除');
    assert.equal(files.has(original), false);
    assert.equal(album.history().total, 0);
    assert.equal(store.snapshot(now).data.snapshot.hasBird, false);
    shop.onShow();
    assert.equal(shop.data.cartCount, 0);
    assert.equal(cart.read(), undefined);
});

test('重置损坏的相册索引并清理无索引旧照片，只删除相册目录', () => {
    const { values, files, faults } = fixture({ recursive: true });
    const malformedIndex = { invalid: true };
    values.set(album.KEY, malformedIndex);
    files.add('/mock/photo');
    files.add('/mock/photo/orphan.bin');
    files.add('/mock/another-feature.bin');
    faults.rmdir = true;
    assert.equal(album.clear(), false);
    assert.deepEqual(values.get(album.KEY), malformedIndex);
    faults.rmdir = false;
    assert.equal(album.clear(), true);
    assert.equal(values.has(album.KEY), false);
    assert.equal(files.has('/mock/photo/orphan.bin'), false);
    assert.equal(files.has('/mock/another-feature.bin'), true);
    assert.equal(album.clear(), true);
});
