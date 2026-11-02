import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAdoptionEntry, adoptionLookupPath, isManufacturingCode} from '../src/adopt/entry.mjs';
test('prefix stays opaque instead of being treated as an internal bird ID',()=>{
 const code='HZ-T01-S01-000001';assert.deepEqual(parseAdoptionEntry('?page=adopt&birdCode='+code),{code,error:null,lookupSupported:false});
 assert.equal(parseAdoptionEntry('?bird='+'0'.repeat(31)+'1').lookupSupported,true);
});
test('missing or competing code fields cannot silently select an entity',()=>{
 for(const search of ['?birdCode=a&birdCode=b','?birdCode=a&bird=b','?bird=a&bird=a','?birdCode='])assert.equal(parseAdoptionEntry(search).error,'INVALID_BIRD_CODE');
 assert.equal(parseAdoptionEntry('?page=adopt').error,'MISSING_BIRD_CODE');
});
test('paths, markup, whitespace and excessive input are rejected',()=>{
 for(const code of ['../birds','<img>','a/b','a b','a'.repeat(161),'x%2Fy'])assert.equal(parseAdoptionEntry('?birdCode='+encodeURIComponent(code)).error,'INVALID_BIRD_CODE');
});

test('new NFC codes use the public-code resolver, preserving internal ID routes',()=>{
 const code='HZ-HY-109843788595200000';
 assert.equal(parseAdoptionEntry('?page=adopt&birdCode='+code).lookupSupported,true);
 assert.equal(adoptionLookupPath(code),'/birds/by-code/'+code);
 const old='00000000000000000000000000000001';
 assert.equal(adoptionLookupPath(old),'/birds/'+old);
 assert.equal(parseAdoptionEntry('?bird='+code).lookupSupported,true);
});
test('manufacturing code transport rejects overflow, leading zeros and casing errors',()=>{
 for(const code of ['hz-HY-1','HZ-hy-1','HZ-HY-0','HZ-HY-01','HZ-HY--1','HZ-HY-9223372036854775808','HZ-HY-12345678901234567890']) {
  assert.equal(isManufacturingCode(code),false,code);
  assert.throws(()=>adoptionLookupPath(code));
 }
 assert.equal(isManufacturingCode('HZ-HY-9223372036854775807'),true);
});

test('public-code response validates birdCode separately from internal ID',async()=>{
 const {matchesAdoptionBird}=await import('../src/adopt/entry.mjs');
 const bird={id:'a'.repeat(32),birdCode:'HZ-HY-123456',active:true};
 assert.equal(matchesAdoptionBird('HZ-HY-123456',bird),true);
 assert.equal(matchesAdoptionBird(bird.id,bird),true);
 assert.equal(matchesAdoptionBird('HZ-HY-654321',bird),false);
 assert.equal(matchesAdoptionBird('b'.repeat(32),bird),false);
 assert.equal(matchesAdoptionBird(bird.birdCode,{...bird,active:false}),false);
 assert.equal(matchesAdoptionBird(bird.birdCode,{...bird,id:'bad'}),false);
});
