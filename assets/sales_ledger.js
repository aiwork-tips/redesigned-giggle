/* Export Scout sales ledger: manually recorded money, never inferred from listings. */
(()=>{
'use strict';
const KEY='export-scout-sales-ledger-v1';
const LIMIT=1000, $=id=>document.getElementById(id);
let records=[],editingId=null,loadWarnings=0;
const yen=n=>Math.round(n).toLocaleString('ja-JP')+'円';
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const safeText=(s,max=180)=>String(s??'').trim().slice(0,max);
const num=(s,name,min,max)=>{
  const v=String(s??'').trim();
  if(!/^\d+$/.test(v))throw Error(name+'は0以上の整数で入力してね');
  const n=Number(v);
  if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(name+'が範囲外');
  return n;
};
const validDate=s=>{
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const t=new Date(s+'T12:00:00Z');
  return Number.isFinite(t.getTime())&&t.toISOString().slice(0,10)===s&&s<='2100-12-31';
};
const safeLink=s=>{
  if(!s)return true;
  try{const u=new URL(s);return s.length<=500&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname.includes('.')}
  catch(e){return false}
};
function validateRow(row){
  if(!row||typeof row!=='object'||typeof row.id!=='string'||row.id.length<6||row.id.length>80||typeof row.sku!=='string'||row.sku.length<2||row.sku.length>180||!validDate(row.purchaseDate)||!Number.isSafeInteger(row.purchaseCostJpy)||row.purchaseCostJpy<0||row.purchaseCostJpy>10000000||!['held','sold'].includes(row.status)||typeof row.notes!=='string'||row.notes.length>300||!safeLink(row.purchaseLink)||!safeLink(row.saleLink))return false;
  if(row.status==='held')return row.saleDate===null&&row.payoutJpy===null&&row.shippingJpy===null&&row.otherJpy===null;
  return validDate(row.saleDate)&&row.saleDate>=row.purchaseDate&&Number.isSafeInteger(row.payoutJpy)&&row.payoutJpy>=0&&row.payoutJpy<=100000000&&Number.isSafeInteger(row.shippingJpy)&&row.shippingJpy>=0&&row.shippingJpy<=10000000&&Number.isSafeInteger(row.otherJpy)&&row.otherJpy>=0&&row.otherJpy<=10000000;
}
function readStore(){
  try{
    const all=JSON.parse(localStorage.getItem(KEY)||'[]');
    if(!Array.isArray(all)){loadWarnings++;return}
    const seen=new Set();
    for(const row of all.slice(0,LIMIT)){
      if(validateRow(row)&&!seen.has(row.id)){seen.add(row.id);records.push(row)}
      else loadWarnings++;
    }
    loadWarnings+=Math.max(0,all.length-LIMIT);
  }catch(e){loadWarnings++}
}
function setMsg(s){$('salesLedgerMessage').textContent=s}
function store(){
  try{localStorage.setItem(KEY,JSON.stringify(records));return true}
  catch(e){setMsg('端末への保存に失敗。変更は保存されていません。容量・ブラウザ設定を確認してね。');return false}
}
function clearForm(){
  editingId=null;
  for(const id of ['ledgerSku','ledgerPurchaseCost','ledgerPayout','ledgerShipping','ledgerOther','ledgerNotes','ledgerPurchaseLink','ledgerSaleLink'])$(id).value='';
  $('ledgerPurchaseDate').value=today();
  $('ledgerSaleDate').value='';
  $('ledgerState').value='held';
  displaySoldFields();
  $('ledgerSave').textContent='仕入れ・販売記録を保存';
  $('salesLedgerEditor').open=true;
}
function displaySoldFields(){
  const sold=$('ledgerState').value==='sold';
  $('ledgerSoldFields').hidden=!sold;
  if(!sold)for(const id of ['ledgerSaleDate','ledgerPayout','ledgerShipping','ledgerOther','ledgerSaleLink'])$(id).value='';
}
function prepareSku(sku){
  clearForm();
  $('ledgerSku').value=safeText(sku);
  $('salesLedgerEditor').scrollIntoView({behavior:'smooth',block:'start'});
  setMsg('型番を引き継いだよ。仕入れた1点につき1記録で入力してね。');
}
function readForm(){
  const id=editingId||'item_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
  const sku=safeText($('ledgerSku').value),date=$('ledgerPurchaseDate').value,status=$('ledgerState').value;
  const purchaseCostJpy=num($('ledgerPurchaseCost').value,'仕入れ総額',0,10000000);
  const row={
    id,sku,purchaseDate:date,purchaseCostJpy,status,
    saleDate:null,payoutJpy:null,shippingJpy:null,otherJpy:null,
    purchaseLink:safeText($('ledgerPurchaseLink').value,500),
    saleLink:'',notes:safeText($('ledgerNotes').value,300),
    savedAt:new Date().toISOString()
  };
  if(status==='sold'){
    row.saleDate=$('ledgerSaleDate').value;
    row.payoutJpy=num($('ledgerPayout').value,'実受取額',0,100000000);
    row.shippingJpy=num($('ledgerShipping').value,'追加で支払った海外送料',0,10000000);
    row.otherJpy=num($('ledgerOther').value,'その他追加費用',0,10000000);
    row.saleLink=safeText($('ledgerSaleLink').value,500);
  }
  if(!validateRow(row))throw Error('商品名・購入日・売却日・URLなどを確認してね。売却日は購入日以降にしてね。');
  const now=today();
  if(row.purchaseDate>now||row.status==='sold'&&row.saleDate>now)throw Error('未来の日付は実績として登録できません');
  return row;
}
function profit(row){return row.status==='sold'?row.payoutJpy-row.purchaseCostJpy-row.shippingJpy-row.otherJpy:null}
function bySku(){
  const out=new Map();
  for(const r of records){
    const key=r.sku.toLocaleLowerCase('ja-JP');
    if(!out.has(key))out.set(key,{name:r.sku,sold:0,held:0,purchaseCount:0,realized:0,costInStock:0,profits:[]});
    const s=out.get(key);s.purchaseCount++;
    if(r.status==='sold'){s.sold++;s.realized+=profit(r);s.profits.push(profit(r))}
    else{s.held++;s.costInStock+=r.purchaseCostJpy}
  }
  return [...out.values()].sort((a,b)=>b.realized-a.realized||b.sold-a.sold);
}
function addText(tag,value,className){
  const node=document.createElement(tag);
  node.textContent=value;if(className)node.className=className;return node;
}
function render(){
  const sold=records.filter(x=>x.status==='sold'),held=records.filter(x=>x.status==='held');
  const realized=sold.reduce((sum,x)=>sum+profit(x),0),inventory=held.reduce((sum,x)=>sum+x.purchaseCostJpy,0);
  const skus=bySku(),repeat=skus.filter(x=>x.sold>=2&&x.realized>0);
  $('salesLedgerSummary').replaceChildren();
  for(const [title,val] of [
    ['売却済み',sold.length+'件'],
    ['入金ベースの利益合計',yen(realized)],
    ['未売却在庫の仕入れ原価',yen(inventory)],
    ['2回以上売却・合計黒字',repeat.length+'種類']]){
    const box=document.createElement('div');box.className='sales-summary-cell';
    box.append(addText('small',title),addText('strong',val));
    $('salesLedgerSummary').append(box);
  }
  $('salesLedgerStatus').textContent='手入力の取引記録 '+records.length+'件。販売実績や金額は入力内容に基づく集計で、外部サービスとの照合はしていません。'+(loadWarnings?' 読み込めない記録が'+loadWarnings+'件あり、元データには触れていません。':'');
  $('salesLedgerBySku').replaceChildren();
  if(!skus.length)$('salesLedgerBySku').append(addText('p','取引記録はまだありません。定番候補の「実績を記録」から始められます。','note'));
  for(const entry of skus.slice(0,40)){
    const node=document.createElement('div');node.className='sales-group';
    const review=entry.sold>=2&&entry.realized>0?'複数回売却の黒字記録あり（自己入力）':entry.sold===1?'売却1回・継続性未確認':entry.sold>=2?'複数回売却・利益合計を再確認':'仕入れのみ・販売未記録';
    node.append(addText('strong',entry.name),addText('p','売却 '+entry.sold+'件 ／ 在庫 '+entry.held+'点 ／ 入金ベース利益 '+yen(entry.realized),'note'),
      addText('p',review+' ／ 在庫仕入れ原価 '+yen(entry.costInStock),'note'));
    const btn=document.createElement('button');btn.type='button';btn.className='secondary';btn.textContent='同じ商品の仕入れを追加';btn.addEventListener('click',()=>prepareSku(entry.name));node.append(btn);$('salesLedgerBySku').append(node);
  }
  const months=new Map();
  for(const r of sold){const m=r.saleDate.slice(0,7);months.set(m,(months.get(m)||0)+profit(r))}
  $('salesLedgerMonths').replaceChildren();
  for(const [month,total] of [...months].sort((a,b)=>b[0].localeCompare(a[0]))){
    $('salesLedgerMonths').append(addText('p',month+'：売却分の利益 '+yen(total),'note'));
  }
  if(!months.size)$('salesLedgerMonths').append(addText('p','売却済みの記録が入ると、販売月ごとの利益を表示します。','note'));
  $('salesLedgerRecords').replaceChildren();
  for(const row of [...records].sort((a,b)=>b.purchaseDate.localeCompare(a.purchaseDate)).slice(0,150)){
    const box=document.createElement('div');box.className='sales-record';
    box.append(addText('strong',row.sku));
    box.append(addText('p','仕入れ '+row.purchaseDate+' '+yen(row.purchaseCostJpy)+' ／ '+(row.status==='sold'?'売却 '+row.saleDate+'・利益 '+yen(profit(row)):'在庫・未売却'),'note'));
    if(row.notes)box.append(addText('p','メモ：'+row.notes,'note'));
    const actions=document.createElement('div');actions.className='trend-auto-actions';
    const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='編集';
    edit.addEventListener('click',()=>editRow(row.id));
    const del=document.createElement('button');del.type='button';del.className='secondary';del.textContent='削除';
    del.addEventListener('click',()=>removeRow(row.id));
    actions.append(edit,del);box.append(actions);$('salesLedgerRecords').append(box);
  }
}
function editRow(id){
  const row=records.find(x=>x.id===id);if(!row)return;
  clearForm();editingId=id;
  $('ledgerSku').value=row.sku;
  $('ledgerPurchaseDate').value=row.purchaseDate;
  $('ledgerPurchaseCost').value=row.purchaseCostJpy;
  $('ledgerState').value=row.status;
  displaySoldFields();
  if(row.status==='sold'){
    $('ledgerSaleDate').value=row.saleDate;
    $('ledgerPayout').value=row.payoutJpy;
    $('ledgerShipping').value=row.shippingJpy;
    $('ledgerOther').value=row.otherJpy;
    $('ledgerSaleLink').value=row.saleLink||'';
  }
  $('ledgerPurchaseLink').value=row.purchaseLink||'';
  $('ledgerNotes').value=row.notes||'';
  $('ledgerSave').textContent='この取引を更新';
  $('salesLedgerEditor').scrollIntoView({behavior:'smooth',block:'start'});
}
function removeRow(id){
  if(!confirm('この仕入れ・販売記録を削除しますか？'))return;
  const next=records.filter(x=>x.id!==id);if(next.length===records.length)return;
  const prior=records;records=next;
  if(!store()){records=prior;return}
  render();setMsg('取引記録を削除しました。');
}
$('ledgerState').addEventListener('change',displaySoldFields);
$('ledgerSave').addEventListener('click',()=>{
  try{
    const item=readForm(),index=records.findIndex(x=>x.id===item.id);
    if(index<0&&records.length>=LIMIT)throw Error('最大1000件です。CSV保存後に古い記録を整理してね。');
    const backup=records;
    records=records.slice();
    if(index>=0)records[index]=item;else records.unshift(item);
    if(!store()){records=backup;return}
    clearForm();$('salesLedgerEditor').open=false;
    render();setMsg(item.sku+'の'+(item.status==='sold'?'売却実績':'仕入れ記録')+'を保存しました。');
  }catch(e){setMsg('保存できません：'+e.message)}
});
$('ledgerNew').addEventListener('click',()=>{clearForm();setMsg('1点の仕入れ単位で記録してね。')});
$('ledgerExport').addEventListener('click',()=>{
  if(!records.length){setMsg('書き出す取引記録がありません。');return}
  const keys=['id','sku','purchaseDate','purchaseCostJpy','status','saleDate','payoutJpy','shippingJpy','otherJpy','purchaseLink','saleLink','notes','savedAt'];
  const escape=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv='\ufeff'+keys.join(',')+'\r\n'+records.map(r=>keys.map(k=>escape(r[k])).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='export-scout-actual-sales.csv';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
  setMsg('取引履歴をCSVに保存しました。この端末内の記録なので定期的に控えを取ってね。');
});
window.ExportScoutSalesOpen=prepareSku;
readStore();clearForm();$('salesLedgerEditor').open=false;render();
})();
