import {sparkReward} from './spark-reward.js';
// Friends-only client execution. DB rules authenticate actors and serialize commits;
// they do not prove every dice calculation against a malicious modified client.
import {campaignCommand,settlementAfterRejectedAction} from '../server/campaign-command.js';
import {normalizeWorld,systemEvents,appendSystemMessages} from './engine-next.js';
import {applyLocalEnhancementBatch} from './enhancement-batch.js';
import {applyEnhancement} from './enhancement-actions.js';
import {packSparkRecords,sparkHash} from './spark-records.js';
import {historyFeed} from './world-data.js';
import {sparkPath,createSparkWorld} from './spark-policy.js';
import {followingSeason} from './seasons.js';
import {changedPaths,entropy} from './store.js';
const error=(message,definite=true)=>Object.assign(Error(message),{details:{committed:!definite,definiteRejection:definite}});
export async function sparkCall(store,name,data){
 if(name==='campaignOpen')return openSparkSeason(store,data.worldId);
 if(!['campaignOrder','enhanceArmy','rulerReward'].includes(name))throw error('무료 전장에서는 사용하지 않는 기능입니다.');
 if(data.worldId!==store.config.worldId)throw error('시즌이 바뀌었습니다. 다시 접속해 주세요.');
 const uid=store.uid,worldId=data.worldId,draw=data.draw??entropy();
 for(let attempt=0;attempt<5;attempt++){
  const before=normalizeWorld(store.world||await store.readWorldAt(worldId));
  if(before.executionMode!=='spark')throw error('무료 전장 전환을 기다려 주세요.');
  if(before.maintenance)throw error('전장 전환 중입니다. 잠시 뒤 새로고침해 주세요.');
  let out,rejected=null;
  const at=Math.max(store.now(),before.updatedAt);
  try{
   if(name==='campaignOrder')out=campaignCommand(before,uid,data,at,{draw});
   else if(name==='enhanceArmy')out=data.mode==='local-batch'?applyLocalEnhancementBatch(before,uid,data.items,at):applyEnhancement(before,uid,data,at,draw);
   else out=sparkReward(before,uid,data.ticketId,data.city,at,draw);
  }catch(e){
   // Commit due recruitment/escapes even when the requested captive action expired.
   if(name!=='campaignOrder')throw error(e.message);
   rejected=e;out={world:settlementAfterRejectedAction(before,uid,data.id,at)};
   if(JSON.stringify(out.world)===JSON.stringify(before))throw error(e.message);
  }
  if(out.world.revision===before.revision){if(rejected)throw error(rejected.message);if(name==='enhanceArmy'&&data.mode!=='local-batch'&&out.result?.detailVersion){const event=(await store.sdk.get(store.sdk.ref(store.db,sparkPath(store.config,'enhancementRecords',worldId)+'/'+data.id+'/'+out.result.detailVersion))).val();if(!event?.enhancement)throw error('이전 강화 결과를 다시 확인 중입니다.',false);return {booster:null,...event.enhancement};}return name==='rulerReward'||name==='enhanceArmy'&&data.mode!=='local-batch'?out.result:response(out,before,data);}
  const next=out.world;next.revision=before.revision+1;next.updatedAt=at;
  next.command={...next.command,actor:uid,baseRevision:before.revision,at,protocol:6,enhancementProtocol:1};
  const {world,records}=await packSparkRecords(next,before),patch={...records},path=sparkPath(store.config,'worlds',worldId);
  for(const[k,v]of Object.entries(changedPaths(before,world)))patch[path+'/'+k]=v;
  const feedBefore=historyFeed(before),feedAfter=historyFeed(world);
  for(const[k,v]of Object.entries(changedPaths(feedBefore,feedAfter)))patch[sparkPath(store.config,'historyFeed',worldId)+'/'+k]=v;
  if(world.season?.endedAt){patch['seasonIndex/'+worldId]={id:worldId,title:world.season.result.title,endedAt:world.season.endedAt};patch[sparkPath(store.config,'recordVersions',worldId)+'/archive']=await sparkHash(world.season.result);}
  try{await store.sdk.update(store.sdk.ref(store.db),patch);}catch(e){
   try{await store.retryRead({worldOnly:true});}catch{throw error('저장 응답을 확인하지 못했습니다. 같은 명령으로 다시 확인합니다.',false);}
   const current=store.world;if(current.revision===before.revision)throw error(e.message);
   if(attempt===4)throw error('다른 명령이 진행 중입니다. 같은 명령으로 다시 시도해 주세요.',false);
   continue;
  }
  store.world=store.observed?.revision>world.revision?store.observed:world;if(world.sparkTickets)store.rewards=world.sparkTickets[uid]||{};store.onWorld(store.world);
  const events=systemEvents(before,world);
  if(events.length)try{await store.sdk.runTransaction(store.chatRef,raw=>{const n=appendSystemMessages(raw,events,uid,at);n.lastSent??={};n.lastSent[uid]=at;return n;},{applyLocally:false});}catch{} // gameplay commit is already final
  if(rejected)throw error(rejected.message);
  return name==='rulerReward'||name==='enhanceArmy'&&data.mode!=='local-batch'?out.result:response(out,world,data);
 }
}
function response(out,world,data){return {result:out.result||null,...(out.results?{results:out.results,nextSeq:world.players[world.command.actor]?.enhanceSeq}:{}),event:out.world.history?.[data.id]||world.history?.[data.id]||null,commit:{worldId:world.season.id,id:data.id,revision:world.revision},guardPending:Object.values(world.pendingBattles||{}).some(p=>p.actor===world.command.actor)};}
export async function openSparkSeason(store,id){
 const number=Number(id?.slice(7));if(!/^season-[1-9][0-9]*$/.test(id)||!Number.isInteger(number))throw error('시즌 번호를 확인해 주세요.');
 const path=sparkPath(store.config,'worlds',id),ref=store.sdk.ref(store.db,path);
 if((await store.sdk.get(store.sdk.ref(store.db,path+'/revision'))).exists())return {id,number};
 const season=(await store.sdk.get(store.sdk.ref(store.db,sparkPath(store.config,'worlds','season-'+(number-1))+'/season'))).val(),next=followingSeason({season},store.now());
 if(!next||next.number!==number)throw error('새 시즌 시작 시각을 기다려 주세요.');
 const initial=createSparkWorld(number,next.startAt,'samguk:'+id+':'+entropy());initial.command.actor=store.uid;initial.command.id='spark-open-'+id;initial.updatedAt=store.now();initial.command.at=initial.updatedAt;
 try{await store.sdk.set(ref,initial);}catch(e){if(!(await store.sdk.get(store.sdk.ref(store.db,path+'/revision'))).exists())throw e;}
 return {id,number};
}
