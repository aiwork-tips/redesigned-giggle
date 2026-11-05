/* Offline tests only: all transactions and member labels are synthetic. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('assets/team_preview.js','utf8');
const key='export-scout-sales-ledger-v1';
const sold=(id,sku,cost,payout,day='2026-10-05')=>({
 id,sku,purchaseDate:'2026-10-01',purchaseCostJpy:cost,status:'sold',
 saleDate:day,payoutJpy:payout,shippingJpy:1000,otherJpy:200,
 notes:'',purchaseLink:'',saleLink:''
});
const held=(id,sku,cost)=>({
 id,sku,purchaseDate:'2026-10-02',purchaseCostJpy:cost,status:'held',
 saleDate:null,payoutJpy:null,shippingJpy:null,otherJpy:null,
 notes:'',purchaseLink:'',saleLink:''
});
const pack=(rows,ledger=true)=>JSON.stringify({
 format:'export-scout-local-backup',schema_version:1,
 exported_at:'2026-11-05T00:00:00.000Z',storage_format:'localStorage-raw-JSON-strings',
 invalid_json_keys:[],stores:ledger?{[key]:JSON.stringify(rows)}:{'export-scout-defaults-v1':'{"ship":1800}'}
});
function element(){
 return {textContent:'',children:[],events:{},disabled:true,files:[],href:'',
 addEventListener(k,fn){this.events[k]=fn},
 append(...children){this.children.push(...children)},
 replaceChildren(){this.children=[];this.textContent=''},
 click(){this.events.click?.()},remove(){}};
}
function run(){
 const nodes=Object.create(null),get=id=>nodes[id]||(nodes[id]=element()),blobs=[];
 const document={getElementById:get,createElement:element,body:{append(){}}};
 const FakeURL=class extends URL{
 static createObjectURL(v){blobs.push(v);return 'blob:local'}
 static revokeObjectURL(){}
 };
 const context={document,window:{},Date,JSON,Set,Map,Number,URL:FakeURL,
 Blob:class{constructor(parts){this.parts=parts}},
 localStorage:{setItem(){throw Error('Team preview must never write to storage')}}};
 vm.runInNewContext(script,context,{filename:'assets/team_preview.js'});
 const getfile=(data,name)=>({name,size:data.length,async text(){return data}});
 async function select(slot,contents){const id='teamFile'+slot;
 get(id).files=[getfile(contents,'member'+slot+'.json')];
 get(id).events.change();
 }
 async function compare(){await get('teamCompare').events.click()}
 return {get,select,compare,blobs};
}
(async()=>{
 const t=run();
 assert.equal(t.get('teamDownload').disabled,true);
 const a=pack([sold('item_A11111','DS Lite White',5000,12000),held('item_A22222','PSP-3000',9000)]);
 const b=pack([sold('item_B11111','DS Lite White',4500,10000)]);
 const c=pack([sold('item_C11111','GBA SP',6000,7000)]);
 await t.select('A',a);
 await t.select('B',b);
 await t.select('C',c);
 await t.compare();
 assert.match(t.get('teamPreviewStatus').textContent,/重複する取引IDはありません/);
 assert.match(t.get('teamPreviewSummary').children[0].textContent,/記録 4件/);
 assert.match(t.get('teamPreviewSummary').children[0].textContent,/売却 3件/);
 assert.match(t.get('teamPreviewSummary').children[1].textContent,/9,700円/);
 assert.match(t.get('teamPreviewSummary').children[1].textContent,/9,000円/);
 assert.equal(t.get('teamPreviewMembers').children.length,3);
 assert.equal(t.get('teamPreviewRanking').children.length,2);
 assert.match(t.get('teamPreviewRanking').children[0].children[1].textContent,/2名/);
 assert.equal(t.get('teamDownload').disabled,false);
 t.get('teamDownload').click();
 assert.equal(t.blobs.length,1);
 const exportData=JSON.parse(t.blobs[0].parts[0]);
 assert.equal(exportData.format,'export-scout-team-offline-review');
 assert.equal(exportData.records.length,4);
 assert.equal(exportData.records[0].member,'担当A');
 assert.equal(exportData.sources.length,3);

 const duplicate=run();
 await duplicate.select('A',a);
 await duplicate.select('B',pack([sold('item_A11111','PS Vita',1000,9000)]));
 await duplicate.compare();
 assert.match(duplicate.get('teamPreviewStatus').textContent,/重複を検出/);
 assert.equal(duplicate.get('teamDownload').disabled,true);
 assert.equal(duplicate.get('teamPreviewSummary').children.length,0,'Do not show partial profit after collision');

 const invalid=run();
 await invalid.select('A',pack([sold('item_A11111','Nintendo 3DS',5000,12000)],true).replace('2026-10-05','impossible'));
 await invalid.compare();
 assert.match(invalid.get('teamPreviewStatus').textContent,/集計を停止/);
 assert.equal(invalid.get('teamDownload').disabled,true);
 const noLedger=run();
 await noLedger.select('A',pack([],false));
 await noLedger.compare();
 assert.match(noLedger.get('teamPreviewMembers').children[0].children[1].textContent,/取引履歴がない/);
 assert.equal(noLedger.get('teamPreviewRanking').children[0].textContent,'売却実績がまだありません。');

 const changed=run();
 await changed.select('A',a);
 await changed.compare();
 assert.equal(changed.get('teamDownload').disabled,false);
 await changed.select('A',b);
 assert.equal(changed.get('teamDownload').disabled,true,'Old comparison cannot be exported after input changes');

 assert.doesNotMatch(script,/fetch\(|localStorage\.setItem|localStorage\.removeItem/);
 console.log('Team preview offline tests PASS: 3 members, profits, inventory, SKU grouping, duplicate rejection, invalid data, no sales, stale input and no storage writes');
})().catch(e=>{console.error(e);process.exitCode=1});
