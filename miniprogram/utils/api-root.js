'use strict';

const ASSET_ORIGIN = 'https://assets.xinchengip.com';

function apiRoot(base) {
    const value = typeof base === 'string' ? base.replace(/\/+$/, '') : '';
    return /^https?:\/\/[^/\s?#@]+\/(?:test\/)?bird\/v1$/.test(value) ? value : '';
}

function assetUrl(path) {
    return /^\/bird\/v1\/content\/assets\/[a-f0-9]{32}$/.test(path) ? ASSET_ORIGIN + path : '';
}

module.exports = { apiRoot, assetUrl };
