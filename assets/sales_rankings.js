/* Export Scout actual-sales ranking. Read-only; no estimated or marketplace data. */
(()=>{
'use strict';
const KEY='export-scout-sales-ledger-v1';
const $=id=>document.getElementById(id);
const yen=n=>Math.round(n).toLocaleString('ja-JP')+'円';
const safeNum=x=>Number.isSafeInteger(x)&&x>=0;
function validDate(s){
if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
}
function read(){
const raw=localStorage.getItem(KEY);
if(raw===null)return [];
const all=JSON.parse(raw);
if(!Array.isArray(all)||all.length>1000)throw Error('取引記録を検査できません');
const ids=new Set();
for(const x of all){
if(!x||typeof x.id!=='string'||ids.has(x.id)||!x.id||typeof x.sku!=='string'||x.sku.trim().length<2||
!validDate(x.purchaseDate)||!safeNum(x.purchaseCostJpy)||!['sold','held'].includes(x.status))throw Error('保存記録に不整合があります');
ids.add(x.id);
if(x.status==='sold'&&(!validDate(x.saleDate)||x.saleDate<x.purchaseDate||!safeNum(x.payoutJpy)||!safeNum(x.shippingJpy)||!safeNum(x.otherJpy)))throw Error('売却記録を検査できません');
}
return all;
}
function rankings(rows){
const grouped=new Map();
for(const r of rows){
const name=r.sku.trim().replace(/\s+/g,' '),key=name.toLocaleLowerCase('ja-JP');
if(!grouped.has(key))grouped.set(key,{name,sales:0,profit:0,losses:0,positive:0,held:0,stockCost:0,purchaseDates:new Set(),lastSale:''});
const s=grouped.get(key);
s.purchaseDates.add(r.purchaseDate);
if(r.status==='held'){s.held++;s.stockCost+=r.purchaseCostJpy;continue}
const p=r.payoutJpy-r.purchaseCostJpy-r.shippingJpy-r.otherJpy;
s.profit+=p;s.sales++;if(p<0)s.losses++;if(p>0)s.positive++;
if(r.saleDate>s.lastSale)s.lastSale=r.saleDate;
}
return [...grouped.values()].filter(x=>x.sales>0).map(s=>({
name:s.name,sales:s.sales,profit:s.profit,avg:s.profit/s.sales,
losses:s.losses,positive:s.positive,held:s.held,stockCost:s.stockCost,
purchaseDays:s.purchaseDates.size,lastSale:s.lastSale,
repeatObservation:s.sales>=2&&s.purchaseDates.size>=2&&s.profit>0
}));}
function node(tag,text,cls){
const el=document.createElement(tag);el.textContent=text;
if(cls)el.className=cls;return el;
}
function render(){
const list=$('salesRankingList'),status=$('salesRankingStatus');
list.replaceChildren();
try{
const rows=read(),all=rankings(rows);
const onlyRepeat=$('salesRankingRepeatOnly').checked;
const selected=$('salesRankingSort').value;
let filtered=all.filter(x=>!onlyRepeat||x.sales>=2);
const compare=(a,b)=>selected==='count'?b.sales-a.sales||b.profit-a.profit:
selected==='avg'?b.avg-a.avg||b.sales-a.sales:
b.profit-a.profit||b.sales-a.sales;
filtered.sort((a,b)=>compare(a,b)||a.name.localeCompare(b.name,'ja-JP'));
status.textContent='自己入力の売却記録を商品別に集計：'+all.length+'商品（表示 '+filtered.length+'商品）。eBayの実売データ取得・利益の第三者検証はしていません。';
if(!filtered.length){
list.append(node('p',rows.length?'表示条件に合う売却済み商品がまだありません。':'まだ販売記録がありません。仕入れ・販売履歴を記録するとここに並びます。','note'));return;
}
filtered.slice(0,30).forEach((x,i)=>{
const card=document.createElement('div');card.className='sales-ranking-card';
card.append(node('strong',(i+1)+'. '+x.name));
const verdict=x.repeatObservation?'複数日の仕入れ＋2回以上の売却＋累計黒字（自己入力）':
x.sales>=2?'2回以上の売却記録あり・再仕入れ実績は未確認':
'売却1回・継続性は未確認';
card.append(node('p',verdict,'note'));
const metrics=document.createElement('div');metrics.className='sales-ranking-metrics';
for(const [label,val] of [
['売却回数',x.sales+'回'],['利益合計',yen(x.profit)],['1回平均',yen(x.avg)],
['赤字取引',x.losses+'回'],['仕入れ日数',x.purchaseDays+'日'],['在庫',x.held+'点']]){
const stat=document.createElement('div');stat.append(node('small',label),node('b',val));metrics.append(stat);
}
card.append(metrics);
card.append(node('p','在庫仕入れ原価 '+yen(x.stockCost)+' ／ 直近売却日 '+x.lastSale+'。集計利益は税・返品・共同分配前。','note'));
const btn=document.createElement('button');btn.type='button';btn.className='secondary';btn.textContent='同じ商品を記録';
btn.addEventListener('click',()=>{if(typeof window.ExportScoutSalesOpen==='function')window.ExportScoutSalesOpen(x.name)});
card.append(btn);list.append(card);
});
}catch(err){status.textContent='販売ランキングを安全に表示できません：'+err.message+'。取引履歴を確認してください。';}
}
$('salesRankingSort').addEventListener('change',render);
$('salesRankingRepeatOnly').addEventListener('change',render);
window.ExportScoutSalesRankingRefresh=render;
render();
})();
