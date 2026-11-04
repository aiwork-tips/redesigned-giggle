/* Sales-ranking tests use fabricated transactions, not real eBay sales. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('assets/sales_rankings.js','utf8');
const KEY='export-scout-sales-ledger-v1';
const row=(id,sku,purchaseDate,cost,soldDate,payout,ship,other)=>({
 id,sku,purchaseDate,purchaseCostJpy:cost,status:soldDate?'sold':'held',
 saleDate:soldDate||null,payoutJpy:payout??null,shippingJpy:ship??null,otherJpy:other??null,
 notes:'',purchaseLink:'',saleLink:''
});
function element(){
 return {children:[],textContent:'',value:'',checked:false,events:{},
 addEventListener(kind,fn){this.events[kind]=fn},
 append(...v){this.children.push(...v)},
 replaceChildren(){this.children=[];this.textContent=''},
 click(){if(this.events.click)this.events.click()}};
}
function start(rows){
 const nodes=Object.create(null),get=id=>nodes[id]||(nodes[id]=element());
 get('salesRankingSort').value='profit';
 const cache={value:rows===undefined?null:JSON.stringify(rows)};
 const ctx={document:{getElementById:get,createElement:element},window:{},
 localStorage:{getItem:k=>k===KEY?cache.value:null},Date,Number,Set,Map,JSON};
 vm.runInNewContext(script,ctx,{filename:'assets/sales_rankings.js'});
 return {get,cache,refresh:ctx.window.ExportScoutSalesRankingRefresh};
}
const empty=start();
assert.match(empty.get('salesRankingList').children[0].textContent,/販売記録がありません/);
assert.match(empty.get('salesRankingStatus').textContent,/0商品/);
const data=[
 row('id_100000','DS Lite 白','2026-09-01',5000,'2026-09-06',10000,1800,200),
 row('id_100001','DS Lite 白','2026-10-01',6000,'2026-10-08',9000,1500,100),
 row('id_100002','PSP-3000','2026-10-02',1000,'2026-10-12',20000,500,100),
 row('id_100003','PS Vita','2026-10-04',8000,null,null,null,null)
];
const t=start(data);
assert.match(t.get('salesRankingStatus').textContent,/2商品/);
assert.equal(t.get('salesRankingList').children.length,2);
assert.match(t.get('salesRankingList').children[0].children[0].textContent,/PSP-3000/,'profit sort ranks big one-off first');
assert.match(t.get('salesRankingList').children[0].children[1].textContent,/継続性は未確認/);
assert.match(t.get('salesRankingList').children[1].children[0].textContent,/DS Lite 白/);
assert.match(t.get('salesRankingList').children[1].children[1].textContent,/複数日の仕入れ/);
const table=t.get('salesRankingList').children[1].children[2];
assert.match(table.children[1].children[1].textContent,/4,400円/);
assert.match(table.children[2].children[1].textContent,/2,200円/);
assert.equal(t.get('salesRankingList').children[0].children[1].textContent.includes('複数日の仕入れ'),false);
t.get('salesRankingSort').value='count';
t.get('salesRankingSort').events.change();
assert.match(t.get('salesRankingList').children[0].children[0].textContent,/DS Lite 白/);
t.get('salesRankingRepeatOnly').checked=true;
t.get('salesRankingRepeatOnly').events.change();
assert.equal(t.get('salesRankingList').children.length,1);
const protect=JSON.stringify(data);
assert.equal(t.cache.value,protect,'ranking must never overwrite ledger data');
const sameDay=start([
 row('id_200000','Game Boy','2026-11-01',1000,'2026-11-02',3500,500,100),
 row('id_200001','Game Boy','2026-11-01',1000,'2026-11-03',3500,500,100)
]);
assert.match(sameDay.get('salesRankingList').children[0].children[1].textContent,/再仕入れ実績は未確認/);
const corrupt=start([...data,{id:'bad_dup',sku:'Broken',status:'sold',purchaseDate:'2026-03-01',purchaseCostJpy:100,saleDate:'invalid',payoutJpy:500,shippingJpy:0,otherJpy:0}]);
assert.equal(corrupt.get('salesRankingList').children.length,0,'fail closed if any record is malformed');
assert.match(corrupt.get('salesRankingStatus').textContent,/安全に表示できません/);
const updated=[...data,row('id_100004','DS Lite 白','2026-11-01',2000,'2026-11-03',5000,900,100)];
t.cache.value=JSON.stringify(updated);
t.get('salesRankingRepeatOnly').checked=false;
t.refresh();
assert.match(t.get('salesRankingList').children[0].children[0].textContent,/DS Lite 白/,'rerender after new sales');
console.log('Actual sales ranking offline tests PASS: fake data zero, totals, profit and count sorts, repeat filter, distinct sourcing days, fail closed, refresh');
