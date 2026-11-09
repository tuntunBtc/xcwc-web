import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/nest/nest.js',import.meta.url),'utf8');
const data=JSON.parse(readFileSync(new URL('../src/nest/idle-animation.json',import.meta.url),'utf8'));
const frameAt=vm.runInNewContext(source+'\n nestIdleFrameAt');

test('audio time selects the right frame at variable-rate boundaries and the loop seam',()=>{
 assert.equal(frameAt(data,0),0);
 for(let i=1;i<data.frameTimesMs.length;i++){
  const time=data.frameTimesMs[i];
  assert.equal(frameAt(data,time-.01),i-1);
  assert.equal(frameAt(data,time),i);
 }
 assert.equal(frameAt(data,data.durationMs-.01),data.frameCount-1);
 assert.equal(frameAt(data,data.durationMs),0);
 assert.equal(frameAt(data,2*data.durationMs+100),frameAt(data,100));
 for(const invalid of [NaN,Infinity,-1])assert.equal(frameAt(data,invalid),0);
});

test('every visual frame has its own bounded mask and the media records match the files',()=>{
 assert.equal(data.frameCount,data.frameTimesMs.length);
 assert.equal(data.frameCount,data.footAreas.length);
 assert(data.frameTimesMs.every((time,i)=>i===0||time>data.frameTimesMs[i-1]));
 assert(data.frameTimesMs.some((time,i)=>i>0&&time-data.frameTimesMs[i-1]<45),'retain full-rate wing movement');
 for(const area of data.footAreas)for(const mask of area.masks){
  assert(mask.x>=0&&mask.y>=0&&mask.x+mask.width<=data.width&&mask.y+mask.height<=data.height);
  assert.equal(Buffer.from(mask.bits,'base64').length,Math.ceil(mask.width*mask.height/8));
 }
 for(const [file,hash]of [['sourceFile','sourceSha256'],['atlasFile','atlasSha256'],['avifFile','avifSha256'],['audioFile','audioSha256']]){
  assert.equal(createHash('sha256').update(readFileSync(new URL('../'+data[file],import.meta.url))).digest('hex'),data[hash]);
 }
});
