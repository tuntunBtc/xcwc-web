'use strict';
const { apiRoot } = require('./api-root');

const codes = Object.freeze({
    'bird-awake': 'awake_idle', 'bird-doze': 'fall_asleep', 'bird-sleeping': 'sleep_idle',
    'bird-wake': 'wake_up', 'bird-pet': 'head_pat', 'bird-eat': 'eat', 'bird-drink': 'drink',
});

function mediaUrl(url) {
    if (typeof url !== 'string') return '';
    const asset = /^https:\/\/assets\.xinchengip\.com\/(?:mini\/media|(?:test\/)?bird\/v1\/oss\/uploads)\/[a-zA-Z0-9_.-]+$/;
    const testUpload = /^https:\/\/api\.xinchengip\.com\/test\/bird\/v1\/oss\/uploads\/[a-zA-Z0-9_.-]+$/;
    return asset.test(url) || testUpload.test(url) ? url : '';
}
function read(platform, base, characterId) {
    if (!apiRoot(base) || !/^[a-zA-Z0-9_-]{1,32}$/.test(characterId || '')) return Promise.resolve(null);
    return new Promise(resolve => platform.request({
        url: base + '/nest-interactions/' + encodeURIComponent(characterId),
        timeout: 6000,
        success(response) {
            const doc = response.data;
            if (response.statusCode !== 200 || doc?.characterId !== characterId || !Array.isArray(doc.actions)) return resolve(null);
            const actions = Object.create(null);
            for (const action of doc.actions) {
                if (action?.enabled !== true || !/^[a-zA-Z0-9_-]{1,80}$/.test(action.actionCode || '') || !mediaUrl(action.videoUrl)) continue;
                actions[action.actionCode] = {
                    code: action.actionCode, label: String(action.name || action.actionCode),
                    url: action.videoUrl, sound: action.sound !== false,
                    poster: mediaUrl(action.firstFrameUrl),
                };
            }
            resolve(actions);
        },
        fail() { resolve(null); },
    })).catch(() => null);
}

module.exports = { codes, read };
