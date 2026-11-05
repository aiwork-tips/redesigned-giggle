import {parseSnapshot,organize,evaluate,SOURCES,RELATIONS} from './model.mjs';

const $=id=>document.getElementById(id);
const yen=n=>Math.round(n).toLocaleString('ja-JP')+'円';
const output={ranking:$('rankingItems'),research:$('researchItems')};
let snapshot={generatedAt:null,items:[]};
const el=(name,value,cls)=>{
 const n=document.createElement(name);
 if(value!==undefined)n.textContent=String(value);
 if(cls)n.className=cls;
 return n;
};
function empty(target,title,description){
 const block=el('div',undefined,'empty');
 block.append(el('strong',title),el('p',description));
 target.append(block);
}
function sourceLink(source,label){
 const a=el('a',label+' ↗');
 a.href=source.url;
 a.target='_blank';
 a.rel='noopener noreferrer';
 return a;
}
function card(item,ranked){
 const calc=item.calculation;
 const box=el('article',undefined,'item');
 const top=el('div',undefined,'item-top');
 const label=el('div'),value=el('div',undefined,'price');
 label.append(el('h3',item.name),el('div',item.category+' ・ '+(RELATIONS[item.japanRelation]||'日本商品関連'),'category'));
 if(ranked){
   value.textContent=yen(calc.profit);
   value.append(el('span','試算利益（確定値ではありません）','price-label'));
 }else{
   const loss=calc.kind==='profit_estimate'&&calc.profit<0;
   value.textContent=loss?'試算赤字：'+yen(calc.profit):'要確認';
   value.append(el('span',loss?'仕入れは見送り・条件再確認':calc.reason,'price-label'));
 }
 top.append(label,value);
 const stats=el('div',undefined,'stats');
 function metric(name,content){
   const box=el('div');box.append(el('small',name),el('strong',content));stats.append(box);
 }
 metric('国内の出品価格',yen(item.domestic.priceJpy)+' / '+(SOURCES[item.domestic.source]||item.domestic.source));
 metric('海外の参考価格',item.overseas?item.overseas.price.toLocaleString('en-US')+' '+item.overseas.currency+' / '+SOURCES[item.overseas.source]:'未取得');
 metric('海外の根拠',item.overseas?
   (item.overseas.evidence==='sold_comparable'?'売却参考 '+item.overseas.soldCount+'件':'現在の出品価格'):'成約データなし');
 const links=el('div',undefined,'source-links');
 links.append(sourceLink(item.domestic,'国内の出品元'));
 if(item.overseas)links.append(sourceLink(item.overseas,'海外の出典元'));
 box.append(top,stats,links);
 if(ranked){
   box.append(el('p','試算用の円換算：'+yen(calc.salesJpy)+' ／ 手数料の仮定：'+yen(calc.feeJpy)+'。送料・その他費用も控除済み（仮定値）。','note'));
 }else{
   const note=calc.kind==='profit_estimate'&&calc.profit<0
     ? '注意：試算利益が赤字です。送料・手数料・海外相場を再確認してください。'
     : '注意：'+calc.reason+'。';
   box.append(el('p',note+' 国内の価格確認：'+new Date(item.domestic.observedAt).toLocaleString('ja-JP')+'。','note warning'));
 }
 return box;
}
function refreshStats(){
 const summary=organize(snapshot.items);
 const reviewed=summary.research.length;
 $('countAll').textContent=String(snapshot.items.length);
 $('countRanked').textContent=String(summary.ranked.length);
 $('countReview').textContent=String(reviewed);
 $('countTime').textContent=snapshot.generatedAt?
   new Date(snapshot.generatedAt).toLocaleString('ja-JP'):'未取得';
}
function render(){
 const selected={
   keyword:$('keyword').value,
   category:$('category').value,
   minProfit:Number($('minProfit').value),
 };
 const summary=organize(snapshot.items,selected);
 output.ranking.replaceChildren();
 output.research.replaceChildren();
 for(const item of summary.ranked)output.ranking.append(card(item,true));
 for(const item of summary.research)output.research.append(card(item,false));
 if(!summary.ranked.length)empty(output.ranking,
   '条件に合う利益候補はまだありません',
   snapshot.items.length?'条件を変更するか、国内価格・海外の成約参考データ・費用がそろうまで確認してください。':'APIで取得した商品がないため、架空の利益ランキングは表示しません。');
 if(!summary.research.length)empty(output.research,
   '追加調査する商品はありません',
   snapshot.items.length?'現在の条件では要確認商品がありません。':'商品APIの接続・取得テスト後に、出典付きの候補を表示します。');
}
function renderMarketResearch(context){
 const root=$('marketResearch');root.replaceChildren();
 if(!context||typeof context!=='object'){
   root.append(el('p','海外の参考データはまだありません。API接続待ちです。'));
   return;
 }
 const heading=el('strong','調査キーワード：'+String(context.keyword||'未指定').slice(0,100));
 root.append(heading);
 const data=context.soldgraph;
 if(data&&data.state==='complete'){
   const count=Number.isInteger(data.priced_count_on_page)?data.priced_count_on_page:0;
   const median=typeof data.median_excluding_best_offer_usd==='number'&&data.median_excluding_best_offer_usd>0
    ? data.median_excluding_best_offer_usd.toLocaleString('en-US')+' USD':'不明';
   root.append(el('p','海外の参考：eBay米国サイトの売却済み検索 1ページ / 価格を読み取れた表示 '+count+'件 / Best Offerの提示額を除外した中央値 '+median+'。'));
   root.append(el('p','これは検索キーワードに対する参考情報。国内の商品と同一型番・状態だとは確認していません。売却頻度・実際の受取額・確定利益とは区別します。','warning'));
 }else{
   root.append(el('p','海外の売却済み価格は未取得。国内出品情報だけでは予想利益を出しません。'));
 }
}
function fillCategories(){
 const current=$('category').value;
 $('category').replaceChildren();
 const all=el('option','すべて');all.value='all';$('category').append(all);
 for(const category of [...new Set(snapshot.items.map(x=>x.category))].sort((a,b)=>a.localeCompare(b,'ja'))){
   const opt=el('option',category);opt.value=category;$('category').append(opt);
 }
 $('category').value=[...$('category').options].some(x=>x.value===current)?current:'all';
}
function status(message,isError=false){
 $('feedStatusText').textContent=message;
 $('feedStatus').setAttribute('aria-invalid',isError?'true':'false');
}
async function load(){
 $('refresh').disabled=true;
 try{
   const response=await fetch('./data/latest.json',{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const payload=await response.json();
   const items=parseSnapshot(payload);
   snapshot={items,generatedAt:payload.generatedAt};
   renderMarketResearch(payload.research_context||null);
   fillCategories();
   refreshStats();
   render();
   if(!items.length)status('APIの実データ接続待ち：まだ取得商品はありません。旧アプリの保存データは変更していません。');
   else status(items.length+'件の商品データを読み込みました。表示価格と売却参考データの取得日時を確認してください。');
 }catch(e){
   snapshot={items:[],generatedAt:null};
   renderMarketResearch(null);fillCategories();refreshStats();render();
   status('取得データの読み込みに失敗しました。古い情報や不完全な商品を表示しないため、結果を非表示にしました。',true);
 }finally{$('refresh').disabled=false}
}
$('researchImport').addEventListener('change',async()=>{
 const file=$('researchImport').files?.[0];
 if(!file)return;
 if(file.size>900000){status('確認用JSONが大きすぎます（900KB以下を選んでください）。',true);return}
 try{
   const payload=JSON.parse(await file.text());
   if($('researchImport').files?.[0]!==file)return;
   const items=parseSnapshot(payload);
   snapshot={items,generatedAt:payload.generatedAt};
   renderMarketResearch(payload.research_context||null);
   fillCategories();refreshStats();render();
   status('この端末だけでAPI確認用JSON '+items.length+'件をプレビュー中。サイトへのアップロードや保存はしていません。');
 }catch(e){
   snapshot={items:[],generatedAt:null};
   renderMarketResearch(null);fillCategories();refreshStats();render();
   status('JSONの形式や商品データが不正なためプレビューを中止しました。',true);
 }
});
for(const name of ['keyword','category','minProfit'])$(''+name).addEventListener(name==='keyword'?'input':'change',render);
$('refresh').addEventListener('click',load);
load();
