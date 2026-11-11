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
    const faults = { read: null, write: null, remove: null, unlink: null, rmdir: false, albumWriteAt: 0, albumWrites: 0 };
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
        removeStorageSync(key) {
            if (faults.remove === key) throw new Error('storage remove denied');
            values.delete(key);
        },
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
                    if (faults.rmdir === 'partial') files.delete(work);
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

test('超过 60 个历史日期后仍限制同一天补给和合照奖励次数', () => {
    const { store } = fixture();
    const dayMs = 24 * 60 * 60 * 1000;
    for (let day = 0; day < 60; day += 1) {
        const at = now + day * dayMs;
        assert.equal(store.supply(at).error, null);
        assert.equal(store.photoReward('earlier-' + day, 'earlier-hash-' + day, at).data.reward, 1);
    }
    const at = now + 60 * dayMs;
    const firstSupply = store.supply(at);
    assert.equal(firstSupply.error, null);
    assert.equal(store.snapshot(at).data.snapshot.supplyClaimed, true);
    const repeatSupply = store.supply(at);
    assert.equal(repeatSupply.error, 'ALREADY_CLAIMED');
    assert.equal(repeatSupply.data.snapshot.food, firstSupply.data.snapshot.food);
    assert.equal(repeatSupply.data.snapshot.water, firstSupply.data.snapshot.water);

    for (let i = 0; i < 4; i += 1) {
        assert.equal(store.photoReward('recent-' + i, 'recent-hash-' + i, at).data.reward, i < 3 ? 1 : 0);
    }
    assert.equal(store.snapshot(at).data.snapshot.todayPhotos, 3);
});

test('相册累计超过 400 次时仍记得新作品的请求和原图防重记录', () => {
    const { values, store } = fixture();
    const history = values.get(guest.STORAGE_KEY);
    for (let i = 0; i < 400; i += 1) {
        history.photoHashes.push('history-hash-' + i);
        history.photoRequests['photo:history-' + i] = { reward: 1 };
    }
    values.set(guest.STORAGE_KEY, history);
    assert.equal(store.photoReward('new-work', 'new-original', now).data.reward, 1);
    const replay = store.photoReward('new-work', 'new-original', now);
    assert.equal(replay.data.reward, 1);
    assert.equal(replay.data.replayed, true);
    assert.equal(store.photoReward('same-original', 'new-original', now).data.reward, 0);
    assert.equal(store.snapshot(now).data.snapshot.points, 1);
});

test('库存已满不占当日补给，单项有空间时只增加该项', () => {
    const { values, store } = fixture();
    const state = values.get(guest.STORAGE_KEY);
    state.care.food = 99;
    state.care.water = 99;
    values.set(guest.STORAGE_KEY, state);
    const full = store.supply(now);
    assert.equal(full.data.foodAdded, 0);
    assert.equal(full.data.waterAdded, 0);
    assert.equal(full.data.snapshot.supplyClaimed, false);
    assert.equal(store.feed(now).error, null);
    const refill = store.supply(now);
    assert.equal(refill.data.foodAdded, 1);
    assert.equal(refill.data.waterAdded, 0);
    assert.equal(refill.data.snapshot.supplyClaimed, true);
});

test('钱包先验证领养和每日记录，微信运动权限设置仅响应明确点按', async () => {
    fixture();
    const page = pageFrom('../miniprogram/pages/index/index');
    const store = require('../miniprogram/utils/store');
    const originalRedeem = store.redeemSteps;
    let redeemCalls = 0;
    let settingCalls = 0;
    store.redeemSteps = async () => { redeemCalls += 1; return { error: 'WERUN_DENIED' }; };
    wx.openSetting = (options) => {
        settingCalls += 1;
        options.success({ authSetting: { 'scope.werun': true } });
    };
    page.showToast = () => {};
    try {
        await page.onRedeemSteps();
        assert.equal(page.data.sheet.type, 'claim');
        page.setData({ hasBird: true, todayStepClaimed: true });
        await page.onRedeemSteps();
        assert.equal(redeemCalls, 0);
        page.setData({ todayStepClaimed: false });
        await page.onRedeemSteps();
        assert.equal(redeemCalls, 1);
        assert.equal(settingCalls, 0);
        assert.equal(page.data.werunNeedsSetting, true);
        page.onOpenWeRunSettings();
        assert.equal(settingCalls, 1);
        assert.equal(page.data.werunNeedsSetting, false);
        assert.equal(redeemCalls, 1);
    } finally {
        store.redeemSteps = originalRedeem;
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
    assert.equal(files.has(work), true);
    faults.unlink = null;
    assert.equal(album.remove(requestId).deleted, true);
    assert.equal(files.has(original), false);
    assert.equal(album.history().total, 0);
});

test('未能记录删除操作时保留合照、原图和索引', async () => {
    const { values, files, faults, store, payload } = fixture();
    assert.equal((await album.create(payload, store)).reward, 1);
    const before = structuredClone(values.get(album.KEY));
    faults.albumWriteAt = faults.albumWrites + 1;
    assert.equal(album.remove(requestId).error, 'STORAGE_UNAVAILABLE');
    assert.deepEqual(values.get(album.KEY), before);
    assert.equal(files.has(original), true);
    assert.equal(files.has(work), true);
    assert.equal(album.history().total, 1);
    assert.equal(store.snapshot(now).data.snapshot.points, 1);
});

test('文件删除后索引写入失败时隐藏失效合照，重开清理且不影响其他作品与叽分', async () => {
    const { values, files, faults, store, payload } = fixture();
    const other = { ...payload, id: 'photo-storage-other-work', digest: 'another-original' };
    assert.equal((await album.create(payload, store)).reward, 1);
    const kept = (await album.create(other, store)).item;
    const before = store.snapshot(now).data.snapshot.points;
    album.saveDraft({ pendingSubmission: { id: requestId } });
    faults.write = album.KEY;
    assert.equal(album.remove(requestId).error, 'STORAGE_UNAVAILABLE');
    assert.equal(album.readDraft().pendingSubmission.id, requestId);
    faults.write = null;
    faults.albumWriteAt = faults.albumWrites + 2;

    const failed = album.remove(requestId);
    assert.equal(failed.error, 'STORAGE_UNAVAILABLE');
    assert.equal(failed.workDeleted, true);
    assert.equal(values.get(album.KEY).find(row => row.id === requestId).stage, 'delete-pending');
    assert.equal(album.readDraft().pendingSubmission, null);
    assert.equal(files.has(work), false);
    assert.equal(files.has(original), false);
    assert.equal(files.has(kept.image), true);
    assert.equal(files.has(kept.original), true);
    assert.deepEqual(album.history().items.map(item => item.id), [other.id]);
    assert.equal(album.detail(requestId), null);
    assert.equal((await album.create(payload, store)).error, 'DELETE_PENDING');

    assert.equal(album.recoverPending(store).error, null);
    assert.equal(album.recoverPending(store).error, null);
    assert.deepEqual(values.get(album.KEY).map(row => row.id), [other.id]);
    assert.equal(store.snapshot(now).data.snapshot.points, before);
    assert.equal((await album.create({ ...payload, id: 'photo-storage-same-original' }, store)).reward, 0);
    assert.equal(store.snapshot(now).data.snapshot.points, before);
});

test('合照删除到文件阶段后写索引失败，界面移除失效卡片并保留重试入口', async () => {
    const { faults, files, store, payload } = fixture();
    assert.equal((await album.create(payload, store)).error, null);
    const page = pageFrom('../miniprogram/pages/photo/photo');
    page.onLoad();
    assert.equal(page.data.albumTotal, 1);
    page.pendingSubmission = { id: requestId };
    page.saveDraft();
    page.onDeleteTap({ currentTarget: { dataset: { id: requestId } } });
    assert.equal(page.data.deletePending, false);
    faults.albumWriteAt = faults.albumWrites + 2;
    page.onConfirmDelete();
    assert.equal(files.has(work), false);
    assert.equal(page.data.albumTotal, 0);
    assert.equal(page.data.deleteConfirm, true);
    assert.equal(page.data.deletePending, true);
    assert.match(page.data.deleteStatus, /重试/);
    assert.match(page.data.albumError, /重试/);
    assert.equal(page.pendingSubmission, null);
    assert.equal(album.readDraft().pendingSubmission, null);

    page.onCancelDelete();
    assert.equal(page.data.deletePending, false);
    page.onRetryAlbum();
    assert.equal(page.data.albumError, '');
    assert.equal(page.data.albumTotal, 0);
    assert.equal(page.data.deleteConfirm, false);
    assert.equal(store.snapshot(now).data.snapshot.points, 1);
});

test('原图指纹读取失败时仍可收藏，合照不发叽分', async () => {
    const { store, payload } = fixture();
    const digest = await album.digestOf(payload.originalPath);
    assert.equal(digest, '');
    const result = await album.create({ ...payload, digest }, store);
    assert.equal(result.error, null);
    assert.equal(result.reward, 0);
    assert.equal(album.history().total, 1);
    assert.equal(store.snapshot(now).data.snapshot.points, 0);
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

test('重置时先保护相册，索引清理失败不显示坏卡且可以重试', async () => {
    const { values, files, faults, store, payload, notices } = fixture({ recursive: true });
    assert.equal((await album.create(payload, store)).error, null);
    album.saveDraft({ pendingSubmission: { id: requestId } });
    assert.equal(cart.write(['hangzhou-xihu']), true);
    files.add('/mock/photo/orphan.bin');
    files.add('/mock/another-feature.bin');
    const profile = pageFrom('../miniprogram/pages/profile/profile');
    profile.onReset();

    for (const blocked of ['read', 'write']) {
        faults[blocked] = album.KEY;
        profile.confirmReset();
        faults[blocked] = null;
        assert.equal(notices.at(-1), '清除未完成，请重试');
        assert.equal(files.has(work), true);
        assert.equal(files.has(original), true);
        assert.equal(album.history().total, 1);
        assert.equal(album.readDraft().pendingSubmission.id, requestId);
    }

    faults.rmdir = 'partial';
    profile.confirmReset();
    assert.equal(notices.at(-1), '清除未完成，请重试');
    assert.equal(files.has(work), false);
    assert.equal(files.has(original), true);
    assert.equal(album.history().total, 0);
    assert.equal(album.detail(requestId), null);
    assert.equal(store.snapshot(now).data.snapshot.hasBird, true);
    assert.deepEqual(cart.read(), ['hangzhou-xihu']);

    faults.rmdir = false;
    faults.remove = album.KEY;
    profile.confirmReset();
    assert.equal(notices.at(-1), '清除未完成，请重试');
    assert.equal(profile.data.resetVisible, true);
    assert.equal(files.has(work), false);
    assert.equal(files.has(original), false);
    assert.equal(files.has('/mock/photo/orphan.bin'), false);
    assert.equal(files.has('/mock/another-feature.bin'), true);
    assert.equal(album.history().total, 0);
    assert.equal(album.detail(requestId), null);
    assert.equal(album.readDraft(), null);
    assert.equal(store.snapshot(now).data.snapshot.hasBird, true);
    assert.deepEqual(cart.read(), ['hangzhou-xihu']);

    faults.remove = null;
    faults.write = album.KEY;
    profile.confirmReset();
    assert.equal(notices.at(-1), '已清除');
    assert.equal(profile.data.resetVisible, false);
    assert.equal(values.has(album.KEY), false);
    assert.equal(store.snapshot(now).data.snapshot.hasBird, false);
    assert.equal(cart.read(), undefined);
    assert.equal(files.has('/mock/another-feature.bin'), true);
});
