'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../miniprogram');
if (!process.argv[2]) throw new Error('请指定素材发布目录');
const output = path.resolve(process.argv[2]);
const objects = path.join(output, 'objects');
const types = {
    '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
    '.aac': 'audio/aac', '.wav': 'audio/wav', '.mp4': 'video/mp4',
};
const entries = {};
fs.mkdirSync(objects, { recursive: true });

function scan(directory) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
        const name = path.posix.join(directory, entry.name);
        if (entry.isDirectory()) {
            scan(name);
        } else if (entry.isFile()) {
            const extension = path.extname(name).toLowerCase();
            const mime = types[extension];
            if (!mime) continue;
            const bytes = fs.readFileSync(path.join(root, name));
            const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
            const filename = sha256 + extension;
            fs.writeFileSync(path.join(objects, filename), bytes);
            entries['/' + name] = {
                sha256, bytes: bytes.length, mime,
                object: 'content/public-mini/' + filename,
                url: 'https://assets.xinchengip.com/mini/media/' + filename,
            };
        }
    }
}

for (const directory of ['assets', 'media', 'pages', 'custom-tab-bar']) scan(directory);
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(entries, null, 2) + '\n', 'utf8');
console.log(Object.keys(entries).length + ' 个素材路径');
