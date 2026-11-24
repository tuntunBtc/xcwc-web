'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../miniprogram/pages/index/index.js'), 'utf8');
function harness() {
    let definition, id = 0; const calls = [], timers = new Map();
    const video = {play: () => calls.push('play'), pause: () => calls.push('pause'), seek: n => calls.push('seek:' + n), stop: () => calls.push('stop')};
    const modules = { '../../utils/config': {}, './spark': {presentSpark: () => ({})}, '../../utils/cloud-ui': {page: p => p}, '../../utils/bird-preview-art': {} };
    vm.runInNewContext(source, {Page: p => {definition=p;}, require: name => modules[name] || {}, wx: {createVideoContext: () => video, showToast: () => calls.push('toast')}, setTimeout: (fn, ms) => {timers.set(++id,{fn,ms}); return id;}, clearTimeout: timer => timers.delete(timer), console});
    const page = {...definition, data:{...definition.data}, syncIdle: on => calls.push('idle:' + on)};
    page.setData = (values, cb) => {Object.assign(page.data,values); if (cb) cb();};
    const fire = ms => {const item=[...timers.entries()].find(([,v])=>v.ms===ms); assert.ok(item, 'timer '+ms); timers.delete(item[0]); item[1].fn();};
    return {page,calls,timers,fire};
}
const event = {currentTarget:{dataset:{key:'diary'}}};
test('first decoded video frame is held during crossfade, then the full video resumes and returns', async () => {
    const h=harness(),p=h.page; await p.onTool(event); assert.equal(p.data.diaryVideoPlaying,false); assert.deepEqual(h.calls,['idle:true','play']);
    p.onDiaryVideoPlay(); p.onDiaryVideoTimeUpdate({detail:{currentTime:0.25,duration:10}});
    assert.equal(p.data.diaryVideoPlaying,false); assert.deepEqual(h.calls.slice(-2),['pause','seek:0']);
    p.onDiaryVideoSeekComplete(); h.fire(120); assert.equal(p.data.diaryVideoPlaying,true); h.fire(1020); assert.equal(h.calls.at(-1),'play');
    p.onDiaryVideoTimeUpdate({detail:{currentTime:9.6,duration:10}}); assert.equal(p.data.diaryVideoPlaying,false); assert.equal(p.data.diaryVideoVisible,true);
    p.onDiaryVideoEnded(); h.fire(1900); assert.equal(p.data.diaryVideoVisible,false); assert.deepEqual(h.calls.slice(-2),['stop','idle:false']);
});
test('repeat taps, cancellation and load failure do not leave a video or restart it', async () => {
    const h=harness(),p=h.page; await p.onTool(event); await p.onTool(event); assert.equal(h.calls.filter(x=>x==='play').length,1);
    p.onDiaryVideoPlay(); p.onDiaryVideoTimeUpdate({detail:{currentTime:0.1,duration:10}}); p.stopDiaryVideo(); assert.equal(h.timers.size,0); assert.equal(p.data.diaryVideoVisible,false);
    await p.onTool(event); h.fire(45000); assert.equal(p.data.diaryVideoVisible,false); assert.equal(h.timers.size,0); assert.equal(h.calls.at(-1),'toast');
});
test('error during first-frame fade cancels delayed playback and restores the scene', async () => {
    const h=harness(),p=h.page; await p.onTool(event); p.onDiaryVideoPlay(); p.onDiaryVideoTimeUpdate({detail:{currentTime:0.1,duration:10}}); p.onDiaryVideoSeekComplete(); h.fire(120); p.onDiaryVideoError();
    assert.equal([...h.timers.values()].some(v=>v.ms===1020),false); h.fire(1900); assert.equal(p.data.diaryVideoVisible,false); assert.equal(h.calls.filter(x=>x==='play').length,1);
});
