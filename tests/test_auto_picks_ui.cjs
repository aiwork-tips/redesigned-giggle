/* All products and RSS signals here are test fixtures, not live sales. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('assets/auto_picks.js','utf8');
const reports=JSON.parse(fs.readFileSync('data/trend_evidence.json','utf8'));
const empty=JSON.parse(fs.readFileSync('data/trend_signals.json','utf8'));
function element(tag='div'){
return {tag,children:[],textContent:'',className:'',listeners:{},
addEventListener(type,fn){this.listeners[type]=fn},
append(...elements){this.children.push(...elements)},
replaceChildren(){this.children=[];this.textContent=''},
click(){this.listeners.click&&this.listeners.click()},
};
}
async function start(report=reports,signals=empty){
const nodes=Object.create(null),saved=[];
const get=id=>nodes[id]||(nodes[id]=element(id));
const ctx={
 document:{getElementById:get,createElement:element},
 window:{ExportScoutTrendAdd:(term,source)=>saved.push([term,source]),ExportScoutTrendResearch:(term)=>saved.push(['research',term])},
 fetch:async path=>({ok:true,async json(){return path.includes('trend_evidence')?report:signals}}),
 AbortController:class{signal={};abort(){}},setTimeout:()=>1,clearTimeout:()=>{},Date,URL,Number,Set,encodeURIComponent,Intl
};
vm.runInNewContext(code,ctx,{filename:'assets/auto_picks.js'});
await new Promise(setImmediate);
return {get,saved};
}
(async()=>{
const normal=await start();
assert.match(normal.get('trendAutoStatus').textContent,/11件/,'11 evidence-linked research products are visible');
assert.equal(normal.get('trendAutoList').children.length,5);
assert.equal(normal.get('trendAutoMore').children.length,6);
assert.match(normal.get('trendSignalStatus').textContent,/未検証/);
const first=normal.get('trendAutoList').children[0];
assert.match(first.children[1].textContent,/ベイブレード/);
first.children[4].children[0].click();
assert.match(normal.saved[0][0],/Beyblade X/);
first.children[4].children[1].click();
assert.equal(normal.saved[1][0],'research');

const stamp=new Date(Date.now()-3600000).toISOString();
const signals={schema_version:1,generated_at:stamp,source:'google_trends_rss',
signal_type:'google_trends_related_keyword',checked_regions:['TW'],failed_regions:[],
signals:[{id:'beyblade_x_TW',product_id:'beyblade_x',name:'ベイブレードX',
term:'Beyblade X Japanese limited',matched_query:'Beyblade X championship',
region:'TW',observed_at:stamp,signal_type:'google_trends_related_keyword',
source_url:'https://trends.google.com/trending?geo=TW'}]};
const fresh=await start(reports,signals);
assert.match(fresh.get('trendSignalStatus').textContent,/1件/);
assert.equal(fresh.get('trendSignalList').children.length,1);
assert.match(fresh.get('trendSignalList').children[0].children[2].textContent,/Beyblade X championship/);
assert.match(fresh.get('trendSignalList').children[0].children[0].textContent,/販売実績ではない/);

const fake=JSON.parse(JSON.stringify(reports));
fake.picks[0].source_url='https://evil.test/pretend';
const bad=await start(fake,empty);
assert.match(bad.get('trendAutoStatus').textContent,/読み込めません/);
assert.equal(bad.get('trendAutoList').children.length,0);

const old=JSON.parse(JSON.stringify(signals));
old.generated_at='2026-01-01T00:00:00+00:00';
const stale=await start(reports,old);
assert.match(stale.get('trendSignalStatus').textContent,/3日以上前/);
assert.equal(stale.get('trendSignalList').children.length,0);

assert.doesNotMatch(code,/localStorage/,'The auto-pick reader must not alter local product prices');
console.log('Auto research leads tests PASS: report picks, signal provenance, adding candidates, no stale or forged sources');
})().catch(err=>{console.error(err);process.exitCode=1});
