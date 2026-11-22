'use strict';

const config = require('./config');

const ORIOLE_AVATAR = '/assets/nest/avatar.webp';
const OSMANTHUS_ART = '/assets/nest/osmanthus-preview.webp';

function isOsmanthus(code) {
    return /^HZ-GH-/i.test(code || '') ||
        (config.DEVICE_SANDBOX_TEST === true && !!code && code === config.DEBUG_OSMANTHUS_BIRD_CODE);
}

function isOriole(code) {
    return !isOsmanthus(code) && /^HZ-HY-/i.test(code || '');
}

function birdAvatar(code) {
    return isOsmanthus(code) ? OSMANTHUS_ART : (isOriole(code) ? ORIOLE_AVATAR : '');
}

module.exports = { ORIOLE_AVATAR, OSMANTHUS_ART, birdAvatar, isOriole, isOsmanthus };
