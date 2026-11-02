// RTDB may invoke a transaction with an empty local cache on a cold instance.
// Keep one bounded listener until commit; aborting on that first null otherwise
// cancels a valid claim before the SDK can load the actual world.
export async function rewardTransaction(ref,update,{timeoutMs=15000,allowMissing=false}={}){
 let listener,timer;
 try{
  await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('전황을 불러오지 못했습니다. 사용권은 보존됩니다.')),timeoutMs);listener=snap=>{if(snap.exists()||allowMissing)resolve();else reject(Error('보상 대상 전장이 없습니다. 사용권은 보존됩니다.'));};ref.on('value',listener,reject);});
  return await ref.transaction(update,undefined,false);
 }finally{clearTimeout(timer);if(listener)ref.off('value',listener);}
}
