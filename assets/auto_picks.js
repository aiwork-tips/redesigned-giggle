/* Source-backed picks + Google Trends RSS matches; no sales-price scraping. */
(()=>{
'use strict';
const get=id=>document.getElementById(id);
const reportStatus=get('trendAutoStatus'),reportList=get('trendAutoList'),reportMore=get('trendAutoMore'),reportMoreLabel=get('trendAutoMoreLabel');
const signalStatus=get('trendSignalStatus'),signalList=get('trendSignalList');
const trustedReports=new Set(['prtimes.jp','beenos.com','journal.zen.one']);
const regions={US:'米国',GB:'英国',CA:'カナダ',AU:'豪州',TW:'台湾',HK:'香港'};
const jst=value=>new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
function validLink(value,allowed){
try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&allowed.has(url.hostname)}
catch(e){return false}
}
function textElement(tag,value,className=''){
const element=document.createElement(tag);element.textContent=value;if(className)element.className=className;return element;
}
function actions(term,source,sourceUrl,mode){
const row=document.createElement('div');row.className='trend-auto-actions';
const btn=document.createElement('button');btn.type='button';btn.className='secondary';
btn.textContent='調査待ちに保存';btn.addEventListener('click',()=>{
if(typeof window.ExportScoutTrendAdd==='function')window.ExportScoutTrendAdd(term,source);
});
const go=document.createElement('button');go.type='button';go.className='secondary';go.textContent='価格調査へ';
go.addEventListener('click',()=>{
if(typeof window.ExportScoutTrendResearch==='function')window.ExportScoutTrendResearch(term);
});
const ebay=document.createElement('a');ebay.href='https://www.ebay.com/sch/i.html?LH_Sold=1&LH_Complete=1&_nkw='+encodeURIComponent(term);ebay.target='_blank';ebay.rel='noopener noreferrer';ebay.textContent='eBay販売済みを見る';
const mercari=document.createElement('a');mercari.href='https://jp.mercari.com/search?keyword='+encodeURIComponent(term);mercari.target='_blank';mercari.rel='noopener noreferrer';mercari.textContent='メルカリ仕入れ';
const sourceLink=document.createElement('a');sourceLink.href=sourceUrl;sourceLink.target='_blank';sourceLink.rel='noopener noreferrer';sourceLink.textContent=mode==='report'?'根拠レポート':'海外検索の元データ';
row.append(btn,go,ebay,mercari,sourceLink);return row;
}
function validateReport(data){
if(data?.schema_version!==1||data.document_type!=='editorial_product_research_candidates'||!Array.isArray(data.picks)||!data.picks.length||data.picks.length>100)throw Error('公開レポート一覧の形式が不正');
const known=new Set();
return data.picks.map(p=>{
if(!p||typeof p.id!=='string'||!/^[a-z0-9_]{3,50}$/.test(p.id)||known.has(p.id)||p.signal_type!=='reported_crossborder_demand'||p.confirmed_live_sales!==false||typeof p.name!=='string'||!p.name.trim()||typeof p.term!=='string'||!p.term.trim()||p.term.length>120||typeof p.source_title!=='string'||typeof p.evidence!=='string'||p.evidence.length>500||typeof p.source_date!=='string'||!Number.isFinite(Date.parse(p.source_date))||Date.parse(p.source_date)>Date.now()+86400000||!validLink(p.source_url,trustedReports))throw Error('出典・商品名に不備');
known.add(p.id);return p;
});
}
function makeReport(p){
const card=document.createElement('div');card.className='trend-auto-card';
const title=textElement('strong',p.name);
const badge=textElement('span','越境取引レポートに関連','trend-pick-type');
const source=textElement('p','参考市場：'+(p.market||'海外')+' ／ 調査対象期間：'+p.data_period+' ／ 報告：'+p.source_date,'note');
const evidence=textElement('p',p.evidence,'note');
card.append(badge,title,source,evidence,actions(p.term,p.source_title,p.source_url,'report'));
return card;
}
async function readFile(path){
const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
try{
const response=await fetch(path,{cache:'no-store',signal:ctl.signal});
if(!response.ok)throw Error('HTTP '+response.status);
return await response.json();
}finally{clearTimeout(timer)}
}
async function loadReports(){
try{
const data=await readFile('./data/trend_evidence.json'),picks=validateReport(data);
reportList.replaceChildren();reportMore.replaceChildren();
picks.slice(0,5).forEach(p=>reportList.append(makeReport(p)));
picks.slice(5).forEach(p=>reportMore.append(makeReport(p)));
reportMoreLabel.textContent='残り'+Math.max(0,picks.length-5)+'件の候補を表示';
reportStatus.textContent='出典付き調査候補 '+picks.length+'件 ／ 整理日：'+data.last_reviewed+'。これは過去の越境取引報告から選んだ候補で、今週の実売順位ではありません。';
}catch(e){
reportStatus.textContent='商品候補を読み込めませんでした（'+e.message+'）。元のレポートから確認できます。';
}
}
function validateSignals(data){
if(data?.schema_version!==1||!['not_checked','google_trends_rss'].includes(data.source)||data.signal_type!=='google_trends_related_keyword'||!Array.isArray(data.signals)||data.signals.length>60)throw Error('急上昇データの形式が不正');
if(data.source==='not_checked'){if(data.signals.length)throw Error('未実行データが混在');return null}
const updated=Date.parse(data.generated_at);
if(!Number.isFinite(updated)||updated>Date.now()+3600000||Date.now()-updated>3*86400000)throw Error('海外の自動確認が3日以上前。新しい情報を待っています');
if(!Array.isArray(data.checked_regions)||!data.checked_regions.length||data.checked_regions.some(x=>!regions[x]))throw Error('対象国情報が不正');
const seen=new Set();
return data.signals.map(s=>{
const at=Date.parse(s.observed_at);
if(!s||typeof s.id!=='string'||seen.has(s.id)||typeof s.term!=='string'||!s.term.trim()||typeof s.name!=='string'||!s.name.trim()||!regions[s.region]||typeof s.matched_query!=='string'||s.signal_type!=='google_trends_related_keyword'||!Number.isFinite(at)||at>Date.now()+3600000||Date.now()-at>7*86400000||!validLink(s.source_url,new Set(['trends.google.com'])))throw Error('個別の急上昇情報に不備');
seen.add(s.id);return s;
});
}
function makeSignal(s){
const card=document.createElement('div');card.className='trend-auto-card';
card.append(textElement('span','海外検索の急上昇（販売実績ではない）','trend-pick-type'),
textElement('strong',s.name),
textElement('p',regions[s.region]+' ／ 関連して検索急増したキーワード：「'+s.matched_query+'」','note'),
textElement('p','Googleトレンド観測日時：'+jst(s.observed_at)+'（日本時間）。この日本商品の購入件数・利益は未確認。','note'),
actions(s.term,'Googleトレンド '+s.region,s.source_url,'trends'));
return card;
}
async function loadSignals(){
try{
const data=await readFile('./data/trend_signals.json'),signals=validateSignals(data);
signalList.replaceChildren();
if(signals===null){
signalStatus.textContent='海外検索の自動チェック：未検証。日次更新の仕組みを追加済みですが、実際の取得成功はまだ確認できていません。';return;
}
const regionLabels=data.checked_regions.map(c=>regions[c]).join('・');
signalStatus.textContent='最終確認：'+jst(data.generated_at)+'（日本時間） ／ '+regionLabels+' ／ 関連キーワード検出：'+signals.length+'件';
if(!signals.length)signalList.append(textElement('p','今回の公開RSSでは、登録商品の関連急上昇キーワードは見つかりませんでした。無理に注目商品は作りません。','note'));
signals.slice(0,16).forEach(s=>signalList.append(makeSignal(s)));
}catch(e){signalStatus.textContent='海外検索の自動チェック結果を表示できません（'+e.message+'）。過去の資料を今週の話題として表示しません。'}
}
loadReports();loadSignals();
})();
