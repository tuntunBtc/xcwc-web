'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCloudStore, SESSION_KEY, compare } = require('../miniprogram/utils/cloud-store');
const { platform } = require('./cloud-platform.cjs');
const A = 'a'.repeat(32), B = 'b'.repeat(32), P = '1'.repeat(32), Q = '2'.repeat(32);
const copy = value => structuredClone(value);
function fixture(config = {}) {
    let identity = A, count = 0;
    const records = new Map(), users = new Map();
    function user(id) { if (!users.has(id)) users.set(id, { pets: [], wallet: { balance: 0, accountVersion: '0' } }); return users.get(id); }
    const response = (data, statusCode = 200) => ({ statusCode, data: copy(data) });
    const transport = async opts => {
        const path = new URL(opts.url).pathname;
        if (path === '/bird/v1/auth/wx-login') return response({ token: identity.repeat(2), userId: identity, expiresAt: '2099-01-01T00:00:00Z' });
        if (path === '/bird/v1/auth/logout') return response(null, 204);
        const id = (opts.header.Authorization || '').slice(7, 39), u = user(id);
        if (path === '/bird/v1/auth/session') return response({ userId: id, expiresAt: '2099-01-01T00:00:00Z' });
        if (path === '/bird/v1/me/pets') return response({ userId: id, items: u.pets, wallet: u.wallet, serverTime: new Date().toISOString() });
        if (path.includes('/operations/')) return records.has(id + path.split('/').pop()) ? response(Object.assign({}, records.get(id + path.split('/').pop()), { replayed: true })) : response({ code: 'OPERATION_NOT_FOUND' }, 404);
        if (path.endsWith('/ledger') || path.endsWith('inventory-ledger') || path.endsWith('/supply-claims')) return response([]);
        if (path === '/bird/v1/me/points') return response({ balance: u.wallet.balance, earnedToday: 0, dailyLimit: 10 });
        if (opts.method === 'GET') { const p = u.pets.find(p => p.petId === path.split('/').pop()); return p ? response({ pet: p, wallet: u.wallet }) : response({ code: 'PET_NOT_FOUND' }, 404); }
        const b = opts.data, k = id + b.requestId;
        if (records.has(k)) return response(Object.assign({}, records.get(k), { replayed: true }));
        let p;
        if (path.endsWith('/adopt')) {
            const serverTime = '2026-11-11T01:00:00.000Z';
            p = { petId: b.birdId, birdId: b.birdId, birdCode: 'HZ-HY-' + (++count), nickname: b.nickname, active: true, version: '0', ruleVersion: 'normal-v1', serverTime, businessDate: '2026-11-11', care: { satiety: 60, hydration: 60, mood: 80, lastCompanionAt: serverTime }, inventory: { food: 3, water: 3 }, cleaning: { status: 'NONE', type: 'POOP', dueAt: null }, supplyClaimed: false };
            u.pets.push(p);
        } else {
            p = u.pets.find(p => p.petId === path.split('/')[5]);
            if (p.version !== b.expectedVersion) return response({ code: 'PET_VERSION_CONFLICT' }, 409);
            if (b.action === 'FEED') { p.inventory.food--; p.care.satiety = Math.min(100, p.care.satiety + 30); }
            if (b.action === 'RENAME') p.nickname = b.nickname;
            p.version = String(Number(p.version) + 1);
        }
        u.wallet.accountVersion = String(Number(u.wallet.accountVersion) + 1);
        const summary = path.endsWith('/adopt') ? { created: true } : { changed: true, reward: 0 };
        const result = { requestId: b.requestId, pet: p, wallet: u.wallet, replayed: false, ...summary, outcome: 'SUCCEEDED' };
        records.set(k, copy(result)); return response(result);
    };
    let intercept;
    const wx = platform(opts => intercept ? intercept(opts, transport) : transport(opts));
    const store = createCloudStore(wx, { API_BASE: 'http://test.invalid/bird/v1', ...config });
    return { store, wx, user, records, transport, setIdentity: id => identity = id, intercept: fn => intercept = fn };
}
async function ready(f, birds = [P]) { assert.equal((await f.store.loginWithWechat()).error, null); for (const bird of birds) assert.equal((await f.store.adopt(bird, '小叽')).error, null); }
const snap = s => s.snapshot().data.snapshot;
test('旧测试库已提交的领养仅凭同一请求的查询回执恢复，正式环境仍校验 created', async () => {
    for (const sandbox of [true, false]) {
        const f = fixture({ DEVICE_SANDBOX_TEST: sandbox });
        await ready(f, []);
        f.intercept(async (o, next) => {
            const result = await next(o);
            if (o.url.endsWith('/adopt') || o.url.includes('/operations/')) delete result.data.created;
            return result;
        });
        const receipt = await f.store.adopt(P, '测试鸟');
        if (sandbox) {
            const recovered = receipt.error ? await f.store.resume() : receipt;
            assert.equal(recovered.error, null);
            assert.equal(snap(f.store).pets.length, 1);
        } else {
            assert.equal(receipt.error, 'RESULT_PENDING');
            assert(f.store.status().pending);
        }
        assert.equal(f.wx.calls.filter(c => c.path.endsWith('/adopt')).length, 1);
    }
});
test('login restores without birdCode; old guest data survives; multiple pets isolate actions and cache', async () => {
    const f = fixture(); f.wx.memory.set('xcwc.mp.guest.v1', { points: 99999 });
    await ready(f, [P, Q]); await f.store.selectPet(P); await f.store.rename('一号'); await f.store.feed();
    assert.equal(snap(f.store).food, 2); await f.store.selectPet(Q); assert.equal(snap(f.store).food, 3);
    assert.equal(snap(f.store).nickname, '小叽'); assert.deepEqual(f.wx.memory.get('xcwc.mp.guest.v1'), { points: 99999 });
    assert(f.wx.calls.filter(c => c.path.includes('/me/')).every(c => c.header.Authorization === 'Bearer ' + A.repeat(2)));
});
test('手账请求沿用云端会话，不能读取不在当前账号列表的小鸟', async () => {
    const f = fixture();
    await ready(f);
    const today = '2026-11-27';
    const diaryPath = '/bird/v1/me/pets/' + P + '/diary';
    f.intercept((options, next) => options.url.includes('/diary')
        ? { statusCode: 200, data: { today, days: [] } }
        : next(options));
    assert.equal((await f.store.diaryCalendar(Q, today, today)).error, 'PET_NOT_FOUND');
    assert.equal((await f.store.diaryDay(P, '2026-11-31')).error, 'INVALID_INPUT');
    assert.deepEqual((await f.store.diaryCalendar(P, today, today)).data, { today, days: [] });
    const [calendar] = f.wx.calls.filter(call => call.path.startsWith(diaryPath));
    assert.equal(calendar.path, diaryPath);
    assert.equal(calendar.header.Authorization, 'Bearer ' + A.repeat(2));
});
test('lost commit response queries receipt, no second settlement, zero reward still succeeds', async () => {
    const f = fixture(); await ready(f); let lost = true;
    f.intercept(async (o, next) => { const r = await next(o); if (lost && o.url.endsWith('/actions')) { lost = false; throw Error('lost'); } return r; });
    const result = await f.store.feed(); assert.equal(result.error, null); assert.equal(result.data.replayed, true); assert.equal(snap(f.store).food, 2);
    assert.equal(f.wx.calls.filter(c => c.path.endsWith('/actions')).length, 1);
    assert.equal((await f.store.pet()).data.granted, 0);
});
test('404 receipt does not mean failure; retry uses exact original body/id', async () => {
    const f = fixture(); await ready(f); let fail = true;
    f.intercept(async (o, next) => { if (o.url.endsWith('/actions') && fail) { fail = false; throw Error('before server'); } return next(o); });
    assert.equal((await f.store.feed()).error, null);
    const writes = f.wx.calls.filter(c => c.path.endsWith('/actions')); assert.equal(writes.length, 2); assert.deepEqual(writes[0].data, writes[1].data);
});
test('unconfirmed operation survives process restart; blocks new mutations and cache clear', async () => {
    const f = fixture(); await ready(f); f.intercept(async () => { throw Error('offline'); });
    assert.equal((await f.store.feed()).error, 'RESULT_PENDING'); assert.equal(f.store.reset().error, 'RESULT_PENDING');
    assert.equal((await f.store.water()).error, 'RESULT_PENDING');
    const wx2 = platform(f.transport, f.wx.memory), s2 = createCloudStore(wx2, { API_BASE: 'http://test.invalid/bird/v1' });
    assert.equal((await s2.resume()).error, null); assert.equal(snap(s2).food, 2);
    assert.deepEqual(wx2.calls.find(c => c.path.endsWith('/actions')).data, f.wx.calls.find(c => c.path.endsWith('/actions')).data);
});
test('version conflict refreshes only; requires fresh user action', async () => {
    const f = fixture(); await ready(f); f.user(A).pets[0].version = '9'; f.user(A).pets[0].nickname = '另一设备';
    assert.equal((await f.store.feed()).error, 'PET_VERSION_CONFLICT'); assert.equal(snap(f.store).nickname, '另一设备');
    assert.equal(f.wx.calls.filter(c => c.path.endsWith('/actions')).length, 1);
    assert.equal((await f.store.feed()).error, null); assert.equal(snap(f.store).food, 2);
});
test('switching pets discards old operation callbacks; recover targets original pet', async () => {
    const f = fixture(); await ready(f, [P, Q]); await f.store.selectPet(P);
    let release, reached; const reachedPromise = new Promise(r => reached = r);
    f.intercept(async (o, next) => { const result = await next(o); if (o.url.endsWith('/actions')) { reached(); await new Promise(r => release = r); } return result; });
    const job = f.store.feed(); await reachedPromise; await f.store.selectPet(Q); release();
    assert.equal((await job).error, 'CONTEXT_CHANGED'); assert.equal(snap(f.store).petId, Q); assert.equal(snap(f.store).food, 3);
    f.intercept(null); await f.store.recover(); assert.equal(snap(f.store).petId, Q); await f.store.selectPet(P); assert.equal(snap(f.store).food, 2);
});
test('logout/account change rejects late reads, pending login and personal cache pollution', async () => {
    const f = fixture(); await ready(f); let release, reached; const seen = new Promise(r => reached = r);
    f.intercept(async (o, next) => { const result = await next(o); if (o.url.endsWith('/me/pets')) { reached(); await new Promise(r => release = r); } return result; });
    const read = f.store.refresh(); await seen; await f.store.logoutWechat(); f.setIdentity(B); f.intercept(null); await f.store.loginWithWechat(); release();
    assert.equal((await read).error, 'CONTEXT_CHANGED'); assert.equal(snap(f.store).userId, B); assert.equal(snap(f.store).pets.length, 0);
    await f.store.logoutWechat(); f.setIdentity(A); await f.store.loginWithWechat(); assert.equal(snap(f.store).pets.length, 1);
});
test('offline/reload is read only; clearing cloud cache restores server state and never rewards photos', async () => {
    const f = fixture(); await ready(f); f.store.setOnline(false); assert.equal((await f.store.feed()).error, 'OFFLINE'); assert.equal(snap(f.store).food, 3);
    assert.equal(f.store.photoReward().data.reward, 0); f.store.setOnline(true); assert.equal((await f.store.feed()).error, 'REFRESH_REQUIRED');
    await f.store.resume(); assert.equal(f.store.reset().error, null); assert.equal(snap(f.store).hasBird, false); await f.store.resume(); assert.equal(snap(f.store).food, 3);
});
test('429 retains original operation and observes Retry-After without immediate new request', async () => {
    const f = fixture(); await ready(f); f.intercept(async (o, next) => o.url.endsWith('/actions') ? { statusCode: 429, data: { code: 'RATE_LIMITED' }, header: { 'Retry-After': '60' } } : next(o));
    assert.equal((await f.store.feed()).error, 'RESULT_PENDING'); const count = f.wx.calls.length;
    assert.equal((await f.store.recover()).error, 'RESULT_PENDING'); assert.equal(f.wx.calls.length, count); assert(f.store.status().retryAt > Date.now());
});
test('large version strings compare exactly; replay never regresses wallet', async () => {
    assert.equal(compare('9007199254740993', '9007199254740992'), 1);
    const f = fixture(); await ready(f); f.user(A).wallet.accountVersion = '9007199254740993'; f.user(A).wallet.balance = 999;
    await f.store.refresh(); assert.equal(snap(f.store).points, 999);
});
test('legacy token acquires userId via authenticated session before restore', async () => {
    const f = fixture(); f.wx.memory.set('auth_token', A.repeat(2));
    assert.equal((await f.store.loginWithWechat()).error, null);
    assert.equal(f.wx.calls[0].path, '/bird/v1/auth/session'); assert.equal(f.wx.calls[0].header.Authorization, 'Bearer ' + A.repeat(2));
    assert.equal(snap(f.store).userId, A);
});
test('late login after logout cannot restore previous identity', async () => {
    const f = fixture(); let release, reached; const seen = new Promise(r => reached = r);
    f.intercept(async (o, next) => { const result = await next(o); if (o.url.endsWith('/wx-login')) { reached(); await new Promise(r => release = r); } return result; });
    const login = f.store.loginWithWechat(); await seen; await f.store.logoutWechat(); release();
    assert.equal((await login).error, 'CONTEXT_CHANGED'); assert.equal(f.store.status().signedIn, false); assert.equal(f.wx.memory.get(SESSION_KEY), null);
});
test('401 on an operation preserves its pending ID, never silently logs into a different identity', async () => {
    const f = fixture(); await ready(f); f.intercept(async (o, next) => o.url.endsWith('/actions') ? { statusCode: 401, data: { code: 'LOGIN_REQUIRED' } } : next(o));
    await f.store.feed(); assert.equal(f.store.status().signedIn, false); assert.equal(f.store.status().pending, true);
    assert.equal(f.wx.calls.filter(c => c.path.endsWith('/wx-login')).length, 1);
    f.setIdentity(B); f.intercept(null); await f.store.loginWithWechat(); assert.equal(f.store.status().pending, false); assert.equal(snap(f.store).pets.length, 0);
});
test('new operation is locked before asynchronous secure randomness; no duplicate click POST', async () => {
    const f = fixture(); await ready(f); let release;
    f.wx.getRandomValues = opts => release = () => opts.success({ randomValues: new Uint8Array(16).fill(7).buffer });
    const first = f.store.feed(); assert.equal((await f.store.feed()).error, 'BUSY'); release(); assert.equal((await first).error, null);
    assert.equal(f.wx.calls.filter(c => c.path.endsWith('/actions')).length, 1);
});
test('cannot send asset operations unless original payload is durable', async () => {
    const f = fixture(); await ready(f);
    f.wx.setStorageSync = () => { throw Error('disk full'); };
    assert.equal((await f.store.feed()).error, 'STORAGE_UNAVAILABLE'); assert.equal(f.wx.calls.filter(c => c.path.endsWith('/actions')).length, 0);
});
test('full-state no-op is final success, no repeated command or optimistic deduction', async () => {
    const f = fixture(); await ready(f); f.intercept(async (o, next) => {
        if (o.url.endsWith('/actions')) return { statusCode: 200, data: { requestId: o.data.requestId, replayed: false, outcome: 'ALREADY_FULL', changed: false, pet: f.user(A).pets[0], wallet: f.user(A).wallet, reward: 0 } };
        return next(o);
    });
    const r = await f.store.feed(); assert.equal(r.data.outcome, 'ALREADY_FULL'); assert.equal(f.store.status().pending, false); assert.equal(snap(f.store).food, 3);
});
test('older list arriving after adoption cannot erase new membership or wallet', async () => {
    const f = fixture(); await ready(f); let release, reached, delayed = true; const seen = new Promise(r => reached = r);
    f.intercept(async (o, next) => { const r = await next(o); if (delayed && o.url.endsWith('/me/pets')) { delayed = false; reached(); await new Promise(resolve => release = resolve); } return r; });
    const read = f.store.refresh(); await seen; await f.store.adopt(Q, '二号'); release(); await read;
    assert.equal(snap(f.store).pets.length, 2); assert.equal(snap(f.store).petId, Q);
});
test('all three history endpoints paginate by exclusive last id/date without numeric coercion', async () => {
    const f = fixture(); await ready(f); const pages = [];
    f.intercept(async (o, next) => {
        if (/ledger|supply-claims/.test(o.url)) {
            pages.push(o.url); const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(900719925474099300n-BigInt(i)), date: '2026-09-'+String(30-i%30).padStart(2,'0'), createdAt:'2026-11-11T00:00:00Z', operation:'PET', delta:1 }));
            return { statusCode:200, data: o.url.includes('?') ? [] : rows };
        } return next(o);
    });
    for (const kind of ['points','inventory','claims']) {
        assert.equal((await f.store.history(kind)).data.hasMore,true); const r = await f.store.history(kind,true); assert.equal(r.data.hasMore,false); assert.equal(r.data.items.length,50);
    }
    assert(pages[1].endsWith('?beforeId=900719925474099251')); assert(pages[3].endsWith('?beforeId=900719925474099251')); assert(pages[5].includes('?beforeDate='));
});

test('uninitialized account explicitly POSTs once and recovers after a lost initialization response', async () => {
    const f = fixture(); let initialized = false, posts = 0, lose = true;
    f.intercept(async (o, next) => {
        if (o.url.endsWith('/me/pets') && !initialized) return { statusCode: 409, data: { code: 'CLOUD_INITIALIZATION_REQUIRED' } };
        if (o.url.endsWith('/me/pets/initialize')) {
            assert.equal(o.method, 'POST'); initialized = true; posts++;
            if (lose) { lose = false; throw Error('response lost'); }
            return next(Object.assign({}, o, { url: o.url.replace('/initialize', ''), method: 'GET' }));
        }
        return next(o);
    });
    await f.store.loginWithWechat();
    assert.equal((await f.store.refresh()).error, null);
    assert.equal(posts, 1);
    initialized = false;
    assert.equal((await f.store.refresh()).error, null);
    assert.equal(posts, 2);
    assert.equal((await f.store.refresh()).error, null);
    assert.equal(posts, 2);
});

function setSpark(pet, fields = {}, date = '2026-11-16') {
    pet.businessDate = date;
    pet.serverTime = date + 'T01:00:00.000Z';
    pet.sparkRuleVersion = 'spark-v1';
    pet.spark = {
        status: 'ACTIVE', level: 1, affinity: 1, effectiveToday: true,
        frozenLevel: 0, recoveryProgress: 0, recoveryDeadline: null, ...fields,
    };
}

async function loseLegacyOperation(f) {
    await ready(f);
    f.intercept(async (options, next) => {
        if (options.url.endsWith('/actions')) { await next(options); throw Error('response lost after commit'); }
        if (options.url.includes('/operations/')) throw Error('lookup unavailable');
        return next(options);
    });
    assert.equal((await f.store.feed()).error, 'RESULT_PENDING');
    assert.equal(f.store.status().pending, true);
    f.intercept(null);
}

test('old server keeps original care working; an upgraded snapshot preserves normal-v1 and exposes spark', async () => {
    const f = fixture(); await ready(f);
    assert.equal(snap(f.store).spark, null);
    assert.equal((await f.store.pet()).error, null);
    setSpark(f.user(A).pets[0]);
    assert.equal((await f.store.refresh()).error, null);
    assert.equal(snap(f.store).pets[0].ruleVersion, 'normal-v1');
    assert.equal(snap(f.store).spark.level, 1);
    assert.equal(snap(f.store).businessDate, '2026-11-16');
});

test('ongoing recovery stays valid past the start deadline; a true server rollback restores legacy capability', async () => {
    const f = fixture(); await ready(f);
    const p = f.user(A).pets[0];
    setSpark(p, { status: 'RECOVERING', level: 5, affinity: 7, frozenLevel: 5, recoveryProgress: 2, recoveryDeadline: '2026-11-20' }, '2026-11-21');
    assert.equal((await f.store.refresh()).error, null);
    assert.deepEqual(snap(f.store).spark, p.spark);
    delete p.sparkRuleVersion;
    delete p.spark;
    p.serverTime = '2026-11-21T02:00:00.000Z';
    assert.equal((await f.store.refresh()).error, null);
    assert.equal(snap(f.store).spark, null);
    assert.equal((await f.store.pet()).error, null);
});

test('supported but malformed list/detail cannot downgrade spark or replace the current state', async t => {
    for (const [name, corrupt] of [
        ['missing value', pet => { delete pet.spark; }],
        ['missing marker', pet => { delete pet.sparkRuleVersion; }],
        ['unknown version', pet => { pet.sparkRuleVersion = 'spark-v2'; }],
        ['wrong server date', pet => { pet.businessDate = '2026-11-15'; }],
        ['invalid recovery progress', pet => { pet.spark.recoveryProgress = 3; }],
        ['detail falsely looks legacy', pet => { delete pet.spark; delete pet.sparkRuleVersion; }],
    ]) {
        await t.test(name, async () => {
            const f = fixture(); await ready(f);
            setSpark(f.user(A).pets[0]);
            await f.store.refresh();
            const before = snap(f.store);
            const serverPet = f.user(A).pets[0];
            serverPet.version = '5';
            setSpark(serverPet, { level: 2, affinity: 2 });
            f.intercept(async (o, next) => {
                const response = await next(o);
                if (o.url.endsWith('/pets/' + P)) corrupt(response.data.pet);
                return response;
            });
            assert.equal((await f.store.refresh()).error, 'INVALID_RESPONSE');
            assert.deepEqual(snap(f.store).spark, before.spark);
            assert.equal(f.store.status().synced, false);
            assert.equal((await f.store.pet()).error, 'REFRESH_REQUIRED');
        });
    }
});

test('previously committed legacy receipt clears pending, refreshes confirmed spark and never writes the operation again', async () => {
    const f = fixture(); await loseLegacyOperation(f);
    setSpark(f.user(A).pets[0], { effectiveToday: false }, '2026-11-17');
    const wx = platform(f.transport, f.wx.memory);
    const upgraded = createCloudStore(wx, { API_BASE: 'http://test.invalid/bird/v1' });
    const recovered = await upgraded.recover();
    assert.equal(recovered.error, null);
    assert.equal(recovered.data.replayed, true);
    assert.equal(recovered.data.sparkEvent, undefined);
    assert.equal(wx.calls.filter(c => c.method === 'POST').length, 0);
    assert.equal(upgraded.status().pending, false);
    assert.equal(snap(upgraded).food, 2);
    assert.equal(snap(upgraded).businessDate, '2026-11-17');
    assert.equal(snap(upgraded).spark.effectiveToday, false);
});

test('failed snapshot after confirming old receipt keeps the newer cached state read only', async () => {
    const f = fixture(); await loseLegacyOperation(f);
    setSpark(f.user(A).pets[0], { level: 2, affinity: 3 });
    f.user(A).pets[0].inventory.food = 1;
    await f.store.refresh();
    f.intercept(async (o, next) => { if (o.url.endsWith('/me/pets')) throw Error('snapshot unavailable'); return next(o); });
    assert.equal((await f.store.recover()).error, null);
    assert.equal(f.store.status().pending, false);
    assert.equal(f.store.status().synced, false);
    assert.equal(snap(f.store).food, 1);
    assert.equal(snap(f.store).spark.level, 2);
    assert.equal((await f.store.feed()).error, 'REFRESH_REQUIRED');
    assert.equal(f.wx.calls.filter(c => c.path.endsWith('/actions')).length, 1);
});

test('unknown or mismatched receipts remain pending and are never treated as a negative lookup', async t => {
    for (const [name, modify] of [
        ['empty receipt', r => { r.data = null; }],
        ['missing replay flag', r => { delete r.data.replayed; }],
        ['wrong ID', r => { r.data.requestId = 'b'.repeat(32); }],
        ['wrong pet', r => { r.data.pet.petId = Q; }],
        ['wrong bird within the pet', r => { r.data.pet.birdId = Q; }],
        ['unknown base version', r => { r.data.pet.ruleVersion = 'normal-v2'; }],
        ['missing original care field', r => { delete r.data.pet.care.lastCompanionAt; }],
        ['missing wallet version', r => { delete r.data.wallet.accountVersion; }],
    ]) {
        await t.test(name, async () => {
            const f = fixture(); await loseLegacyOperation(f);
            f.intercept(async (o, next) => {
                const result = await next(o);
                if (o.url.includes('/operations/')) modify(result);
                return result;
            });
            assert.equal((await f.store.recover()).error, 'RESULT_PENDING');
            assert.equal(f.store.status().error, 'INVALID_RESPONSE');
            assert.equal(f.store.status().pending, true);
            assert.equal(f.store.status().canOperate, false);
            assert.equal(f.wx.calls.filter(c => c.path.endsWith('/actions')).length, 1);
        });
    }
});

test('malformed new action and history response are never shown as success', async () => {
    const f = fixture(); await ready(f);
    const pet = f.user(A).pets[0];
    setSpark(pet);
    await f.store.refresh();
    f.intercept(async (o, next) => {
        const result = await next(o);
        if (o.url.endsWith('/actions') || o.url.includes('/operations/')) delete result.data.pet.spark;
        return result;
    });
    assert.equal((await f.store.feed()).error, 'RESULT_PENDING');
    assert.equal(f.store.status().error, 'INVALID_RESPONSE');
    assert.equal(f.store.status().synced, false);
    assert.equal(f.store.status().pending, true);
    assert.equal(snap(f.store).food, 3);
    assert.equal(f.wx.calls.filter(c => c.path.endsWith('/actions')).length, 1);
});

test('only a valid immediate action emits spark feedback; replay and date rollover suppress it', async t => {
    for (const mode of ['current', 'replay', 'midnight']) {
        await t.test(mode, async () => {
            const f = fixture(); await ready(f);
            const pet = f.user(A).pets[0];
            setSpark(pet, { status: 'UNLIT', level: 0, affinity: 0, effectiveToday: false });
            await f.store.refresh();
            f.intercept(async (o, next) => {
                if (!o.url.endsWith('/actions')) return next(o);
                setSpark(pet);
                const result = await next(o);
                const recorded = f.records.get(A + o.data.requestId);
                recorded.sparkEvent = 'LIT';
                result.data.sparkEvent = 'LIT';
                if (mode === 'replay') throw Error('response lost');
                if (mode === 'midnight') setSpark(pet, { effectiveToday: false }, '2026-11-17');
                return result;
            });
            const response = await f.store.pet();
            assert.equal(response.error, null);
            assert.equal(response.data.granted, 0);
            assert.equal(response.data.sparkEvent, mode === 'current' ? 'LIT' : undefined);
            assert.equal(snap(f.store).spark.level, 1);
            assert.equal(snap(f.store).spark.effectiveToday, mode !== 'midnight');
        });
    }
});
