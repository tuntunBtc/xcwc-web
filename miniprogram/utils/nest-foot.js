'use strict';

const { idleSize, idle, happy, angry } = require('./nest-foot-masks');
const staticAreas = {
    'poster.webp': { size: idleSize, masks: idle[0] },
    'emotion-happy.webp': happy,
    'emotion-angry.webp': angry,
};
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function containsFootPixel([left, top, width, height, bits], pixelX, pixelY) {
    const x = pixelX - left;
    const y = pixelY - top;
    if (x < 0 || y < 0 || x >= width || y >= height) return false;

    // The mask stores pixels least-significant bit first within each byte.
    // Base64 encodes the same bytes most-significant bit first.
    const index = y * width + x;
    const encodedBit = (index & ~7) + (7 - (index & 7));
    const digit = BASE64.indexOf(bits[Math.floor(encodedBit / 6)]);
    return digit >= 0 && (digit & (1 << (5 - encodedBit % 6))) !== 0;
}

function isFootTap(artPath, idleFrame, rect, x, y) {
    const area = Number.isInteger(idleFrame)
        ? { size: idleSize, masks: idle[idleFrame] }
        : staticAreas[String(artPath || '').split('/').pop()];
    if (!area || !area.masks || !rect ||
        ![rect.left, rect.top, rect.width, rect.height, x, y].every(Number.isFinite) ||
        rect.width <= 0 || rect.height <= 0) return false;

    const [sourceWidth, sourceHeight] = area.size;
    const scale = Math.min(rect.width / sourceWidth, rect.height / sourceHeight);
    const left = rect.left + (rect.width - sourceWidth * scale) / 2;
    const top = rect.top + (rect.height - sourceHeight * scale) / 2;
    const pixelX = Math.floor((x - left) / scale);
    const pixelY = Math.floor((y - top) / scale);
    return area.masks.some(mask => containsFootPixel(mask, pixelX, pixelY));
}

// These masks describe the bundled atlas and identical published copies, frame for frame.
const idleAtlasHash = '5537383d5cf6bc8e0bc218bd611e9211451ab567dee3c61494b996e703e56716';
module.exports = { isFootTap, idleAtlasHash };
