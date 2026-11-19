'use strict';
const { apiRoot } = require('./api-root');

// 服务端是唯一资产来源。工厂注入平台接口，供真实 HTTP 与故障测试复用同一实现。
const SESSION_KEY = 'xcwc.cloud.session.v1';
const PREFIX = 'xcwc.cloud.v1:';
const clone = value => JSON.parse(JSON.stringify(value));
const failure = error => ({ error: error && error.error || 'SERVICE_UNAVAILABLE' });
const version = value => typeof value === 'string' && /^\d+$/.test(value);
const hasField = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const sparkEnabled = pet => pet.sparkRuleVersion === 'spark-v1';
const nonnegative = value => Number.isSafeInteger(value) && value >= 0;
const dateTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const sparkActions = ['PET', 'FEED', 'WATER', 'CLEAN'];
const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
function compare(a, b) {
    a = a.replace(/^0+(?=\d)/, ''); b = b.replace(/^0+(?=\d)/, '');
    return a.length === b.length ? (a === b ? 0 : a > b ? 1 : -1) : a.length > b.length ? 1 : -1;
}
function dateOnly(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dateTime(value) &&
        new Date(value).toISOString().slice(0, 10) === value;
}
function validSpark(pet) {
    if (!hasField(pet, 'sparkRuleVersion') && !hasField(pet, 'spark')) return true;
    if (!sparkEnabled(pet) || !pet.spark || !dateOnly(pet.businessDate) || !validCareFields(pet)) return false;
    const timeWithinDay = Date.parse(pet.serverTime) + shanghaiOffsetMs - Date.parse(pet.businessDate);
    if (timeWithinDay < 0 || timeWithinDay >= dayMs) return false;
    const { status, level, affinity, effectiveToday, frozenLevel, recoveryProgress, recoveryDeadline } = pet.spark;
    if (![level, affinity, frozenLevel, recoveryProgress].every(nonnegative) ||
        typeof effectiveToday !== 'boolean' || affinity < level + recoveryProgress) return false;
    if (status === 'RECOVERABLE' || status === 'RECOVERING') {
        if (!(level > 0 && frozenLevel === level && dateOnly(recoveryDeadline))) return false;
        return status === 'RECOVERABLE'
            ? recoveryProgress === 0 && !effectiveToday && recoveryDeadline >= pet.businessDate
            : recoveryProgress === 1 || recoveryProgress === 2;
    }
    if (frozenLevel !== 0 || recoveryProgress !== 0 || recoveryDeadline !== null) return false;
    if (status === 'ACTIVE') return level > 0;
    if (level !== 0 || effectiveToday) return false;
    return status === 'UNLIT' ? affinity === 0 : status === 'EXPIRED' && affinity > 0;
}
function validCareFields(pet) {
    return dateTime(pet.care.lastCompanionAt) && pet.cleaning.type === 'POOP' &&
        (pet.cleaning.dueAt === null || dateTime(pet.cleaning.dueAt));
}
function validPet(p) {
    return p && /^[a-f0-9]{32}$/.test(p.petId) && /^[a-f0-9]{32}$/.test(p.birdId) &&
        typeof p.nickname === 'string' && typeof p.active === 'boolean' && version(p.version) &&
        p.ruleVersion === 'normal-v1' && dateTime(p.serverTime) && /^\d{4}-\d{2}-\d{2}$/.test(p.businessDate) &&
        p.care && ['satiety', 'hydration', 'mood'].every(k => Number.isInteger(p.care[k]) && p.care[k] >= 0 && p.care[k] <= 100) &&
        p.inventory && ['food', 'water'].every(k => nonnegative(p.inventory[k])) &&
        p.cleaning && ['NONE', 'PENDING', 'PRESENT'].includes(p.cleaning.status) && typeof p.supplyClaimed === 'boolean' && validSpark(p);
}
function validWallet(w) { return w && Number.isSafeInteger(w.balance) && version(w.accountVersion); }
function validSparkEvent(result, action) {
    if (!hasField(result, 'sparkEvent')) return true;
    if (!sparkEnabled(result.pet) || result.outcome !== 'SUCCEEDED' || !sparkActions.includes(action)) return false;
    const { status, level, effectiveToday, recoveryProgress } = result.pet.spark;
    if (!effectiveToday) return false;
    switch (result.sparkEvent) {
        case 'LIT':
        case 'RELIT': return status === 'ACTIVE' && level === 1;
        case 'LEVELED': return status === 'ACTIVE' && level > 1;
        case 'RESTORED': return status === 'ACTIVE' && level >= 4;
        case 'RECOVERY_STARTED': return status === 'RECOVERING' && recoveryProgress === 1;
        case 'RECOVERY_PROGRESS': return status === 'RECOVERING' && recoveryProgress === 2;
        default: return false;
    }
}
function validReceipt(result, op, fromLookup, sandbox) {
    if (!result || typeof result.replayed !== 'boolean' || (fromLookup && !result.replayed) ||
        result.requestId !== op.body.requestId || !validPet(result.pet) || !validCareFields(result.pet) ||
        !dateOnly(result.pet.businessDate) || !validWallet(result.wallet)) return false;
    if (!op.petId) {
        return result.pet.birdId === op.body.birdId && result.outcome === 'SUCCEEDED' &&
            (typeof result.created === 'boolean' || (sandbox && fromLookup && !hasField(result, 'created'))) &&
            !hasField(result, 'sparkEvent');
    }
    const action = op.body.action;
    const outcome = result.outcome;
    return result.pet.petId === op.petId && typeof result.changed === 'boolean' &&
        (result.reward === 0 || (result.reward === 1 && action === 'PET' && outcome === 'SUCCEEDED')) &&
        (outcome === 'SUCCEEDED' || (outcome === 'ALREADY_FULL' && ['FEED', 'WATER'].includes(action)) ||
            (outcome === 'ALREADY_CLAIMED' && action === 'CLAIM_SUPPLY')) && validSparkEvent(result, action);
}
const NOTES = { PET: '摸摸奖励', WELCOME: '初见礼', REDEEM: '兑换', STEPS: '历史步数奖励', CHECKIN_REWARD: '历史合照奖励' };

function createCloudStore(platform, config) {
    let session = null, epoch = 0, online = true, synced = false, busy = false, loading = false;
    let lastError = '', storageError = false, loginJob = null, refreshJob = null, operationJob = null;
    let data = empty(), pending = null, retryAt = 0;
    const listeners = new Set();
    function empty() { return { items: [], selected: '', wallet: { balance: 0, accountVersion: '0' }, quota: {}, histories: {}, metadata: {} }; }
    function key(kind) { return PREFIX + session.userId + ':' + kind; }
    function read(k) { try { return platform.getStorageSync(k); } catch (e) { storageError = true; return null; } }
    function write(k, value) {
        try { platform.setStorageSync(k, clone(value)); return true; }
        catch (e) { storageError = true; lastError = 'STORAGE_UNAVAILABLE'; return false; }
    }
    function emit() { listeners.forEach(fn => fn()); }
    function save() { if (session && session.userId) write(key('cache'), data); }
    function ctx() { return { epoch, userId: session && session.userId, token: session && session.token }; }
    function current(c) { return c.epoch === epoch && c.userId === (session && session.userId) && c.token === (session && session.token); }
    function guard(c) { if (!current(c)) throw { error: 'CONTEXT_CHANGED' }; }
    function invalidate() { epoch++; synced = false; loading = false; busy = false; refreshJob = null; operationJob = null; }
    function loadAccount() {
        data = empty(); pending = null;
        if (!session || !session.userId) return;
        const cache = read(key('cache'));
        if (cache && Array.isArray(cache.items) && cache.items.every(validPet) && validWallet(cache.wallet)) {
            data = Object.assign(empty(), clone(cache));
        }
        pending = read(key('pending')) || null;
        retryAt = pending && pending.retryAt || 0;
    }
    const stored = read(SESSION_KEY);
    if (stored && /^[a-f0-9]{32}$/.test(stored.userId) && typeof stored.token === 'string' && Number.isFinite(Date.parse(stored.expiresAt))) {
        session = stored;
        if (Date.parse(session.expiresAt) <= Date.now()) session.token = '';
        loadAccount();
    }
    function signedIn() { return !!(session && session.token && Date.parse(session.expiresAt) > Date.now()); }
    function request(path, method, body, c, anonymous, tokenOverride) {
        if (!apiRoot(config.API_BASE)) return Promise.reject({ error: 'NO_ENDPOINT' });
        if (!online) return Promise.reject({ error: 'OFFLINE', uncertain: true });
        if (!anonymous && (!c || !(tokenOverride || c.token))) return Promise.reject({ error: 'LOGIN_REQUIRED' });
        return new Promise((resolve, reject) => {
            platform.request({
                url: apiRoot(config.API_BASE) + path, method: method || 'GET', data: body,
                timeout: path === '/auth/wx-phone-login' ? 45000 : 10000,
                header: Object.assign({ 'content-type': 'application/json' }, anonymous ? {} : { Authorization: 'Bearer ' + (tokenOverride || c.token) }),
                success(res) {
                    if (c && !c.detached && !current(c)) return reject({ error: 'CONTEXT_CHANGED' });
                    if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data);
                    const code = res.data && res.data.code || 'SERVICE_UNAVAILABLE';
                    const headers = res.header || {};
                    const raw = headers['Retry-After'] || headers['retry-after'];
                    const delay = /^\d+$/.test(String(raw)) ? Number(raw) * 1000 : Date.parse(raw) - Date.now();
                    if (res.statusCode === 429 && !c.detached) {
                        retryAt = Date.now() + (Number.isFinite(delay) ? Math.max(1000, delay) : 30000);
                        if (pending && session) { pending.retryAt = retryAt; write(key('pending'), pending); }
                    }
                    if (res.statusCode === 401 && !anonymous && !tokenOverride && !c.detached) {
                        invalidate(); session.token = ''; write(SESSION_KEY, session); lastError = 'LOGIN_REQUIRED'; emit();
                    }
                    reject({ error: res.statusCode === 429 ? 'RATE_LIMITED' : code, uncertain: res.statusCode >= 500 || res.statusCode === 408 || res.statusCode === 429 });
                },
                fail() { reject({ error: 'NETWORK_ERROR', uncertain: true }); },
            });
        });
    }
    function mergePet(p) {
        if (!validPet(p)) throw { error: 'INVALID_RESPONSE', uncertain: true };
        const index = data.items.findIndex(item => item.petId === p.petId), old = data.items[index];
        if (old && (compare(p.version, old.version) < 0 || (compare(p.version, old.version) === 0 && Date.parse(p.serverTime) < Date.parse(old.serverTime)))) return;
        if (index < 0) data.items.push(clone(p)); else data.items[index] = clone(p);
    }
    function mergeWallet(w) {
        if (!validWallet(w)) throw { error: 'INVALID_RESPONSE', uncertain: true };
        if (compare(w.accountVersion, data.wallet.accountVersion) >= 0) data.wallet = clone(w);
    }
    async function refreshInternal(c) {
        let list;
        try { list = await request('/me/pets', 'GET', null, c); }
        catch (e) {
            guard(c);
            if (e.error !== 'CLOUD_INITIALIZATION_REQUIRED') throw e;
            // Explicit, convergent POST; GET never creates inventory or changes reward eligibility.
            list = await request('/me/pets/initialize', 'POST', {}, c);
        }
        guard(c);
        if (!list || list.userId !== c.userId || !Array.isArray(list.items) || !list.items.every(validPet) ||
            !list.items.every(p => sparkEnabled(p) === sparkEnabled(list.items[0])) || !validWallet(list.wallet)) {
            throw { error: 'INVALID_RESPONSE' };
        }
        const items = compare(list.wallet.accountVersion, data.wallet.accountVersion) >= 0 ? list.items : data.items;
        const pet = items.find(p => p.petId === data.selected) || items[0];
        let detail;
        if (pet) {
            detail = await request('/me/pets/' + pet.petId, 'GET', null, c); guard(c);
            if (!detail || !validPet(detail.pet) || detail.pet.petId !== pet.petId || detail.pet.birdId !== pet.birdId ||
                !validWallet(detail.wallet) || (list.items.length && sparkEnabled(detail.pet) !== sparkEnabled(list.items[0]))) {
                throw { error: 'INVALID_RESPONSE' };
            }
        }
        const quota = await request('/me/points', 'GET', null, c); guard(c);
        // 城市展示资料不在 CloudPet 内，读取本人实体名单；不据编码前缀推断。
        let metadata;
        try {
            const birds = await request('/me/birds', 'GET', null, c); guard(c);
            if (Array.isArray(birds)) metadata = birds.reduce((all, bird) => {
                all[bird.id] = { cityCode: bird.cityCode, cityName: bird.cityName, typeName: bird.typeName }; return all;
            }, {});
        } catch (e) { guard(c); /* 资料失败不伪造城市，养成快照仍可使用 */ }
        // 先核对整个响应，避免畸形详情覆盖已确认的快照。
        const latestMembership = compare(list.wallet.accountVersion, data.wallet.accountVersion) >= 0;
        list.items.forEach(mergePet); mergeWallet(list.wallet);
        if (latestMembership) data.items = data.items.filter(p => list.items.some(item => item.petId === p.petId));
        if (detail && data.items.some(p => p.petId === detail.pet.petId)) {
            mergePet(detail.pet); mergeWallet(detail.wallet);
        }
        if (!data.items.some(p => p.petId === data.selected)) data.selected = data.items[0]?.petId || '';
        data.quota = { earnedToday: quota.earnedToday, dailyLimit: quota.dailyLimit };
        if (metadata) data.metadata = metadata;
        synced = true; lastError = ''; save(); emit();
        return { error: null, data: snapshot().data };
    }
    async function refresh() {
        if (!signedIn()) { synced = false; lastError = apiRoot(config.API_BASE) ? 'LOGIN_REQUIRED' : 'NO_ENDPOINT'; emit(); return failure({ error: lastError }); }
        if (refreshJob) return refreshJob;
        const c = ctx(); loading = true; emit();
        const job = refreshInternal(c).catch(e => {
            if (current(c)) { synced = false; lastError = e.error; emit(); }
            return failure(e);
        }).finally(() => { if (current(c)) { loading = false; if (refreshJob === job) refreshJob = null; emit(); } });
        refreshJob = job; return job;
    }
    async function login(phoneCode) {
        if (loginJob) return phoneCode ? failure({ error: 'BUSY' }) : loginJob;
        if (!apiRoot(config.API_BASE)) return failure({ error: 'NO_ENDPOINT' });
        if (!online) return failure({ error: 'OFFLINE' });
        invalidate(); const c = ctx(); loading = true; emit();
        const job = (async () => {
            // 老版本仅有 token 时先查询持久身份，不凭本机鸟码恢复。
            let value;
            const oldToken = !phoneCode && !session && read('auth_token');
            if (oldToken) {
                try { value = await request('/auth/session', 'GET', null, c, false, oldToken); }
                catch (e) { if (e.error !== 'LOGIN_REQUIRED') throw e; }
            }
            if (!value) {
                const login = await new Promise((resolve, reject) => platform.login({ success: resolve, fail: () => reject({ error: 'LOGIN_FAILED' }) }));
                guard(c);
                if (!login.code) throw { error: 'LOGIN_FAILED' };
                value = await request(phoneCode ? '/auth/wx-phone-login' : '/auth/wx-login', 'POST',
                    phoneCode ? { code: login.code, phoneCode } : { code: login.code }, c, true);
            }
            guard(c);
            if (!value || !/^[a-f0-9]{32}$/.test(value.userId) || !/^[a-f0-9]{64}$/.test(value.token || oldToken) || !Number.isFinite(Date.parse(value.expiresAt))) throw { error: 'INVALID_RESPONSE' };
            if (phoneCode && !/^\+[1-9][0-9]{0,3} \*{4} [0-9]{4}$/.test(value.phoneMasked || '')) throw { error: 'INVALID_RESPONSE' };
            session = { userId: value.userId, token: value.token || oldToken, expiresAt: value.expiresAt };
            if (phoneCode) session.phoneMasked = value.phoneMasked;
            invalidate(); write(SESSION_KEY, session); loadAccount(); emit();
            const result = await refresh();
            if (!result.error && pending) return recover();
            return result;
        })().catch(e => { if (current(c)) { lastError = e.error; loading = false; emit(); } return failure(e); })
            .finally(() => { if (loginJob === job) loginJob = null; });
        loginJob = job; return job;
    }
    function loginWithWechat() { return login(); }
    function loginWithPhone(phoneCode) {
        if (typeof phoneCode !== 'string' || !phoneCode.trim() || phoneCode.length > 512) return Promise.resolve(failure({ error: 'WX_PHONE_CODE_INVALID' }));
        return login(phoneCode);
    }
    async function logoutWechat() {
        const old = session; invalidate(); loginJob = null; session = null; data = empty(); pending = null; lastError = '';
        write(SESSION_KEY, null);
        try { platform.removeStorageSync('auth_token'); } catch (e) { storageError = true; }
        emit();
        // 本机立即退出；撤销旧 token 的响应永不应用到新账号。
        if (old && old.token) {
            try { await request('/auth/logout', 'POST', null, { epoch: -1, userId: old.userId, token: old.token, detached: true }); }
            catch (e) { return { error: e.error === 'LOGIN_REQUIRED' ? null : 'LOGOUT_LOCAL_ONLY' }; }
        }
        return { error: null };
    }
    function selected() { return data.items.find(p => p.petId === data.selected); }
    function status() {
        return { userId: session && session.userId || '', phoneMasked: session && session.phoneMasked || '', signedIn: signedIn(), online, synced, loading, busy,
            pending: !!pending, retryAt, error: storageError ? 'STORAGE_UNAVAILABLE' : lastError,
            canOperate: signedIn() && online && synced && !busy && !pending && !storageError && Date.now() >= retryAt };
    }
    function snapshot() {
        const p = selected(), q = data.quota;
        return { error: null, data: { snapshot: {
            hasBird: !!p, petId: p && p.petId || '', birdId: p && p.birdId || '', birdCode: p && p.birdCode || '',
            nickname: p && p.nickname || '', cityCode: p && data.metadata[p.birdId] && data.metadata[p.birdId].cityCode || '', pets: data.items.map(pet => Object.assign({}, clone(pet), data.metadata[pet.birdId] || {})), userId: session && session.userId || '',
            points: data.wallet.balance, todayPoints: q.earnedToday || 0, dailyLimit: q.dailyLimit || 10,
            food: p ? p.inventory.food : 0, water: p ? p.inventory.water : 0,
            satiety: p ? p.care.satiety : 0, hydration: p ? p.care.hydration : 0, mood: p ? p.care.mood : 0,
            spark: p && sparkEnabled(p) ? clone(p.spark) : null, businessDate: p?.businessDate || '',
            serverTime: p?.serverTime || '',
            supplyClaimed: !!(p && p.supplyClaimed), cleaning: p && clone(p.cleaning), status: status(),
            ledger: (data.histories.points || []).map(row => Object.assign({}, row, {
                at: Date.parse(row.createdAt), day: row.createdAt.slice(0, 10), note: NOTES[row.operation] || row.operation,
                amountText: (row.delta > 0 ? '+' : '') + row.delta,
            })),
        } } };
    }
    async function selectPet(id) {
        if (!data.items.some(p => p.petId === id)) return { error: 'PET_NOT_FOUND' };
        invalidate(); data.selected = id; save(); emit();
        return refresh();
    }
    function randomId() {
        return new Promise((resolve, reject) => {
            if (typeof platform.getRandomValues !== 'function') return reject({ error: 'RANDOM_UNAVAILABLE' });
            platform.getRandomValues({ length: 16, success(r) {
                const bytes = new Uint8Array(r.randomValues || []);
                if (bytes.length !== 16) return reject({ error: 'RANDOM_UNAVAILABLE' });
                resolve(Array.from(bytes, b => ('0' + b.toString(16)).slice(-2)).join(''));
            }, fail: () => reject({ error: 'RANDOM_UNAVAILABLE' }) });
        });
    }
    function persistPending(value) {
        if (!write(key('pending'), value)) throw { error: 'STORAGE_UNAVAILABLE' };
        pending = value;
    }
    async function finish(result, c, op, fromLookup) {
        guard(c);
        const knownPet = op.petId && data.items.find(p => p.petId === op.petId);
        if (!validReceipt(result, op, fromLookup, config.DEVICE_SANDBOX_TEST === true) ||
            (knownPet && result.pet.birdId !== knownPet.birdId) ||
            (!result.replayed && data.items.some(sparkEnabled) && !sparkEnabled(result.pet))) {
            throw { error: 'INVALID_RESPONSE', uncertain: true };
        }
        // 历史回执只能证明结算，不用来覆盖当前快照。
        if (!result.replayed) { mergePet(result.pet); mergeWallet(result.wallet); }
        if (!op.petId) data.selected = result.pet.petId;
        persistPending(null); save();
        synced = false;
        try { await refreshInternal(c); } catch (e) { guard(c); synced = false; lastError = e.error; }
        guard(c); emit();
        const { sparkEvent, ...acknowledged } = result;
        const pet = selected();
        if (synced && sparkEvent && !result.replayed && pet?.petId === result.pet.petId &&
            pet.businessDate === result.pet.businessDate && pet.spark?.effectiveToday) acknowledged.sparkEvent = sparkEvent;
        return { error: null, data: { ...acknowledged, granted: result.reward || 0 } };
    }
    async function runPending(c, lookup) {
        const op = clone(pending);
        try {
            if (Date.now() < retryAt) throw { error: 'RATE_LIMITED', uncertain: true };
            let result, fromLookup = false;
            if (lookup) {
                try { result = await request('/me/operations/' + op.body.requestId, 'GET', null, c); fromLookup = true; }
                catch (e) { if (e.error !== 'OPERATION_NOT_FOUND') throw { ...e, uncertain: true }; }
            }
            guard(c);
            if (!fromLookup) result = await request(op.path, 'POST', op.body, c);
            return await finish(result, c, op, fromLookup);
        } catch (e) {
            if (!current(c)) return failure({ error: 'CONTEXT_CHANGED' });
            if (!e.uncertain && e.error !== 'LOGIN_REQUIRED') {
                persistPending(null);
                if (['PET_VERSION_CONFLICT', 'SUPPLY_DAY_CHANGED', 'PET_NOT_FOUND', 'BIRD_INACTIVE'].includes(e.error)) {
                    synced = false;
                    try { await refreshInternal(c); } catch (ignored) { /* 保留只读快照 */ }
                }
            } else synced = false;
            guard(c); lastError = pending && e.error !== 'INVALID_RESPONSE' ? 'RESULT_PENDING' : e.error; emit();
            return failure({ error: pending ? 'RESULT_PENDING' : e.error });
        }
    }
    async function transact(path, fields, petId) {
        const st = status();
        if (!st.canOperate) return { error: pending ? 'RESULT_PENDING' : !st.signedIn ? 'LOGIN_REQUIRED' : busy ? 'BUSY' : storageError ? 'STORAGE_UNAVAILABLE' : !online ? 'OFFLINE' : Date.now() < retryAt ? 'RATE_LIMITED' : 'REFRESH_REQUIRED' };
        const c = ctx(); busy = true; emit();
        try {
            const id = await randomId(); guard(c);
            persistPending({ path, petId: petId || '', body: Object.assign({}, fields, { requestId: id }) }); emit();
            let result = await runPending(c, false);
            // 一次自动查回执/原样重试。仍不确定就等待用户或下次前台恢复，不循环点击。
            if (result.error === 'RESULT_PENDING' && online && Date.now() >= retryAt) result = await runPending(c, true);
            return result;
        } catch (e) { return failure(e); }
        finally { if (current(c)) { busy = false; emit(); } }
    }
    function action(action, fields) {
        const p = selected();
        if (!p) return Promise.resolve({ error: 'NO_BIRD' });
        if (!p.active) return Promise.resolve({ error: 'BIRD_INACTIVE' });
        return transact('/me/pets/' + p.petId + '/actions', Object.assign({ action, expectedVersion: p.version }, fields || {}), p.petId);
    }
    async function recover() {
        if (operationJob) return operationJob;
        if (!pending) return refresh();
        if (busy) return { error: 'BUSY' };
        if (!signedIn() || !online) return { error: !signedIn() ? 'LOGIN_REQUIRED' : 'OFFLINE' };
        const c = ctx(); busy = true; emit();
        const job = runPending(c, true).catch(failure).finally(() => { if (current(c)) { busy = false; operationJob = null; emit(); } });
        operationJob = job; return job;
    }
    async function history(kind, more) {
        const c = ctx(), p = selected(), name = kind === 'inventory' ? kind + ':' + (p && p.petId) : kind;
        if (!signedIn() || !online) return { error: !online ? 'OFFLINE' : 'LOGIN_REQUIRED', data: { items: clone(data.histories[name] || []), hasMore: false } };
        if (kind === 'inventory' && !p) return { error: 'NO_BIRD' };
        const existing = more ? data.histories[name] || [] : [];
        const last = existing[existing.length - 1];
        const route = kind === 'points' ? '/me/points/ledger' : kind === 'claims' ? '/me/supply-claims' : '/me/pets/' + p.petId + '/inventory-ledger';
        const query = last ? (kind === 'claims' ? '?beforeDate=' + last.date : '?beforeId=' + last.id) : '';
        try {
            const rows = await request(route + query, 'GET', null, c); guard(c);
            if (!Array.isArray(rows)) throw { error: 'INVALID_RESPONSE' };
            data.histories[name] = existing.concat(rows.filter(row => !existing.some(old => (old.id || old.date) === (row.id || row.date))));
            if (kind === 'points') {
                const quota = await request('/me/points', 'GET', null, c); guard(c);
                // 旧钱包接口无 accountVersion，仅取额度；余额只采纳版本化云端钱包。
                data.quota = { earnedToday: quota.earnedToday, dailyLimit: quota.dailyLimit };
            }
            save(); emit(); return { error: null, data: { items: clone(data.histories[name]), hasMore: rows.length === 50 } };
        } catch (e) { return failure(e); }
    }
    function reset() {
        if (pending || busy) return { error: 'RESULT_PENDING' };
        if (!session) return { error: null };
        invalidate(); data = empty(); save(); emit(); return { error: storageError ? 'STORAGE_UNAVAILABLE' : null };
    }
    async function resume() { if (!signedIn()) return { error: 'LOGIN_REQUIRED' }; return pending ? recover() : refresh(); }
    function setOnline(value) { online = value; if (!value) synced = false; emit(); }
    return {
        snapshot, status, refresh, resume, recover, history, selectPet, loginWithWechat, loginWithPhone, logoutWechat, reset, setOnline,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        readWechatSignedIn: signedIn, getToken: () => session && session.token || '',
        getExperienceGeneration: () => epoch,
        verifyWechatSession: async () => { const r = await refresh(); return !r.error ? 'valid' : r.error === 'LOGIN_REQUIRED' ? 'expired' : 'unknown'; },
        adopt: (birdId, nickname) => transact('/me/pets/adopt', { birdId, nickname }),
        rename: nickname => action('RENAME', { nickname: String(nickname).trim() }),
        feed: () => action('FEED'), water: () => action('WATER'), pet: () => action('PET'), clean: () => action('CLEAN'),
        supply: () => action('CLAIM_SUPPLY', { expectedDate: selected() && selected().businessDate }),
        photoReward: () => ({ error: null, data: { reward: 0 } }),
    };
}
module.exports = { createCloudStore, compare, validPet, SESSION_KEY };
