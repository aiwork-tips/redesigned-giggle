/* Overseas game press RSS signals: editorial mentions only, not actual sold products. */
(()=>{
'use strict';
const status=document.getElementById('newsSignalStatus'),root=document.getElementById('newsSignalList');
const allowed={'Nintendo Life':'www.nintendolife.com','Time Extension':'www.timeextension.com'};
function validSource(url,site){
try{
const link=new URL(url);
return link.protocol==='https:'&&!link.username&&!link.password&&!link.port&&link.hostname===allowed[site]&&link.pathname.startsWith('/news/');
}catch(e){return false}
}
function validate(data){
if(!data||data.schema_version!==1||data.signal_type!=='overseas_editorial_product_mention'||!['not_checked','publisher_rss','unavailable'].includes(data.source)||!Array.isArray(data.articles)||data.articles.length>24)throw Error('配信データの形式が不正');
if(data.source==='not_checked'){
if(data.articles.length)throw Error('未確認データの不一致');
return null;
}
if(data.source==='unavailable'){
if(data.articles.length||!Array.isArray(data.failed_sources)||!data.failed_sources.length||!data.failed_sources.every(x=>allowed[x]))throw Error('取得失敗データに不備');
return 'unavailable';
}
const published=Date.parse(data.generated_at);
if(!Number.isFinite(published)||published>Date.now()+3600000||Date.now()-published>3*86400000)throw Error('RSSの確認結果が3日以上前');
if(!Array.isArray(data.checked_sources)||!data.checked_sources.length||data.checked_sources.some(x=>!allowed[x]))throw Error('媒体名が不正');
const seen=new Set();
return data.articles.map(article=>{
if(!article||typeof article.id!=='string'||seen.has(article.publisher+'|'+article.id)||!allowed[article.publisher]||!data.checked_sources.includes(article.publisher)||article.signal_type!=='overseas_editorial_product_mention'||typeof article.term!=='string'||article.term.length<2||article.term.length>120||typeof article.product_name!=='string'||!article.product_name.trim()||typeof article.article_title!=='string'||!article.article_title.trim()||!validSource(article.article_url,article.publisher))throw Error('記事情報に不備');
const d=Date.parse(article.published_at);
if(!Number.isFinite(d)||d>Date.now()+3600000||Date.now()-d>7*86400000)throw Error('公開日時が不正');
seen.add(article.publisher+'|'+article.id);
return article;
});
}
function link(label,url){
const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function makeCard(item){
const card=document.createElement('div'),badge=document.createElement('span'),title=document.createElement('strong'),info=document.createElement('p'),article=document.createElement('p'),actions=document.createElement('div'),btn=document.createElement('button'),go=document.createElement('button');
card.className='trend-auto-card';badge.className='trend-pick-type';badge.textContent='海外専門メディアで言及（売上データではない）';title.textContent=item.product_name;info.className='note';info.textContent=item.publisher+' ／ 記事公開 '+new Date(item.published_at).toLocaleDateString('ja-JP');article.className='note';article.textContent='記事タイトル：'+item.article_title;actions.className='trend-auto-actions';
btn.type='button';btn.className='secondary';btn.textContent='調査待ちに保存';btn.addEventListener('click',()=>{if(typeof window.ExportScoutTrendAdd==='function')window.ExportScoutTrendAdd(item.term,item.publisher+'の記事')});
go.type='button';go.className='secondary';go.textContent='価格調査へ';go.addEventListener('click',()=>{if(typeof window.ExportScoutTrendResearch==='function')window.ExportScoutTrendResearch(item.term)});
actions.append(btn,go,link('eBay成約例','https://www.ebay.com/sch/i.html?LH_Sold=1&LH_Complete=1&_nkw='+encodeURIComponent(item.term)),link('元記事',item.article_url));
card.append(badge,title,info,article,actions);return card;
}
async function load(){
try{
const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),8000);let response;
try{response=await fetch('./data/overseas_news_signals.json',{cache:'no-store',signal:ctrl.signal})}finally{clearTimeout(timeout)}
if(!response.ok)throw Error('情報取得に失敗');
const data=await response.json(),articles=validate(data);root.replaceChildren();
if(articles===null){
status.textContent='海外専門記事の自動チェック：実行結果未確認。日次RSS取得の仕組みは追加済み。';return;
}
if(articles==='unavailable'){
status.textContent='海外専門メディアのRSS取得失敗：'+data.failed_sources.join('・')+'。商品が存在しないという意味ではありません。';return;
}
status.textContent='記事確認：'+new Date(data.generated_at).toLocaleDateString('ja-JP')+' ／ 新着の商品関連トピック：'+articles.length+'件（'+data.checked_sources.join('・')+'）。取引数・利益は未確認。';
if(!articles.length){const p=document.createElement('p');p.className='note';p.textContent='今回の新着RSSに日本の商品調査に使える関連キーワードは見つかりませんでした。';root.append(p)}
articles.slice(0,12).forEach(x=>root.append(makeCard(x)));
}catch(e){
status.textContent='海外専門記事の候補を表示できません（'+e.message+'）。架空の最新ニュースは表示しません。';
}
}
load();
})();
