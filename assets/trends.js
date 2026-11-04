/* Export Scout trend discovery: curated source links, NOT automatic sales data. */
(()=>{
'use strict';
const KEY='export-scout-trend-inbox-v1';
const $=id=>document.getElementById(id);
const sources={
ebayReport:'https://ebay.co.jp/release/20260828',
zen:'https://journal.zen.one/japanese-item-ranking/',
};
const seeds=[
{term:'One Piece Japanese trading card',label:'ワンピースカード（日本語版）',source:'eBay Japan 2026年第2四半期',url:sources.ebayReport},
{term:'Pokemon card Japanese',label:'ポケモンカード（日本語版）',source:'eBay Japan 2026年第2四半期',url:sources.ebayReport},
{term:'One Piece graded manga first edition',label:'鑑定済み漫画・初版',source:'eBay Japan 2026年第2四半期',url:sources.ebayReport},
{term:'Seiko 5 vintage watch',label:'セイコー中古時計',source:'eBay Japan 2026年第2四半期（時計カテゴリー）',url:sources.ebayReport},
{term:'Nintendo DS Lite Japanese',label:'ニンテンドーDS Lite',source:'ZenMarket 2026年版（ゲーム機カテゴリー）',url:sources.zen},
{term:'Dragon Ball Japanese figure',label:'ドラゴンボールのフィギュア',source:'ZenMarket 2026年版（フィギュアカテゴリー）',url:sources.zen}
];
let inbox=[];
function cleanTerm(value){
return String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120);
}
function load(){
try{
const d=JSON.parse(localStorage.getItem(KEY)||'[]');
if(Array.isArray(d))inbox=d.slice(0,150).filter(x=>x&&typeof x.term==='string'&&x.term.trim().length>0).map(x=>({term:cleanTerm(x.term),source:typeof x.source==='string'?x.source.slice(0,70):'手動追加',at:typeof x.at==='string'?x.at:''}));
}catch(e){inbox=[]}
}
function store(){
try{localStorage.setItem(KEY,JSON.stringify(inbox));$('trendMessage').textContent='この端末に保存しました。'}catch(e){$('trendMessage').textContent='端末に保存できませんでした。ブラウザの保存設定を確認してください。'}
}
function link(label,url){
const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function researchLink(label,base,term){return link(label,base+encodeURIComponent(term))}
function goToResearch(term){
$('product').value=term;
$('product').scrollIntoView({behavior:'smooth',block:'center'});
$('trendMessage').textContent='商品名を検索欄にセットしました。eBayで成約例、国内サイトで仕入れ価格を確認してください。';
}
function add(term,source){
const cleaned=cleanTerm(term);
if(!cleaned){$('trendMessage').textContent='商品名・検索語を入力してください。';return}
if(inbox.some(x=>x.term.toLowerCase()===cleaned.toLowerCase())){$('trendMessage').textContent='同じ検索語はすでに調査待ちリストにあります。';return}
if(inbox.length>=150){$('trendMessage').textContent='調査待ちリストは150件までです。';return}
inbox.unshift({term:cleaned,source:source||'手動追加',at:new Date().toISOString()});
store();render();
}
function render(){
const root=$('trendInboxList');root.replaceChildren();
$('trendInboxCount').textContent='調査待ち '+inbox.length+'件（実売・利益未確認）';
if(!inbox.length){const p=document.createElement('p');p.className='note';p.textContent='まだ登録されていません。下の注目キーワードや外部ランキングから、気になった商品を追加してね。';root.append(p);return}
for(const [index,x] of inbox.entries()){
const card=document.createElement('div'),head=document.createElement('strong'),sub=document.createElement('p'),actions=document.createElement('div'),btn=document.createElement('button'),remove=document.createElement('button');
card.className='trend-entry';head.textContent=x.term;sub.className='note';sub.textContent='きっかけ：'+x.source+(x.at?' ／ 登録 '+new Date(x.at).toLocaleDateString('ja-JP'):'');
actions.className='research-links';btn.className='secondary';btn.textContent='価格調査へ';btn.addEventListener('click',()=>goToResearch(x.term));
actions.append(btn,
researchLink('eBay成約例','https://www.ebay.com/sch/i.html?LH_Sold=1&LH_Complete=1&_nkw=',x.term),
researchLink('メルカリ','https://jp.mercari.com/search?keyword=',x.term),
researchLink('ヤフオク','https://auctions.yahoo.co.jp/search/search?p=',x.term));
remove.className='trend-delete';remove.textContent='削除';remove.setAttribute('aria-label',x.term+'を調査待ちから削除');remove.addEventListener('click',()=>{inbox.splice(index,1);store();render()});
card.append(head,sub,actions,remove);root.append(card);
}
}
function setupSeeds(){
const root=$('trendSeedList');root.replaceChildren();
for(const item of seeds){
const card=document.createElement('div'),label=document.createElement('strong'),info=document.createElement('p'),btn=document.createElement('button');
card.className='trend-seed';label.textContent=item.label;info.className='note';info.textContent='調査キーワード：'+item.term+' ／ 着想元：'+item.source+'。この商品の売上順位・利益は未確認。';
btn.className='secondary';btn.textContent='調査待ちに追加';btn.addEventListener('click',()=>add(item.term,item.source));
card.append(label,info,btn,link('根拠元を開く',item.url));root.append(card);
}
}
$('trendAdd').addEventListener('click',()=>{const value=$('trendTerm').value;add(value,'自分で追加');if(inbox.some(x=>x.term.toLowerCase()===cleanTerm(value).toLowerCase()))$('trendTerm').value=''});
$('trendTerm').addEventListener('keydown',e=>{if(e.key==='Enter')$('trendAdd').click()});
$('trendExport').addEventListener('click',()=>{
if(!inbox.length){$('trendMessage').textContent='書き出す調査待ち候補がありません。';return}
const esc=s=>'"'+String(s||'').replace(/"/g,'""')+'"';
const csv='\ufeff'+'検索語,登録元,登録日時\n'+inbox.map(x=>[x.term,x.source,x.at].map(esc).join(',')).join('\n');
const file=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(file),a=document.createElement('a');
a.href=url;a.download='export-scout-trend-inbox.csv';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
$('trendMessage').textContent='調査待ち候補をCSVで書き出しました。';
});
load();setupSeeds();render();
})();
