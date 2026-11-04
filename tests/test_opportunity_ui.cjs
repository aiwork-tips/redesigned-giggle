/* Offline DOM tests; price evidence here is synthetic and never published. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('assets/opportunities.js','utf8');

function element(){
return {children:[],value:'',textContent:'',className:'',listeners:{},
addEventListener(kind,fn){this.listeners[kind]=fn},
append(...x){this.children.push(...x)},
replaceChildren(){this.children=[];this.textContent=''}};
}
function sample(){
const now=Date.now();
const row={target_id:'t04',query:'Sony PSP 3000',condition:'used',
price_type:'historical_sale_vs_active_domestic_offer',
median_completed_sale_total_usd:80,min_domestic_delivered_cost_jpy:4000,
completed_sale_samples:2,
sample_sale_urls:['https://www.ebay.com/itm/111','https://www.ebay.com/itm/222'],
domestic_offer_url:'https://jp.mercari.com/item/m333',
last_sale_checked_at:new Date(now-2*86400000).toISOString(),
domestic_offer_checked_at:new Date(now-3600000).toISOString()};
return {schema_version:1,source:'source_linked_evidence',price_type:row.price_type,
generated_at:new Date(now-3600000).toISOString(),items:[row]};
}
async function simulate(data){
const nodes=Object.create(null);
const get=id=>nodes[id]||(nodes[id]=element());
get('usdRate').value='150';get('ship').value='1600';get('rate').value='14';get('other').value='200';
const context={document:{getElementById:get,createElement:element},
URL,Date,Intl,Number,Set,
AbortController:class{signal={};abort(){}},
setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,
fetch:async()=>({ok:true,json:async()=>data})};
vm.runInNewContext(source,context,{filename:'assets/opportunities.js'});
await new Promise(setImmediate);
return {get};
}
(async()=>{
const empty=await simulate({schema_version:1,source:'not_connected',
price_type:'historical_sale_vs_active_domestic_offer',items:[]});
assert.match(empty.get('autoPairsStatus').textContent,/未接続/);
assert.equal(empty.get('autoPairsList').children.length,0);

const withEvidence=await simulate(sample());
const cards=withEvidence.get('autoPairsList').children;
assert.equal(cards.length,2,'summary plus 1 product card');
assert.match(cards[1].children[2].textContent,/4,520/);
assert.match(cards[1].children[2].textContent,/条件悪化時/);
assert.equal(cards[1].children[3].children[0].href,'https://www.ebay.com/itm/111');

const wrong=sample();wrong.items[0].sample_sale_urls[0]='https://www.ebay.com.evil.test/itm/111';
const rejected=await simulate(wrong);
assert.match(rejected.get('autoPairsStatus').textContent,/不備/);
assert.equal(rejected.get('autoPairsList').children.length,0);

const stale=sample();stale.items[0].domestic_offer_checked_at=new Date(Date.now()-9*86400000).toISOString();
const expired=await simulate(stale);
assert.match(expired.get('autoPairsStatus').textContent,/不備/);
assert.equal(expired.get('autoPairsList').children.length,0);

assert.doesNotMatch(source,/localStorage\./,'Viewer must never modify saved candidates');
console.log('Opportunity viewer offline tests: PASS (empty feed, calculations, sources, stale rejection, storage isolation)');
})().catch(err=>{console.error(err);process.exitCode=1});
