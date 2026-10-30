// Pure round execution. Storage/lease and billing activation are separate adapters.
import {normalizeWorld,applyCommand,movementPlan,myPendingBattle,refreshIndexes} from './engine-next.js';
import {ownedTerritories,hash32,requireGame} from './game-core.js';
import {AI_POLICY,isAi,spawnInternalAis,validateAiState} from './ai-world.js';
import {createAiPlanner} from './ai-policy.js';

export function runAiRound(raw,at,{seedFor,plannerOptions={},maxDecisionMs=40_000,clock=()=>performance.now()}={}){
  let s=validateAiState(normalizeWorld(raw));const original=s.revision,round=Math.floor((at-s.season?.startAt)/AI_POLICY.decisionMs),actions=[],started=clock();
  if(!s.ai?.enabled||s.season?.endedAt||at<s.season.startAt||s.ai.lastTick>=round)return {world:s,actions,reason:'not-due'};
  requireGame(at>=s.updatedAt,'전장의 시각보다 이전 AI 회차입니다.');
  requireGame(typeof seedFor==='function','서버 전용 전투 난수 공급기가 필요합니다.');
  const cmd=(uid,type,fields,id)=>{s=applyCommand(s,uid,{id,type,...fields,baseRevision:s.revision,at},at);};
  const aiPlayers=()=>Object.values(s.players).filter(isAi);
  const settler=aiPlayers()[0]?.uid||Object.keys(s.players)[0];if(!settler)return {world:s,actions,reason:'no-players'};
  cmd(settler,'recruit',{},`ai-settle-s${s.season.number}-r${round}`);
  if(!s.season.endedAt)s=spawnInternalAis(s,at);
  if(s.season.endedAt)return {world:s,actions,reason:'season-ended'};
  const order=aiPlayers().sort((a,b)=>hash32(`${s.seed}:ai-order:${round}:${a.uid}`)-hash32(`${s.seed}:ai-order:${round}:${b.uid}`)||a.uid.localeCompare(b.uid));
  for(const player of order){
    if(clock()-started>=maxDecisionMs)break;
    const uid=player.uid,p=s.players[uid];
    if(!ownedTerritories(s,uid).length||p.ai.nextDecisionAt>at||p.ai.lastRound>=round)continue;
    const excluded=new Set();let territorial=0,officer=0,taken=0;
    for(let step=0;step<3&&clock()-started<maxDecisionMs;step++){
      const pending=myPendingBattle(s,uid);if(pending){cmd(uid,'resolveGuard',{battleId:pending.id,guardChoice:pending.defaultTarget},`ai-guard-s${s.season.number}-r${round}-${uid}`);}
      const planner=createAiPlanner(s,at,{...plannerOptions,shouldContinue:()=>clock()-started<maxDecisionMs});
      let decision=territorial<2?planner.bestSupport(uid,excluded)||planner.bestAttack(uid,excluded)||planner.bestTransfer(uid,excluded)||planner.bestRevival(uid,excluded):null;
      if(!decision&&officer<1)decision=planner.bestTransfer(uid,excluded,true);
      if(!decision)break;
      const independent=decision.type==='move'&&movementPlan(s,uid,decision.from,decision.to,decision.unitIds,at).independent;
      if(independent&&officer>=1){excluded.add(decision.from);continue;}
      if(!independent&&territorial>=2)break;
      const id=`ai-action-s${s.season.number}-r${round}-${uid}-${step}`,seed=seedFor(id);
      requireGame(Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff,'서버 전투 난수가 올바르지 않습니다.');
      cmd(uid,decision.type,{from:decision.from,to:decision.to,territoryId:decision.territoryId,unitIds:decision.unitIds,seed},id);
      // Guan Ping uses the already frozen dice and the default eligible officer.
      const guard=myPendingBattle(s,uid);if(guard)cmd(uid,'resolveGuard',{battleId:guard.id,guardChoice:guard.defaultTarget},id+'-guard');
      if(independent)officer++;else territorial++;taken++;excluded.add(decision.from);
      const current=s.players[uid].ai;if(decision.type==='move')for(const unitId of decision.unitIds)current.moves[unitId]={from:decision.from,to:decision.to,at};
      actions.push({id,uid,category:decision.category,from:decision.from,to:decision.to||decision.territoryId,count:decision.unitIds.length,reason:decision.reason,...(decision.probability?{chance:decision.probability.lower}:{} )});
      if(s.season.endedAt)break;
    }
    const current=s.players[uid].ai;current.lastRound=round;current.nextDecisionAt=at+AI_POLICY.decisionMs;current.idleRounds=taken?0:current.idleRounds+1;
    current.moves=Object.fromEntries(Object.entries(current.moves||{}).filter(([,m])=>at-m.at<20*60_000));
    if(s.season.endedAt)break;
  }
  // One atomic caller commit exposes the final revision, not intermediate actions.
  s.ai.lastTick=round;s.revision=original+1;s.updatedAt=at;s.command={...s.command,id:`ai-round-s${s.season.number}-r${round}`,type:'aiBatch',actor:'ai-system',at,baseRevision:original};
  refreshIndexes(s);return {world:normalizeWorld(s),actions,reason:s.season.endedAt?'season-ended':'processed',elapsedMs:clock()-started};
}

// Cost diagnostics are advisory; explicit enable/disable controls execution.
export function aiCostGate(metrics,now,{freeBytes=360_000_000,staleMs=6*3600_000}={}){
  if(!metrics||!Number.isFinite(metrics.observedAt)||metrics.observedAt>now||now-metrics.observedAt>staleMs)return {mode:'unknown',reason:'사용량 측정 누락·지연'};
  const keys=['actualBytes','forecastHumanBytes','forecastAiBytes','forecastOverheadBytes','otherCost'];
  if(keys.some(k=>!Number.isFinite(metrics[k])||metrics[k]<0)||metrics.otherCost>0)return {mode:'unknown',reason:'비용 추정 불확실 또는 실제 청구 감지'};
  const ratio=Math.max(metrics.actualBytes,metrics.forecastHumanBytes+metrics.forecastAiBytes+metrics.forecastOverheadBytes)/freeBytes;
  if(ratio>=.85)return {mode:'high',ratio,reason:'무료량 85% 이상 예상 · 비용 발생 가능성 안내'};
  if(ratio>=.75)return {mode:'high',ratio,reason:'무료량 75% 이상 예상 · 비용 발생 가능성 안내'};
  if(ratio>=.6)return {mode:'warning',ratio,reason:'무료량 60% 접근'};
  return {mode:'normal',ratio,reason:'측정치 기준 여유'};
}
export function canActivateAi(metrics,now){return {allowed:true,gate:aiCostGate(metrics,now)};}

export async function executeAiTick(adapter,{now,seedFor,plannerOptions={},clock=()=>performance.now(),maxDecisionMs=40_000}={}){
  requireGame(Number.isFinite(now),'AI 실행 시각이 올바르지 않습니다.');const began=clock();
  // The production adapter must implement a fenced, revision-conditional atomic commit.
  // No implementation here silently falls back to a blind Admin update().
  const meta=await adapter.readMeta();
  if(!meta?.activationApproved||!meta?.enabled)return {status:'disabled',reads:0};
  const gate=aiCostGate(meta.cost,now),notice={...gate,periodId:meta.cost?.periodId||'unverified'};if(gate.mode!=='normal'){try{await adapter.reportGate(notice);}catch{/* Cost reporting must not suspend authorized gameplay. */}}
  const round=Math.floor((now-meta.startAt)/AI_POLICY.decisionMs);
  if(meta.endedAt||round<0||meta.lastTick>=round)return {status:'not-due',reads:0};
  const lease=await adapter.acquire(round,now);if(!lease)return {status:'busy',reads:0};
  let reads=0;
  try{
    for(let attempt=0;attempt<3;attempt++){
      const remaining=maxDecisionMs-(clock()-began);if(remaining<=0)return {status:'deferred',reads};
      const world=await adapter.readWorld();reads++;
      const result=runAiRound(world,now,{seedFor,plannerOptions,clock,maxDecisionMs:Math.max(0,maxDecisionMs-(clock()-began))});
      if(result.reason==='not-due')return {status:'not-due',reads};
      if(await adapter.commit({expectedRevision:world.revision,lease,round,world:result.world,actions:result.actions}))return {status:'committed',reads,actions:result.actions,gate};
    }
    return {status:'conflict',reads};
  }finally{await adapter.release(lease);}
}
