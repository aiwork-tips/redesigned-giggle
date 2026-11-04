/* Local migration-backup regression tests: no cloud or filesystem access. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('assets/migration_backup.js','utf8');
function node(){
 return {children:[],textContent:'',className:'',events:{},download:'',href:'',
 addEventListener(kind,fn){this.events[kind]=fn},append(...xs){this.children.push(...xs)},
 replaceChildren(){this.children=[];this.textContent=''},click(){if(this.events.click)this.events.click()},
 remove(){this.removed=true}};
}
function run(seed){
 const data=new Map(Object.entries(seed)),dom=Object.create(null),get=id=>dom[id]||(dom[id]=node());
 const downloads=[],urlBlob=[];
 const FakeURL=class extends URL{
 static createObjectURL(blob){urlBlob.push(blob);return 'blob:offline'}
 static revokeObjectURL(){}
 };
 const document={getElementById:get,createElement:node,body:node()};
 document.body.append=function(...els){downloads.push(...els)};
 vm.runInNewContext(script,{
 document,URL:FakeURL,Date,JSON,
 localStorage:{getItem:k=>data.get(k)??null,setItem(){throw Error('backup may not modify original data')}},
 Blob:class{constructor(parts,info){this.parts=parts;this.info=info}}
 },{filename:'assets/migration_backup.js'});
 return {get,data,downloads,urlBlob};
}
const t=run({
 'export-scout-items-v1':'[{"name":"DS Lite","price":5000}]',
 'export-scout-trend-inbox-v1':'[{"term":"PSP-3000"}]',
 'export-scout-repeatability-v1':'[]',
 'export-scout-sales-ledger-v1':'[{"privateSale":"only-on-device"}]',
 'export-scout-defaults-v1':'{"ship":1800}',
 'export-scout-fx-usdjpy-v1':'{"rate":155}',
 'export-scout-reviewed-v1':'["ds"]',
 'unrelated-third-party':'{"secret":"must not export"}'
});
assert.match(t.get('migrationBackupStatus').textContent,/7種類/);
assert.equal(t.get('migrationBackupInventory').children.length,7);
t.get('migrationBackupDownload').click();
assert.equal(t.urlBlob.length,1);
const contents=JSON.parse(t.urlBlob[0].parts[0]);
assert.equal(contents.format,'export-scout-local-backup');
assert.equal(contents.schema_version,1);
assert.equal(contents.storage_format,'localStorage-raw-JSON-strings');
assert.equal(Object.keys(contents.stores).length,7);
assert.equal(contents.stores['export-scout-sales-ledger-v1'],'[{"privateSale":"only-on-device"}]');
assert.equal(contents.stores['export-scout-items-v1'],'[{"name":"DS Lite","price":5000}]');
assert.equal(Object.hasOwn(contents.stores,'unrelated-third-party'),false);
assert.deepEqual(contents.invalid_json_keys,[]);
assert.equal(t.downloads.length,1);
assert.match(t.downloads[0].download,/export-scout-local-backup-/);
const empty=run({});
empty.get('migrationBackupDownload').click();
assert.match(empty.get('migrationBackupMessage').textContent,/書き出す保存データがありません/);
assert.equal(empty.urlBlob.length,0);
const broken=run({'export-scout-sales-ledger-v1':'{incomplete json'});
broken.get('migrationBackupDownload').click();
const raw=JSON.parse(broken.urlBlob[0].parts[0]);
assert.equal(raw.stores['export-scout-sales-ledger-v1'],'{incomplete json');
assert.equal(raw.invalid_json_keys.length,1,'Corrupted raw storage must be preserved');
assert.match(broken.get('migrationBackupMessage').textContent,/不正なJSON/);
console.log('Full local backup offline tests PASS: 7 known storage namespaces, unchanged raw values, no cloud writes, no unrelated secrets, broken JSON preservation');
