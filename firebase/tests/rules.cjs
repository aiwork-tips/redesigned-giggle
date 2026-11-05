/* Firebase emulator only. No live Firebase project is accessed. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,serverTimestamp,Timestamp}=require('firebase/firestore');

const RULES=fs.readFileSync(path.join(__dirname,'../firestore.candidate.rules'),'utf8');
const TEAM='team-alpha',OTHER='team-other';
const memberDoc=(team,uid)=>'teams/'+team+'/members/'+uid;
const transactionPath=(team,uid,legacy)=>'teams/'+team+'/transactions/'+uid+'__'+legacy;

function validTransaction(uid,legacy,overrides={}){
 return {
   schemaVersion:1,createdByUid:uid,legacyRecordId:legacy,
   sku:'Nintendo DS Lite USG-001 white',
   purchaseDate:'2026-10-01',purchaseCostJpy:5000,
   status:'held',saleDate:null,payoutJpy:null,shippingJpy:null,otherJpy:null,
   notes:'confirmed used',purchaseLink:'',saleLink:'',
   revision:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
   ...overrides
 };
}
(async()=>{
 const t=await initializeTestEnvironment({
   projectId:'demo-export-scout',
   firestore:{rules:RULES}
 });
 try{
   await t.clearFirestore();
   await t.withSecurityRulesDisabled(async context=>{
     const db=context.firestore();
     await setDoc(doc(db,'teams',TEAM),{createdBy:'server-admin',name:'Export Team A'});
     await setDoc(doc(db,'teams',OTHER),{createdBy:'server-admin',name:'Separate Team'});
     for(const uid of ['member-A','member-B','member-C']){
       await setDoc(doc(db,memberDoc(TEAM,uid)),{active:true,role:uid==='member-A'?'owner':'member'});
     }
     await setDoc(doc(db,memberDoc(TEAM,'disabled-user')),{active:false,role:'member'});
     await setDoc(doc(db,memberDoc(OTHER,'other-user')),{active:true,role:'member'});
   });

   const anonymous=t.unauthenticatedContext().firestore();
   const alice=t.authenticatedContext('member-A').firestore();
   const bob=t.authenticatedContext('member-B').firestore();
   const carol=t.authenticatedContext('member-C').firestore();
   const outside=t.authenticatedContext('outside-user').firestore();
   const disabled=t.authenticatedContext('disabled-user').firestore();
   const other=t.authenticatedContext('other-user').firestore();
   const docName=transactionPath(TEAM,'member-A','item_abc123');

   await assertFails(getDoc(doc(anonymous,'teams',TEAM)));
   await assertFails(getDocs(collection(anonymous,'teams',TEAM,'transactions')));
   await assertFails(getDoc(doc(outside,'teams',TEAM)));
   await assertFails(getDoc(doc(disabled,'teams',TEAM)));
   await assertFails(getDoc(doc(other,'teams',TEAM)));
   await assertSucceeds(getDoc(doc(alice,'teams',TEAM)));
   await assertSucceeds(getDoc(doc(bob,'teams',TEAM)));
   await assertSucceeds(getDoc(doc(carol,'teams',TEAM)));

   // Team and membership provisioning must be admin-only.
   await assertFails(setDoc(doc(alice,'teams','unapproved-team'),{name:'Hijacked'}));
   await assertFails(setDoc(doc(alice,memberDoc(TEAM,'outside-user')),{active:true,role:'member'}));
   await assertFails(updateDoc(doc(alice,memberDoc(TEAM,'member-A')),{role:'owner'}));
   await assertFails(getDocs(collection(alice,'teams',TEAM,'members')));
   await assertFails(getDoc(doc(bob,memberDoc(TEAM,'member-A'))));
   await assertSucceeds(getDoc(doc(bob,memberDoc(TEAM,'member-B'))));

   // Owner can create own record only. All 3 members can read each other's records.
   await assertFails(setDoc(doc(anonymous,docName),validTransaction('member-A','item_abc123')));
   await assertFails(setDoc(doc(outside,docName),validTransaction('outside-user','item_abc123')));
   await assertFails(setDoc(doc(disabled,docName),validTransaction('disabled-user','item_abc123')));
   await assertFails(setDoc(doc(bob,docName),validTransaction('member-A','item_abc123')));
   await assertFails(setDoc(doc(bob,docName),validTransaction('member-B','item_abc123')));
   await assertSucceeds(setDoc(doc(alice,docName),validTransaction('member-A','item_abc123')));
   await assertSucceeds(getDoc(doc(bob,docName)));
   await assertSucceeds(getDoc(doc(carol,docName)));
   await assertSucceeds(getDocs(collection(alice,'teams',TEAM,'transactions')));

   // Cross-team isolation for member/transactions collection.
   await assertFails(getDoc(doc(other,docName)));
   await assertFails(getDocs(collection(other,'teams',TEAM,'transactions')));
   await assertFails(setDoc(doc(other,transactionPath(TEAM,'other-user','item_xyz123')),
     validTransaction('other-user','item_xyz123')));

   // Validate all required money fields, allowed keys, creator IDs, and version numbers.
   const bad=(legacy,overrides)=>setDoc(doc(alice,transactionPath(TEAM,'member-A',legacy)),
     validTransaction('member-A',legacy,overrides));
   await assertFails(bad('item_bad001',{purchaseCostJpy:-5}));
   await assertFails(bad('item_bad002',{status:'sold',saleDate:'2026-09-01',payoutJpy:9000,shippingJpy:1000,otherJpy:0}));
   await assertFails(bad('item_bad003',{revision:2}));
   await assertFails(bad('item_bad004',{extraAdmin:true}));
   await assertFails(bad('item_bad005',{createdByUid:'member-B'}));
   await assertFails(bad('item_bad006',{createdAt:Timestamp.now()}));
   await assertFails(bad('item_bad007',{purchaseDate:'2026-99-99'})); // format-only check cannot validate month bounds

   // Versioned update: creator only; preserve immutable ID/creator/date and increment revision.
   await assertFails(updateDoc(doc(bob,docName),{sku:'edited by other member',revision:2,updatedAt:serverTimestamp()}));
   await assertFails(updateDoc(doc(alice,docName),{sku:'edited without revision',updatedAt:serverTimestamp()}));
   await assertFails(updateDoc(doc(alice,docName),{createdByUid:'member-B',revision:2,updatedAt:serverTimestamp()}));
   await assertFails(updateDoc(doc(alice,docName),{revision:2,updatedAt:Timestamp.now()}));
   await assertSucceeds(updateDoc(doc(alice,docName),{
     sku:'Nintendo DS Lite USG-001 white tested',revision:2,updatedAt:serverTimestamp()
   }));
   await assertFails(updateDoc(doc(alice,docName),{revision:2,notes:'stale update',updatedAt:serverTimestamp()}));
   await assertFails(deleteDoc(doc(alice,docName)));
   await assertFails(setDoc(doc(alice,'teams',TEAM,'research','unsafe'),{value:'no client writes yet'}));
   await assertFails(getDoc(doc(alice,'teams',TEAM,'audit','nothing')));

   console.log('PASS: anonymous, outside team, inactive member, member provisioning, create, read, field validation, owner-only edits, revision CAS and no deletes');
 }finally{await t.cleanup();}
})().catch(e=>{console.error('Firestore emulator RULE TESTS FAILED',e);process.exitCode=1;});
