'use strict';

let loading;

function load() {
    if (typeof require.async !== 'function') return Promise.resolve(null);
    if (!loading) {
        loading = require.async('../media/collection/files.js').catch(function () {
            loading = null;
            return null;
        });
    }
    return loading;
}

module.exports = { load };
