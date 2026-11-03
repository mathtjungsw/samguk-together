import {packBattleRecords,publishBattleRecords} from './battle-records.js';
export {packBattleRecords,publishBattleRecords,committedBattleEvent} from './battle-records.js';
export {committedEnhancementResult} from './enhancement-records.js';
// RTDB may invoke a transaction with an empty local cache on a cold instance.
// Keep one bounded listener until commit; aborting on that first null otherwise
// cancels a valid claim before the SDK can load the actual world.
export async function rewardTransaction(ref,update,{timeoutMs=15000,allowMissing=false,compactEnhancements=false}={}){
 let listener,timer;
 try{
  await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('전황을 불러오지 못했습니다. 사용권은 보존됩니다.')),timeoutMs);listener=snap=>{if(snap.exists()||allowMissing)resolve();else reject(Error('보상 대상 전장이 없습니다. 사용권은 보존됩니다.'));};ref.on('value',listener,reject);});
    let fullHistory;
    const result=await ref.transaction(raw=>{const previous={enhancementLedger:raw?.enhancementLedger,history:Object.fromEntries(Object.entries(raw?.history||{}).map(([id,e])=>[id,{id:e.id,type:e.type,detailVersion:e.detailVersion}]))};const next=update(raw);if(next){fullHistory=next.history;return packBattleRecords(compactEnhancements?{...next,enhancementStorageVersion:1}:next,previous);}return next;},undefined,false);
    if(result.committed)try{await publishBattleRecords(ref,result.snapshot.val());}catch{console.warn('battle-record-publication-pending');}
    return {...result,fullHistory};
 }finally{clearTimeout(timer);if(listener)ref.off('value',listener);}
}
