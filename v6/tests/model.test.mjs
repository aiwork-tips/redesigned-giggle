import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSnapshot,evaluate,organize,RELATIONS,SOURCES} from '../assets/model.mjs';

const now=Date.parse('2026-11-05T11:00:00Z');
const one={
  id:'yahoo:psp-3000:001',
  name:'Sony PSP-3000（テスト用データ）',
  category:'ゲーム・ホビー',
  japanRelation:'japan_brand',
  domestic:{
    source:'yahoo_shopping',currency:'JPY',priceJpy:5000,
    url:'https://store.shopping.yahoo.co.jp/test/psp.html',
    observedAt:'2026-11-05T10:00:00Z'
  },
  overseas:{
    source:'soldgraph',price:100,currency:'USD',evidence:'sold_comparable',
    soldCount:3,url:'https://example.com/market/psp',observedAt:'2026-11-04T12:00:00Z'
  },
  assumptions:{fxJpyPerUnit:150,shippingJpy:2500,otherJpy:500,feePercent:15}
};
const snapshot={kind:'export-scout-discovery-v6',schemaVersion:1,
  generatedAt:'2026-11-05T10:59:00Z',items:[one]};
assert.equal(parseSnapshot(snapshot).length,1);
const result=evaluate(one,now);
assert.equal(result.kind,'profit_estimate');
assert.equal(result.salesJpy,15000);
assert.equal(result.feeJpy,2250);
assert.equal(result.profit,4750);
assert.equal(organize([one],{now}).ranked[0].calculation.profit,4750);
assert.equal(organize([one],{now,keyword:'psp'}).total,1);
assert.equal(organize([one],{now,keyword:'camera'}).total,0);
assert.equal(organize([one],{now,category:'カメラ'}).total,0);
assert.equal(organize([one],{now,minProfit:5000}).ranked.length,0);
assert.equal(organize([one],{now,minProfit:4000}).ranked.length,1);

const active={...one,id:'yahoo:psp-3000:002',overseas:{...one.overseas,evidence:'active_listing',soldCount:null}};
assert.equal(evaluate(active,now).profit,null);
assert.equal(organize([active],{now}).research.length,1);

const domestic={...one,id:'yahoo:psp-3000:003',overseas:null,assumptions:null};
assert.equal(evaluate(domestic,now).kind,'domestic_only');
assert.equal(organize([domestic],{now}).ranked.length,0);

const stale={...one,id:'yahoo:psp-3000:004',
  domestic:{...one.domestic,observedAt:'2026-11-02T10:00:00Z'}};
assert.equal(evaluate(stale,now).kind,'stale_price');
assert.equal(organize([stale],{now}).research.length,1);

const losing={...one,id:'yahoo:psp-3000:005',
  assumptions:{...one.assumptions,shippingJpy:8000}};
assert.equal(evaluate(losing,now).profit,-750);
assert.equal(organize([losing],{now}).ranked.length,0);
assert.equal(organize([losing],{now}).research.length,1);

assert.deepEqual(parseSnapshot({kind:'export-scout-discovery-v6',schemaVersion:1,generatedAt:null,items:[]}),[]);
assert.throws(()=>parseSnapshot({...snapshot,items:[one,one]}),/重複/);
assert.throws(()=>parseSnapshot({...snapshot,generatedAt:null}),/取得日時/);
assert.throws(()=>parseSnapshot({...snapshot,items:[{...one,domestic:{...one.domestic,url:'javascript:alert(1)'}}]}),/不正/);
assert.throws(()=>parseSnapshot({...snapshot,items:[{...one,japanRelation:'__proto__'}]}),/不正/);
assert.throws(()=>parseSnapshot({...snapshot,items:[{...one,overseas:{...one.overseas,source:'__proto__'}}]}),/不正/);
assert.throws(()=>parseSnapshot({...snapshot,items:[{...one,domestic:{...one.domestic,priceJpy:0}}]}),/不正/);
assert.throws(()=>parseSnapshot({...snapshot,items:[{...one,domestic:{...one.domestic,priceJpy:'5000'}}]}),/不正/);
assert.equal(Object.keys(SOURCES).length>=5,true);
assert.equal(Object.keys(RELATIONS).length>=4,true);

const empty=JSON.parse(readFileSync('v6/data/latest.json','utf8'));
assert.equal(parseSnapshot(empty).length,0);
assert.equal(empty.generatedAt,null,'Production feed must not fake a fetch timestamp');
assert.deepEqual(empty.items,[],'Production feed must not contain fictional listings');
console.log('PASS v6: schema, provenance, estimated margin, missing sales, stale prices, negative profit, filtering and honest empty feed');
