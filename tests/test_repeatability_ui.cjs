/* Synthetic evidence only. Verifies manual repeatability review without network. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('assets/repeatability.js','utf8');
const KEY='export-scout-repeatability-v1';
function element(){
return {children:[],listeners:{},value:'',textContent:'',open:false,
addEventListener(kind,handler){this.listeners[kind]=handler},
append(...items){this.children.push(...items)},
replaceChildren(){this.children=[];this.textContent=''},
scrollIntoView(){this.scrolled=true},
click(){this.listeners.click?.()},
remove(){this.removed=true}};
}
function setup(cacheData={}){
const data=new Map(Object.entries(cacheData)),nodes=Object.create(null),urls=[];
const get=id=>nodes[id]||(nodes[id]=element());
get('usdRate').value='150';
get('ship').value='1800';
get('rate').value='14';
get('other').value='200';
const FakeURL=class extends URL {
  static createObjectURL(){urls.push('blob:local');return 'blob:local'}
  static revokeObjectURL(){}
};
const context={
document:{getElementById:get,createElement:element,body:element()},
window:{},URL:FakeURL,Date,Number,String,JSON,
Blob:class{constructor(content,options){this.content=content;this.options=options}},
localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}
};
vm.runInNewContext(code,context,{filename:'assets/repeatability.js'});
return {get,data,urls,open:context.window.ExportScoutRepeatabilityOpen};
}
function completed(t){
const set=(k,v)=>{t.get(k).value=String(v)};
t.open('Nintendo DS Lite 本体','Nintendo DS Lite console Japanese');
assert.equal(t.get('repeatEditor').open,true);
assert.match(t.get('repeatSku').value,/Nintendo DS Lite/);
assert.equal(Number(t.get('repeatFx').value),150);
assert.equal(Number(t.get('repeatShip').value),1800);
set('repeatSku','DS Lite USG-001 white full working');
set('repeatSoldCount',5);
set('repeatActiveCount',12);
set('repeatUsd',85);
set('repeatCost',4500);
set('repeatShip',1800);
set('repeatFee',14);
set('repeatOther',200);
set('repeatFx',150);
set('repeatTarget',2000);
set('repeatSourcing','複数回見込み');
set('repeatSoldUrl','https://www.ebay.com/sch/i.html?_nkw=ds+lite&LH_Sold=1');
set('repeatBuyUrl','https://jp.mercari.com/item/m123456');
t.get('repeatSave').click();
}
const t=setup({'export-scout-items-v1':'[{"title":"Keep prices intact"}]'});
assert.match(t.get('repeatStatus').textContent,/0件/);
completed(t);
assert.match(t.get('repeatStatus').textContent,/継続調査優先：1件/);
assert.equal(JSON.parse(t.data.get(KEY)).length,1);
assert.equal(t.data.get('export-scout-items-v1'),'[{"title":"Keep prices intact"}]');
const card=t.get('repeatList').children[0];
assert.match(card.children[1].textContent,/継続調査優先/);
assert.match(card.children[3].textContent,/4,465円/);
assert.match(card.children[3].textContent,/条件悪化時/);
t.get('repeatExport').click();
assert.equal(t.urls.length,1,'CSV backup created');
const again=setup(Object.fromEntries(t.data));
assert.match(again.get('repeatStatus').textContent,/1件/);
again.get('repeatList').children[0].children[5].children[0].click();
assert.equal(again.get('repeatSku').value,'DS Lite USG-001 white full working');
again.get('repeatSourcing').value='単発';
again.get('repeatSave').click();
assert.match(again.get('repeatList').children[0].children[1].textContent,/単発仕入れ/);
assert.equal(JSON.parse(again.data.get(KEY)).length,1,'Same SKU updates without duplicates');
again.get('repeatList').children[0].children[5].children[0].click();
again.get('repeatSoldUrl').value='';
again.get('repeatSave').click();
assert.match(again.get('repeatList').children[0].children[1].textContent,/情報不足/);
const stale=JSON.parse(again.data.get(KEY));
stale[0].checkedAt=new Date(Date.now()-32*86400000).toISOString();
const old=setup({[KEY]:JSON.stringify(stale)});
assert.match(old.get('repeatList').children[0].children[1].textContent,/要再確認/);
const bad=setup();
bad.open('PSP-3000','Sony PSP');
bad.get('repeatSoldCount').value='-1';
bad.get('repeatSave').click();
assert.match(bad.get('repeatFeedback').textContent,/保存できません/);
assert.equal(bad.data.has(KEY),false);
again.get('repeatList').children[0].children[5].children[1].click();
assert.match(again.get('repeatStatus').textContent,/0件/);
console.log('Manual repeatability verification tests PASS: local save, ROI maths, recurrent vs one-off, stale, missing proofs, CSV, edits and original-storage isolation');
