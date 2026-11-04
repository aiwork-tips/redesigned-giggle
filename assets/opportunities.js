'use strict';
(()=> {
const el=id=>document.getElementById(id);
const status=el('autoPairsStatus'),list=el('autoPairsList');
let pairs=[],lastInputs='';
function sourceURL(value,kind){
try{
const u=new URL(value);
if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
if(kind==='sold')return u.hostname==='www.ebay.com'&&u.pathname.startsWith('/itm/');
return (u.hostname==='jp.mercari.com'&&u.pathname.startsWith('/item/'))||(u.hostname==='auctions.yahoo.co.jp'&&u.pathname.startsWith('/jp/auction/'));
}catch(e){return false}
}
function valid(x){
if(!x||typeof x.target_id!=='string'||!/^t[0-9]{2,3}$/.test(x.target_id)||!['new','used'].includes(x.condition)||typeof x.query!=='string'||!x.query.trim()||x.price_type!=='historical_sale_vs_active_domestic_offer'||!Number.isFinite(x.median_completed_sale_total_usd)||x.median_completed_sale_total_usd<=0||!Number.isFinite(x.min_domestic_delivered_cost_jpy)||x.min_domestic_delivered_cost_jpy<=0||!Number.isInteger(x.completed_sale_samples)||x.completed_sale_samples<2||!Array.isArray(x.sample_sale_urls)||x.sample_sale_urls.length<2||x.sample_sale_urls.length>5||!x.sample_sale_urls.every(u=>sourceURL(u,'sold'))||!sourceURL(x.domestic_offer_url,'domestic'))return false;
for(const [time,days] of [[x.last_sale_checked_at,14],[x.domestic_offer_checked_at,7]]){
const d=Date.parse(time);
if(!Number.isFinite(d)||d>Date.now()+3600000||Date.now()-d>days*86400000)return false;
}
return true;
}
function render(){
list.replaceChildren();
if(!pairs.length)return;
const rateText=el('usdRate').value,shipText=el('ship').value,feeText=el('rate').value,otherText=el('other').value;
if([rateText,shipText,feeText,otherText].some(v=>v==='')){
list.textContent='為替レート・送料・手数料の設定後に参考利益を表示します。';return;
}
const fx=Number(rateText),ship=Number(shipText),fee=Number(feeText),other=Number(otherText);
if(!Number.isFinite(fx)||fx<=0||![ship,fee,other].every(n=>Number.isFinite(n)&&n>=0)||fee>100){
list.textContent='為替レート・送料・手数料の入力内容を確認してください。';return;
}
const ranked=pairs.map(x=>{
const revenue=x.median_completed_sale_total_usd*fx;
const profit=revenue-x.min_domestic_delivered_cost_jpy-ship-other-revenue*fee/100;
const bad=revenue*.9-x.min_domestic_delivered_cost_jpy-(ship+500)-other-revenue*.9*fee/100;
return {x,profit,bad};
}).sort((a,b)=>b.profit-a.profit);
const note=document.createElement('p');
note.className='note';note.textContent='参考候補 '+ranked.length+'件（掲載情報の真偽・在庫・取引成立は保証しません）';
list.append(note);
ranked.slice(0,20).forEach(({x,profit,bad},i)=>{
const box=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('p'),numbers=document.createElement('p'),links=document.createElement('div'),dates=document.createElement('p');
box.className='item';title.textContent=(i+1)+'. '+x.query+'（'+(x.condition==='used'?'中古':'新品')+'）';
detail.className='note';detail.textContent='過去の成約例 '+x.completed_sale_samples+'件 ／ 総額中央値 $'+x.median_completed_sale_total_usd.toFixed(2)+' USD ／ 国内掲載総額 '+x.min_domestic_delivered_cost_jpy.toLocaleString('ja-JP')+'円';
numbers.className='note';numbers.textContent='参考利益 '+Math.round(profit).toLocaleString('ja-JP')+'円 ／ 条件悪化時 '+Math.round(bad).toLocaleString('ja-JP')+'円';
links.className='research-links';
for(const [label,url] of [['eBay成約例',x.sample_sale_urls[0]],['国内掲載元',x.domestic_offer_url]]){
const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;links.append(a);
}
dates.className='note';dates.textContent='成約確認：'+new Date(x.last_sale_checked_at).toLocaleDateString('ja-JP')+' ／ 国内掲載確認：'+new Date(x.domestic_offer_checked_at).toLocaleDateString('ja-JP')+'。購入前にリンク先を確認してください。';
box.append(title,detail,numbers,links,dates);list.append(box);
});
}
async function load(){
pairs=[];list.replaceChildren();status.textContent='出典付き価格データの接続状況を確認中…';
try{
const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);let response;
try{response=await fetch('./data/opportunity_pairs.json',{cache:'no-store',signal:controller.signal})}
finally{clearTimeout(timeout)}
if(!response.ok)throw Error('価格データ未取得');
const data=await response.json();
if(data.schema_version!==1||data.price_type!=='historical_sale_vs_active_domestic_offer'||!Array.isArray(data.items)||data.items.length>100)throw Error('データ形式不正');
if(data.items.length){
if(data.source!=='source_linked_evidence'||!Number.isFinite(Date.parse(data.generated_at)))throw Error('出典データ不明');
const seen=new Set();
for(const x of data.items){
const key=x.target_id+'|'+x.condition;
if(!valid(x)||seen.has(key))throw Error('価格・日付・出典の不備');
seen.add(key);
}
}else if(data.source!=='not_connected')throw Error('接続状態不明');
pairs=data.items;
status.textContent=pairs.length?'出典付き比較候補 '+pairs.length+'件（リンク内容は独立検証していません）':'成約価格と国内仕入れ価格の自動連携：未接続（0件）。推測の利益ランキングは表示しません。';
render();
}catch(e){status.textContent='自動比較は未利用（'+e.message+'）。保存済み候補は変更しません。'}
}
for(const id of ['usdRate','ship','rate','other'])el(id).addEventListener('input',render);
setInterval(()=>{
if(!pairs.length)return;
const snapshot=['usdRate','ship','rate','other'].map(id=>el(id).value).join('|');
if(snapshot!==lastInputs){lastInputs=snapshot;render()}
},12000);
el('refreshFeed').addEventListener('click',load);
load();
})();
