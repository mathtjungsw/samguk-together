import {initializeApp} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {onValueWritten} from 'firebase-functions/v2/database';
import {recordManifest,recordHash} from './record-versions.js';
import {claimReward} from './rewards.js';
import {rewardTransaction} from './reward-transaction.js';
import {applyEnhancement} from './enhancement.js';
import {campaignCommand,settlementAfterRejectedAction,isRetiredMissionCommand,MISSIONS_REMOVED_MESSAGE,configureCampaignRandom,campaignEnabled,FIRST_CAMPAIGN_SEASON} from './campaign.js';
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
 const key=process.env.AI_DICE_KEY;if(!key||key.length<32)throw Error('AI_DICE_KEY is missing');const rng=tag=>createHmac('sha256',key).update(tag).digest().readUInt32BE(0)/4294967296;configureCampaignRandom(rng);const game=await import('./game.js');game.configureCampaignRandom(rng);
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

export const enhanceArmy=onCall({...settings,invoker:'public'},async request=>{
 if(!request.auth||request.auth.token.firebase?.sign_in_provider!=='google.com')throw new HttpsError('unauthenticated','Google 로그인이 필요합니다.');const uid=request.auth.uid,req=request.data||{},worldId=req.worldId;
 if(!/^season-[1-9][0-9]*$/.test(worldId||'')||!/^[\w-]{8,100}$/.test(req.id||'')||typeof req.unitId!=='string'||req.unitId.length>256||typeof req.city!=='string'||req.city.length>100||!Array.isArray(req.materialIds)||req.materialIds.length>8||!req.materialIds.every(x=>typeof x==='string'&&x.length<=256)||(req.boosterId!==undefined&&(typeof req.boosterId!=='string'||req.boosterId.length>256))||!Number.isInteger(req.seq)||req.seq<0||req.seq>=1e9)throw new HttpsError('invalid-argument','강화 요청과 재료를 확인해 주세요.');
 const key=process.env.AI_DICE_KEY;if(!key)throw new HttpsError('internal','서버 강화 설정을 확인해 주세요.');const draw=createHmac('sha256',key).update('enhance:'+worldId+':'+uid+':'+req.seq).digest().readUInt32BE(0),worldRef=db.ref('worlds/'+worldId);let receipt,committed=false;
 try{const result=await rewardTransaction(worldRef,raw=>{if(!raw)return;const next=applyEnhancement(raw,uid,req,Math.max(Date.now(),raw.updatedAt),draw);receipt=next.result;return next.world;});if(!result.committed)throw Error('전황이 바뀌었습니다. 같은 요청으로 다시 확인해 주세요.');committed=true;const s=result.snapshot.val(),{historyFeed}=await import('./game.js');await db.ref('historyFeed/'+worldId).transaction(old=>old?.revision>s.revision?undefined:historyFeed(s));return receipt;}catch(error){console.warn('enhance-failed',error.message);throw new HttpsError('failed-precondition',error.message||'강화 결과를 확인하지 못했습니다.',{committed});}
});

export const rulerReward=onCall({...settings,invoker:'public'},async request=>{
 if(!request.auth||request.auth.token.firebase?.sign_in_provider!=='google.com')throw new HttpsError('unauthenticated','Google 로그인이 필요합니다.');
 const uid=request.auth.uid,{ticketId,city}=request.data||{};if(!/^[\w-]{8,100}$/.test(ticketId||'')||typeof city!=='string'||city.length>100)throw new HttpsError('invalid-argument','보상과 도시를 확인해 주세요.');
 const ticketRef=db.ref('rewardTickets/'+uid+'/'+ticketId),ticket=(await ticketRef.get()).val();if(!ticket||ticket.uid!==uid||!/^season-\d+$/.test(ticket.season))throw new HttpsError('permission-denied','지급된 보상이 없습니다.');
 const key=process.env.AI_DICE_KEY;if(!key)throw new HttpsError('internal','서버 보상 설정을 확인해 주세요.');const random=createHmac('sha256',key).update('reward:'+uid+':'+ticketId).digest().readUInt32BE(0),worldRef=db.ref('worlds/'+ticket.season);let output;
 try{const result=await rewardTransaction(worldRef,raw=>{if(!raw)return;output=claimReward(raw,uid,ticket,city,Math.max(Date.now(),raw.updatedAt),random);return output.world;});if(!result.committed)throw Error('전황이 바뀌었습니다. 다시 시도해 주세요.');const s=result.snapshot.val(),claim=JSON.parse(s.rewardClaims)[ticketId];await ticketRef.update({status:'claimed',claim});const {historyFeed}=await import('./game.js');await db.ref('historyFeed/'+ticket.season).transaction(old=>old?.revision>s.revision?undefined:historyFeed(s));return claim;}catch(error){console.warn('reward-claim-failed',error.message);throw new HttpsError('failed-precondition',error.message||'보상을 받지 못했습니다. 사용권은 보존됩니다.');}
});

export const campaignOpen=onCall({...settings,invoker:'public'},async request=>{
 if(!request.auth||request.auth.token.firebase?.sign_in_provider!=='google.com')throw new HttpsError('unauthenticated','Google 로그인이 필요합니다.');
 const id=request.data?.worldId;if(!/^season-[1-9][0-9]*$/.test(id||''))throw new HttpsError('invalid-argument','시즌 번호를 확인해 주세요.');const number=+id.slice(7);if(number<FIRST_CAMPAIGN_SEASON)throw new HttpsError('failed-precondition','이전 시즌은 기존 경로로 입장해 주세요.');
 const existing=await header(id);if(existing)return {id,number:existing.number};const previous=await header('season-'+(number-1)),opening=followingSeason({season:previous},Date.now());if(!opening||opening.number!==number)throw new HttpsError('failed-precondition','새 시즌 개막 시각을 기다려 주세요.');
 await db.ref('worlds/'+id).transaction(raw=>raw||createSeasonWorld(number,opening.startAt,'samguk-'+id));return {id,number};
});

export const campaignOrder=onCall({...settings,invoker:'public'},async request=>{
 if(!request.auth||request.auth.token.firebase?.sign_in_provider!=='google.com')throw new HttpsError('unauthenticated','Google 로그인이 필요합니다.');const uid=request.auth.uid,{worldId,...input}=request.data||{};
 if(isRetiredMissionCommand(input.type))throw new HttpsError('failed-precondition',MISSIONS_REMOVED_MESSAGE,{definiteRejection:true});
 if(!/^season-[1-9][0-9]*$/.test(worldId||'')||JSON.stringify(input).length>24000||!/^[\w-]{8,90}$/.test(input.id||''))throw new HttpsError('invalid-argument','명령을 확인해 주세요.');const key=process.env.AI_DICE_KEY;if(!key)throw new HttpsError('internal','서버 설정을 확인해 주세요.');const rng=tag=>createHmac('sha256',key).update(tag).digest().readUInt32BE(0)/4294967296;configureCampaignRandom(rng);
 const worldRef=db.ref('worlds/'+worldId);
 if(!Number.isInteger(input.seq)||input.seq<0)throw new HttpsError('invalid-argument','명령 순번을 확인해 주세요.');let output,rejected=null;const draw=Math.floor(rng('command:'+worldId+':'+uid+':'+input.id)*4294967296);
 try{const transaction=await rewardTransaction(worldRef,raw=>{rejected=null;if(!raw)return;if(!campaignEnabled(raw))throw Error('새 기능은 다음 시즌부터 적용됩니다.');const at=Math.max(Date.now(),raw.updatedAt);try{output=campaignCommand(raw,uid,input,at,{draw});return output.world;}catch(error){rejected=error.message;return settlementAfterRejectedAction(raw,uid,input.id,at);}});if(!transaction.committed)throw Error('명령을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.');
  const n=transaction.snapshot.val(),{historyFeed}=await import('./game.js');await db.ref('historyFeed/'+worldId).transaction(old=>old?.revision>n.revision?undefined:historyFeed(n));const events=Object.values(n.history||{}).filter(e=>e.id===input.id&&['update','season'].includes(e.type)||e.type==='bounty'&&e.text?.startsWith('📣'));if(events.length)await db.ref('chat/'+worldId).transaction(raw=>appendSystemMessages(raw,events,uid,n.updatedAt));if(n.season.endedAt)await db.ref('seasonIndex/'+worldId).set({id:worldId,title:n.season.result.title,endedAt:n.season.endedAt});if(rejected)throw Error(rejected);return {result:output?.result||null,event:n.history?.[input.id]||null};
 }catch(error){throw new HttpsError('failed-precondition',error.message||'명령을 처리하지 못했습니다.',{definiteRejection:!!rejected});}
});
