/* Display-only Firebase preflight; no SDK, login, network or cloud access. */
(()=>{
'use strict';
const get=id=>document.getElementById(id);
function inspect(){
 const status=get('firebasePreflightStatus'),list=get('firebasePreflightList');
 list.replaceChildren();
 const mapper=window.ExportScoutTeamMapper;
 if(!mapper||typeof mapper.inspect!=='function'){
   status.textContent='検査モジュールを読み込めませんでした。';return;
 }
 let raw;
 try{raw=localStorage.getItem('export-scout-sales-ledger-v1')}
 catch(e){status.textContent='端末内の販売履歴を読み取れません。ブラウザの保存設定を確認してね。';return}
 if(raw===null){
   status.textContent='Firebase未接続・ログイン未実装。移行対象の取引履歴はまだありません。';
   return;
 }
 let rows;
 try{rows=JSON.parse(raw)}
 catch(e){status.textContent='Firebase未接続。取引履歴のJSONが壊れているため、移行準備を停止しています。';return}
 const summary=mapper.inspect(rows);
 if(summary.count===0&&!summary.blocked){
  status.textContent='Firebase未接続。取引履歴は0件なので、移行対象はありません。';return;
 }
 const info=[
  'この端末の取引履歴：'+summary.count+'件',
  '形式検査に通った取引：'+summary.valid+'件',
  '形式に不備：'+summary.invalid+'件',
  '重複ID：'+summary.duplicates+'件'
 ];
 for(const line of info){
   const p=document.createElement('p');p.className='note';p.textContent=line;list.append(p);
 }
 status.textContent=summary.blocked
  ?'Firebase未接続。取引データに要確認項目があるため、移行を進められません。バックアップを保管してね。'
  :'Firebase未接続。販売履歴は形式上、移行計画に使えます。本人のFirebaseログイン・チーム登録・権限テスト後に取り込みます。';
}
get('firebasePreflightRefresh').addEventListener('click',inspect);
inspect();
})();
