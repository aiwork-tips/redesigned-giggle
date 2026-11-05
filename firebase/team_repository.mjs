/* Firebase future client integration; deliberately not imported by current GitHub Pages UI.
 * All methods require a real Firebase auth user and Firestore SDK instance.
 * Firestore Security Rules remain the authoritative authorization gate.
 */
const editable=new Set(['sku','purchaseDate','purchaseCostJpy','status',
  'saleDate','payoutJpy','shippingJpy','otherJpy','notes','purchaseLink','saleLink']);

export function makeTeamRepository({sdk,auth,db,teamId,mapper}){
 if(!sdk||!auth||!db||!mapper||typeof mapper.prepare!=='function'||
    typeof teamId!=='string'||!/^[A-Za-z0-9_-]{3,128}$/.test(teamId))
   throw Error('Firebase接続情報が未設定です');
 for(const name of ['doc','collection','getDocs','runTransaction','serverTimestamp'])
   if(typeof sdk[name]!=='function')throw Error('Firestore SDKの機能が足りません: '+name);
 const collectionPath=['teams',teamId,'transactions'];
 const signedIn=()=>{
   const uid=auth.currentUser?.uid;
   if(!mapper.validUid(uid))throw Error('Firebase認証が完了していません');
   return uid;
 };
 const docRef=id=>sdk.doc(db,...collectionPath,id);
 function docId(uid,legacyId){return uid+'__'+legacyId}
 async function list(){
   signedIn();
   const snapshot=await sdk.getDocs(sdk.collection(db,...collectionPath));
   return snapshot.docs.map(d=>({id:d.id,...d.data()}));
 }
 async function createFromLegacy(row){
   const uid=signedIn();
   const planned=mapper.prepare([row],uid);
   const item=planned.items[0],ref=docRef(item.id);
   await sdk.runTransaction(db,async tx=>{
     if((await tx.get(ref)).exists())throw Error('同じ元取引がすでに存在します。上書きしません');
     // Firebase rules require these server timestamps to match request.time.
     tx.set(ref,{...item.data,createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()});
   });
   return item.id;
 }
 async function updateOwnTransaction(legacyId,expectedRevision,patch){
   const uid=signedIn();
   if(typeof legacyId!=='string'||!/^item_[A-Za-z0-9_-]{1,75}$/.test(legacyId))
      throw Error('元の取引IDが不正');
   if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      throw Error('変更前の更新番号が必要');
   if(!patch||typeof patch!=='object'||Array.isArray(patch))
      throw Error('変更内容が不正');
   const keys=Object.keys(patch);
   if(!keys.length||keys.some(k=>!editable.has(k)))
      throw Error('更新できない項目が含まれています');
   const ref=docRef(docId(uid,legacyId));
   return sdk.runTransaction(db,async tx=>{
     const snap=await tx.get(ref);
     if(!snap.exists())throw Error('取引が見つかりません');
     const current=snap.data();
     if(current.createdByUid!==uid||current.legacyRecordId!==legacyId)
       throw Error('本人が作成した取引ではありません');
     if(current.revision!==expectedRevision)
       throw Error('他の操作で内容が変わりました。再読み込みして確認してください');
     const nextRevision=expectedRevision+1;
     tx.update(ref,{...patch,revision:nextRevision,updatedAt:sdk.serverTimestamp()});
     return nextRevision;
   });
 }
 // No delete, invite, member grant or blind upsert methods by design.
 return Object.freeze({list,createFromLegacy,updateOwnTransaction});
}
