import {createHmac} from 'node:crypto';
import {executeAiTick} from '../src/ai-runtime.js';

// Never bundle this secret-dependent module into GitHub Pages.
export function serverDice(secret){
  if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Error('AI 서버 난수 키는32바이트 이상이어야 합니다.');
  return eventId=>createHmac('sha256',secret).update(eventId).digest().readUInt32BE(0);
}
export function createAiJob({adapter,secret,enabled=false,now=()=>Date.now(),onReport=()=>{}}){
  const seedFor=enabled?serverDice(secret):null;
  // No scheduled Cloud Function is exported or deployed by creating this factory.
  return async function aiJob(){
    if(!enabled)return {status:'disabled',reads:0};
    const result=await executeAiTick(adapter,{now:now(),seedFor});
    // Only bounded counters, never a state snapshot or secret in operational logs.
    await onReport({status:result.status,reads:result.reads,actions:result.actions?.length||0,mode:result.gate?.mode||''});
    return result;
  };
}
