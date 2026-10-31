import {initializeApp} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {onValueWritten} from 'firebase-functions/v2/database';
import {recordManifest,recordHash} from './record-versions.js';
import {createHmac} from 'node:crypto';
import {loadAiContext,advanceLiveAi,aiStartCount,previousRulerNames,encodeLiveAi,castAiBallot,aiElectors,createSeasonWorld,followingSeason,systemEvents,appendSystemMessages} from './game.js';
initializeApp();const db=getDatabase();
const settings={region:'asia-southeast1',memory:'256MiB',cpu:'gcf_gen1',concurrency:1,minInstances:0,maxInstances:1,timeoutSeconds:120};
async function header(id){return (await db.ref('worlds/'+id+'/season').orderByKey().endBefore('result').get()).val();}
async function current(){
 const index=(await db.ref('seasonIndex').get()).val()||{},ids=Object.keys(index).filter(x=>/^season-\d+$/.test(x)).sort((a,b)=>+b.slice(7)-+a.slice(7));
 let id=ids[0]||'season-1',season=await header(id);
 if(season?.endedAt){const next='season-'+(season.number+1);let found=await header(next);const opening=followingSeason({season},Date.now());if(!found&&opening){await db.ref('worlds/'+next).transaction(old=>old||createSeasonWorld(opening.number,opening.startAt,'samguk-'+next));found=await header(next);}if(found){id=next;season=found;}}
 return {id,season,index};
}
async function tick(){
 if((await db.ref('aiOperations/enabled').get()).val()!==true)return {status:'disabled'};
 const {id,season,index}=await current();if(!season||season.endedAt)return {status:'waiting'};
 const firstRef=db.ref('aiOperations/firstSeason');await firstRef.transaction(old=>old??season.number);const firstSeason=(await firstRef.get()).val();
 const key=process.env.AI_DICE_KEY;if(!key||key.length<32)throw Error('AI_DICE_KEY is missing');
 const ref=db.ref('worlds/'+id);let initial,callback;
 // Keep this bounded world snapshot in the SDK cache during the CAS; never read the DB root or one copy per AI.
 await new Promise((resolve,reject)=>{callback=s=>{if(initial===undefined){initial=s.val();resolve();}};ref.on('value',callback,reject);});
 try{
  if(!initial)return {status:'missing'};
  let historicalReads=0;const {names,count}=await loadAiContext(path=>{historicalReads++;return db.ref(path).get().then(s=>s.val());},initial);
  const at=Math.max(Date.now(),initial.updatedAt),next=advanceLiveAi(initial,{at,firstSeason,names,count,seedFor:event=>createHmac('sha256',key).update(event).digest().readUInt32BE(0)});
  if(next.revision===initial.revision)return {status:'not-due'};
  // A single conditional commit exposes no intermediate AI decisions. On conflict defer, do not replay old attacks.
  next.revision=initial.revision+1;next.updatedAt=at;next.command={...next.command,id:'ai-server-'+id+'-'+Math.floor(at/600000),actor:'ai-system',type:'aiBatch',baseRevision:initial.revision,at};
  const result=await ref.transaction(old=>old?.revision===initial.revision?encodeLiveAi(next):undefined,undefined,false);
  if(!result.committed)return {status:'conflict'};
  // Legacy clients use canonical history if this projection temporarily lags.
  const {historyFeed}=await import('./game.js');const manifest=recordManifest(next);await db.ref('recordVersions/'+id).transaction(old=>!old||old.revision<=manifest.revision?manifest:undefined);await db.ref('historyFeed/'+id).transaction(old=>old?.revision>next.revision?undefined:historyFeed(next));const events=systemEvents(initial,next);if(events.length)await db.ref('chat/'+id).transaction(raw=>appendSystemMessages(raw,events,'ai-system',at));
  if(next.season.endedAt)await db.ref('seasonIndex/'+id).set({id,title:next.season.result.title,endedAt:next.season.endedAt});
  return {status:'updated',season:id,revision:next.revision,historicalReads};
 }finally{ref.off('value',callback);}
}
async function loggedTick(){const result=await tick();console.log('ai-ruler',JSON.stringify(result));return result;}
export const aiRulerTick=onSchedule({...settings,schedule:'every 10 minutes',timeZone:'Asia/Seoul',retryCount:0},loggedTick);
export const aiRulerActivation=onValueWritten({...settings,ref:'/aiOperations/enabled',instance:'samguk-together-default-rtdb'},async event=>{if(event.data.after.val()===true)return loggedTick();});
export const aiRulerAdmin=onCall(settings,async request=>{if(!request.auth||request.auth.token.email!==process.env.AI_ADMIN_EMAIL)throw new HttpsError('permission-denied','운영자만 실행할 수 있습니다.');return tick();});
export const aiRulerChoice=onCall({...settings,invoker:'public'},async request=>{
 if(!request.auth||request.auth.token.firebase?.sign_in_provider!=='google.com')throw new HttpsError('unauthenticated','Google 로그인이 필요합니다.');
 const id=request.data?.worldId;if(!/^season-[1-9][0-9]*$/.test(id||''))throw new HttpsError('invalid-argument','시즌 번호를 확인해 주세요.');
 const season=(await db.ref('worlds/'+id+'/season').get()).val(),players=(await db.ref('worlds/'+id+'/players').get()).val()||{},world={season,players,territories:{}},uid=request.auth.uid,at=Date.now(),ref=db.ref('aiOperations/ballots/'+id);
 if(request.data.count!==undefined){try{await ref.transaction(old=>castAiBallot(world,old||{},uid,request.data.count,at));}catch{throw new HttpsError('permission-denied','선택 권한이나 개막 시각을 확인해 주세요.');}}
 const ballots=(await ref.get()).val()||{},open=!!season?.endedAt&&at<season.nextStartAt;return {open,eligible:open&&aiElectors(world).includes(uid),selected:ballots[uid]||null,nextCount:aiStartCount(world,ballots),nextStartAt:season?.nextStartAt||0};
});

export const archiveRecordVersion=onValueWritten({...settings,ref:'/worlds/{worldId}/season/result',instance:'samguk-together-default-rtdb'},async event=>{const result=event.data.after.val();if(result)await db.ref('recordVersions/'+event.params.worldId+'/archive').set(recordHash(result));});
