/* No network; transaction conversion is deterministic and never writes. */
'use strict';
const assert=require('node:assert/strict');
const mapper=require('../assets/team_migration_mapper.js');
const sold={
 id:'item_abc123',sku:'DS Lite white',purchaseDate:'2026-10-01',purchaseCostJpy:5000,
 status:'sold',saleDate:'2026-10-05',payoutJpy:12000,shippingJpy:1800,otherJpy:200,
 notes:'confirmed',purchaseLink:'',saleLink:''
};
const held={
 id:'item_def456',sku:'PSP-3000 black',purchaseDate:'2026-10-05',purchaseCostJpy:3000,
 status:'held',saleDate:null,payoutJpy:null,shippingJpy:null,otherJpy:null,
 notes:'',purchaseLink:'',saleLink:''
};
assert.equal(mapper.validateRow(sold),true);
assert.equal(mapper.validateRow(held),true);
assert.equal(mapper.validUid('memberA_user_123'),true);
assert.equal(mapper.validUid(''),false);
const res=mapper.prepare([sold,held],'memberA_user_123');
assert.equal(res.count,2);
assert.equal(res.items[0].id,'memberA_user_123__item_abc123');
assert.equal(res.items[0].data.createdByUid,'memberA_user_123');
assert.equal(res.items[0].data.legacyRecordId,'item_abc123');
assert.equal(res.items[0].data.revision,1);
assert.equal(res.items[1].data.saleDate,null);
assert.equal(res.items[1].data.shippingJpy,null);
assert.equal(res.items[0].data.createdAt,undefined,'Client must add server timestamp at write time');
assert.equal(res.items[0].data.updatedAt,undefined);
assert.equal(sold.createdByUid,undefined,'Source record remains unchanged');
assert.throws(()=>mapper.prepare([sold],''),/ユーザーID/);
assert.throws(()=>mapper.prepare([sold,sold],'memberA_user_123'),/重複/);
assert.throws(()=>mapper.prepare([sold],'memberA_user_123',['memberA_user_123__item_abc123']),/自動上書きできません/);
assert.equal(mapper.inspect([sold,held]).blocked,false);
assert.equal(mapper.inspect([sold,{...held,id:sold.id}]).duplicates,1);
assert.equal(mapper.inspect([sold,{...held,purchaseCostJpy:-1}]).invalid,1);
assert.equal(mapper.validateRow({...sold,saleDate:'2026-01-01'}),false);
assert.equal(mapper.validateRow({...held,status:'sold'}),false);
assert.equal(mapper.validateRow({...sold,purchaseLink:'http://unsafe.test'}),false);
assert.equal(mapper.validateRow({...sold,notes:'x'.repeat(301)}),false);
assert.equal(mapper.prepare([],'memberA_user_123').count,0);
console.log('PASS: legacy mapping, stable composite IDs, collision and invalid-data rejection, no local mutation and no cloud writes');
