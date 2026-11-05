/* Mock repository only; authorization is tested separately with Firestore emulator. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {makeTeamRepository} from '../firebase/team_repository.mjs';
const require=createRequire(import.meta.url);
const mapper=require('../assets/team_migration_mapper.js');
const map=new Map();
const events=[];
const sdk={
  doc(_db,...parts){return parts.join('/')},
  collection(_db,...parts){return parts.join('/')},
  getDocs:async coll=>({docs:[...map].filter(([path])=>path.startsWith(coll+'/'))
    .map(([path,data])=>({id:path.split('/').at(-1),data:()=>structuredClone(data)}))}),
  serverTimestamp:()=>({mockServerTimestamp:true}),
  runTransaction:async(_db,handler)=>{
    const pending=[];
    const tx={
      get:async ref=>({exists:()=>map.has(ref),data:()=>structuredClone(map.get(ref))}),
      set(ref,data){pending.push({action:'set',ref,data})},
      update(ref,data){pending.push({action:'update',ref,data})}
    };
    const result=await handler(tx);
    for(const item of pending){
      if(item.action==='set'){map.set(item.ref,item.data);events.push('set')}
      else {map.set(item.ref,{...map.get(item.ref),...item.data});events.push('update')}
    }
    return result;
  }
};
const auth={currentUser:null};
const repo=makeTeamRepository({sdk,db:{},auth,teamId:'team-alpha',mapper});
const sample={
 id:'item_a12345',sku:'Nintendo DS Lite white',purchaseDate:'2026-10-01',
 purchaseCostJpy:5000,status:'held',saleDate:null,payoutJpy:null,shippingJpy:null,
 otherJpy:null,notes:'',purchaseLink:'',saleLink:''
};
await assert.rejects(repo.list(),/認証/);
await assert.rejects(repo.createFromLegacy(sample),/認証/);
assert.equal(map.size,0);
auth.currentUser={uid:'member-A-12345'};
const id=await repo.createFromLegacy(sample);
assert.equal(id,'member-A-12345__item_a12345');
assert.equal(map.size,1);
assert.equal((await repo.list()).length,1);
const current=map.get('teams/team-alpha/transactions/'+id);
assert.equal(current.createdByUid,'member-A-12345');
assert.equal(current.revision,1);
assert.deepEqual(current.createdAt,{mockServerTimestamp:true});
await assert.rejects(repo.createFromLegacy(sample),/上書きしません/);
assert.equal(map.size,1);
await assert.rejects(repo.updateOwnTransaction(sample.id,1,{createdByUid:'attacker'}),/更新できない/);
await assert.rejects(repo.updateOwnTransaction(sample.id,0,{sku:'not possible'}),/更新番号/);
assert.equal(await repo.updateOwnTransaction(sample.id,1,{sku:'Nintendo DS Lite white checked'}),2);
assert.equal((await repo.list())[0].sku,'Nintendo DS Lite white checked');
assert.equal(map.get('teams/team-alpha/transactions/'+id).revision,2);
await assert.rejects(repo.updateOwnTransaction(sample.id,1,{sku:'stale'}),/再読み込み/);
assert.equal(map.get('teams/team-alpha/transactions/'+id).sku,'Nintendo DS Lite white checked');
auth.currentUser={uid:'member-B-12345'};
await assert.rejects(repo.updateOwnTransaction(sample.id,2,{sku:'edit other owner'}),/見つかりません/);
auth.currentUser=null;
await assert.rejects(repo.updateOwnTransaction(sample.id,2,{sku:'anonymous'}),/認証/);
assert.deepEqual(events,['set','update']);
console.log('PASS: authenticated repository, non-overwriting create, exact owner ID, CAS edit, no delete/invite, no actual cloud I/O');
