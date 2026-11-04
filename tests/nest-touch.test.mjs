import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/nest/nest.js',import.meta.url),'utf8');
const data=JSON.parse(readFileSync(new URL('../src/nest/foot-hit-areas.json',import.meta.url),'utf8'));
const {isFoot}=vm.runInNewContext(source+'\n({isFoot:isNestFootPoint});',{
 nestFootHitAreas:data.areas,atob:value=>Buffer.from(value,'base64').toString('binary')
});
const point=(art,x,y)=>isFoot(art,x/640,y/580);

test('visible feet react while the head, belly, transparent gaps and canvas background do not',()=>{
 for(const [x,y]of [[167,509],[192,519],[232,526],[376,531],[416,526],[444,514],[165,508],[192,520],[232,530],[376,535],[416,532],[446,518],[207,525],[411,525]])assert.equal(point('happy',x,y),true,`happy-v2 toe ${x},${y}`);
 for(const [x,y]of [[320,150],[320,390],[205,490],[232,495],[380,495],[416,490],[320,520],[147,505],[172,524],[258,524],[350,527],[436,531],[457,501],[150,525],[465,525],[175,535],[320,568],[0,0]])assert.equal(point('happy',x,y),false,`happy-v2 body or background ${x},${y}`);
 assert.equal(point('crying',249,529),true);assert.equal(point('shy',264,532),false);
 for(const [x,y]of [[216,527],[371,531],[188,518],[220,532],[250,530],[353,534],[390,530]])assert.equal(point('puzzled',x,y),true,`puzzled-v2 foot ${x},${y}`);
 for(const [x,y]of [[216,500],[320,520],[160,525],[420,532],[275,547],[320,548]])assert.equal(point('puzzled',x,y),false,`puzzled-v2 background or belly ${x},${y}`);
 for(const [x,y]of [[194,528],[442,528],[150,525],[190,532],[230,534],[404,535],[445,532],[482,521]])assert.equal(point('angry',x,y),true,`new angry foot ${x},${y}`);
 for(const [x,y]of [[130,523],[505,522],[255,545],[375,545],[218,498],[320,520]])assert.equal(point('angry',x,y),false,`new angry background or belly ${x},${y}`);
});

test('upturned orange feet react while opaque white belly inside the foot bounds does not',()=>{
 for(const [x,y]of [[146,389],[338,433],[116,375],[154,361],[176,389],[141,415],[307,416],[347,407],[369,436],[331,459]])assert.equal(point('belly',x,y),true,`${x},${y}`);
 for(const [x,y]of [[180,360],[320,400],[250,430],[320,568]])assert.equal(point('belly',x,y),false,`${x},${y}`);
 assert.equal(Object.hasOwn(data.areas,'shy'),false,'retired artwork has no active touch region');
});

test('lying poses never invent hidden feet and every supplied outfit has its own real foot mask',()=>{
 for(const art of ['hungry','unwell'])for(let y=0;y<580;y+=10)for(let x=0;x<640;x+=10)assert.equal(point(art,x,y),false,art);
 const outfits=Object.keys(data.areas).filter(key=>key.startsWith('huangying_'));
 assert.equal(outfits.length,8);
 for(const art of outfits){
  assert.equal(point(art,art==='huangying_pilgrim'?239:218,art==='huangying_pilgrim'?503:500),true,art);
  assert.equal(point(art,410,500),true,art);assert.equal(point(art,320,360),false,art);
 }
});

test('touch masks track the exact public artwork instead of silently drifting after an asset change',()=>{
 assert.equal(data.schemaVersion,1);assert.equal(Object.keys(data.areas).length,15);
 for(const [art,area]of Object.entries(data.areas)){
  const bytes=readFileSync(new URL('../'+area.sourceFile,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),area.sourceSha256,art);
  assert.equal(area.width,640);assert.equal(area.height,580);
  for(const mask of area.masks){
   assert(mask.x>=0&&mask.y>=0&&mask.x+mask.width<=640&&mask.y+mask.height<=580,art);
   assert.equal(Buffer.from(mask.bits,'base64').length,Math.ceil(mask.width*mask.height/8),art);
  }
 }
});

test('unknown art and non-image coordinates cannot be classified as feet',()=>{
 for(const art of ['missing','__proto__','toString',undefined])assert.equal(isFoot(art,.3,.9),false);
 for(const [x,y]of [[-1,.9],[1,.9],[.3,1],[NaN,.9],[.3,Infinity],['.3',.9]])assert.equal(isFoot('happy',x,y),false);
});
