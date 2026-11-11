'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const guest = require('../miniprogram/utils/guest-store');

const at = Date.parse('2026-11-10T16:00:01Z');
const prior = '2026-11-10';
const current = '2026-11-11';
const birdCode = 'HZ-HY-0000000000000000001';
const otherBird = 'HZ-HY-0000000000000000002';
const receipt = { id: 'synthetic-receipt', date: prior, birdCode, food: 1, water: 1 };

function fixture(withBird = true) {
    let saved;
    const faults = { write: '', read: false, writes: 0 };
    const storage = {
        getStorageSync(key) {
            assert.equal(key, guest.STORAGE_KEY);
            if (faults.read) throw Error('read failed');
            return structuredClone(saved);
        },
        setStorageSync(key, value) {
            assert.equal(key, guest.STORAGE_KEY);
            faults.writes += 1;
            if (faults.write === 'before') throw Error('write failed');
            saved = structuredClone(value);
            if (faults.write === 'after') throw Error('write status unknown');
        },
        removeStorageSync(key) {
            assert.equal(key, guest.STORAGE_KEY);
            saved = undefined;
        },
    };
    const store = guest.createGuestStore(storage);
    if (withBird) assert.equal(store.adopt(birdCode, '小叽', at).error, null);
    const stock = () => {
        const snapshot = store.snapshot(at).data.snapshot;
        return [snapshot.food, snapshot.water, snapshot.points];
    };
    return { store, storage, faults, stock, state: () => saved };
}

test('迟到回执按服务端日期落盘，同日及相同编号都不重复入账', () => {
    const { store, stock, state, storage } = fixture();
    assert.equal(guest.dayKey(at), current);
    const first = store.applySupplyReceipt(receipt, at);
    assert.equal(first.error, null);
    assert.deepEqual(stock(), [4, 4, 0]);
    assert.equal(first.data.snapshot.supplyClaimed, false);
    assert.deepEqual(state().supplyReceipts, { [prior]: receipt.id });
    const reopened = guest.createGuestStore(storage);
    assert.equal(reopened.supplyClaimedOn(prior, at).data.claimed, true);
    assert.equal(reopened.supplyClaimedOn(current, at).data.claimed, false);
    for (const repeat of [receipt, { ...receipt, id: 'another-receipt' }, { ...receipt, date: current }]) {
        const result = reopened.applySupplyReceipt(repeat, at);
        assert.equal(result.error, 'ALREADY_CLAIMED');
        assert.deepEqual([result.data.foodAdded, result.data.waterAdded], [0, 0]);
    }
    assert.deepEqual(stock(), [4, 4, 0]);
    assert.equal(reopened.applySupplyReceipt({ ...receipt, id: 'next-day-receipt', date: current }, at).error, null);
    assert.deepEqual(stock(), [5, 5, 0]);
});

test('拒绝不存在的小鸟、鸟码不匹配与不完整回执，且不写缓存', () => {
    const empty = fixture(false);
    assert.equal(empty.store.applySupplyReceipt(receipt, at).error, 'NO_BIRD');
    assert.equal(empty.faults.writes, 0);
    const { store, faults, stock } = fixture();
    assert.equal(store.applySupplyReceipt({ ...receipt, birdCode: otherBird }, at).error, 'SUPPLY_BIRD_MISMATCH');
    for (const invalid of [null, { ...receipt, date: '2026-02-31' }, { ...receipt, food: 0 },
        { ...receipt, water: '1' }, { ...receipt, id: '../receipt' }]) {
        assert.equal(store.applySupplyReceipt(invalid, at).error, 'INVALID_SUPPLY_RECEIPT');
    }
    assert.equal(store.supplyClaimedOn('2026-02-31', at).error, 'INVALID_SUPPLY_DATE');
    assert.equal(faults.writes, 1);
    assert.deepEqual(stock(), [3, 3, 0]);
});

test('写失败时不显示未入账库存，原回执可重试且只增加一次', () => {
    const { store, faults, stock } = fixture();
    faults.write = 'before';
    const failed = store.applySupplyReceipt(receipt, at);
    assert.equal(failed.error, 'STORAGE_UNAVAILABLE');
    assert.equal(failed.data.saved, false);
    assert.equal(failed.data.snapshot.food, 3);
    assert.equal(store.supplyClaimedOn(prior, at).data.claimed, false);
    assert.deepEqual(stock(), [3, 3, 0]);
    faults.write = '';
    assert.equal(store.applySupplyReceipt(receipt, at).error, null);
    assert.equal(store.applySupplyReceipt(receipt, at).error, 'ALREADY_CLAIMED');
    assert.deepEqual(stock(), [4, 4, 0]);
});

test('写入状态异常但确认库存和回执均已保存时恢复原结果', () => {
    const { store, faults, stock } = fixture();
    faults.write = 'after';
    assert.equal(store.applySupplyReceipt(receipt, at).error, null);
    const writes = faults.writes;
    assert.equal(store.applySupplyReceipt(receipt, at).error, 'ALREADY_CLAIMED');
    assert.equal(faults.writes, writes);
    assert.deepEqual(stock(), [4, 4, 0]);
});

test('库存都满时回执留待重试，单项有空间时只补该项', () => {
    const { store, state, faults, stock } = fixture();
    state().care.food = guest.SUPPLY_CAP;
    state().care.water = guest.SUPPLY_CAP;
    assert.equal(store.applySupplyReceipt(receipt, at).error, 'STOCK_FULL');
    assert.equal(store.supplyClaimedOn(prior, at).data.claimed, false);
    assert.equal(faults.writes, 1);
    assert.equal(store.water(at).error, null);
    const granted = store.applySupplyReceipt(receipt, at);
    assert.equal(granted.error, null);
    assert.deepEqual([granted.data.foodAdded, granted.data.waterAdded], [0, 1]);
    assert.deepEqual(stock(), [guest.SUPPLY_CAP, guest.SUPPLY_CAP, 0]);
});

test('测试补给和真实回执共用同日门禁，较早的回执不会被日期修剪丢失', () => {
    const { store, stock } = fixture();
    assert.equal(store.applySupplyReceipt(receipt, at).error, null);
    assert.equal(store.supply(at).error, null);
    assert.equal(store.applySupplyReceipt({ ...receipt, id: 'same-day-live', date: current }, at).error, 'ALREADY_CLAIMED');
    const dayMs = 24 * 60 * 60 * 1000;
    for (let day = 1; day <= 62; day += 1) assert.equal(store.supply(at + day * dayMs).error, null);
    const before = stock();
    const later = at + 62 * dayMs;
    assert.equal(store.supplyClaimedOn(prior, later).data.claimed, true);
    assert.equal(store.applySupplyReceipt(receipt, later).error, 'ALREADY_CLAIMED');
    assert.deepEqual(stock(), before);
});

test('安装 ID 仅在有鸟且持久化确认后返回，重复读取不写入，清除后可重建', () => {
    const { store, faults } = fixture(false);
    const first = '0123456789abcdef0123456789abcdef';
    const second = 'fedcba9876543210fedcba9876543210';
    assert.deepEqual(store.supplyInstallationId(undefined, at), { data: { id: '' }, error: null });
    assert.equal(store.supplyInstallationId(first, at).error, 'NO_BIRD');
    assert.equal(faults.writes, 0);
    assert.equal(store.adopt(birdCode, '小叽', at).error, null);
    assert.equal(store.supplyInstallationId(first.toUpperCase(), at).error, 'INVALID_INSTALLATION_ID');
    faults.write = 'before';
    assert.deepEqual(store.supplyInstallationId(first, at), { data: { id: '' }, error: 'STORAGE_UNAVAILABLE' });
    faults.write = 'after';
    assert.deepEqual(store.supplyInstallationId(first, at), { data: { id: first }, error: null });
    const writes = faults.writes;
    assert.equal(store.supplyInstallationId(second, at).data.id, first);
    assert.equal(faults.writes, writes);
    faults.read = true;
    assert.equal(store.supplyInstallationId(undefined, at).error, 'STORAGE_UNAVAILABLE');
    assert.equal(store.supplyClaimedOn(current, at).error, 'STORAGE_UNAVAILABLE');
    faults.read = false;
    faults.write = '';
    assert.equal(store.reset(at).error, null);
    assert.equal(store.supplyInstallationId(undefined, at).data.id, '');
    assert.equal(store.adopt(birdCode, '小叽', at).error, null);
    assert.equal(store.supplyInstallationId(second, at).data.id, second);
});
