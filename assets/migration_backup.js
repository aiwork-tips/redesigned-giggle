/* Migration preparation: local-only raw JSON export. No cloud sync or import. */
(()=>{
'use strict';
const KEYS=[
'export-scout-items-v1',
'export-scout-trend-inbox-v1',
'export-scout-repeatability-v1',
'export-scout-sales-ledger-v1',
'export-scout-defaults-v1',
'export-scout-fx-usdjpy-v1',
'export-scout-reviewed-v1',
];
const $=id=>document.getElementById(id);
function report(){
const rows=[];
for(const key of KEYS){
const raw=localStorage.getItem(key);
if(raw===null)continue;
let count='形式未確認';
try{
const v=JSON.parse(raw);
count=Array.isArray(v)?v.length+'件':typeof v==='object'&&v!==null?'設定・構造データ':typeof v;
}catch(e){count='JSON読取注意'}
rows.push({key,raw,count});
}
return rows;
}
function refresh(){
try{
const rows=report();
$('migrationBackupStatus').textContent='この端末で見つかった保存領域：'+rows.length+'種類（候補・調査待ち・販売履歴・仮評価・設定）。クラウド共有や移行先への送信は行いません。';
$('migrationBackupInventory').replaceChildren();
if(!rows.length){
const p=document.createElement('p');p.className='note';p.textContent='まだ保存されたデータはありません。';$('migrationBackupInventory').append(p);return;
}
for(const item of rows){
const p=document.createElement('p');p.className='note';p.textContent=item.key+'：'+item.count;
$('migrationBackupInventory').append(p);
}
}catch(e){$('migrationBackupStatus').textContent='保存領域を読み取れません。ブラウザの設定を確認してください。'}
}
$('migrationBackupDownload').addEventListener('click',()=>{
try{
const rows=report();
if(!rows.length){$('migrationBackupMessage').textContent='書き出す保存データがありません。';return}
const stores=Object.create(null);
const invalid=[];
for(const row of rows){
stores[row.key]=row.raw;
try{JSON.parse(row.raw)}catch(e){invalid.push(row.key)}
}
const documentData={
format:'export-scout-local-backup',
schema_version:1,
exported_at:new Date().toISOString(),
storage_format:'localStorage-raw-JSON-strings',
description:'Local Export Scout browser data. Not yet an importable Firebase migration package.',
stores,
invalid_json_keys:invalid,
};
const blob=new Blob([JSON.stringify(documentData,null,2)],{type:'application/json;charset=utf-8'});
const url=URL.createObjectURL(blob),a=document.createElement('a');
a.href=url;a.download='export-scout-local-backup-'+new Date().toISOString().slice(0,10)+'.json';
document.body.append(a);
try{a.click()}finally{a.remove();URL.revokeObjectURL(url)}
$('migrationBackupMessage').textContent='バックアップのダウンロード操作を開始しました。'+(invalid.length?'一部データが不正なJSONの可能性があります。元データを保護するため内容をそのまま書き出しました。':'')+' ファイルが保存されたか確認してください。';
}catch(e){$('migrationBackupMessage').textContent='バックアップを作成できません：'+e.message}
});
$('migrationBackupRefresh').addEventListener('click',refresh);
refresh();
})();
