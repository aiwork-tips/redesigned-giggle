/* Offline regression tests for trend links and a price-free local shortlist. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('assets/trends.js','utf8');
const html=fs.readFileSync('index.html','utf8');
function element(tag='div'){
  return {
    tag,children:[],value:'',textContent:'',listeners:{},attributes:{},
    addEventListener(type,fn){this.listeners[type]=fn;},
    setAttribute(name,value){this.attributes[name]=value;},
    append(...items){this.children.push(...items);},
    replaceChildren(){this.children=[];this.textContent='';},
    scrollIntoView(){this.scrolled=true;},
    click(){if(this.listeners.click)this.listeners.click()},
    remove(){this.removed=true},
  };
}
function setup(initial){
  const nodes=Object.create(null),cache=new Map(Object.entries(initial||{}));
  const get=id=>nodes[id]||(nodes[id]=element('id:'+id));
  const doc={getElementById:get,createElement:element,body:element('body')};
  let blobCount=0,downloadCount=0;
  const FakeURL={
    createObjectURL(){blobCount++;return 'blob:test'},
    revokeObjectURL() {},
  };
  const ctx={
    document:doc,
    localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)},
    URL:FakeURL,
    Blob:class{constructor(contents,info){this.contents=contents;this.info=info}},
    Date,Number,String,Array,JSON,encodeURIComponent,
  };
  vm.runInNewContext(source,ctx,{filename:'assets/trends.js'});
  return {get,cache,doc,blobCount:()=>blobCount};
}
const KEY='export-scout-trend-inbox-v1';
const t=setup({'export-scout-items-v1':'[{"name":"Protected","sale":1000}]'});
assert.equal(t.get('trendSeedList').children.length,6,'All 6 documented seed suggestions render');
assert.match(t.get('trendInboxCount').textContent,/0件/);
t.get('trendSeedList').children[0].children[2].click();
assert.match(t.get('trendInboxCount').textContent,/1件/);
assert.equal(JSON.parse(t.cache.get(KEY))[0].term,'One Piece Japanese trading card');
t.get('trendSeedList').children[0].children[2].click();
assert.equal(JSON.parse(t.cache.get(KEY)).length,1,'Duplicates are rejected');

t.get('trendTerm').value='Nintendo DS Lite';
t.get('trendAdd').click();
assert.equal(JSON.parse(t.cache.get(KEY)).length,2,'Manual search terms can be saved without prices');
assert.equal(t.get('trendTerm').value,'','Clear input on successful save');
const first=t.get('trendInboxList').children[0];
assert.match(first.children[0].textContent,/Nintendo DS Lite/);
const actionList=first.children[2];
actionList.children[0].click();
assert.equal(t.get('product').value,'Nintendo DS Lite','Price research pre-populates existing search');
assert.equal(t.get('product').scrolled,true);
assert.match(actionList.children[1].href,/Nintendo%20DS%20Lite/);
first.children[3].click();
assert.equal(JSON.parse(t.cache.get(KEY)).length,1,'Delete a research-only candidate');
assert.equal(t.cache.get('export-scout-items-v1'),'[{"name":"Protected","sale":1000}]','Stored priced items unchanged');

const reload=setup(Object.fromEntries(t.cache));
assert.match(reload.get('trendInboxCount').textContent,/1件/,'Shortlist persists across refresh');
reload.get('trendExport').click();
assert.equal(reload.blobCount(),1,'Shortlist supports local CSV export');
assert.match(html,/eBay Product Research/);
assert.match(html,/Googleトレンド・米国/);
assert.match(html,/ZenMarket 日本商品ランキング/);
assert.match(html,/Buyee 人気商品・ランキング特集/);
assert.match(html,/2026年8月28日/);
assert.doesNotMatch(source,/fetch\(/,'No unapproved third-party scraping or feeds');
console.log('Trend discovery offline regression tests: PASS (sources, no-price shortlist, duplicates, CSV, main storage isolation)');
