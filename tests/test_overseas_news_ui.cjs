/* Offline regression tests for overseas specialist publisher RSS viewer. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('assets/overseas_news.js','utf8');
const initial={schema_version:1,source:'not_checked',signal_type:'overseas_editorial_product_mention',generated_at:null,checked_sources:[],failed_sources:[],articles:[]};

function element(){
return {children:[],textContent:'',events:{},className:'',
addEventListener(kind,fn){this.events[kind]=fn},
append(...items){this.children.push(...items)},
replaceChildren(){this.children=[];this.textContent=''},
click(){this.events.click?.()}};
}
function feed(){
const now=new Date(Date.now()-3600000).toISOString();
return {schema_version:1,source:'publisher_rss',
signal_type:'overseas_editorial_product_mention',generated_at:now,
checked_sources:['Time Extension'],failed_sources:[],
articles:[{id:'time_extension_0',product_name:'NEOGEO',
term:'SNK Neo Geo Japanese game',
article_title:'Retro Japanese Neo Geo game makes a comeback',
article_url:'https://www.timeextension.com/news/2026/11/japanese-neo-geo',
publisher:'Time Extension',published_at:now,
signal_type:'overseas_editorial_product_mention'}]};
}
async function run(data){
const nodes=Object.create(null),action=[];
const get=id=>nodes[id]||(nodes[id]=element());
vm.runInNewContext(code,{
document:{getElementById:get,createElement:element},
window:{ExportScoutTrendAdd:(...args)=>action.push(['add',...args]),
ExportScoutTrendResearch:(...args)=>action.push(['research',...args])},
URL,AbortController:class{signal={};abort(){}},Date,Number,Array,
setTimeout:()=>1,clearTimeout:()=>{},encodeURIComponent,
fetch:async()=>({ok:true,async json(){return data}})
},{filename:'assets/overseas_news.js'});
await new Promise(setImmediate);
return {get,action};
}
(async()=>{
const empty=await run(initial);
assert.match(empty.get('newsSignalStatus').textContent,/未確認/);
assert.equal(empty.get('newsSignalList').children.length,0);

const unavailable=await run({schema_version:1,source:'unavailable',
signal_type:'overseas_editorial_product_mention',
generated_at:new Date().toISOString(),checked_sources:[],
failed_sources:['Time Extension','Nintendo Life'],articles:[]});
assert.match(unavailable.get('newsSignalStatus').textContent,/RSS取得失敗/);
assert.equal(unavailable.get('newsSignalList').children.length,0);

const valid=await run(feed());
assert.match(valid.get('newsSignalStatus').textContent,/1件/);
const card=valid.get('newsSignalList').children[0];
assert.match(card.children[0].textContent,/売上データではない/);
assert.match(card.children[1].textContent,/NEOGEO/);
card.children[4].children[0].click();
assert.match(valid.action[0][1],/Neo Geo/);
card.children[4].children[1].click();
assert.equal(valid.action[1][0],'research');

const bad=feed();
bad.articles[0].article_url='https://www.timeextension.com.evil.test/news/2026/11/forged';
const rejected=await run(bad);
assert.match(rejected.get('newsSignalStatus').textContent,/不備/);
assert.equal(rejected.get('newsSignalList').children.length,0);

const stale=feed();
stale.generated_at='2026-01-01T00:00:00+00:00';
const outdated=await run(stale);
assert.match(outdated.get('newsSignalStatus').textContent,/3日以上前/);
assert.equal(outdated.get('newsSignalList').children.length,0);

assert.doesNotMatch(code,/localStorage/,'No modifications to saved product prices');
console.log('Overseas news UI tests PASS: no-verified-feed, real RSS provenance, source protection, stale discard and one-click shortlist');
})().catch(err=>{console.error(err);process.exitCode=1});
