'use strict';
const crypto = require('node:crypto');
const copy = value => value === undefined ? undefined : structuredClone(value);
function platform(transport, memory = new Map()) {
    const calls = [];
    const wx = {
        calls, memory,
        getStorageSync: key => copy(memory.get(key)),
        setStorageSync: (key, value) => memory.set(key, copy(value)),
        removeStorageSync: key => memory.delete(key),
        login: opts => opts.success({ code: 'MP_CLOUD_TEST' }),
        getRandomValues: opts => opts.success({ randomValues: Uint8Array.from(crypto.randomBytes(opts.length)).buffer }),
        request(opts) {
            calls.push({ path: new URL(opts.url).pathname, method: opts.method, data: copy(opts.data), header: opts.header });
            Promise.resolve().then(() => transport(opts)).then(opts.success, opts.fail);
        },
    };
    return wx;
}
async function http(opts) {
    const res = await fetch(opts.url, { method: opts.method, headers: opts.header,
        body: opts.method === 'POST' && opts.data ? JSON.stringify(opts.data) : undefined, signal: AbortSignal.timeout(12000) });
    return { statusCode: res.status, header: Object.fromEntries(res.headers), data: res.status === 204 ? null : await res.json() };
}
module.exports = { platform, http };
