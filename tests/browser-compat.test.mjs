import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
const source=readFileSync(new URL('../src/browser-compat.js',import.meta.url),'utf8');
function setup(subtle){const window={};vm.runInNewContext(source,{window,crypto:{getRandomValues:array=>webcrypto.getRandomValues(array),subtle},Uint8Array,Uint32Array,DataView,Array,Math});return window;}
test('HTTP visitor SHA-256 fallback matches standard hash across padding boundaries and Unicode',async()=>{const w=setup(undefined);for(const value of ['', 'abc','a'.repeat(55),'a'.repeat(56),'a'.repeat(64),'a'.repeat(1000),'小黄莺，杭州西湖']){assert.equal(await w.xcwcDigestBlob(new Blob([value])),createHash('sha256').update(value).digest('hex'));}});
test('HTTP visitor identifiers work without randomUUID and are distinct request IDs',()=>{const w=setup(undefined);const ids=Array.from({length:100},()=>w.xcwcRandomId());assert.equal(new Set(ids).size,100);for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);});
test('secure-context digest and HTTP fallback agree',async()=>{const blob=new Blob(['same local photo']);assert.equal(await setup(webcrypto.subtle).xcwcDigestBlob(blob),await setup(undefined).xcwcDigestBlob(blob));});
