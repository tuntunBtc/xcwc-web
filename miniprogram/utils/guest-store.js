'use strict';

// 纯业务逻辑层：不依赖 DOM、window 或 wx，可在 Node 下单测，也可整段平移到服务端。
// 调试期数据只落本机；正式版应把 award/redeemSteps 的结算移到服务端，前端只展示结果。
const STORAGE_KEY = 'xcwc.mp.guest.v1';
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const SUPPLY_CAP = 99;

const DEFAULT_RULES = {
    petCooldownMs: 30 * 1000,
    pointsDailyLimit: 10,
    stepUnit: 1000,
    stepDailyCap: 5,
    satietyDecayPerMinute: 8,
    hydrationDecayPerMinute: 8,
    moodDecayPerMinute: 3,
};

function dayKey(now) {
    return new Date(now + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function isNumber(value) {
    return typeof value === 'number' && isFinite(value);
}

function text(value, maxLength) {
    return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function recentDayKeys(records) {
    return Object.keys(records).filter(function (key) {
        return /^\d{4}-\d{2}-\d{2}$/.test(key);
    }).sort().slice(-60);
}

function isSupplyDay(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const at = Date.parse(date + 'T00:00:00Z');
    return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === date;
}

function isSupplyReceiptId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function isSupplyInstallationId(id) {
    return typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
}

function claimedSupplyOn(state, date) {
    return !!(state.supplyDays[date] || state.supplyReceipts[date]);
}

function defaultState(now) {
    return {
        version: 1,
        bird: null,
        points: 0,
        ledger: [],
        dayPoints: {},
        stepClaims: {},
        supplyDays: {},
        supplyReceipts: {},
        supplyInstallationId: '',
        // 合照打卡：原图去重、每日最多 3 张新原图、请求编号幂等。
        // 与 H5 guest-store.mjs 的 photoHashes / daily.photos / requests 对应。
        photoHashes: [],
        photoDays: {},
        photoRequests: {},
        lastPetAt: 0,
        care: {
            food: 3,
            water: 3,
            satiety: 70,
            hydration: 70,
            mood: 70,
            updatedAt: now,
        },
    };
}

function normalize(raw, now) {
    const state = defaultState(now);
    if (!raw || typeof raw !== 'object') {
        return state;
    }
    if (raw.bird && typeof raw.bird === 'object') {
        const code = text(raw.bird.code, 64);
        if (code) {
            state.bird = {
                code: code,
                nickname: text(raw.bird.nickname, 12) || '小鸟',
                cityCode: raw.bird.cityCode === undefined ? 'hangzhou' : text(raw.bird.cityCode, 32),
                adoptedAt: isNumber(raw.bird.adoptedAt) ? raw.bird.adoptedAt : now,
            };
        }
    }
    state.points = isNumber(raw.points) ? clamp(Math.floor(raw.points), 0, 999999) : 0;
    state.lastPetAt = isNumber(raw.lastPetAt) ? raw.lastPetAt : 0;

    if (raw.dayPoints && typeof raw.dayPoints === 'object') {
        Object.keys(raw.dayPoints).forEach(function (key) {
            if (isNumber(raw.dayPoints[key])) {
                state.dayPoints[key] = clamp(Math.floor(raw.dayPoints[key]), 0, 9999);
            }
        });
    }
    if (raw.stepClaims && typeof raw.stepClaims === 'object') {
        Object.keys(raw.stepClaims).forEach(function (key) {
            const claim = raw.stepClaims[key];
            if (claim && isNumber(claim.steps) && isNumber(claim.points)) {
                state.stepClaims[key] = { steps: claim.steps, points: claim.points };
            }
        });
    }
    if (raw.supplyDays && typeof raw.supplyDays === 'object') {
        recentDayKeys(raw.supplyDays).forEach(function (key) {
            if (raw.supplyDays[key] === true) {
                state.supplyDays[key] = true;
            }
        });
    }
    if (raw.supplyReceipts && typeof raw.supplyReceipts === 'object') {
        Object.keys(raw.supplyReceipts).forEach(function (date) {
            if (isSupplyDay(date) && isSupplyReceiptId(raw.supplyReceipts[date])) {
                state.supplyReceipts[date] = raw.supplyReceipts[date];
            }
        });
    }
    if (isSupplyInstallationId(raw.supplyInstallationId)) {
        state.supplyInstallationId = raw.supplyInstallationId;
    }
    if (raw.photoHashes && Array.isArray(raw.photoHashes)) {
        state.photoHashes = raw.photoHashes.filter(function (value) {
            return typeof value === 'string' && value.length > 0 && value.length <= 128;
        });
    }
    if (raw.photoDays && typeof raw.photoDays === 'object') {
        recentDayKeys(raw.photoDays).forEach(function (key) {
            if (isNumber(raw.photoDays[key])) {
                state.photoDays[key] = clamp(Math.floor(raw.photoDays[key]), 0, 3);
            }
        });
    }
    if (raw.photoRequests && typeof raw.photoRequests === 'object') {
        Object.keys(raw.photoRequests).forEach(function (key) {
            const prior = raw.photoRequests[key];
            if (prior && isNumber(prior.reward)) {
                state.photoRequests[key] = { reward: clamp(Math.floor(prior.reward), 0, 1) };
            }
        });
    }
    if (Array.isArray(raw.ledger)) {
        state.ledger = raw.ledger.slice(0, 40).filter(function (item) {
            return item && typeof item === 'object';
        });
    }
    const care = raw.care && typeof raw.care === 'object' ? raw.care : {};
    state.care = {
        food: isNumber(care.food) ? clamp(Math.floor(care.food), 0, SUPPLY_CAP) : 3,
        water: isNumber(care.water) ? clamp(Math.floor(care.water), 0, SUPPLY_CAP) : 3,
        satiety: isNumber(care.satiety) ? clamp(care.satiety, 0, 100) : 70,
        hydration: isNumber(care.hydration) ? clamp(care.hydration, 0, 100) : 70,
        mood: isNumber(care.mood) ? clamp(care.mood, 0, 100) : 70,
        updatedAt: isNumber(care.updatedAt) ? Math.min(care.updatedAt, now) : now,
    };
    return state;
}

function applyDecay(state, now, rules) {
    const care = state.care;
    const minutes = Math.max(0, Math.floor((now - care.updatedAt) / 60000));
    if (minutes <= 0) {
        return state;
    }
    care.satiety = clamp(care.satiety - minutes * rules.satietyDecayPerMinute, 0, 100);
    care.hydration = clamp(care.hydration - minutes * rules.hydrationDecayPerMinute, 0, 100);
    care.mood = clamp(care.mood - minutes * rules.moodDecayPerMinute, 0, 100);
    care.updatedAt = care.updatedAt + minutes * 60000;
    return state;
}

function award(state, kind, amount, note, now, rules) {
    const day = dayKey(now);
    const used = state.dayPoints[day] || 0;
    const granted = Math.min(amount, rules.pointsDailyLimit - used);
    if (granted <= 0) {
        return 0;
    }
    state.dayPoints[day] = used + granted;
    state.points += granted;
    state.ledger.unshift({
        id: String(now) + '-' + kind + '-' + String(granted),
        kind: kind,
        amount: granted,
        note: note,
        at: now,
        day: day,
    });
    state.ledger = state.ledger.slice(0, 40);
    return granted;
}

function stepReward(steps, state, now, rules) {
    const day = dayKey(now);
    if (state.stepClaims[day]) {
        return 0;
    }
    const used = state.dayPoints[day] || 0;
    const remaining = Math.max(0, rules.pointsDailyLimit - used);
    return Math.min(Math.floor(steps / rules.stepUnit), rules.stepDailyCap, remaining);
}

function publicSnapshot(state, now, rules, debugSteps) {
    const day = dayKey(now);
    const todayPoints = state.dayPoints[day] || 0;
    const claim = state.stepClaims[day] || null;
    const petElapsed = now - state.lastPetAt;
    const petWaitSeconds = Math.max(0, Math.ceil((rules.petCooldownMs - petElapsed) / 1000));
    const hasBird = !!state.bird;
    return {
        hasBird: hasBird,
        nickname: hasBird ? state.bird.nickname : '',
        birdCode: hasBird ? state.bird.code : '',
        cityCode: hasBird ? state.bird.cityCode : '',
        points: state.points,
        todayPoints: todayPoints,
        dailyLimit: rules.pointsDailyLimit,
        food: state.care.food,
        water: state.care.water,
        satiety: Math.round(state.care.satiety),
        hydration: Math.round(state.care.hydration),
        mood: Math.round(state.care.mood),
        canPet: hasBird && petWaitSeconds === 0 && todayPoints < rules.pointsDailyLimit,
        petWaitSeconds: petWaitSeconds,
        todayStepClaim: claim,
        todayStepClaimed: !!claim,
        supplyClaimed: claimedSupplyOn(state, day),
        todayPhotos: state.photoDays[day] || 0,
        debugSteps: debugSteps,
        stepEarnable: claim ? 0 : stepReward(debugSteps, state, now, rules),
        stepUnit: rules.stepUnit,
        stepDailyCap: rules.stepDailyCap,
        ledger: (function () {
            let running = state.points;
            return state.ledger.slice(0, 8).map(function (item) {
                const entry = {
                    id: item.id,
                    note: item.note,
                    amount: item.amount,
                    amountText: '+' + String(item.amount) + ' 叽分',
                    at: item.at,
                    day: item.day,
                    balanceAfter: running,
                };
                running -= item.amount;
                return entry;
            });
        })(),
    };
}

function createGuestStore(storage, options) {
    const rules = Object.assign({}, DEFAULT_RULES, options && options.rules ? options.rules : {});
    const debugSteps = options && isNumber(options.debugSteps) ? options.debugSteps : 0;

    function read(now) {
        let raw = null;
        try {
            raw = storage.getStorageSync(STORAGE_KEY);
        } catch (error) {
            return null;
        }
        // wx 缺键返回空字符串。其他无效根结构或未知版本应保留以供恢复。
        if (raw != null && raw !== '' && (typeof raw !== 'object' || Array.isArray(raw) ||
            (raw.version != null && raw.version !== 1))) {
            return null;
        }
        const state = normalize(raw, now);
        applyDecay(state, now, rules);
        return state;
    }

    function readFailure() {
        return { data: { saved: false, snapshot: null }, error: 'STORAGE_UNAVAILABLE' };
    }

    function write(state) {
        try {
            storage.setStorageSync(STORAGE_KEY, state);
            return true;
        } catch (storageError) {
            return false;
        }
    }

    function commit(state, now, error, extra) {
        const saved = write(state);
        const data = Object.assign(
            { saved: saved, snapshot: publicSnapshot(state, now, rules, debugSteps) },
            extra || {}
        );
        return { data: data, error: saved ? error : 'STORAGE_UNAVAILABLE' };
    }

    function snapshot(now) {
        const at = isNumber(now) ? now : Date.now();
        const state = read(at);
        if (!state) return readFailure();
        return { data: { saved: true, snapshot: publicSnapshot(state, at, rules, debugSteps) }, error: null };
    }

    function pet(now) {
        const at = isNumber(now) ? now : Date.now();
        const state = read(at);
        if (!state) return readFailure();
        if (!state.bird) {
            return commit(state, at, 'NO_BIRD');
        }
        if (at - state.lastPetAt < rules.petCooldownMs) {
            return commit(state, at, 'COOLDOWN');
        }
        const granted = award(state, 'pet', 1, '摸摸小鸟', at, rules);
        if (granted <= 0) {
            return commit(state, at, 'DAILY_LIMIT');
        }
        state.lastPetAt = at;
        state.care.mood = clamp(state.care.mood + 5, 0, 100);
        return commit(state, at, null, { granted: granted });
    }

    function careAction(kind, now) {
        const at = isNumber(now) ? now : Date.now();
        const state = read(at);
        if (!state) return readFailure();
        if (!state.bird) {
            return commit(state, at, 'NO_BIRD');
        }
        if ((kind === 'feed' && state.care.satiety >= 100) || (kind === 'water' && state.care.hydration >= 100)) {
            return { data: { saved: true, snapshot: publicSnapshot(state, at, rules, debugSteps), changed: false }, error: null };
        }
        if (kind === 'feed') {
            if (state.care.food <= 0) {
                return commit(state, at, 'NO_FOOD');
            }
            state.care.food -= 1;
            state.care.satiety = clamp(state.care.satiety + 20, 0, 100);
        } else if (kind === 'water') {
            if (state.care.water <= 0) {
                return commit(state, at, 'NO_WATER');
            }
            state.care.water -= 1;
            state.care.hydration = clamp(state.care.hydration + 20, 0, 100);
        } else {
            state.care.mood = clamp(state.care.mood + 5, 0, 100);
        }
        state.care.updatedAt = at;
        return commit(state, at, null);
    }

    function redeemSteps(steps, now) {
        const at = isNumber(now) ? now : Date.now();
        const state = read(at);
        if (!state) return readFailure();
        if (!state.bird) {
            return commit(state, at, 'NO_BIRD');
        }
        if (!isNumber(steps) || steps < 0 || Math.floor(steps) !== steps) {
            return commit(state, at, 'INVALID_STEPS');
        }
        const day = dayKey(at);
        if (state.stepClaims[day]) {
            return commit(state, at, 'ALREADY_CLAIMED');
        }
        const granted = award(state, 'steps', stepReward(steps, state, at, rules), '微信步数兑换', at, rules);
        if (granted <= 0) {
            return commit(state, at, 'NO_REWARD');
        }
        state.stepClaims[day] = { steps: steps, points: granted };
        return commit(state, at, null, { granted: granted });
    }

    // 服务端已结算后的本地镜像：严格按服务端下发的 granted 记录，前端不再用步数重算（防篡改）。
    function recordExact(state, amount, note, now, day) {
        state.dayPoints[day] = (state.dayPoints[day] || 0) + amount;
        state.points += amount;
        state.ledger.unshift({
            id: String(now) + '-steps-' + String(amount),
            kind: 'steps',
            amount: amount,
            note: note,
            at: now,
            day: day,
        });
        state.ledger = state.ledger.slice(0, 40);
        return amount;
    }

    function applyServerReward(granted, steps, date, now, claimed) {
        const at = isNumber(now) ? now : Date.now();
        const state = read(at);
        if (!state) return readFailure();
        if (!state.bird) {
            return commit(state, at, 'NO_BIRD');
        }
        const day = (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : dayKey(at);
        if (state.stepClaims[day]) {
            return commit(state, at, 'ALREADY_CLAIMED');
        }
        let given = 0;
        if (granted > 0) {
            given = recordExact(state, granted, '微信步数兑换', at, day);
        }
        if (given <= 0 && !claimed) {
            return commit(state, at, 'NO_REWARD');
        }
        state.stepClaims[day] = { steps: steps || 0, points: given };
        return commit(state, at, null, { granted: given });
    }

    function adopt(code, nickname, now, cityCode) {
        const at = isNumber(now) ? now : Date.now();
        const state = read(at);
        if (!state) return readFailure();
        const cleanCode = text(code, 64).trim();
        if (!cleanCode) {
            return commit(state, at, 'INVALID_CODE');
        }
        if (state.bird) {
            const sameBird = state.bird.code === cleanCode;
            return {
                data: { saved: true, snapshot: publicSnapshot(state, at, rules, debugSteps), replayed: sameBird },
                error: sameBird ? null : 'BIRD_ALREADY_PRESENT',
            };
        }
        const cleanName = text(nickname, 12).trim();
        const nameLength = Array.from(cleanName).length;
        if (nameLength < 1 || nameLength > 6) {
            return commit(state, at, 'INVALID_NICKNAME');
        }
        // 调试期为单鸟本机模型；正式版由服务端按账号与实体编码做幂等绑定。
        state.bird = { code: cleanCode, nickname: cleanName, cityCode: cityCode === undefined ? 'hangzhou' : text(cityCode, 32), adoptedAt: at };
        return commit(state, at, null, { birdCode: cleanCode });
    }

    // 网页端小窝的「补给 / 改名」两个本机交互。都不发放叽分，避免与每日上限规则冲突。
    function supply(now) {
        const at = isNumber(now) ? now : Date.now();
        const state = read(at);
        if (!state) return readFailure();
        if (!state.bird) {
            return commit(state, at, 'NO_BIRD');
        }
        const day = dayKey(at);
        if (claimedSupplyOn(state, day)) {
            return commit(state, at, 'ALREADY_CLAIMED');
        }
        const foodAdded = state.care.food < SUPPLY_CAP ? 1 : 0;
        const waterAdded = state.care.water < SUPPLY_CAP ? 1 : 0;
        if (!foodAdded && !waterAdded) {
            return { data: { saved: true, snapshot: publicSnapshot(state, at, rules, debugSteps), foodAdded, waterAdded }, error: null };
        }
        state.care.food += foodAdded;
        state.care.water += waterAdded;
        state.supplyDays[day] = true;
        return commit(state, at, null, { granted: 0, foodAdded, waterAdded });
    }

    function supplyInstallationId(candidate, now) {
        const at = isNumber(now) ? now : Date.now();
        const state = read(at);
        if (!state) return { data: { id: '' }, error: 'STORAGE_UNAVAILABLE' };
        if (state.supplyInstallationId || candidate === undefined) {
            return { data: { id: state.supplyInstallationId }, error: null };
        }
        if (!state.bird) return { data: { id: '' }, error: 'NO_BIRD' };
        if (!isSupplyInstallationId(candidate)) {
            return { data: { id: '' }, error: 'INVALID_INSTALLATION_ID' };
        }
        state.supplyInstallationId = candidate;
        if (!write(state)) {
            // 写入异常后回读确认，避免把未保存的安装 ID 交给服务端。
            const stored = read(at);
            if (!stored || !stored.supplyInstallationId) {
                return { data: { id: '' }, error: 'STORAGE_UNAVAILABLE' };
            }
            return { data: { id: stored.supplyInstallationId }, error: null };
        }
        return { data: { id: candidate }, error: null };
    }

    function supplyClaimedOn(date, now) {
        if (!isSupplyDay(date)) return { data: { claimed: false }, error: 'INVALID_SUPPLY_DATE' };
        const state = read(isNumber(now) ? now : Date.now());
        if (!state) return { data: { claimed: false }, error: 'STORAGE_UNAVAILABLE' };
        return { data: { claimed: claimedSupplyOn(state, date) }, error: null };
    }

    function applySupplyReceipt(receipt, now) {
        const at = isNumber(now) ? now : Date.now();
        const state = read(at);
        if (!state) return readFailure();
        const before = publicSnapshot(state, at, rules, debugSteps);
        const unchanged = { saved: true, snapshot: before, foodAdded: 0, waterAdded: 0 };
        if (!receipt || !isSupplyReceiptId(receipt.id) || !isSupplyDay(receipt.date) ||
            typeof receipt.birdCode !== 'string' || !receipt.birdCode || receipt.food !== 1 || receipt.water !== 1) {
            return { data: unchanged, error: 'INVALID_SUPPLY_RECEIPT' };
        }
        if (!state.bird) return { data: unchanged, error: 'NO_BIRD' };
        if (state.bird.code !== receipt.birdCode) return { data: unchanged, error: 'SUPPLY_BIRD_MISMATCH' };
        if (claimedSupplyOn(state, receipt.date) || Object.values(state.supplyReceipts).includes(receipt.id)) {
            return { data: unchanged, error: 'ALREADY_CLAIMED' };
        }
        const foodAdded = state.care.food < SUPPLY_CAP ? receipt.food : 0;
        const waterAdded = state.care.water < SUPPLY_CAP ? receipt.water : 0;
        if (!foodAdded && !waterAdded) return { data: unchanged, error: 'STOCK_FULL' };

        // 库存和服务端自然日的回执标记必须在同一个缓存写入中落盘。
        state.care.food += foodAdded;
        state.care.water += waterAdded;
        state.supplyReceipts[receipt.date] = receipt.id;
        const stored = write(state) ? state : read(at);
        if (!stored || stored.supplyReceipts[receipt.date] !== receipt.id) {
            return { data: Object.assign({}, unchanged, { saved: false }), error: 'STORAGE_UNAVAILABLE' };
        }
        return {
            data: { saved: true, snapshot: publicSnapshot(stored, at, rules, debugSteps), foodAdded, waterAdded },
            error: null,
        };
    }

    function rename(nickname, now) {
        const at = isNumber(now) ? now : Date.now();
        const state = read(at);
        if (!state) return readFailure();
        if (!state.bird) {
            return commit(state, at, 'NO_BIRD');
        }
        const cleanName = text(nickname, 12).trim();
        const length = Array.from(cleanName).length;
        if (length < 1 || length > 6) {
            return commit(state, at, 'INVALID_NICKNAME');
        }
        state.bird.nickname = cleanName;
        return commit(state, at, null);
    }

    // 合照收藏：同一请求编号幂等，同一张原图只发一次，每日最多 3 张新原图各 +1。
    // 沿用本机全局叽分日上限；额度用尽时不记入本张原图，可稍后再试。
    function photoReward(id, hash, now) {
        const at = isNumber(now) ? now : Date.now();
        const state = read(at);
        if (!state) return readFailure();
        if (!state.bird) return commit(state, at, 'NO_BIRD');
        const request = 'photo:' + String(id);
        if (Object.prototype.hasOwnProperty.call(state.photoRequests, request)) {
            return commit(state, at, null, { reward: state.photoRequests[request].reward, replayed: true });
        }
        const day = dayKey(at);
        const digest = typeof hash === 'string' ? hash.slice(0, 128) : '';
        let reward = 0;
        if (digest && state.photoHashes.indexOf(digest) < 0 && (state.photoDays[day] || 0) < 3) {
            const granted = award(state, 'photo', 1, '合照打卡', at, rules);
            if (granted > 0) {
                reward = 1;
                state.photoHashes.push(digest);
                state.photoDays[day] = (state.photoDays[day] || 0) + 1;
            }
        }
        state.photoRequests[request] = { reward: reward };
        return commit(state, at, null, { reward: reward, replayed: false });
    }

    function reset(now) {
        const at = isNumber(now) ? now : Date.now();
        const state = defaultState(at);
        let removed = true;
        try {
            storage.removeStorageSync(STORAGE_KEY);
        } catch (error) {
            removed = false;
        }
        return {
            data: { saved: removed, reset: removed, snapshot: publicSnapshot(state, at, rules, debugSteps) },
            error: removed ? null : 'STORAGE_UNAVAILABLE',
        };
    }

    return {
        snapshot: snapshot,
        pet: pet,
        feed: function (now) { return careAction('feed', now); },
        water: function (now) { return careAction('water', now); },
        clean: function (now) { return careAction('clean', now); },
        redeemSteps: redeemSteps,
        applyServerReward: applyServerReward,
        supply: supply,
        supplyInstallationId: supplyInstallationId,
        supplyClaimedOn: supplyClaimedOn,
        applySupplyReceipt: applySupplyReceipt,
        rename: rename,
        adopt: adopt,
        photoReward: photoReward,
        reset: reset,
    };
}

module.exports = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_RULES: DEFAULT_RULES,
    SUPPLY_CAP: SUPPLY_CAP,
    dayKey: dayKey,
    normalize: normalize,
    createGuestStore: createGuestStore,
};
