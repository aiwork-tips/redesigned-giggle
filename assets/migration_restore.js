/* Export Scout local backup restore: explicit, non-overwriting, no cloud sync. */
(()=>{
'use strict';
const KEYS=[
'export-scout-items-v1',
'export-scout-trend-inbox-v1',
'export-scout-repeatability-v1',
'export-scout-sales-ledger-v1',
'export-scout-defaults-v1',
'export-scout-fx-usdjpy-v1',
'export-scout-reviewed-v1'
];
const LABELS={
'export-scout-items-v1':'仕入れ候補',
'export-scout-trend-inbox-v1':'調査待ちリスト',
'export-scout-repeatability-v1':'利益検証メモ',
'export-scout-sales-ledger-v1':'実際の取引履歴',
'export-scout-defaults-v1':'送料・手数料設定',
'export-scout-fx-usdjpy-v1':'為替参考値',
'export-scout-reviewed-v1':'調査済みフラグ'
};
const ARRAY_KEYS=new Set(KEYS.slice(0,4));
const MAX_BYTES=2*1024*1024;
const $=id=>document.getElementById(id);
let prepared=null;
const safeDate=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
function isObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)}
function verifyRecord(key,data){
if(ARRAY_KEYS.has(key)){
 if(!Array.isArray(data)||data.length>(key==='export-scout-sales-ledger-v1'?1000:5000))throw Error(LABELS[key]+'の保存形式が不正');
 if(key==='export-scout-sales-ledger-v1'){
   const ids=new Set();
   for(const row of data){
     if(!isObject(row)||typeof row.id!=='string'||row.id.length<6||row.id.length>80||ids.has(row.id)||
      typeof row.sku!=='string'||row.sku.trim().length<2||typeof row.purchaseDate!=='string'||
      !['held','sold'].includes(row.status)||!Number.isSafeInteger(row.purchaseCostJpy)||row.purchaseCostJpy<0)throw Error('取引履歴の型番・ID・仕入れ額に不備');
     if(row.status==='sold'&&(!safeDate(row.saleDate)||!Number.isSafeInteger(row.payoutJpy)||!Number.isSafeInteger(row.shippingJpy)||!Number.isSafeInteger(row.otherJpy)||row.payoutJpy<0||row.shippingJpy<0||row.otherJpy<0))throw Error('売却記録の金額に不備');
     ids.add(row.id);
   }
 }
 if(key==='export-scout-repeatability-v1'&&data.some(row=>!isObject(row)||typeof row.sku!=='string'||row.sku.trim().length<2))throw Error('利益検証メモの型番に不備');
 if(key==='export-scout-trend-inbox-v1'&&data.some(row=>!isObject(row)||typeof row.term!=='string'||!row.term.trim()))throw Error('調査待ちリストの商品名に不備');
 if(key==='export-scout-items-v1'&&data.some(row=>!isObject(row)||typeof row.name!=='string'||!row.name.trim()))throw Error('仕入れ候補の名前に不備');
}else if(!isObject(data))throw Error(LABELS[key]+'の設定形式が不正');
}
function parseBackup(contents){
 if(typeof contents!=='string'||contents.length>MAX_BYTES)throw Error('バックアップは2MB以下のJSONファイルを選択してね');
 let pack;
 try{pack=JSON.parse(contents)}catch(e){throw Error('JSONファイルとして読み取れません')}
 if(!isObject(pack)||pack.format!=='export-scout-local-backup'||pack.schema_version!==1||
  pack.storage_format!=='localStorage-raw-JSON-strings'||!safeDate(pack.exported_at)||
  !isObject(pack.stores))throw Error('Export Scout v5.3以降のバックアップ形式ではありません');
 if(!Array.isArray(pack.invalid_json_keys))throw Error('ファイルの検証情報が不正');
 if(pack.invalid_json_keys.length)throw Error('元データに破損が報告されています。安全のため復元を停止しました');
 const names=Object.keys(pack.stores);
 if(!names.length||names.some(key=>!KEYS.includes(key)))throw Error('対応していない保存データが含まれています');
 const values=Object.create(null);
 for(const key of names){
  const raw=pack.stores[key];
  if(typeof raw!=='string'||raw.length>MAX_BYTES)throw Error(LABELS[key]+'が文字列として保存されていません');
  let value;
  try{value=JSON.parse(raw)}catch(e){throw Error(LABELS[key]+'のJSONが壊れています')}
  verifyRecord(key,value);
  values[key]=raw;
 }
 return {values,names,exportedAt:pack.exported_at};
}
function reset(){
 prepared=null;
 $('migrationRestoreApprove').checked=false;
 $('migrationRestoreApply').disabled=true;
 $('migrationRestorePreview').replaceChildren();
}
function report(text){$('migrationRestoreMessage').textContent=text}
function addInfo(text){
 const p=document.createElement('p');p.className='note';p.textContent=text;
 $('migrationRestorePreview').append(p);
}
function preview(pack,fileLabel){
 reset();
 const snapshot=Object.create(null);
 for(const key of pack.names)snapshot[key]=localStorage.getItem(key);
 const empty=pack.names.filter(key=>snapshot[key]===null);
 const existing=pack.names.filter(key=>snapshot[key]!==null);
 prepared={pack,fileLabel,snapshot,empty,existing};
 addInfo('ファイル：'+fileLabel+' ／ 作成日時：'+new Date(pack.exportedAt).toLocaleString('ja-JP'));
 for(const key of pack.names){
  const data=JSON.parse(pack.values[key]);
  const count=Array.isArray(data)?data.length+'件':'設定';
  addInfo(LABELS[key]+'（'+count+'）：'+(snapshot[key]===null?'復元可能（空き）':'この端末に既存データあり → 上書きせずスキップ'));
 }
 if(!empty.length)report('全種類が既存データと重複しています。今回は何も取り込みません。CSVで記録を比較してください。');
 else report('事前確認完了：'+empty.length+'種類を復元可能、'+existing.length+'種類はスキップ。チェックを入れて実行を選んでね。');
}
async function selectFile(){
 reset();
 report('ファイルを検証中…');
 const file=$('migrationRestoreFile').files?.[0];
 if(!file){report('JSONファイルを選択してね');return}
 if(typeof file.size==='number'&&file.size>MAX_BYTES){report('復元ファイルが2MBを超えています');return}
 try{
  const raw=await file.text();
  if($('migrationRestoreFile').files?.[0]!==file)return; // file selection changed during async read
  const parsed=parseBackup(raw);
  preview(parsed,file.name||'local-backup.json');
 }catch(e){reset();report('復元前の検査で停止：'+e.message)}
}
function commit(){
 if(!prepared||!$('migrationRestoreApprove').checked){report('先にファイルを確認し、復元の同意チェックを入れてね');return}
 const plan=prepared;
 const current=plan.pack.names.map(key=>[key,localStorage.getItem(key)]);
 if(current.some(([key,value])=>value!==plan.snapshot[key])){reset();report('検査後に保存データが変わりました。ファイルを選び直して再確認してね。');return}
 const writable=plan.empty.filter(k=>localStorage.getItem(k)===null);
 if(!writable.length){report('空き領域がありません。復元は行っていません。');return}
 if(!confirm(writable.length+'種類のデータをこの端末に復元します。既存データは上書きしません。実行しますか？'))return;
 const written=[];
 try{
  for(const key of writable){
   if(localStorage.getItem(key)!==null)throw Error('復元中に既存データが作成された');
   localStorage.setItem(key,plan.pack.values[key]);
   written.push(key);
   if(localStorage.getItem(key)!==plan.pack.values[key])throw Error('保存内容の照合に失敗');
  }
 }catch(e){
  const issues=[];
  for(const key of written.reverse()){
   try{
    if(localStorage.getItem(key)===plan.pack.values[key])localStorage.removeItem(key);
    else issues.push(LABELS[key]);
   }catch(err){issues.push(LABELS[key])}
  }
  reset();
  report('復元失敗：'+e.message+'。'+(issues.length?'一部の巻き戻しが未完了（'+issues.join('、')+'）。追加操作せずバックアップを保管してください。':'今回追加したデータは巻き戻しました。既存データは触れていません。'));
  return;
 }
 reset();
 report(writable.length+'種類の復元が完了しました。'+plan.existing.length+'種類の既存データはスキップしました。画面を再読み込みすると読み込まれます。バックアップは保管してね。');
}
$('migrationRestoreFile').addEventListener('change',selectFile);
$('migrationRestoreApprove').addEventListener('change',()=>{
 $('migrationRestoreApply').disabled=!prepared||!prepared.empty.length||!$('migrationRestoreApprove').checked;
});
$('migrationRestoreApply').addEventListener('click',commit);
reset();
report('バックアップファイルを選ぶと、復元できる種類と競合を先に表示します。');
})();
