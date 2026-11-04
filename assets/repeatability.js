/* Manual, evidence-labelled repeat-sourcing review. Never claims verified profit. */
(()=>{
'use strict';
const KEY='export-scout-repeatability-v1';
const MAX=200;
const $=id=>document.getElementById(id);
let records=[];
const q=id=>String($(id).value??'').trim();
const money=n=>Math.round(n).toLocaleString('ja-JP')+'円';
const num=v=>v===''?null:Number(v);
const clean=v=>String(v??'').trim().slice(0,180);
function validURL(raw){
if(!raw)return false;
try{
const u=new URL(raw);
return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname.includes('.')&&u.href.length<=500;
}catch(e){return false}
}
function getFields(){
const sku=q('repeatSku'),category=q('repeatCategory'),soldCount=num(q('repeatSoldCount')),usd=num(q('repeatUsd')),cost=num(q('repeatCost')),ship=num(q('repeatShip')),fee=num(q('repeatFee')),other=num(q('repeatOther')),fx=num(q('repeatFx')),activeCount=num(q('repeatActiveCount')),minProfit=num(q('repeatTarget'));
const sourceSold=q('repeatSoldUrl'),sourceBuy=q('repeatBuyUrl'),sourcing=q('repeatSourcing');
const values={sku:clean(sku),category:clean(category),soldCount,usd,cost,ship,fee,other,fx,activeCount,minProfit,sourceSold,sourceBuy,sourcing};
const numeric=[['soldCount',soldCount,0,100000,true],['usd',usd,0,100000,false],['cost',cost,0,10000000,false],['ship',ship,0,10000000,false],['fee',fee,0,100,false],['other',other,0,10000000,false],['fx',fx,0,300,false],['activeCount',activeCount,0,100000,true],['minProfit',minProfit,0,10000000,false]];
for(const [key,n,min,max,int] of numeric){
if(n!==null&&(!Number.isFinite(n)||n<min||n>max||(int&&!Number.isInteger(n))))throw Error(key+' の数値を確認してね');
}
if(!values.sku||values.sku.length<2)throw Error('商品型番・品番は2文字以上で入力してね');
if(!['未確認','単発','複数回見込み'].includes(sourcing))throw Error('仕入れ再現性を選択してね');
if(sourceSold&&!validURL(sourceSold)||sourceBuy&&!validURL(sourceBuy))throw Error('出典URLは有効なHTTPSリンクを入力してね');
if(records.length>=MAX&&!records.some(x=>x.sku.toLowerCase()===sku.toLowerCase()))throw Error('検証履歴は200件まで。CSVで控えを保存してから整理してね');
return values;
}
function verdict(row,now=Date.now()){
const age=now-Date.parse(row.checkedAt);
const calc=[row.usd,row.cost,row.ship,row.fee,row.other,row.fx,row.minProfit];
const complete=calc.every(n=>typeof n==='number'&&Number.isFinite(n))&&row.usd>0&&row.fx>0;
const sale=complete?row.usd*row.fx:null;
const profit=complete?sale-row.cost-row.ship-row.other-sale*row.fee/100:null;
const conservative=complete?sale*.9-row.cost-(row.ship+500)-row.other-sale*.9*row.fee/100:null;
const fresh=Number.isFinite(age)&&age>=-3600000&&age<=30*86400000;
const hasProof=row.sourceSold&&row.sourceBuy&&validURL(row.sourceSold)&&validURL(row.sourceBuy);
let status='情報不足・追加調査';
if(!fresh)status='要再確認（30日以上経過）';
else if(complete&&row.soldCount>=3&&hasProof){
if(profit<row.minProfit)status='利益目標未達（仮試算）';
else if(row.sourcing==='複数回見込み')status='継続調査優先（仮評価）';
else if(row.sourcing==='単発')status='単発仕入れの利益候補（仮）';
else status='仕入れの再現性を確認';
}
return {status,profit,conservative};
}
function stateMessage(value){
$('repeatFeedback').textContent=value;
}
function store(){
try{localStorage.setItem(KEY,JSON.stringify(records));return true}
catch(e){stateMessage('端末への保存に失敗。ブラウザの保存設定を確認してね。');return false}
}
function load(){
try{
const list=JSON.parse(localStorage.getItem(KEY)||'[]');
if(!Array.isArray(list))return;
records=list.slice(0,MAX).filter(x=>x&&typeof x.sku==='string'&&x.sku.length>1&&typeof x.checkedAt==='string'&&Number.isFinite(Date.parse(x.checkedAt))&&['未確認','単発','複数回見込み'].includes(x.sourcing));
}catch(e){records=[]}
}
function fill(row){
$('repeatCategory').value=row?.category||'';
$('repeatSku').value=row?.sku||'';
for(const [field,key] of [['repeatSoldCount','soldCount'],['repeatActiveCount','activeCount'],['repeatUsd','usd'],['repeatCost','cost'],['repeatShip','ship'],['repeatFee','fee'],['repeatOther','other'],['repeatFx','fx'],['repeatTarget','minProfit']]){
const defaults={'repeatFee':14,'repeatTarget':2000,'repeatShip':1800,'repeatOther':0};
$(field).value=row&&row[key]!==null&&row[key]!==undefined?row[key]:(defaults[field]??'');
}
if(!row||row.fx===undefined||row.fx===null){
const current=num($('usdRate').value);if(current!==null&&Number.isFinite(current)&&current>0)$('repeatFx').value=current;
if(!row||row.ship===undefined){const currentShip=num($('ship').value);if(currentShip!==null&&Number.isFinite(currentShip)&&currentShip>=0)$('repeatShip').value=currentShip}
if(!row||row.fee===undefined){const currentFee=num($('rate').value);if(currentFee!==null&&Number.isFinite(currentFee)&&currentFee>=0)$('repeatFee').value=currentFee}
if(!row||row.other===undefined){const currentOther=num($('other').value);if(currentOther!==null&&Number.isFinite(currentOther)&&currentOther>=0)$('repeatOther').value=currentOther}
}
$('repeatSourcing').value=row?.sourcing||'未確認';
$('repeatSoldUrl').value=row?.sourceSold||'';
$('repeatBuyUrl').value=row?.sourceBuy||'';
$('repeatEditor').open=true;
stateMessage('同じ型番・仕様の成約実績と仕入れ条件を入力。空欄はそのまま未検証として保存できるよ。');
}
function render(){
const root=$('repeatList');root.replaceChildren();
const sorted=records.map(x=>({row:x,result:verdict(x)})).sort((a,b)=>{
const order={'継続調査優先（仮評価）':0,'単発仕入れの利益候補（仮）':1,'仕入れの再現性を確認':2,'利益目標未達（仮試算）':3,'情報不足・追加調査':4,'要再確認（30日以上経過）':5};
return (order[a.result.status]??6)-(order[b.result.status]??6)||(b.result.profit??-1e12)-(a.result.profit??-1e12);
});
const preferred=sorted.filter(x=>x.result.status==='継続調査優先（仮評価）').length;
$('repeatStatus').textContent='検証メモ：'+records.length+'件 ／ 継続調査優先：'+preferred+'件（すべて自己申告の仮試算。実利益・在庫は未確認）';
if(!sorted.length){root.append(Object.assign(document.createElement('p'),{className:'note',textContent:'まだ検証記録がないよ。定番候補の「この商品を検証」から始められる。'}));return}
for(const {row,result} of sorted){
const card=document.createElement('div');card.className='repeat-record';
const title=document.createElement('strong');title.textContent=row.sku;
const badge=document.createElement('span');badge.className='repeat-verdict';badge.textContent=result.status;
const sub=document.createElement('p');sub.className='note';sub.textContent='確認：'+new Date(row.checkedAt).toLocaleDateString('ja-JP')+' ／ eBay過去90日成約：'+(row.soldCount??'未入力')+'件 ／ 仕入れ：'+row.sourcing;
const estimate=document.createElement('p');estimate.className='note';
estimate.textContent=result.profit===null?'参考利益：計算に必要な項目が未入力':'参考利益：'+money(result.profit)+' ／ 条件悪化時：'+money(result.conservative)+'（自己申告値の試算）';
const proof=document.createElement('p');proof.className='note';proof.textContent='出典：'+(row.sourceSold&&row.sourceBuy?'URL記録あり（内容は未検証）':'未登録・不足')+' ／ 為替：'+(row.fx??'未入力')+'円/USD';
const buttons=document.createElement('div');buttons.className='trend-auto-actions';
const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='編集';
edit.addEventListener('click',()=>{fill(row);$('repeatEditor').scrollIntoView({block:'start',behavior:'smooth'})});
const del=document.createElement('button');del.type='button';del.className='secondary';del.textContent='削除';
del.addEventListener('click',()=>{records=records.filter(x=>x.sku.toLowerCase()!==row.sku.toLowerCase());if(store()){render();stateMessage(row.sku+'の検証メモを削除したよ。')}});
buttons.append(edit,del);
for(const [label,url] of [['成約元',row.sourceSold],['仕入れ元',row.sourceBuy]]){
if(url&&validURL(url)){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;buttons.append(a)}
}
card.append(title,badge,sub,estimate,proof,buttons);root.append(card);
}
}
window.ExportScoutRepeatabilityOpen=(name,query)=>{
const key=clean(name),term=clean(query);
const match=records.find(x=>x.sku.toLowerCase()===key.toLowerCase()||x.sku.toLowerCase()===term.toLowerCase());
if(match)fill(match);
else{
fill(null);
$('repeatSku').value=key||term;
$('repeatCategory').value=term;
}
$('repeatEditor').scrollIntoView({block:'start',behavior:'smooth'});
};
$('repeatSave').addEventListener('click',()=>{
try{
const values=getFields(),key=values.sku.toLowerCase();
const next={...values,checkedAt:new Date().toISOString()};
const index=records.findIndex(x=>x.sku.toLowerCase()===key);
if(index>=0)records[index]=next;
else records.unshift(next);
if(!store())return;
render();$('repeatEditor').open=false;stateMessage(values.sku+'の検証メモを保存したよ。利益は仮試算として扱うよ。');
}catch(e){stateMessage('保存できません：'+e.message)}
});
$('repeatReset').addEventListener('click',()=>{fill(null);stateMessage('新しい商品を記録できるよ。')});
$('repeatExport').addEventListener('click',()=>{
if(!records.length){stateMessage('書き出す記録がないよ。');return}
const fields=['sku','category','checkedAt','soldCount','activeCount','usd','cost','ship','fee','other','fx','minProfit','sourcing','sourceSold','sourceBuy'];
const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
const csv='\ufeff'+fields.join(',')+'\r\n'+records.map(x=>fields.map(k=>esc(x[k])).join(',')).join('\r\n');
const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
a.href=url;a.download='export-scout-repeat-sourcing-review.csv';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
stateMessage('CSVを保存したよ。端末のデータ消去に備え、定期的にバックアップしてね。');
});
load();fill(null);$('repeatEditor').open=false;render();
})();
