/* Offline catalog contract: evergreen research is NOT a profit ranking. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('assets/evergreen.js','utf8');
const catalog=JSON.parse(fs.readFileSync('data/evergreen_candidates.json','utf8'));

function element(){
return {children:[],textContent:'',className:'',listeners:{},
addEventListener(kind,cb){this.listeners[kind]=cb},
append(...entries){this.children.push(...entries)},
replaceChildren(){this.children=[];this.textContent=''},
click(){this.listeners.click?.()}};
}
async function simulate(data){
const nodes=Object.create(null),calls=[];
const get=id=>nodes[id]||(nodes[id]=element());
vm.runInNewContext(script,{
document:{getElementById:get,createElement:element},
window:{
ExportScoutTrendAdd:(...args)=>calls.push(['save',...args]),
ExportScoutTrendResearch:(...args)=>calls.push(['research',...args])},
fetch:async()=>({ok:true,async json(){return data}}),
URL,Date,Set,Number,AbortController:class{signal={};abort(){}},
setTimeout:()=>1,clearTimeout:()=>{},encodeURIComponent,
},{filename:'assets/evergreen.js'});
await new Promise(setImmediate);
return {get,calls};
}
(async()=>{
assert.equal(catalog.items.length,12);
for(const x of catalog.items){
assert.equal(x.profit_verified,false);
assert.equal(x.model_sales_verified,false);
assert.match(x.source_url,/^https:/);
assert.match(x.check_before_sourcing,/.+/);
}
const good=await simulate(catalog);
assert.match(good.get('evergreenStatus').textContent,/12件/);
assert.match(good.get('evergreenStatus').textContent,/未検証/);
assert.equal(good.get('evergreenList').children.length,5);
assert.equal(good.get('evergreenMore').children.length,7);
const card=good.get('evergreenList').children[0];
assert.match(card.children[0].textContent,/利益未確認/);
assert.match(card.children[2].textContent,/2026年/);
assert.match(card.children[4].textContent,/確認事項/);
card.children[6].children[0].click();
assert.equal(good.calls[0][0],'save');
card.children[6].children[1].click();
assert.equal(good.calls[1][0],'research');
assert.match(card.children[6].children[2].href,/LH_Sold=1/);
assert.match(card.children[6].children[3].href,/jp.mercari.com/);

const bad=JSON.parse(JSON.stringify(catalog));
bad.items[0].source_url='https://ebay.co.jp.evil.test/invalid';
const invalid=await simulate(bad);
assert.match(invalid.get('evergreenStatus').textContent,/不備/);
assert.equal(invalid.get('evergreenList').children.length,0);

const duplicate=JSON.parse(JSON.stringify(catalog));
duplicate.items[1].id=duplicate.items[0].id;
const dup=await simulate(duplicate);
assert.match(dup.get('evergreenStatus').textContent,/不備/);

const falseProfit=JSON.parse(JSON.stringify(catalog));
falseProfit.items[0].profit_verified=true;
const rejected=await simulate(falseProfit);
assert.match(rejected.get('evergreenStatus').textContent,/不備/);
assert.doesNotMatch(script,/localStorage/,'Evergreen cards must not modify the original saved inventory');
console.log('Evergreen research UI tests PASS: source evidence, cautions, links, shortlist, no fake profit, invalid-data rejection');
})().catch(err=>{console.error(err);process.exitCode=1});
