'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../miniprogram/utils/diary-player.js'), 'utf8');
const urls = require('../miniprogram/utils/diary-urls');
function fixture({failDownload = false} = {}) {
    let downloads = 0, draws = 0, plays = 0, stopped = 0, error = 0, started = 0, ended = 0, handlers = {};
    const timers = new Map(); let nextTimer = 0;
    const context = { clearRect() {}, drawImage() { draws++; } };
    const canvas = { getContext: () => context, createImage() { const image = {}; Object.defineProperty(image, 'src', { set() { queueMicrotask(() => image.onload()); } }); return image; } };
    const wx = {
        downloadFile({success}) { downloads++; queueMicrotask(() => success(failDownload ? {statusCode:503} : {statusCode:200,tempFilePath:'/temp/'+downloads})); return {abort(){}}; },
        getFileSystemManager() { return {access({success}) { success(); }}; },
        createSelectorQuery() { return {in() { return this; },select() { return this; },fields() { return this; },exec(cb) { cb([{node:canvas,width:375,height:812}]); }}; },
        getWindowInfo() { return {pixelRatio:2}; },
        createInnerAudioContext() { return {currentTime:0, onPlay(cb){handlers.play=cb;},onEnded(cb){handlers.ended=cb;},onError(cb){handlers.error=cb;},play(){plays++;handlers.play();},pause(){},stop(){stopped++;},destroy(){}}; },
    };
    const mod = {exports:{}};
    vm.runInNewContext(source,{module:mod,require:() => urls,wx,Promise,console,setTimeout(fn, ms){if (ms >= 250) { queueMicrotask(fn); return ++nextTimer; } timers.set(++nextTimer,fn);return nextTimer;},clearTimeout(id){timers.delete(id);}});
    const player = mod.exports.create({}, {started(){started++;},ended(){ended++;},error(){error++;}});
    return {player,handlers,stats:() => ({downloads,draws,plays,stopped,error,started,ended})};
}
test('loads the OSS atlases, draws a first frame, plays and can be stopped', async () => {
    const f=fixture(); await f.player.start();
    assert.equal(f.stats().downloads,13); assert.ok(f.stats().draws>=1);
    assert.equal(f.stats().started,1); assert.equal(f.stats().plays,1);
    f.handlers.ended(); assert.equal(f.stats().ended,1);
    f.player.stop(); assert.equal(f.stats().stopped,1);
    await f.player.start(); assert.equal(f.stats().downloads,13, 'reuses session files');
    f.player.stop();
});
test('failed asset requests retry and return an error without starting', async () => {
    const f=fixture({failDownload:true}); await f.player.start();
    assert.equal(f.stats().downloads,3); assert.equal(f.stats().error,1); assert.equal(f.stats().started,0);
});
