import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/city/city.js',import.meta.url),'utf8');
const context={};
vm.runInNewContext(source.slice(0,source.indexOf('function mountCity()'))+';globalThis.model={cities:cityCollectionCities,collectedCityCodes,cityCollectionRows};',context);
const {cities,collectedCityCodes,cityCollectionRows}=context.model;
const plain=value=>JSON.parse(JSON.stringify(value));

test('the confirmed six cities keep their order even when ownership changes',()=>{
 assert.deepEqual(plain(cities.map(city=>[city.code,city.name])),[['hangzhou','杭州'],['suzhou','苏州'],['nanjing','南京'],['shanghai','上海'],['xian','西安'],['wuhan','武汉']]);
 collectedCityCodes([{cityCode:'wuhan',eggStatus:'HATCHED'},{cityCode:'hangzhou',eggStatus:'HATCHED'}]);
 assert.equal(cities[0].code,'hangzhou');assert.equal(cities[5].code,'wuhan');
});

test('progress counts unique supported hatched cities and excludes old unknown cities',()=>{
 assert.equal(collectedCityCodes([]).size,0);
 const result=collectedCityCodes([{id:'one',cityCode:'hangzhou',eggStatus:'HATCHED'},{id:'two',cityCode:'hangzhou',eggStatus:'HATCHED'},{cityCode:'suzhou',eggStatus:'HATCHED'},{cityCode:'nanjing',eggStatus:'PENDING'},{cityCode:'unknown',eggStatus:'HATCHED'}]);
 assert.deepEqual([...result],['hangzhou','suzhou']);assert.equal(result.size,2);
 assert.equal(collectedCityCodes(cities.map(city=>({cityCode:city.code,eggStatus:'HATCHED'}))).size,6);
});

test('city details retain distinct owned entities and do not duplicate their public model',()=>{
 const mine=[{id:'first',name:'一号',cityCode:'hangzhou',typeId:'hy',skinId:'green',eggStatus:'HATCHED'},{id:'second',name:'二号',cityCode:'hangzhou',typeId:'hy',skinId:'green',eggStatus:'HATCHED'},{id:'pending',cityCode:'hangzhou',typeId:'other',skinId:'green',eggStatus:'PENDING'}];
 const catalog=[{cityCode:'hangzhou',name:'公开小黄莺',typeId:'hy',skinId:'green'},{cityCode:'hangzhou',name:'另一真实配置',typeId:'hy',skinId:'yellow'},{cityCode:'hangzhou',name:'重复配置',typeId:'hy',skinId:'yellow'},{cityCode:'wuhan',name:'异地目录',typeId:'wh',skinId:'green'}];
 const result=plain(cityCollectionRows('hangzhou',mine,catalog));
 assert.deepEqual(result.map(row=>[row.name,row.owned]),[['一号',true],['二号',true],['另一真实配置',false]]);
 assert.equal(mine.length,3);assert.equal(catalog.length,4);
});

test('catalog failures leave real local birds visible and empty cities stay empty',()=>{
 const mine=[{id:'real',name:'伙伴',cityCode:'hangzhou',eggStatus:'HATCHED'}];
 assert.deepEqual(plain(cityCollectionRows('hangzhou',mine,null)).map(row=>row.id),['real']);
 assert.deepEqual(plain(cityCollectionRows('suzhou',mine,[])),[]);
});
