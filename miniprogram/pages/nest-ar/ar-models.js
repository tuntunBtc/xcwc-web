'use strict';

const BASE_URL = 'https://assets.xinchengip.com/ar/models/';
const FILES = {
    "color": {
        "name": "color-f8da55cc019a6df2.glb",
        "size": 469376
    },
    "original": {
        "name": "original-827044cdbc213474.glb",
        "size": 466876
    },
    "plush": {
        "name": "plush-c0e6668998495eee.glb",
        "size": 498840
    },
    "profile": {
        "name": "profile-e9e90bf7bc773548.glb",
        "size": 448744
    }
};
const pending = new Map();

function validFile(fileSystem, path, size) {
    try {
        if (fileSystem.statSync(path).size !== size) return false;
        const header = new DataView(fileSystem.readFileSync(path, undefined, 0, 12));
        return header.getUint32(0, true) === 0x46546c67
            && header.getUint32(4, true) === 2
            && header.getUint32(8, true) === size;
    } catch {
        return false;
    }
}

function removeFile(fileSystem, path) {
    try { fileSystem.unlinkSync(path); } catch { /* Missing file. */ }
}

function cachePath(platform, asset) {
    return platform.env.USER_DATA_PATH + '/xcwh-ar-' + asset.name;
}

function removeOldVersions(fileSystem, directory, asset) {
    const model = asset.name.slice(0, asset.name.indexOf('-'));
    const owned = new RegExp('^xcwh-ar-' + model + '-[a-f0-9]{16}\\.glb$');
    try {
        for (const name of fileSystem.readdirSync(directory)) {
            if (owned.test(name) && name !== 'xcwh-ar-' + asset.name) removeFile(fileSystem, directory + '/' + name);
        }
    } catch { /* A cache cleanup failure does not block rendering. */ }
}

async function download(platform, asset) {
    const fileSystem = platform.getFileSystemManager();
    const path = cachePath(platform, asset);
    if (validFile(fileSystem, path, asset.size)) return path;

    const temporary = path + '.part';
    removeFile(fileSystem, temporary);
    try {
        const result = await new Promise((resolve, reject) => {
            platform.downloadFile({
                url: BASE_URL + asset.name,
                filePath: temporary,
                timeout: 30000,
                success: resolve,
                fail: reject,
            });
        });
        if (result.statusCode !== 200 || !validFile(fileSystem, temporary, asset.size)) {
            throw new Error('AR 模型下载不完整：' + asset.name);
        }
        removeFile(fileSystem, path);
        fileSystem.renameSync(temporary, path);
        removeOldVersions(fileSystem, platform.env.USER_DATA_PATH, asset);
        return path;
    } finally {
        removeFile(fileSystem, temporary);
    }
}

exports.loadArModel = function loadArModel(key, platform = wx) {
    if (!Object.prototype.hasOwnProperty.call(FILES, key)) return Promise.reject(new Error('未知 AR 模型'));
    const asset = FILES[key];
    if (!pending.has(key)) {
        pending.set(key, download(platform, asset).finally(() => pending.delete(key)));
    }
    return pending.get(key);
};

exports.invalidateArModel = function invalidateArModel(key, path, platform = wx) {
    if (!Object.prototype.hasOwnProperty.call(FILES, key) || cachePath(platform, FILES[key]) !== path) return;
    removeFile(platform.getFileSystemManager(), path);
};
