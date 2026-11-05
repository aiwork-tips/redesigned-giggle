/* Export Scout v6 - evidence-first, read-only model.
   No mock items, no API keys, no localStorage access. */
export const SOURCES=Object.freeze({
  yahoo_shopping:'Yahoo!ショッピング',
  rakuten:'楽天市場',
  etsy:'Etsy',
  ebay:'eBay',
  soldgraph:'Soldgraph',
  other:'その他（出典確認）'
});
export const RELATIONS=Object.freeze({
  made_in_japan:'日本製',
  japan_brand:'日本ブランド',
  japan_limited:'日本限定・国内流通',
  japanese_collectible:'日本由来のコレクター商品',
  sourced_in_japan:'日本国内で仕入れ可能'
});
const MAX_ITEMS=2000;
const validDate=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&/[TZ+-]\d/.test(x);
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const num=(x,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=max;
const positive=(x,max)=>num(x,max)&&x>0;
function url(x){
  if(typeof x!=='string'||x.length>1000)return false;
  try{const u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!!u.hostname.includes('.')}
  catch(e){return false}
}
function sourceListing(x,domestic){
 if(!obj(x)||!Object.hasOwn(SOURCES,x.source)||!url(x.url)||!validDate(x.observedAt))return false;
 if(domestic){
   return positive(x.priceJpy,100000000)&&x.currency==='JPY';
 }
 return positive(x.price,1000000)&&typeof x.currency==='string'&&/^[A-Z]{3}$/.test(x.currency)
   &&['active_listing','sold_comparable'].includes(x.evidence)
   &&(x.soldCount===null||(Number.isSafeInteger(x.soldCount)&&x.soldCount>=0&&x.soldCount<=10000000));
}
function validRow(x){
 return obj(x)&&typeof x.id==='string'&&/^[A-Za-z0-9._:-]{5,120}$/.test(x.id)
   &&typeof x.name==='string'&&x.name.trim().length>=2&&x.name.length<=200
   &&typeof x.category==='string'&&x.category.trim().length>0&&x.category.length<=80
   &&Object.hasOwn(RELATIONS,x.japanRelation)
   &&sourceListing(x.domestic,true)
   &&(x.overseas===null||sourceListing(x.overseas,false))
   &&(x.assumptions===null||(
     obj(x.assumptions)
     &&positive(x.assumptions.fxJpyPerUnit,100000)
     &&num(x.assumptions.shippingJpy,10000000)
     &&num(x.assumptions.otherJpy,10000000)
     &&num(x.assumptions.feePercent,100)
   ));
}
export function parseSnapshot(payload){
 if(!obj(payload)||payload.schemaVersion!==1||payload.kind!=='export-scout-discovery-v6'
   ||!(payload.generatedAt===null||validDate(payload.generatedAt))
   ||!Array.isArray(payload.items)||payload.items.length>MAX_ITEMS)throw Error('データ形式に問題があるため、商品一覧は表示しません');
 const ids=new Set();
 for(const item of payload.items){
   if(!validRow(item)||ids.has(item.id))throw Error('取得データに重複または不正な商品があるため表示を停止しました');
   ids.add(item.id);
 }
 if(payload.items.length&&payload.generatedAt===null)throw Error('取得日時が不明なため表示を停止しました');
 return payload.items;
}
export function evaluate(row,now=Date.now()){
 const freshnessHours=(now-Date.parse(row.domestic.observedAt))/3600000;
 const fresh=freshnessHours>=0&&freshnessHours<=24;
 const overseas=row.overseas;
 if(!overseas)return {kind:'domestic_only',fresh,profit:null,margin:null,reason:'海外相場未取得'};
 if(overseas.evidence!=='sold_comparable'||!(overseas.soldCount>0))
   return {kind:'listing_only',fresh,profit:null,margin:null,reason:'海外の出品価格のみ。成約データなし'};
 const a=row.assumptions;
 if(!a||a.fxJpyPerUnit<=0)return {kind:'needs_costs',fresh,profit:null,margin:null,reason:'送料・手数料・為替の仮定が不足'};
 const salesJpy=Math.round(overseas.price*a.fxJpyPerUnit);
 const feeJpy=Math.round(salesJpy*a.feePercent/100);
 const profit=salesJpy-row.domestic.priceJpy-a.shippingJpy-a.otherJpy-feeJpy;
 return {kind:fresh?'profit_estimate':'stale_price',fresh,profit,margin:salesJpy>0?profit/salesJpy:null,
   salesJpy,feeJpy,reason:fresh?'成約参考値による試算。実現利益ではありません':'国内価格が24時間を超えているため再確認'};
}
export function organize(items,{keyword='',category='all',minProfit=0,now=Date.now()}={}){
 const word=String(keyword).trim().toLocaleLowerCase('ja-JP');
 const matches=items.filter(item=>
   (!word||(item.name+' '+item.category).toLocaleLowerCase('ja-JP').includes(word))&&
   (category==='all'||item.category===category)
 ).map(item=>({...item,calculation:evaluate(item,now)}));
 const ranked=matches.filter(item=>item.calculation.kind==='profit_estimate'&&item.calculation.profit>=minProfit)
   .sort((a,b)=>b.calculation.profit-a.calculation.profit||a.name.localeCompare(b.name));
 const research=matches.filter(item=>item.calculation.kind!=='profit_estimate'||item.calculation.profit<0)
   .sort((a,b)=>Date.parse(b.domestic.observedAt)-Date.parse(a.domestic.observedAt));
 return {ranked,research,total:matches.length,matched:ranked.length,needsReview:research.length};
}
