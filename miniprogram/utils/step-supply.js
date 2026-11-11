'use strict';

const config = require('./config');
const store = require('./store');
const werun = require('./werun');
const { SUPPLY_CAP, dayKey } = require('./guest-store');

const PREVIEW_INVALIDATED_BY = [
    'NO_ENDPOINT', 'SUPPLY_DAY_CHANGED', 'SUPPLY_CONTEXT_CHANGED', 'SUPPLY_BIRD_MISMATCH', 'BIRD_NOT_FOUND', 'BIRD_INACTIVE',
    'WERUN_DENIED', 'PRIVACY_NOT_AUTHORIZED', 'PRIVACY_UNAVAILABLE', 'WX_LOGIN_REQUIRED', 'WX_SESSION_CHANGED',
    'LOGIN_FAILED', 'LOGIN_CODE_MISSING',
];
let latestPreview = null;

function enabled() {
    return config.ENABLE_WERUN_SUPPLIES === true && !config.USE_LOCAL_FIXTURE && !!config.API_BASE;
}

function failure(error, data) {
    return { error, data: data || null };
}

function needsNewPreview(error) {
    return PREVIEW_INVALIDATED_BY.includes(error);
}

function discardStaleSessionPreview() {
    if (!latestPreview) return;
    try { latestPreview.checkSession(); }
    catch (error) { latestPreview = null; }
}

function cachedPreview() {
    discardStaleSessionPreview();
    if (!latestPreview) return null;
    const { token, installation, birdCode, reading } = latestPreview;
    const local = store.snapshot();
    const current = store.supplyInstallationId();
    if (!enabled() || token !== store.getToken() || reading.date !== dayKey(Date.now()) ||
        local.error || !local.data.snapshot.hasBird || local.data.snapshot.birdCode !== birdCode ||
        current.error || current.data.id !== installation) {
        latestPreview = null;
        return null;
    }
    const prior = store.supplyClaimedOn(reading.date);
    return prior.error ? null : Object.assign({}, reading, { localClaimed: prior.data.claimed, cached: true });
}

function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function randomInstallationId() {
    return new Promise((resolve, reject) => {
        if (typeof wx.getRandomValues !== 'function') {
            reject({ error: 'STORAGE_UNAVAILABLE' });
            return;
        }
        wx.getRandomValues({
            length: 16,
            success(result) {
                if (!result || !result.randomValues || result.randomValues.byteLength !== 16) {
                    reject({ error: 'STORAGE_UNAVAILABLE' });
                    return;
                }
                const bytes = new Uint8Array(result.randomValues);
                resolve(Array.from(bytes, value => ('0' + value.toString(16)).slice(-2)).join(''));
            },
            fail() { reject({ error: 'STORAGE_UNAVAILABLE' }); },
        });
    });
}

async function installationId(checkContext) {
    let result = store.supplyInstallationId();
    if (result.error) throw result;
    if (!result.data.id) {
        const candidate = await randomInstallationId();
        checkContext();
        result = store.supplyInstallationId(candidate);
    }
    if (result.error) throw result;
    return result.data.id;
}

function validResult(result, birdCode) {
    if (!result || !isDate(result.date) || !Number.isSafeInteger(result.steps) || result.steps < 0 ||
        !Number.isSafeInteger(result.requiredSteps) || result.requiredSteps < 1 ||
        typeof result.claimed !== 'boolean' || typeof result.claimable !== 'boolean') return false;
    if (result.claimable !== (!result.claimed && result.steps >= result.requiredSteps)) return false;
    if (result.receipt === null) return true;
    const receipt = result.receipt;
    return !!(result.claimed && receipt && typeof receipt.id === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(receipt.id) &&
        receipt.date === result.date && receipt.birdCode === birdCode && receipt.food === 1 && receipt.water === 1);
}

async function execute(claiming, expectedDate) {
    if (!enabled()) return failure('NO_ENDPOINT');
    if (claiming && !isDate(expectedDate)) return failure('SUPPLY_DAY_CHANGED');
    const local = store.snapshot();
    if (local.error) return local;
    const snapshot = local.data.snapshot;
    if (!snapshot.hasBird) return failure('NO_BIRD');
    let claimToken;
    if (claiming) {
        const prior = store.supplyClaimedOn(expectedDate);
        if (prior.error) return prior;
        if (prior.data.claimed) return failure('ALREADY_CLAIMED', { snapshot, localClaimed: true });
        if (snapshot.food >= SUPPLY_CAP && snapshot.water >= SUPPLY_CAP) return failure('STOCK_FULL', { snapshot });
        const cached = cachedPreview();
        if (!cached || cached.date !== expectedDate || !(cached.claimable || cached.restoreAvailable)) {
            return failure('WX_SESSION_CHANGED');
        }
        claimToken = latestPreview.token;
    }

    const previewAtStart = latestPreview;
    let id;
    let result;
    let usedToken;
    let checkSession;
    const generation = store.getExperienceGeneration();
    const checkExperience = () => {
        if (generation !== store.getExperienceGeneration()) throw { error: 'SUPPLY_CONTEXT_CHANGED' };
        // 重新登录可以继续，但领取确认只能用于用户看到步数时的会话。
        if (claimToken && ((usedToken && usedToken !== claimToken) || store.getToken() !== claimToken)) {
            throw { error: 'WX_SESSION_CHANGED' };
        }
    };
    try {
        checkSession = werun.captureSessionGuard();
        const checkContext = () => {
            checkSession();
            checkExperience();
        };
        id = await installationId(checkContext);
        checkContext();
        const fields = { installationId: id, birdCode: snapshot.birdCode };
        if (claiming) fields.expectedDate = expectedDate;
        const request = claiming ? werun.claimSupplies : werun.previewSupplies;
        result = await werun.withSession(store.getToken(), token => {
            usedToken = token;
            return request(token, fields, checkExperience);
        });
        checkContext();
        if (!claiming && usedToken !== store.getToken()) throw { error: 'WX_SESSION_CHANGED' };
    } catch (error) {
        const code = (error && error.error) || 'REDEEM_FAILED';
        if (latestPreview === previewAtStart && generation === store.getExperienceGeneration() && needsNewPreview(code)) {
            latestPreview = null;
        }
        return failure(code);
    }
    if (!validResult(result, snapshot.birdCode)) return failure('INVALID_SUPPLY_RECEIPT');

    const current = store.supplyInstallationId();
    if (current.error) return current;
    if (current.data.id !== id || (claiming && result.date !== expectedDate)) {
        latestPreview = null;
        return failure(current.data.id !== id ? 'SUPPLY_CONTEXT_CHANGED' : 'SUPPLY_DAY_CHANGED');
    }
    const prior = store.supplyClaimedOn(result.date);
    if (prior.error) return prior;
    const { date, steps, requiredSteps, claimed, claimable, receipt } = result;
    const reading = { date, steps, requiredSteps, claimed, claimable, restoreAvailable: !!receipt };
    if (usedToken && usedToken === store.getToken() && date === dayKey(Date.now())) {
        latestPreview = { token: usedToken, installation: id, birdCode: snapshot.birdCode, reading, checkSession };
    }
    const data = Object.assign({}, result, { localClaimed: prior.data.claimed });
    if (!claiming || !result.receipt || prior.data.claimed) return { error: null, data };

    const applied = store.applySupplyReceipt(result.receipt);
    if (applied.error) return failure(applied.error, Object.assign(data, applied.data || {}));
    return { error: null, data: Object.assign(data, applied.data, { localClaimed: true }) };
}

function preview() { return execute(false); }
function claim(expectedDate) { return execute(true, expectedDate); }

module.exports = { enabled, preview, claim, cachedPreview, needsNewPreview };
