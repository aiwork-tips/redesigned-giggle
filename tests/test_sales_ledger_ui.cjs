/* Offline sales ledger tests: every transaction here is synthetic, not real sales. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('assets/sales_ledger.js','utf8');
const KEY='export-scout-sales-ledger-v1';
function element(){
 return {value:'',textContent:'',children:[],open:false,hidden:false,events:{},
 addEventListener(type,fn){this.events[type]=fn},
 append(...items){this.children.push(...items)},
 replaceChildren(){this.children=[];this.textContent=''},
 scrollIntoView(){this.scrolled=true},click(){this.events.click?.()},remove(){}};
}
function harness(seed={}){
 const nodes=Object.create(null),data=new Map(Object.entries(seed));
 const get=id=>nodes[id]||(nodes[id]=element());
 let csvCount=0,confirmCount=0;
 const FakeURL=class extends URL{
   static createObjectURL(){csvCount++;return 'blob:fake'}
   static revokeObjectURL(){}
 };
 const context={
 document:{getElementById:get,createElement:element,body:element()},
 window:{},
 localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},
 confirm(){confirmCount++;return true},
 URL:FakeURL,Date,Math,Number,Set,Map,JSON,
 Blob:class{constructor(parts,options){this.parts=parts;this.options=options}},
 };
 vm.runInNewContext(code,context,{filename:'assets/sales_ledger.js'});
 return {get,data,open:context.window.ExportScoutSalesOpen,ledger:()=>JSON.parse(data.get(KEY)||'[]'),csv:()=>csvCount,confirmed:()=>confirmCount};
}
function set(t,name,value){t.get(name).value=String(value)}
function purchase(t,sku,cost){
 t.open(sku);
 set(t,'ledgerPurchaseCost',cost);
 t.get('ledgerSave').click();
}
function sellRecord(t,i,payout,ship,other){
 t.get('salesLedgerRecords').children[i].children.at(-1).children[0].click();
 set(t,'ledgerState','sold');
 t.get('ledgerState').events.change();
 set(t,'ledgerSaleDate',t.get('ledgerPurchaseDate').value);
 set(t,'ledgerPayout',payout);
 set(t,'ledgerShipping',ship);
 set(t,'ledgerOther',other);
 t.get('ledgerSave').click();
}
const t=harness({'export-scout-items-v1':'[{"name":"DO NOT MODIFY"}]'});
assert.match(t.get('salesLedgerStatus').textContent,/0件/);
purchase(t,'DS Lite USG-001 white',5000);
assert.equal(t.ledger().length,1);
assert.equal(t.ledger()[0].status,'held');
assert.match(t.get('salesLedgerSummary').children[1].children[1].textContent,/0円/);
assert.match(t.get('salesLedgerSummary').children[2].children[1].textContent,/5,000円/);
assert.equal(t.data.get('export-scout-items-v1'),'[{"name":"DO NOT MODIFY"}]');

sellRecord(t,0,12000,1800,200);
assert.equal(t.ledger().length,1,'Edit replaces a row rather than duplicating');
assert.equal(t.ledger()[0].status,'sold');
assert.match(t.get('salesLedgerSummary').children[1].children[1].textContent,/5,000円/);
assert.match(t.get('salesLedgerStatus').textContent,/1件/);
assert.match(t.get('salesLedgerBySku').children[0].children[2].textContent,/継続性未確認/);
assert.equal(t.get('salesLedgerMonths').children.length,1,'Sale month is recorded');

purchase(t,'DS Lite USG-001 white',6000);
sellRecord(t,0,14000,1600,200);
assert.equal(t.ledger().length,2);
assert.match(t.get('salesLedgerSummary').children[1].children[1].textContent,/11,200円/);
assert.match(t.get('salesLedgerSummary').children[3].children[1].textContent,/1種類/);
assert.match(t.get('salesLedgerBySku').children[0].children[2].textContent,/複数回売却の黒字記録あり/);

purchase(t,'PSP-3000 blue',9000);
assert.match(t.get('salesLedgerSummary').children[2].children[1].textContent,/9,000円/);
assert.match(t.get('salesLedgerSummary').children[1].children[1].textContent,/11,200円/);
assert.equal(t.ledger().length,3);

const reload=harness(Object.fromEntries(t.data));
assert.equal(reload.ledger().length,3,'Rows persist across page loads');
assert.match(reload.get('salesLedgerSummary').children[1].children[1].textContent,/11,200円/);
reload.get('ledgerExport').click();
assert.equal(reload.csv(),1,'CSV export works');

const negative=harness();
negative.open('Game Boy Advance');
set(negative,'ledgerPurchaseCost','-1');
negative.get('ledgerSave').click();
assert.match(negative.get('salesLedgerMessage').textContent,/保存できません/);
assert.equal(negative.ledger().length,0);
const missingSale=harness();
missingSale.open('PSP 3000');
set(missingSale,'ledgerPurchaseCost',2000);
set(missingSale,'ledgerState','sold');
missingSale.get('ledgerState').events.change();
set(missingSale,'ledgerSaleDate',missingSale.get('ledgerPurchaseDate').value);
set(missingSale,'ledgerPayout',7000);
missingSale.get('ledgerSave').click();
assert.match(missingSale.get('salesLedgerMessage').textContent,/保存できません/,'Missing shipping and other costs cannot be assumed to be zero');

const badOriginal='[{"id":"bad","sku":"Corrupt old data"}]';
const corrupt=harness({[KEY]:badOriginal});
assert.match(corrupt.get('salesLedgerStatus').textContent,/読み込めない記録/);
purchase(corrupt,'Nintendo 3DS',4000);
assert.equal(corrupt.data.get(KEY),badOriginal,'Malformed records must never be silently overwritten');

const deleted=harness(Object.fromEntries(t.data));
deleted.get('salesLedgerRecords').children[0].children.at(-1).children[1].click();
assert.equal(deleted.ledger().length,2);
assert.equal(deleted.confirmed(),1);
console.log('Sales ledger offline tests PASS: purchases, two sales, cash profit, inventory, monthly totals, reload, CSV, invalid inputs, corruption protection, deletion, legacy storage isolation');
