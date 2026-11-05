/* Versioned legacy-sales -> Firestore transaction mapping. Pure function, no I/O.
 * Actual writes require Firebase Authentication and serverTimestamp(), not provided here.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ExportScoutTeamMapper=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const MAX_ROWS=1000;
  function isObj(v){return !!v&&typeof v==='object'&&!Array.isArray(v)}
  function int(v,max){return Number.isSafeInteger(v)&&v>=0&&v<=max}
  function date(v){
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
    const d=new Date(v+'T12:00:00Z');
    return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===v;
  }
  function url(v){
    if(v===''||v===undefined)return true;
    if(typeof v!=='string'||v.length>500)return false;
    try{const x=new URL(v);return x.protocol==='https:'&&!x.username&&!x.password&&!x.port&&x.hostname.includes('.')}
    catch(e){return false}
  }
  function validateRow(r){
    if(!isObj(r)||typeof r.id!=='string'||!/^item_[A-Za-z0-9_-]{1,75}$/.test(r.id)||
       typeof r.sku!=='string'||r.sku.trim().length<2||r.sku.length>180||
       !date(r.purchaseDate)||!int(r.purchaseCostJpy,10000000)||
       !['held','sold'].includes(r.status)||
       typeof (r.notes??'')!=='string'||(r.notes??'').length>300||
       !url(r.purchaseLink)||!url(r.saleLink))return false;
    return r.status==='held'
      ? r.saleDate===null&&r.payoutJpy===null&&r.shippingJpy===null&&r.otherJpy===null
      : date(r.saleDate)&&r.saleDate>=r.purchaseDate&&
        int(r.payoutJpy,100000000)&&int(r.shippingJpy,10000000)&&int(r.otherJpy,10000000);
  }
  function validUid(uid){return typeof uid==='string'&&/^[A-Za-z0-9_-]{6,128}$/.test(uid)}
  function prepare(rows,uid,existingIds=[]){
    if(!Array.isArray(rows)||rows.length>MAX_ROWS)throw Error('取引履歴は最大1000件まで');
    if(!validUid(uid))throw Error('FirebaseのユーザーIDが未確定');
    if(!Array.isArray(existingIds)||existingIds.some(x=>typeof x!=='string'))throw Error('既存の取引ID照合情報が不正');
    const used=new Set(),cloudIds=new Set(existingIds),items=[];
    for(const original of rows){
      if(!validateRow(original))throw Error('取引履歴に移行できないデータがあります');
      if(used.has(original.id))throw Error('元の取引IDが重複しています');
      used.add(original.id);
      const id=uid+'__'+original.id;
      if(cloudIds.has(id))throw Error('Firebase側に同じ元取引IDがあります。自動上書きできません');
      cloudIds.add(id);
      items.push({
        id,
        data:{
          schemaVersion:1,createdByUid:uid,legacyRecordId:original.id,
          sku:original.sku.trim(),
          purchaseDate:original.purchaseDate,
          purchaseCostJpy:original.purchaseCostJpy,
          status:original.status,
          saleDate:original.status==='held'?null:original.saleDate,
          payoutJpy:original.status==='held'?null:original.payoutJpy,
          shippingJpy:original.status==='held'?null:original.shippingJpy,
          otherJpy:original.status==='held'?null:original.otherJpy,
          notes:original.notes??'',purchaseLink:original.purchaseLink??'',
          saleLink:original.saleLink??'',revision:1
          // createdAt and updatedAt MUST be serverTimestamp() in authenticated writer.
        }
      });
    }
    return {schemaVersion:1,readyForReview:true,count:items.length,items,
      warning:'変換結果は書き込み前の検査用。Firebaseへは送信していません。'};
  }
  function inspect(rows){
    if(!Array.isArray(rows)||rows.length>MAX_ROWS)return {count:0,valid:0,invalid:0,duplicates:0,blocked:true};
    const ids=new Set();let valid=0,invalid=0,duplicates=0;
    for(const item of rows){
      if(!validateRow(item))invalid++;
      else if(ids.has(item.id))duplicates++;
      else{ids.add(item.id);valid++}
    }
    return {count:rows.length,valid,invalid,duplicates,blocked:invalid>0||duplicates>0};
  }
  return Object.freeze({validateRow,validUid,prepare,inspect});
});

