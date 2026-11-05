/* 3-member offline comparison. Read-only; NOT Firestore synchronization. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const MAX_FILE=2*1024*1024,MAX_ROWS=3000;
const SLOTS=[{id:'teamFileA',label:'担当A'},{id:'teamFileB',label:'担当B'},{id:'teamFileC',label:'担当C'}];
let ready=null;
const yen=n=>Math.round(n).toLocaleString('ja-JP')+'円';
const text=(tag,value,cls='')=>{const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el};
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function dateIsValid(s){
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===s;
}
function isMoney(n,max){return Number.isSafeInteger(n)&&n>=0&&n<=max}
function parseFile(contents,label){
 if(typeof contents!=='string'||contents.length>MAX_FILE)throw Error(label+'：ファイルが2MBを超えています');
 let pack;try{pack=JSON.parse(contents)}catch(e){throw Error(label+'：JSONの形式が不正')};
 if(!isObj(pack)||pack.format!=='export-scout-local-backup'||pack.schema_version!==1||
 pack.storage_format!=='localStorage-raw-JSON-strings'||!isObj(pack.stores)||
 !Array.isArray(pack.invalid_json_keys)||pack.invalid_json_keys.length||
 typeof pack.exported_at!=='string'||!Number.isFinite(Date.parse(pack.exported_at)))throw Error(label+'：対応外または破損したバックアップ');
 const raw=pack.stores['export-scout-sales-ledger-v1'];
 if(raw===undefined)return {label,rows:[],hasLedger:false,exportedAt:pack.exported_at};
 if(typeof raw!=='string'||raw.length>MAX_FILE)throw Error(label+'：取引履歴データが不正');
 let rows;try{rows=JSON.parse(raw)}catch(e){throw Error(label+'：取引履歴を読み取れません')};
 if(!Array.isArray(rows)||rows.length>1000)throw Error(label+'：取引件数が形式に適合しません');
 const ids=new Set();
 for(const row of rows){
   if(!isObj(row)||typeof row.id!=='string'||row.id.length<6||row.id.length>80||ids.has(row.id)||
   typeof row.sku!=='string'||row.sku.trim().length<2||row.sku.length>180||
   !dateIsValid(row.purchaseDate)||!isMoney(row.purchaseCostJpy,10000000)||
   !['held','sold'].includes(row.status))throw Error(label+'：取引ID・SKU・仕入れデータが不正');
   ids.add(row.id);
   if(row.status==='held'){
     if(row.saleDate!==null||row.payoutJpy!==null||row.shippingJpy!==null||row.otherJpy!==null)throw Error(label+'：在庫状態が不正');
   }else if(!dateIsValid(row.saleDate)||row.saleDate<row.purchaseDate||
      !isMoney(row.payoutJpy,100000000)||!isMoney(row.shippingJpy,10000000)||
      !isMoney(row.otherJpy,10000000))throw Error(label+'：売却日・費用データが不正');
 }
 return {label,rows,hasLedger:true,exportedAt:pack.exported_at};
}
function mergedReports(sources){
 const seen=new Map(),recordList=[];
 for(const source of sources){
  for(const row of source.rows){
   const previous=seen.get(row.id);
   if(previous)throw Error('取引IDの重複を検出：'+previous+'と'+source.label+'に同じ取引があります。二重計上を防ぐため集計を停止しました');
   seen.set(row.id,source.label);
   recordList.push({source:source.label,row});
  }
 }
 if(recordList.length>MAX_ROWS)throw Error('最大3000取引まで確認できます');
 let sold=0,held=0,profit=0,stockCost=0;
 const group=new Map();
 for(const entry of recordList){
  const r=entry.row,key=r.sku.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ja-JP');
  if(!group.has(key))group.set(key,{name:r.sku,sold:0,held:0,profit:0,stockCost:0,sourceSet:new Set(),purchaseDates:new Set()});
  const sku=group.get(key);sku.sourceSet.add(entry.source);sku.purchaseDates.add(r.purchaseDate);
  if(r.status==='held'){held++;sku.held++;sku.stockCost+=r.purchaseCostJpy;stockCost+=r.purchaseCostJpy;}
  else{
   sold++;sku.sold++;const p=r.payoutJpy-r.purchaseCostJpy-r.shippingJpy-r.otherJpy;
   profit+=p;sku.profit+=p;
  }
 }
 return {records:recordList,sold,held,profit,stockCost,bySku:[...group.values()].sort((a,b)=>b.profit-a.profit||b.sold-a.sold)};
}
function reset(){
 ready=null;
 $('teamPreviewSummary').replaceChildren();$('teamPreviewMembers').replaceChildren();$('teamPreviewRanking').replaceChildren();
 $('teamDownload').disabled=true;
}
function showState(message){$('teamPreviewStatus').textContent=message}
async function compare(){
 reset();showState('バックアップを端末内で検証中…');
 const selected=SLOTS.map(x=>({...x,file:$(x.id).files?.[0]})).filter(x=>x.file);
 if(!selected.length){showState('担当A〜Cのバックアップを1つ以上選択してね');return}
 try{
   const sources=[];
   for(const slot of selected){
     if(slot.file.size>MAX_FILE)throw Error(slot.label+'：2MBを超えています');
     const raw=await slot.file.text();
     if(SLOTS.some(s=>(selected.find(x=>x.id===s.id)?.file||null)!==($(s.id).files?.[0]||null)))return;
     sources.push(parseFile(raw,slot.label));
   }
   const merged=mergedReports(sources);
   ready={sources,merged,selected:selected.map(x=>({id:x.id,file:x.file}))};
   $('teamPreviewSummary').append(text('p','読み込んだ担当：'+sources.length+'名 ／ 記録 '+merged.records.length+'件 ／ 売却 '+merged.sold+'件 ／ 在庫 '+merged.held+'点','note'));
   $('teamPreviewSummary').append(text('p','記録上の利益合計：'+yen(merged.profit)+' ／ 在庫仕入れ原価：'+yen(merged.stockCost)+'（自己入力・返品税金等は別）','note'));
   for(const source of sources){
     const box=document.createElement('div');box.className='team-member-row';
     const s=source.rows.filter(x=>x.status==='sold'),held=source.rows.filter(x=>x.status==='held');
     const sum=s.reduce((v,x)=>v+x.payoutJpy-x.purchaseCostJpy-x.shippingJpy-x.otherJpy,0);
     box.append(text('strong',source.label),text('p',source.hasLedger?
      '売却 '+s.length+'件 ／ 在庫 '+held.length+'点 ／ 記録上の利益 '+yen(sum):
      '取引履歴がないバックアップ（0件として集計）','note'));
     $('teamPreviewMembers').append(box);
   }
   for(const sku of merged.bySku.filter(x=>x.sold).slice(0,20)){
     const box=document.createElement('div');box.className='team-member-row';
     box.append(text('strong',sku.name),text('p','売却 '+sku.sold+'件 ／ 利益 '+yen(sku.profit)+' ／ 在庫 '+sku.held+'点 ／ 記録元 '+sku.sourceSet.size+'名','note'));
     $('teamPreviewRanking').append(box);
   }
   if(!merged.bySku.some(x=>x.sold))$('teamPreviewRanking').append(text('p','売却実績がまだありません。','note'));
   $('teamDownload').disabled=false;
   showState('照合完了：重複する取引IDはありません。これはファイルの一時比較であり、データの共有・同期・上書きではありません。');
 }catch(e){reset();showState('集計を停止しました：'+e.message)}
}
$('teamCompare').addEventListener('click',compare);
for(const slot of SLOTS)$(slot.id).addEventListener('change',()=>{
 reset();showState('ファイルを変更しました。もう一度「バックアップを照合」を実行してね。');
});
$('teamDownload').addEventListener('click',()=>{
 if(!ready){showState('先に照合を完了してね');return}
 if(ready.selected.some(x=>($(x.id).files?.[0]||null)!==x.file)){reset();showState('ファイルが変わりました。もう一度照合してね。');return}
 const packet={
 format:'export-scout-team-offline-review',
 schema_version:1,
 exported_at:new Date().toISOString(),
 notice:'Self-reported local transaction records only. Not Firebase-ready authenticated data or audited eBay sales.',
 sources:ready.sources.map(x=>({label:x.label,exported_at:x.exportedAt,has_ledger:x.hasLedger,transaction_count:x.rows.length})),
 records:ready.merged.records.map(x=>({member:x.source,transaction:x.row}))
 };
 const blob=new Blob([JSON.stringify(packet,null,2)],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='export-scout-team-review.json';
 document.body.append(a);try{a.click()}finally{a.remove();URL.revokeObjectURL(url)}
 showState('共同集計用JSONのダウンロード操作を開始しました。ファイルの保存を確認してね。売上の個人情報を含むため公開GitHubにアップロードしないでください。');
});
$('teamJump').addEventListener('click',()=>{$('migrationBackupPanel').open=true});
showState('最大3名のJSONバックアップを読み取って、重複・利益・在庫を一時比較できます。');
})();
