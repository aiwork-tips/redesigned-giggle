/* Repeatable sourcing research leads. Category/brand evidence, never proven item profits. */
(()=>{
'use strict';
const get=id=>document.getElementById(id);
const status=get('evergreenStatus'),list=get('evergreenList'),more=get('evergreenMore'),moreLabel=get('evergreenMoreLabel');
const allowedHosts=new Set(['ebay.co.jp','www.ebay.co.jp','journal.zen.one']);
const conditions=new Set(['小型','中型','大型']);
const categories=new Set(['腕時計','トレカ','フィギュア','携帯ゲーム','ゲームソフト','ホビー','ミニカー']);
function validReportLink(value){
try{
const url=new URL(value);
return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&allowedHosts.has(url.hostname)&&url.pathname.length>2;
}catch(e){return false}
}
function validateCatalog(data){
if(!data||data.schema_version!==1||data.data_type!=='repeatable_sourcing_research_leads'||!Array.isArray(data.items)||data.items.length<1||data.items.length>50||!Number.isFinite(Date.parse(data.last_reviewed))||Date.parse(data.last_reviewed)>Date.now()+86400000)throw Error('定番候補データが不正');
const seen=new Set();
for(const x of data.items){
if(!x||typeof x.id!=='string'||!/^[a-z0-9_]{3,60}$/.test(x.id)||seen.has(x.id)||typeof x.name!=='string'||!x.name.trim()||x.name.length>100||typeof x.query!=='string'||!x.query.trim()||x.query.length>120||!categories.has(x.category)||!conditions.has(x.shipping_size)||typeof x.selection_reason!=='string'||!x.selection_reason.trim()||typeof x.check_before_sourcing!=='string'||!x.check_before_sourcing.trim()||typeof x.domestic_source_ideas!=='string'||!x.domestic_source_ideas.trim()||!validReportLink(x.source_url)||(x.additional_source_url!==null&&!validReportLink(x.additional_source_url))||typeof x.source_period!=='string'||!x.source_period.trim()||x.profit_verified!==false||x.model_sales_verified!==false||!['優先調査','その他の定番調査'].includes(x.priority)||x.demand_basis!=='category_or_brand_report')throw Error('出典や商品調査条件に不備');
seen.add(x.id);
}
return data.items;
}
function actionLink(label,url){
const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function makeCard(x){
const card=document.createElement('div');card.className='trend-auto-card';
const tag=document.createElement('span');tag.className='trend-pick-type';tag.textContent='定番調査候補・利益未確認';
const title=document.createElement('strong');title.textContent=x.name;
const meta=document.createElement('p');meta.className='note';meta.textContent=x.category+' ／ '+x.shipping_size+' ／ 調査の根拠：'+x.source_period+'のカテゴリー・ブランド実績';
const why=document.createElement('p');why.className='note';why.textContent='調査する理由：'+x.selection_reason;
const caution=document.createElement('p');caution.className='note';caution.textContent='確認事項：'+x.check_before_sourcing;
const sourcing=document.createElement('p');sourcing.className='note';sourcing.textContent='国内仕入れ先の候補：'+x.domestic_source_ideas+'（在庫は未確認）';
const actions=document.createElement('div');actions.className='trend-auto-actions';
const save=document.createElement('button');save.type='button';save.className='secondary';save.textContent='調査待ちに保存';
save.addEventListener('click',()=>{if(typeof window.ExportScoutTrendAdd==='function')window.ExportScoutTrendAdd(x.query,'定番調査：'+x.category)});
const research=document.createElement('button');research.type='button';research.className='secondary';research.textContent='価格調査へ';
research.addEventListener('click',()=>{if(typeof window.ExportScoutTrendResearch==='function')window.ExportScoutTrendResearch(x.query)});
actions.append(save,research,
actionLink('eBay成約例','https://www.ebay.com/sch/i.html?LH_Sold=1&LH_Complete=1&_nkw='+encodeURIComponent(x.query)),
actionLink('メルカリ','https://jp.mercari.com/search?keyword='+encodeURIComponent(x.query)),
actionLink('ヤフオク','https://auctions.yahoo.co.jp/search/search?p='+encodeURIComponent(x.query)),
actionLink('根拠レポート',x.source_url));
const verify=document.createElement('button');verify.type='button';verify.className='secondary';verify.textContent='この商品を検証';
verify.addEventListener('click',()=>{if(typeof window.ExportScoutRepeatabilityOpen==='function')window.ExportScoutRepeatabilityOpen(x.name,x.query)});
actions.append(verify);
const actual=document.createElement('button');actual.type='button';actual.className='secondary';actual.textContent='実際の仕入れ・売却を記録';
actual.addEventListener('click',()=>{if(typeof window.ExportScoutSalesOpen==='function')window.ExportScoutSalesOpen(x.name)});
actions.append(actual);
card.append(tag,title,meta,why,caution,sourcing,actions);
return card;
}
async function load(){
try{
const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);let response;
try{response=await fetch('./data/evergreen_candidates.json',{cache:'no-store',signal:controller.signal})}finally{clearTimeout(timeout)}
if(!response.ok)throw Error('データを取得できませんでした');
const data=await response.json(),items=validateCatalog(data);
list.replaceChildren();more.replaceChildren();
items.slice(0,5).forEach(x=>list.append(makeCard(x)));
items.slice(5).forEach(x=>more.append(makeCard(x)));
moreLabel.textContent='残り'+Math.max(0,items.length-5)+'件の定番候補を見る';
status.textContent='継続調査候補：'+items.length+'件 ／ 情報整理：'+data.last_reviewed+'。個別の販売数・国内仕入れ相場・利益は未検証です。';
}catch(e){status.textContent='定番候補の読み込みに失敗しました（'+e.message+'）。未確認の利益商品は表示しません。'}
}
load();
})();
