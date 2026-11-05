/* Readiness remains local-only; Firebase is deliberately not activated. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const mapperSrc=fs.readFileSync('assets/team_migration_mapper.js','utf8');
const preflightSrc=fs.readFileSync('assets/firebase_readiness.js','utf8');
const sold={
 id:'item_abc123',sku:'Nintendo DS Lite white',purchaseDate:'2026-10-01',
 purchaseCostJpy:5000,status:'sold',saleDate:'2026-10-05',
 payoutJpy:12000,shippingJpy:1800,otherJpy:200,notes:'',purchaseLink:'',saleLink:''
};
function element(){
 return {textContent:'',children:[],events:{},open:false,
 addEventListener(k,f){this.events[k]=f},append(...items){this.children.push(...items)},
 replaceChildren(){this.children=[];this.textContent=''},click(){this.events.click?.()}};
}
function setup(raw){
 const nodes=Object.create(null),get=id=>nodes[id]||(nodes[id]=element());
 const win={};const document={getElementById:get,createElement:element};
 vm.runInNewContext(mapperSrc,{window:win,Date,Number,Set,URL});
 const storage={getItem(k){assert.equal(k,'export-scout-sales-ledger-v1');return raw},
 setItem(){throw Error('Preflight must never write')},removeItem(){throw Error('Preflight must never remove')}};
 vm.runInNewContext(preflightSrc,{window:win,document,localStorage:storage,JSON,Date});
 return {get,win};
}
const valid=setup(JSON.stringify([sold]));
assert.match(valid.get('firebasePreflightStatus').textContent,/形式上、移行計画に使えます/);
assert.equal(valid.get('firebasePreflightList').children.length,4);
assert.match(valid.get('firebasePreflightList').children[1].textContent,/1件/);
assert.match(valid.get('firebasePreflightStatus').textContent,/Firebase未接続/);
valid.get('firebaseJump').click();
assert.equal(valid.get('migrationBackupPanel').open,true);
valid.get('firebasePreflightRefresh').click();
assert.equal(valid.get('firebasePreflightList').children.length,4);
const none=setup(null);
assert.match(none.get('firebasePreflightStatus').textContent,/移行対象の取引履歴はまだありません/);
const broken=setup('[broken json');
assert.match(broken.get('firebasePreflightStatus').textContent,/JSONが壊れている/);
const duplicate=setup(JSON.stringify([sold,sold]));
assert.match(duplicate.get('firebasePreflightStatus').textContent,/移行を進められません/);
assert.match(duplicate.get('firebasePreflightList').children[3].textContent,/1件/);
assert.doesNotMatch(preflightSrc,/fetch\(|localStorage\.setItem|firebase\.initializeApp/);
console.log('PASS: Firebase preflight read-only, zero, damaged, duplicate, heading shortcut, no network and existing data unchanged');
