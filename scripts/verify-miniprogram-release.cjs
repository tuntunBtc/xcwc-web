'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { collectRuntimeFiles, isFile } = require('./miniprogram-runtime-files.cjs');

const { values: flags, positionals } = parseArgs({
    options: {
        release: { type: 'boolean' },
        'step-supply': { type: 'boolean' },
        appid: { type: 'string' },
        'api-base': { type: 'string' },
    },
    allowPositionals: true,
});
if (positionals.length > 1) throw new Error('只接受一个小程序候选目录');
const root = path.resolve(positionals[0] || path.join(__dirname, '../miniprogram'));
const readJson = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const app = readJson('app.json');
const project = readJson('project.config.json');
const config = require(path.join(root, 'utils/config.js'));
const subpackages = app.subpackages || app.subPackages || [];
const excluded = (project.packOptions || {}).ignore || [];
const included = (project.packOptions || {}).include || [];
const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;
const APPID_PATTERN = /^wx[0-9a-f]{16}$/i;
const failures = [];
let packagedWebp = 0;

function supportedPackRule(rule) {
    return rule && (rule.type === 'file' || rule.type === 'folder') && typeof rule.value === 'string';
}

const rootedPackPath = name => name.startsWith('/') ? name : '/' + name;

function matchesPackRule(name, rule) {
    if (!supportedPackRule(rule)) return false;
    const value = rootedPackPath(rule.value.toLowerCase());
    return rule.type === 'file' ? name === value : name.startsWith(value.endsWith('/') ? value : value + '/');
}

function skipped(name) {
    const normalized = rootedPackPath(name.replace(/\\/g, '/').toLowerCase());
    return excluded.some(rule => matchesPackRule(normalized, rule)) && !included.some(rule => matchesPackRule(normalized, rule));
}

const sizes = new Map([['main', 0], ...subpackages.map(pkg => [pkg.root, 0])]);
function countFiles(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const name = relative ? relative + '/' + entry.name : entry.name;
        if (name.startsWith('project.') || entry.name === '.DS_Store') continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) countFiles(file, name);
        else if (entry.isFile() && !skipped(name)) {
            if (path.extname(name).toLowerCase() === '.webp') packagedWebp += 1;
            const pkg = subpackages.find(item => name.startsWith(item.root + '/'));
            const key = pkg ? pkg.root : 'main';
            sizes.set(key, sizes.get(key) + fs.statSync(file).size);
        }
    }
}

countFiles(root);
for (const [name, bytes] of sizes) {
    console.log(name + '  ' + bytes + ' B（源码及资源估算）');
    if (bytes > MAX_PACKAGE_BYTES) failures.push(name + ' 源码及资源超过 2 MiB');
}

const runtime = collectRuntimeFiles(root, app);
for (const file of runtime.files) {
    if (!isFile(root, file)) failures.push('候选包缺少必需文件：' + file);
    else if (skipped(file)) failures.push('打包规则排除了必需文件：' + file);
}
for (const reference of runtime.outside) failures.push('运行模块引用超出候选目录：' + reference);
for (const tab of app.tabBar.list) {
    if (!app.pages.includes(tab.pagePath)) failures.push('底栏页面不在主包：' + tab.pagePath);
}

function apiRoot(value) {
    try {
        const url = new URL(value);
        const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
        if (url.protocol === 'https:' && url.href === url.origin + '/' && hostname.includes('.') &&
            !hostname.startsWith('.') && !hostname.endsWith('.') && !hostname.includes('..') &&
            !net.isIP(hostname) && !/(?:^|\.)(?:localhost|local)$/.test(hostname)) {
            return { origin: url.origin, hostname };
        }
    } catch (error) { /* 由调用处报告无效地址 */ }
    return null;
}

function isReservedHost(api) {
    return api && (/\.(?:example|invalid|test)$/.test(api.hostname) ||
        /(?:^|\.)example\.(?:com|net|org)$/.test(api.hostname));
}

const api = apiRoot(config.API_BASE);
if (!api) failures.push('缺少有效的 HTTPS API 域名根地址');
if (config.USE_LOCAL_FIXTURE !== false) failures.push('仍启用调试数据');
if (config.DEBUG_DEMO_BIRD_CODE) failures.push('发布配置仍带调试领养码');
if (flags['step-supply'] && config.ENABLE_WERUN_SUPPLIES !== true) failures.push('候选包尚未开启微信步数补给');
if (flags.release && !flags['step-supply'] && config.ENABLE_WERUN_SUPPLIES !== false) {
    failures.push('正式校验预期关闭微信步数补给，但候选包没有明确关闭');
}
if (!APPID_PATTERN.test(project.appid || '')) failures.push('缺少格式正确的小程序 AppID');
if (project.setting?.urlCheck !== true) failures.push('发布项目未开启合法域名检查');
if (project.condition) failures.push('发布项目仍包含本机编译预设');
if (fs.existsSync(path.join(root, 'project.private.config.json'))) failures.push('发布项目仍包含本机私有配置');
if (packagedWebp) failures.push('当前官方 CI 默认编译会过滤本地 WebP（' + packagedWebp + ' 个），须验证可发布的素材方案');

if (flags.release) {
    for (const rule of [...excluded, ...included]) {
        if (!supportedPackRule(rule)) failures.push('正式校验不支持此打包规则：' + (rule?.type || '缺少类型'));
    }
    if (!APPID_PATTERN.test(flags.appid || '')) failures.push('正式校验需要独立提供有效的 --appid');
    else if (flags.appid !== project.appid) failures.push('候选 AppID 与正式校验提供的 AppID 不一致');

    const expectedApi = apiRoot(flags['api-base']);
    if (!expectedApi) failures.push('正式校验需要独立提供有效的 --api-base');
    else if (api && expectedApi.origin !== api.origin) failures.push('候选 API 根地址与正式校验提供的 API 根地址不一致');
    if (isReservedHost(api) || isReservedHost(expectedApi)) failures.push('正式校验不接受示例或保留域名');
} else if (flags.appid !== undefined || flags['api-base'] !== undefined) {
    failures.push('--appid 和 --api-base 需要与 --release 一起使用');
}

if (failures.length) {
    failures.forEach(failure => console.error('FAIL ' + failure));
    process.exitCode = 1;
} else {
    if (flags.release) console.log('候选 AppID 和 HTTPS API 根地址与正式校验参数一致。');
    console.log('源码检查通过。实际编译体积及微信后台配置需单独核验。');
}
