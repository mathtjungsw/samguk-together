import {availableColor,assignColor} from './faction-colors.js';
import {chooseAiName} from './ai-names.js';
// Server-side domain logic. No browser import or production activation hook.
import {normalizeWorld,refreshIndexes,reconcileRoles,emptyRoles,capacityOf,isLocked} from './engine-next.js';
import {adjacent,ownedTerritories,hash32,RULES,requireGame,placeInfo} from './game-core.js';
import {stampUnit} from './role-policy.js';
import {closeIfWon} from './season-policy.js';

export const AI_POLICY=Object.freeze({version:1,decisionMs:600_000,spawnMs:7_200_000,minCountry:15,defaultStart:3});
export const isAi=p=>p?.kind==='ai';
export function validateAiState(s){
  const a=s.ai;if(!a)return s;
  requireGame(a.version===1&&typeof a.enabled==='boolean'&&Number.isInteger(a.startCount)&&a.startCount>=1&&a.startCount<=5&&Number.isInteger(a.nextSerial)&&a.nextSerial>=1&&Number.isInteger(a.spawnRound)&&a.spawnRound>=0&&Number.isInteger(a.lastTick)&&a.lastTick>=-1,'AI 운영 기록 버전을 확인해 주세요.','CORRUPT');
  for(const p of Object.values(s.players).filter(isAi)){if(typeof p.ai==='string'){try{p.ai=JSON.parse(p.ai);}catch{requireGame(false,'AI 판단 기록을 읽을 수 없습니다.','CORRUPT');}}const x=p.ai;if(x)x.moves??={};requireGame(x?.version===1&&Number.isFinite(x.bornAt)&&Number.isInteger(x.lastRound)&&x.lastRound>=-1&&Number.isFinite(x.nextDecisionAt)&&Number.isInteger(x.idleRounds)&&x.idleRounds>=0&&x.moves&&typeof x.moves==='object','AI 군주 판단 기록이 손상되었습니다.','CORRUPT');if(x.behaviorVersion!==undefined)requireGame(x.behaviorVersion===2&&Number.isFinite(x.lastAttackAt)&&x.lastAttackAt>=0&&Number.isFinite(x.nextRiskAt)&&x.nextRiskAt>=0,'AI 공격 대기 기록을 확인해 주세요.','CORRUPT');}
  return s;
}
export function aiElectors(s){
  const humans=Object.values(s.players).filter(p=>!isAi(p));
  const winners=humans.filter(p=>s.season?.winners?.includes(p.uid));
  if(winners.length)return winners.map(p=>p.uid).sort();
  const lands=p=>Number.isInteger(p.landCount)?p.landCount:ownedTerritories(s,p.uid).length,max=Math.max(0,...humans.map(lands));
  return humans.filter(p=>lands(p)===max).map(p=>p.uid).sort();
}
export function aiStartCount(previous,ballots={}){
  const values=aiElectors(previous).map(uid=>ballots[uid]).filter(n=>Number.isInteger(n)&&n>=1&&n<=5).sort((a,b)=>a-b);
  return values.length?values[Math.floor((values.length-1)/2)]:AI_POLICY.defaultStart;
}
export function castAiBallot(previous,ballots,uid,count,at){
  requireGame(previous.season?.endedAt&&at>=previous.season.endedAt&&at<previous.season.nextStartAt,'시즌 종료 후 다음 개막 전까지 선택할 수 있습니다.');
  requireGame(aiElectors(previous).includes(uid),'지난 시즌 우승 군주에게 선택권이 있습니다.');
  requireGame(Number.isInteger(count)&&count>=1&&count<=5,'시작 AI 수는 1~5명입니다.');
  return {...ballots,[uid]:count};
}
const ordered=(s,key,items)=>items.slice().sort((a,b)=>hash32(`${s.seed}:${key}:${a.id}`)-hash32(`${s.seed}:${key}:${b.id}`)||a.id.localeCompare(b.id));
function addHistory(s,id,at,fields){s.history[id]={id,at,actor:'ai-system',...fields};s.history=Object.fromEntries(Object.entries(s.history).sort((a,b)=>b[1].at-a[1].at||b[0].localeCompare(a[0])).slice(0,100));}
function checkpoint(s,before,at,id){s.revision=before+1;s.updatedAt=at;s.command={...s.command,id,type:'aiBatch',actor:'ai-system',at,baseRevision:before,protocol:6};reconcileRoles(s,at);refreshIndexes(s);return normalizeWorld(s);}
export function previousRulerNames(archives){return [...new Set(archives.flatMap(a=>Object.values(a?.rankings||{}).map(p=>String(p.name||'').trim().slice(0,16))).filter(Boolean))];}
function rulerName(s,n){return chooseAiName(s,'',n-1);}
function createAi(s,t,at,infantry,origin=''){
  const slot=availableColor(s,''),n=s.ai.nextSerial++,uid=`ai-s${s.season.number}-${String(n).padStart(3,'0')}`,name=rulerName(s,n);
  requireGame(!s.players[uid],'AI 군주 번호가 이미 사용 중입니다. 기존 군주를 보존했습니다.','CORRUPT');
  s.players[uid]={uid,name,kind:'ai',nameChosen:true,colorSlot:slot,color:Object.keys(s.players).length%15,joinedAt:at,life:1,eliminatedAt:0,startedAt:at,captures:0,defeats:0,kills:0,deaths:0,revived:0,exchanged:0,rulerId:'',retreatCostD4:0,ai:{version:1,bornAt:at,origin,lastRound:-1,nextDecisionAt:at+RULES.protectionMs,behaviorVersion:2,lastAttackAt:at,nextRiskAt:at,idleRounds:0,moves:{}}};
  assignColor(s,uid);t.owner=uid;t.generation++;t.revision++;t.roles=emptyRoles();t.protectionUntil=at+RULES.protectionMs;t.actionReadyAt=at+RULES.actionMs;t.lastRecruitAt=at;t.nextRecruitAt=at+RULES.recruitMs;t.cycleMs=RULES.recruitMs;t.lastAttackAt=0;t.battleLock='';
  t.units=[20,...Array(infantry).fill(4)].map((sides,i)=>stampUnit({id:`${uid}:initial:${i}`,name:sides===20?name:'병사',sides,readyAt:at+RULES.actionMs,moveReadyAt:at+RULES.actionMs},at,t.id));
  return uid;
}
export function initializeAiWorld(raw,count=3,names=[]){
  requireGame(Number.isInteger(count)&&count>=1&&count<=5,'시작 AI 수는 1~5명입니다.');
  const s=normalizeWorld(raw);if(s.ai?.version===1){requireGame(s.ai.startCount===count,'이미 준비된 AI 수와 다릅니다.');return s;}
  requireGame(s.featureVersion===6&&s.season&&!s.season.endedAt,'AI를 준비할 새 시즌이 필요합니다.');
  requireGame(!Object.keys(s.players).length&&!Object.values(s.territories).some(t=>t.owner),'진행 중인 시즌에는 시작 AI를 주입하지 않습니다.');
  const at=s.season.startAt,revision=s.revision;s.ai={version:1,enabled:true,startCount:count,nextSerial:1,spawnRound:0,lastTick:-1,namePool:JSON.stringify(names),enabledAt:at};
  const candidates=ordered(s,'ai-start',Object.values(s.territories));
  for(const t of candidates.slice(0,count))createAi(s,t,at,4);
  addHistory(s,`ai-start-s${s.season.number}`,at,{type:'ai',text:`지난 군웅 ${count}명이 새 강토에서 깃발을 올렸습니다.`});
  return validateAiState(checkpoint(s,revision,at,`ai-initialize-s${s.season.number}`));
}
export function enableCurrentSeasonAi(raw,at,names=[]){
  const s=normalizeWorld(raw);if(s.ai)return validateAiState(s);
  requireGame(s.featureVersion===6&&s.season&&!s.season.endedAt,'진행 중인 새 규칙 시즌이 필요합니다.');
  requireGame(at>=s.updatedAt,'전장보다 이전 활성화 시각입니다.');
  s.ai={version:1,enabled:true,startCount:3,nextSerial:1,spawnRound:Math.floor((at-s.season.startAt)/AI_POLICY.spawnMs),lastTick:-1,namePool:JSON.stringify(names),enabledAt:at};
  // Ongoing season: attach metadata only; no starting AI or retroactive revolts.
  return validateAiState(checkpoint(s,s.revision,at,'ai-enable-s'+s.season.number));
}
export function seedOpeningAis(raw,count,at,names=[]){
  const s=normalizeWorld(raw);if(s.ai)return validateAiState(s);requireGame(Number.isInteger(count)&&count>=1&&count<=5,'시작 AI 수는1~5명입니다.');
  s.ai={version:1,enabled:true,startCount:count,nextSerial:1,spawnRound:Math.floor((at-s.season.startAt)/AI_POLICY.spawnMs),lastTick:-1,namePool:JSON.stringify(names),enabledAt:at};
  // A player may connect before the scheduler: preserve occupied cities and armies.
  for(const t of ordered(s,'ai-start',Object.values(s.territories).filter(t=>!t.owner)).slice(0,count))createAi(s,t,at,4);
  addHistory(s,'ai-start-s'+s.season.number,at,{type:'ai',text:`지난 군웅들이 새 강토에서 다시 깃발을 올렸습니다.`});
  return validateAiState(checkpoint(s,s.revision,at,'ai-opening-s'+s.season.number));
}
export function internalCandidates(s,uid,at){
  if(ownedTerritories(s,uid).length<AI_POLICY.minCountry)return [];
  return ownedTerritories(s,uid).filter(t=>!isLocked(s,t.id)&&t.protectionUntil<=at&&!t.units.some(u=>u.sides===20)&&adjacent(t.id).length&&adjacent(t.id).every(id=>s.territories[id].owner===uid));
}
export function spawnInternalAis(raw,at){
  const s=validateAiState(normalizeWorld(raw));if(!s.ai?.enabled||s.season.endedAt||at<s.season.startAt)return s;
  requireGame(at>=s.updatedAt,'전장의 시각보다 이전 등장 회차입니다.');
  const round=Math.floor((at-s.season.startAt)/AI_POLICY.spawnMs);if(round<=s.ai.spawnRound)return s;
  const revision=s.revision;if(closeIfWon(s,at))return checkpoint(s,revision,s.season.endedAt,`ai-expired-s${s.season.number}`);
  // Freeze the countries before any spawn; new countries never spawn recursively.
  const countries=Object.keys(s.players).filter(uid=>ownedTerritories(s,uid).length>=AI_POLICY.minCountry).sort();
  s.ai.spawnRound=round;const spawned=[];
  for(const owner of countries){
    const t=ordered(s,`ai-revolt:${round}:${owner}`,internalCandidates(s,owner,at))[0];if(!t)continue;
    const old=t.units.slice(),destinations=adjacent(t.id).map(id=>s.territories[id]).filter(d=>d.owner===owner&&!isLocked(s,d.id)).sort((a,b)=>a.units.length-b.units.length||a.id.localeCompare(b.id));
    for(const dest of destinations){
      const moving=old.splice(0,Math.max(0,capacityOf(dest.id,s,at)-dest.units.length));
      for(const u of moving){u.readyAt=Math.max(u.readyAt,at+RULES.actionMs);if(u.sides>4)u.moveReadyAt=Math.max(u.moveReadyAt,at+RULES.actionMs);stampUnit(u,at,dest.id);}dest.units.push(...moving);if(moving.length)dest.revision++;
    }
    if(old.length){const q=s.returnQueues[owner]??={from:t.id,at,life:s.players[owner].life,units:[]};for(const u of old){u.readyAt=Math.max(u.readyAt,at+RULES.actionMs);if(u.sides>4)u.moveReadyAt=Math.max(u.moveReadyAt,at+RULES.actionMs);u.stationTerritoryId='';}q.units.push(...old);}
    const uid=createAi(s,t,at,6,owner);spawned.push({uid,territory:t.id,previousOwner:owner});
  }
  if(spawned.length)addHistory(s,`ai-revolt-s${s.season.number}-${round}`,at,{type:'ai',text:`내부에서 군웅 ${spawned.length}명이 새 깃발을 올렸습니다: ${spawned.map(x=>`${s.players[x.uid].name} · ${placeInfo(x.territory).ko}`).join(', ')}`});
  return checkpoint(s,revision,at,`ai-spawn-round-s${s.season.number}-${round}`);
}
