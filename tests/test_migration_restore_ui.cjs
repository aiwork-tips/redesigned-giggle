/* Synthetic local-only restore tests: no network, no real buyer data. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('assets/migration_restore.js','utf8');
const salesRow={id:'item_123456',sku:'DS Lite USG-001 white',purchaseDate:'2026-10-01',purchaseCostJpy:5000,status:'sold',saleDate:'2026-10-05',payoutJpy:12000,shippingJpy:1800,otherJpy:200,notes:'',purchaseLink:'',saleLink:''};
const rawItems=JSON.stringify([{name:'DS Lite',sale:9500}]);
const rawLedger=JSON.stringify([salesRow]);
function packageFor(stores,changes={}){
 return JSON.stringify({format:'export-scout-local-backup',schema_version:1,exported_at:'2026-11-05T00:00:00.000Z',
 storage_format:'localStorage-raw-JSON-strings',invalid_json_keys:[],stores,...changes});
}
function element(){
 return {events:{},children:[],value:'',textContent:'',checked:false,disabled:true,files:[],
 addEventListener(kind,fn){this.events[kind]=fn},
 append(...items){this.children.push(...items)},replaceChildren(){this.children=[];this.textContent=''},
 click(){this.events.click?.()}};
}
function setup(old={},options={}){
 const data=new Map(Object.entries(old)),nodes=Object.create(null),events=[],get=id=>nodes[id]||(nodes[id]=element());
 let approve=true,writes=0;
 const storage={
   getItem:k=>data.get(k)??null,
   setItem(k,v){writes++;if(options.failOnWrite===writes)throw Error('Simulated full storage');data.set(k,v);events.push('write:'+k)},
   removeItem(k){data.delete(k);events.push('rollback:'+k)}
 };
 const ctx={document:{getElementById:get,createElement:element},localStorage:storage,Date,Number,Set,JSON,URL,
 confirm(){return approve}};
 vm.runInNewContext(script,ctx,{filename:'assets/migration_restore.js'});
 async function pick(contents,name='backup.json'){
   const file={size:contents.length,name,async text(){return contents}};
   get('migrationRestoreFile').files=[file];
   await get('migrationRestoreFile').events.change();
 }
 function apply(){
   get('migrationRestoreApprove').checked=true;
   get('migrationRestoreApprove').events.change();
   assert.equal(get('migrationRestoreApply').disabled,false,'Preview must allow one empty namespace');
   get('migrationRestoreApply').click();
 }
 return {get,data,events,pick,apply,storage,deny:()=>{approve=false}};
}
(async()=>{
const t=setup();
assert.equal(t.get('migrationRestoreApply').disabled,true,'No import without preview');
await t.pick(packageFor({'export-scout-items-v1':rawItems,'export-scout-sales-ledger-v1':rawLedger}));
assert.match(t.get('migrationRestoreMessage').textContent,/2種類を復元可能/);
assert.equal(t.get('migrationRestorePreview').children.length,3);
assert.equal(t.get('migrationRestoreApply').disabled,true,'No commit until explicit consent');
t.apply();
assert.equal(t.data.get('export-scout-items-v1'),rawItems);
assert.equal(t.data.get('export-scout-sales-ledger-v1'),rawLedger);
assert.match(t.get('migrationRestoreMessage').textContent,/2種類の復元が完了/);
assert.equal(t.get('migrationRestoreApply').disabled,true);

const occupied=setup({'export-scout-items-v1':'[{"name":"existing","sale":100}]'});
await occupied.pick(packageFor({'export-scout-items-v1':rawItems,'export-scout-sales-ledger-v1':rawLedger}));
assert.match(occupied.get('migrationRestoreMessage').textContent,/1種類を復元可能、1種類はスキップ/);
occupied.apply();
assert.equal(occupied.data.get('export-scout-items-v1'),'[{"name":"existing","sale":100}]','Never overwrite data');
assert.equal(occupied.data.get('export-scout-sales-ledger-v1'),rawLedger);

const conflict=setup({'export-scout-items-v1':rawItems});
await conflict.pick(packageFor({'export-scout-items-v1':rawItems}));
assert.equal(conflict.get('migrationRestoreApply').disabled,true,'No available namespaces');
assert.match(conflict.get('migrationRestoreMessage').textContent,/何も取り込みません/);

const tampered=setup();
await tampered.pick(packageFor({'export-scout-items-v1':rawItems}));
tampered.storage.setItem('export-scout-items-v1','[{"name":"new local data"}]');
tampered.apply();
assert.equal(tampered.data.get('export-scout-items-v1'),'[{"name":"new local data"}]');
assert.match(tampered.get('migrationRestoreMessage').textContent,/検査後に保存データが変わりました/);

const cancelled=setup();
await cancelled.pick(packageFor({'export-scout-items-v1':rawItems}));
cancelled.deny();
cancelled.apply();
assert.equal(cancelled.data.size,0,'Native confirm cancellation must write nothing');

const malformed=setup();
await malformed.pick(packageFor({'export-scout-sales-ledger-v1':'{garbage'}));
assert.match(malformed.get('migrationRestoreMessage').textContent,/復元前の検査で停止/);
assert.equal(malformed.get('migrationRestoreApply').disabled,true);
const duplicate=JSON.stringify([salesRow,{...salesRow,sku:'PSP-3000'}]);
await malformed.pick(packageFor({'export-scout-sales-ledger-v1':duplicate}));
assert.match(malformed.get('migrationRestoreMessage').textContent,/取引履歴の型番・ID/);
const invalidKeys=setup();
await invalidKeys.pick(packageFor({'any-other-storage':'{"secret":true}'}));
assert.match(invalidKeys.get('migrationRestoreMessage').textContent,/対応していない/);
await invalidKeys.pick(packageFor({'export-scout-items-v1':rawItems},{invalid_json_keys:['export-scout-sales-ledger-v1']}));
assert.match(invalidKeys.get('migrationRestoreMessage').textContent,/破損が報告/);

const failing=setup({}, {failOnWrite:2});
await failing.pick(packageFor({'export-scout-items-v1':rawItems,'export-scout-sales-ledger-v1':rawLedger}));
failing.apply();
assert.equal(failing.data.size,0,'Rollback must remove first key after second write fails');
assert.match(failing.get('migrationRestoreMessage').textContent,/巻き戻しました/);

assert.doesNotMatch(script,/fetch\(/,'All operations must be local-only');
console.log('Safe migration import regression tests PASS: preview, explicit approval, skip occupied, stale state, cancel, schema/duplicate-ID check, rollback, no network');
})().catch(err=>{console.error(err);process.exitCode=1});
