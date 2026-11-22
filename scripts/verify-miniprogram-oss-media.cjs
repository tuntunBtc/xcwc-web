'use strict';

const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { get } = require('node:https');
const path = require('node:path');
const { parseArgs } = require('node:util');

const BASE_URL = 'https://assets.xinchengip.com/mini/media/';
const OBJECT_PREFIX = 'content/public-mini/';
const MEDIA_EXTENSION = /^\.(?:webp|png|jpe?g|svg|gif|mp3|m4a|aac|wav|mp4)$/;
const CONCURRENCY = 6;
const TIMEOUT_MS = 15000;

function validateEntry(route, entry) {
    const extension = path.posix.extname(route).toLowerCase();
    if (!route.startsWith('/') || path.posix.normalize(route) !== route || !MEDIA_EXTENSION.test(extension) ||
        typeof entry?.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256) ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || typeof entry.mime !== 'string' || !entry.mime) {
        throw new Error('清单条目格式无效');
    }
    const filename = entry.sha256 + extension;
    if (entry.url !== BASE_URL + filename || entry.object !== OBJECT_PREFIX + filename) {
        throw new Error('URL 或对象键与素材域及内容指纹不一致');
    }
}

async function verifyEntry(route, entry) {
    const result = { route, url: entry?.url, ok: false };
    try {
        validateEntry(route, entry);
        result.expected = { bytes: entry.bytes, sha256: entry.sha256 };
        const response = await new Promise((resolve, reject) => {
            get(entry.url, {
                headers: { 'Accept-Encoding': 'identity' },
                signal: AbortSignal.timeout(TIMEOUT_MS),
            }, resolve).once('error', reject);
        });
        result.status = response.statusCode;
        if (response.statusCode !== 200) {
            response.destroy();
            throw new Error(`HTTP ${response.statusCode}，预期 200`);
        }
        const hash = createHash('sha256');
        let bytes = 0;
        for await (const chunk of response) {
            bytes += chunk.length;
            if (bytes > entry.bytes) {
                result.actual = { bytesAtLeast: bytes };
                throw new Error('响应体超过清单大小');
            }
            hash.update(chunk);
        }
        result.actual = { bytes, sha256: hash.digest('hex') };
        if (bytes !== entry.bytes) throw new Error('响应体字节数与清单不一致');
        if (result.actual.sha256 !== entry.sha256) throw new Error('响应体 SHA-256 与清单不一致');
        result.ok = true;
    } catch (error) {
        result.error = error.message;
    }
    return result;
}

async function main() {
    const { values, positionals } = parseArgs({ options: { report: { type: 'string' } }, allowPositionals: true });
    if (positionals.length !== 1) {
        throw new Error('用法：node scripts/verify-miniprogram-oss-media.cjs <manifest.json> [--report <新回执.json>]');
    }
    const manifest = JSON.parse(readFileSync(positionals[0], 'utf8'));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Object.keys(manifest).length) {
        throw new Error('清单必须是非空的素材路径映射');
    }
    const entries = Object.entries(manifest);
    const results = [];
    let next = 0;
    async function worker() {
        while (next < entries.length) {
            const index = next++;
            results[index] = await verifyEntry(...entries[index]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));

    const passed = results.filter(result => result.ok).length;
    const report = {
        checkedAt: new Date().toISOString(),
        manifest: path.resolve(positionals[0]),
        total: results.length,
        passed,
        failed: results.length - passed,
        results,
    };
    const text = JSON.stringify(report, null, 2) + '\n';
    if (values.report) {
        writeFileSync(values.report, text, { encoding: 'utf8', flag: 'wx' });
        console.log(`公网核验通过 ${passed}/${results.length} 项。回执 ${values.report}`);
    } else {
        process.stdout.write(text);
    }
    if (report.failed) process.exitCode = 1;
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
