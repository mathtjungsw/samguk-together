import {assignColor} from './faction-colors.js';
import {closeIfWon,seasonClosed,seasonVictory,armyCounts} from './season-policy.js';
import {RELEASE_ID,RELEASE_TEXT,heroNewsAllowed} from './release-policy.js';
import * as V4 from './engine-v4.js';
import {RANKS,baseCapacity,combatPolicy,winnerLoss,survivalDraws} from './combat-policy.js';
import * as V3 from './engine-v3.js';
import {chooseOfficers,officerOrder,resolveRoles,stampUnit,inheritedCreatedAt} from './role-policy.js';
import * as Legacy from './legacy-engine.js';
import {MAP,MINUTE,RULES,TIERS,COLORS,placeInfo,adjacent,ownedTerritories,queuedUnits,livingUnits,isOfficer,hash32,seededRandom,GameError,requireGame,byId} from './game-core.js';
import {EFFECTS,heroByName,heroById,effectOf,effectNumber,newEffectState,stateOf,reusable,markProc,governor,preparedSince,economy,regularRecruitBonus,battleOfficers,evaluateBattle,moveTiming} from './hero-effects-next.js';
export {MAP,MINUTE,RULES,RANKS,TIERS,COLORS,placeInfo,adjacent,baseCapacity,ownedTerritories,queuedUnits,livingUnits,hash32,seededRandom,GameError};
export const RELEASE=Object.freeze({id:RELEASE_ID,text:RELEASE_TEXT});
export const cleanName=Legacy.cleanName,clockText=Legacy.clockText,armyPower=Legacy.armyPower,attackScore=Legacy.attackScore,casualtyCount=Legacy.casualtyCount,winProbability=Legacy.winProbability;
export const addChatMessage=Legacy.addChatMessage,chatMessages=Legacy.chatMessages,appendSystemMessages=Legacy.appendSystemMessages;
export const readyUnits=(t,now)=>t.units.filter(u=>u.readyAt<=now);
export const GUARD_CHOICE_MS=10_000;
export const isLocked=(s,id)=>Object.values(s.pendingBattles||{}).some(p=>p.locks?.[id]);
export const myPendingBattle=(s,uid)=>Object.values(s.pendingBattles||{}).find(p=>p.actor===uid)||null;
export function reconcileRoles(s,at){for(const t of Object.values(s.territories))if(!isLocked(s,t.id)&&(t.settledAt??0)<=at)resolveRoles(s,t,at);}
export function retreatPlan(s,uid,battleTerritory,unit,at,key='retreat'){
  if(!uid)return null;
  const candidates=adjacent(battleTerritory).map(id=>s.territories[id]).filter(t=>t.owner===uid&&!isLocked(s,t.id));
  const rank=(a,b)=>a.units.length-b.units.length||hash32(`${s.seed}:${key}:${a.id}`)-hash32(`${s.seed}:${key}:${b.id}`)||a.id.localeCompare(b.id);
  const free=candidates.filter(t=>t.units.length<capacityOf(t.id,s,at)).sort(rank)[0];
  if(free)return {to:free.id,cost:null};
  if(![6,8,12].includes(unit.sides))return null;
  const full=candidates.filter(t=>t.units.some(u=>u.sides===4)).sort(rank)[0];if(!full)return null;
  const cost=full.units.filter(u=>u.sides===4).sort((a,b)=>(a.readyAt>at)-(b.readyAt>at)||(a.createdAt||0)-(b.createdAt||0)||hash32(`${key}:${a.id}`)-hash32(`${key}:${b.id}`)||byId(a,b))[0];
  return {to:full.id,cost};
}
export function maximumMove(s,uid,from,to,at){
  const a=s.territories[from],b=s.territories[to];if(!a||a.owner!==uid)return [];
  const ready=readyUnits(a,at).filter(u=>!b||b.owner!==uid||u.sides===4||u.moveReadyAt<=at),leaders=ready.filter(u=>u.sides>4).sort(officerOrder(s.seed,`${from}:move`)),infantry=ready.filter(u=>u.sides===4).sort(officerOrder(s.seed,`${from}:move`));
  if(!b||b.owner!==uid)return [...leaders,...infantry].slice(0,Math.max(0,a.units.length-1)).map(u=>u.id);
  let best=[];
  for(let h=0;h<=leaders.length;h++)for(let i=0;i<=infantry.length;i++){
    const ids=[...leaders.slice(0,h),...infantry.slice(0,i)].map(u=>u.id);if(ids.length<best.length||ids.length===best.length&&h<=best.filter(id=>leaders.some(u=>u.id===id)).length)continue;
    const plan=movementPlan(s,uid,from,to,ids,at);if(plan.error)continue;
    const copy=structuredClone(s),src=copy.territories[from],dst=copy.territories[to],chosen=new Set(ids),back=new Set(plan.returning.map(u=>u.id));src.units=src.units.filter(u=>!chosen.has(u.id)).concat(plan.returning);dst.units=dst.units.filter(u=>!back.has(u.id)).concat(plan.units);
    resolveRoles(copy,src,at);resolveRoles(copy,dst,at);
    if(src.units.length>Math.max(a.units.length,capacityOf(from,copy,at))||dst.units.length>Math.max(b.units.length,capacityOf(to,copy,at)))continue;
    best=ids;
  }
  return best;
}
function prepareGuardChoice(s,uid,c,at){
  const a=s.territories[c.from],b=s.territories[c.to];if(!a||!b||a.owner===b.owner)return false;
  const plan=movementPlan(s,uid,c.from,c.to,c.unitIds,at);requireGame(!plan.error,plan.error);
  const active=chooseOfficers(s,a,plan.units,'attack',at,2);if(!active.some(u=>effectNumber(u)===33))return false;
  const result=evaluateBattle({s,from:a.id,to:b.id,attackUnits:plan.units,defendUnits:b.units,at,seed:c.seed});result.survivalDraws=survivalDraws(c.seed,c.id,[...plan.units,...b.units]);if(result.attack.score>result.defense.score)return false;
  const candidates=plan.units.filter(u=>[6,8,12].includes(u.sides)&&effectNumber(u)!==33).sort(officerOrder(s.seed,`${b.id}:guard`));
  if(!candidates.length)return false;
  const preview=structuredClone(s);preview.territories[a.id].units=preview.territories[a.id].units.filter(u=>!c.unitIds.includes(u.id));
  const possible=candidates.filter(u=>retreatPlan(preview,uid,b.id,u,at,c.id));if(!possible.length)return false;
  const defaultTarget=possible.find(u=>u.id===a.roles.guardTarget)?.id||possible[0].id;
  const locks=Object.fromEntries([...new Set([a.id,b.id,...adjacent(b.id).filter(id=>s.territories[id].owner===uid)])].map(id=>[id,true]));
  requireGame(!Object.keys(locks).some(id=>isLocked(s,id)),'퇴각 후보 영토의 다른 전투가 끝난 뒤 시도해 주세요.');
  s.pendingBattles[c.id]={id:c.id,actor:uid,from:a.id,to:b.id,at,deadline:at+GUARD_CHOICE_MS,defaultTarget,candidates:possible.map(u=>u.id),unitIds:[...c.unitIds],seed:c.seed,result,locks};
  return true;
}
function finishPending(s,p,choice,at){
  delete s.pendingBattles[p.id];
  const cmd={battleAt:p.at,id:p.id,type:'move',actor:p.actor,from:p.from,to:p.to,unitIds:p.unitIds,seed:p.seed,at,guardChoice:choice,finalizing:true,frozenResult:p.result};
  executeMove(s,p.actor,cmd,at);
  for(const id of Object.keys(p.locks)){const t=s.territories[id];cleanRoles(s);resolveRoles(s,t,at);t.settledAt=at;}
  refreshIndexes(s);
}
function settleExpiredBattles(s,now){for(const p of Object.values(s.pendingBattles||{}).sort((a,b)=>a.deadline-b.deadline||a.id.localeCompare(b.id)))if(p.deadline<=now)finishPending(s,p,p.defaultTarget,p.deadline);}
function resolveGuard(s,uid,c,now){
  const p=s.pendingBattles[c.battleId];
  if(!p){requireGame(s.history[c.battleId]?.type==='battle','이미 처리했거나 유효하지 않은 전투입니다.');return;}
  requireGame(p.actor===uid,'자신의 관평 호위 대상만 선택할 수 있습니다.');
  c.from=p.from;c.to=p.to;const choice=c.guardChoice||p.defaultTarget;requireGame(choice==='none'||p.candidates.includes(choice),'실제 함께 출진한 장수를 선택해 주세요.');
  finishPending(s,p,now>=p.deadline?p.defaultTarget:choice,Math.min(now,p.deadline));
}
export const capacityOf=(id,s=null,at=s?.projectedAt??s?.updatedAt??0)=>s?.featureVersion>=3?economy(s,s.territories[id],at).capacity:baseCapacity(id);
export const nextRecruitAt=t=>t.owner?(t.nextRecruitAt??t.lastRecruitAt+RULES.recruitMs):0;
export const restartAvailableAt=p=>p?.life>0?p.eliminatedAt+RULES.restartMs:0;
export function unitTier(roll,probabilities=[9000,700,250,50]){let n=roll*10000;for(let i=0;i<4;i++){if(n<probabilities[i])return [4,6,8,12][i];n-=probabilities[i];}return 12;}
export const emptyRoles=()=>({governor:'',defense:[],support:'',supportManual:'',supportChangeAt:0,retreat:'',guardTarget:'',policyVersion:1,policySeed:'',governorSince:0,defenseSince:0,governorChangeAt:0,defenseChangeAt:0});
const countUnits=s=>Object.values(s.territories).reduce((n,t)=>n+t.units.length,0)+Object.values(s.returnQueues||{}).reduce((n,q)=>n+q.units.length,0);
function heroIndex(s){const out={};const add=(u,owner,location)=>{if(!u.heroId)return;requireGame(!out[u.heroId],'같은 무장이 전장에 두 명 있습니다.','CORRUPT');out[u.heroId]={unitId:u.id,owner,...location};};for(const t of Object.values(s.territories))t.units.forEach((u,slot)=>add(u,t.owner,{kind:'territory',territoryId:t.id,slot}));for(const [uid,q] of Object.entries(s.returnQueues||{}))q.units.forEach((u,slot)=>add(u,uid,{kind:'queue',territoryId:'',slot}));return out;}
export function refreshIndexes(s){s.heroIndex=heroIndex(s);for(const p of Object.values(s.players)){p.rulerId=livingUnits(s,p.uid).find(u=>u.sides===20)?.id||'';p.landCount=ownedTerritories(s,p.uid).length;}return s;}
function autoRoles(t,at){const available=t.units.filter(u=>effectOf(u)&&u.readyAt<=at);if(!t.roles.governor){const u=available.filter(u=>effectOf(u).economic).sort((a,b)=>effectOf(b).sides-effectOf(a).sides||byId(a,b))[0];if(u){t.roles.governor=u.id;t.roles.governorSince=at;}}if(!t.roles.defense.length){t.roles.defense=available.filter(u=>effectOf(u).battle&&effectOf(u).defense).sort((a,b)=>effectOf(b).sides-effectOf(a).sides||byId(a,b)).slice(0,2).map(u=>u.id);if(t.roles.defense.length)t.roles.defenseSince=at;}}
export function upgradeWorld(raw,at=raw.updatedAt){
  if(raw.featureVersion===6)return normalizeWorld(raw);
  const s=V4.upgradeWorld(raw,at);requireGame(at>=s.updatedAt,'전환 시각을 확인해 주세요.');
  requireGame(!Object.values(s.pendingBattles||{}).some(p=>p.deadline>at),'관평 선택 마감 후 전환해 주세요.','PENDING');
  const news=V4.settleRecruitment(s,at);for(const e of news)s.history[e.id]=e;
  s.featureVersion=6;s.command.protocol=6;s.rosterVersion=3;s.effectsVersion=2;s.heroCatalog=Object.fromEntries(EFFECTS.map(e=>[e.id,e.name]));const moved=[];
  for(const t of Object.values(s.territories)){
    const cap=capacityOf(t.id,s,at),keep=new Set([t.roles.governor,...t.units.filter(u=>u.sides===20).map(u=>u.id)]);
    const candidates=t.units.filter(u=>!keep.has(u.id)).sort((a,b)=>a.sides-b.sides||Number(!!a.heroId)-Number(!!b.heroId)||b.arrivedAt-a.arrivedAt||b.createdAt-a.createdAt||byId(a,b));
    const excess=candidates.slice(0,Math.max(0,t.units.length-cap)),ids=new Set(excess.map(u=>u.id));t.units=t.units.filter(u=>!ids.has(u.id));
    for(const u of excess){u.stationTerritoryId='';moved.push({u,from:t.id,uid:t.owner});}
  }
  cleanRoles(s);reconcileRoles(s,at);placeQueued(s,at);
  for(const {u,from,uid} of moved){
    const destinations=stableDestinations(s,uid,from).sort((a,b)=>Number(adjacent(from).includes(b.id))-Number(adjacent(from).includes(a.id)));
    const dest=destinations.find(t=>t.units.length<capacityOf(t.id,s,at));
    if(dest){u.readyAt=Math.max(u.readyAt,at+RULES.actionMs);if(u.sides>4)u.moveReadyAt=Math.max(u.moveReadyAt,at+RULES.actionMs);stampUnit(u,at,dest.id);dest.units.push(u);}
    else{const q=s.returnQueues[uid]??={from,at,life:s.players[uid].life,units:[]};q.units.push(u);(q.capacityOrigins??={})[u.id]=from;}
  }
  s.capacityMigration={at,moved:moved.length,origins:Object.fromEntries(moved.map(x=>[x.u.id,x.from]))};
  reconcileRoles(s,at);refreshIndexes(s);s.updatedAt=at;return normalizeWorld(s);
}
export function createWorld(now=Date.now(),seed='samguk-main'){return upgradeWorld(V4.createWorld(now,seed),now);}
export function normalizeWorld(raw){
  if(raw?.featureVersion!==6)return V4.normalizeWorld(raw);
  requireGame(raw.version===1&&raw.mapId===MAP.mapId,'전장 저장 버전이 다릅니다. 기존 기록을 보존했어요.','VERSION');const s=structuredClone(raw);
  for(const key of ['players','requests','history','receipts','returnQueues','heroIndex','pendingBattles'])s[key]??={};
  requireGame(s.rolePolicyVersion===1&&EFFECTS.every(e=>s.heroCatalog?.[e.id]===e.name),'자동 배정 정책이나 무장 명단 기록을 확인해 주세요.','CORRUPT');
  for(const [id,p] of Object.entries(s.pendingBattles)){
    requireGame(p.id===id&&s.players[p.actor]&&Array.isArray(p.unitIds)&&Array.isArray(p.candidates)&&p.deadline===p.at+GUARD_CHOICE_MS&&p.locks?.[p.from]&&p.locks?.[p.to]&&s.territories[p.from]&&s.territories[p.to],'호위 선택 기록을 확인해 주세요.','CORRUPT');
    for(const side of ['attack','defense']){const arm=p.result?.[side];requireGame(arm&&Array.isArray(arm.dice)&&Number.isFinite(arm.score),'고정 전투 결과가 손상되었습니다.','CORRUPT');arm.chosen??=[];arm.used??=[];arm.logs??=[];}
  }
  requireGame(s.rosterVersion===3&&s.effectsVersion===2&&Number.isInteger(s.revision)&&Number.isFinite(s.updatedAt),'새 전장 기록을 확인할 수 없습니다.','CORRUPT');
  const ids=new Set();
  const checkUnit=u=>{requireGame(u&&typeof u.id==='string'&&!ids.has(u.id)&&TIERS[u.sides]&&typeof u.name==='string'&&Number.isFinite(u.readyAt)&&u.readyAt>=0,'중복되거나 손상된 병력 기록입니다.','CORRUPT');ids.add(u.id);requireGame(Number.isFinite(u.createdAt)&&Number.isFinite(u.arrivedAt)&&u.createdAt>=0&&u.arrivedAt>=u.createdAt&&Number.isFinite(u.moveReadyAt)&&u.moveReadyAt>=0&&typeof u.stationTerritoryId==='string','병력 생성·도착 기록을 확인해 주세요.','CORRUPT');if(u.heroId){const e=heroById.get(u.heroId);requireGame(u.heroVersion===2&&e&&u.name===e.name&&u.sides>=e.sides,'무장 이름이나 등급 기록이 다릅니다.','CORRUPT');u.effectState={...newEffectState(),...u.effectState,captured:u.effectState?.captured||{},defended:u.effectState?.defended||{}};for(const k of ['recruits','attacks','wins','escapes','lastProcAt','lastAttackAt','capacityStamp'])requireGame(Number.isFinite(u.effectState[k])&&u.effectState[k]>=0,'무장 효과 기록이 손상되었습니다.','CORRUPT');}else requireGame(!isOfficer(u)||u.legacy===true,'무장 이름 예약을 확인할 수 없습니다.','CORRUPT');};
  for(const p of MAP.places){const t=s.territories?.[p.id];if(t)t.battleLock??='';requireGame(t&&t.id===p.id&&typeof t.owner==='string'&&Array.isArray(t.units)&&t.units.length>=1&&t.units.length<=baseCapacity(p.id)+3,'영토의 병력 기록을 확인할 수 없어요.','CORRUPT');requireGame(!t.owner||!!s.players[t.owner],'영토 소유자의 기록을 확인할 수 없어요.','CORRUPT');t.roles={...emptyRoles(),...t.roles,defense:t.roles?.defense||[]};t.nextRecruitAt??=0;t.cycleMs??=RULES.recruitMs;t.lastAttackAt??=0;for(const k of ['revision','generation','lastRecruitAt','nextRecruitAt','actionReadyAt','protectionUntil','cycleMs','lastAttackAt'])requireGame(Number.isFinite(t[k])&&t[k]>=0,'영토 시간 기록이 손상되었습니다.','CORRUPT');t.units.forEach(u=>{checkUnit(u);requireGame(u.stationTerritoryId===t.id,'병력 주둔 기록이 다릅니다.','CORRUPT');});requireGame(t.roles.defense.length<=2&&new Set(t.roles.defense).size===t.roles.defense.length,'수비 특기 기록을 확인해 주세요.','CORRUPT');}
  for(const [uid,q] of Object.entries(s.returnQueues)){requireGame(s.players[uid]&&q.life===s.players[uid].life&&Array.isArray(q.units)&&q.units.length<=3000&&ownedTerritories(s,uid).length,'복귀 대기 병력 기록을 확인해 주세요.','CORRUPT');q.units.forEach(checkUnit);}
  const expected=heroIndex(s);requireGame(Object.keys(expected).length===Object.keys(s.heroIndex).length&&Object.entries(expected).every(([id,row])=>s.heroIndex[id]&&Object.keys(row).length===Object.keys(s.heroIndex[id]).length&&Object.entries(row).every(([key,value])=>s.heroIndex[id][key]===value)),'무장 위치 기록이 일치하지 않습니다.','CORRUPT');return s;
}
export function chooseStartTerritory(s,uid){
  const life=(s.players[uid]?.life||0)+1,key=`${s.seed}:start:${uid}:${life}`,randomOrder=(values,suffix)=>values.slice().sort((a,b)=>hash32(`${key}:${suffix}:${a}`)-hash32(`${key}:${suffix}:${b}`)||a.localeCompare(b));
  const neutral=Object.values(s.territories).filter(t=>!t.owner).map(t=>t.id);if(neutral.length)return {id:randomOrder(neutral,'neutral')[0],owner:''};
  const counts=Object.keys(s.players).map(id=>({id,count:ownedTerritories(s,id).length})),max=Math.max(...counts.map(x=>x.count));requireGame(max>=2,'전장 정원에 도달했습니다. 시작 가능한 영토를 기다려 주세요.','WORLD_FULL');
  const owner=randomOrder(counts.filter(x=>x.count===max).map(x=>x.id),'owner')[0];return {id:randomOrder(ownedTerritories(s,owner).map(t=>t.id),'land')[0],owner};
}
function eligibleToStart(s,uid,now){const p=s.players[uid];requireGame(p,'먼저 군주 이름을 정해 주세요.');requireGame(!ownedTerritories(s,uid).length,'이미 영토를 가지고 있습니다.');requireGame(!p.life||p.eliminatedAt>0,'재참가 기록을 확인해 주세요.');requireGame(now>=restartAvailableAt(p),`마지막 영토를 잃은 뒤 1시간이 지나야 합니다. 남은 시간 ${clockText(restartAvailableAt(p)-now)}`,'RESTART_WAIT');}
const trim=(v,limit)=>Object.fromEntries(Object.entries(v).sort(([,a],[,b])=>b.at-a.at).slice(0,limit));
function logEvent(s,c,e){s.history[c.id]={id:c.id,at:c.at,actor:c.actor,...e};}
function resetRecruit(t,now,interval){t.lastRecruitAt=now;t.cycleMs=interval;t.nextRecruitAt=t.owner?now+interval:0;}
function cleanRoles(s){for(const t of Object.values(s.territories)){const ids=new Set(t.units.map(u=>u.id));if(!ids.has(t.roles.governor))t.roles.governor='';t.roles.defense=t.roles.defense.filter(id=>ids.has(id));if(!ids.has(t.roles.guardTarget))t.roles.guardTarget='';if(!adjacent(t.id).includes(t.roles.support)||s.territories[t.roles.support]?.owner!==t.owner)t.roles.support='';if(s.territories[t.roles.retreat]?.owner!==t.owner||t.roles.retreat===t.id)t.roles.retreat='';}}
function stableDestinations(s,uid,from){const p=placeInfo(from)?.coord||[0,0],distance=t=>{const q=placeInfo(t.id).coord;return Math.hypot(q[0]-p[0],q[1]-p[1]);};return ownedTerritories(s,uid).filter(t=>t.id!==from).sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id));}
function placeQueued(s,at){let changed=false;for(const [uid,q] of Object.entries(s.returnQueues)){
   q.units.sort((a,b)=>Number(!!q.capacityOrigins?.[a.id])-Number(!!q.capacityOrigins?.[b.id])||(b.sides-a.sides)||byId(a,b));
   for(const u of q.units.slice()){
     const origin=q.capacityOrigins?.[u.id],all=stableDestinations(s,uid,origin||q.from);if(origin&&s.territories[origin]?.owner===uid)all.unshift(s.territories[origin]);
     const t=all.find(t=>!isLocked(s,t.id)&&(t.settledAt??0)<=at&&t.units.length<capacityOf(t.id,s,at));if(!t)continue;
     u.readyAt=Math.max(u.readyAt,at+RULES.actionMs);if(u.sides>4)u.moveReadyAt=Math.max(u.moveReadyAt,at+RULES.actionMs);stampUnit(u,at,t.id);t.units.push(u);q.units=q.units.filter(x=>x.id!==u.id);if(origin)delete q.capacityOrigins[u.id];changed=true;
   }if(!q.units.length)delete s.returnQueues[uid];
 }return changed;}
function spawnRecruit(s,t,at){const rng=seededRandom(`${s.seed}:${t.id}:${t.generation}:${at}`);let sides=unitTier(rng(),economy(s,t,at).probabilities),e=null;if(sides>4){const pool=EFFECTS.filter(e=>e.sides===sides&&!s.heroIndex[e.id]);if(pool.length)e=pool[Math.floor(rng()*pool.length)];else sides=4;}const u={id:`recruit:${t.id}:${t.generation}:${at}`,name:e?.name||'병사',sides,readyAt:at};if(e){u.heroId=e.id;u.heroVersion=2;u.effectState=newEffectState();}return stampUnit(u,at,t.id);}
function bonusSoldier(t,at,tag){return stampUnit({id:`bonus:${t.id}:${t.generation}:${at}:${tag}`,name:'병사',sides:4,readyAt:at},at,t.id);}
function nextEffectEvents(s,now,cursor){const events=[];for(const t of Object.values(s.territories)){if(!t.owner||isLocked(s,t.id))continue;const localCursor=t.settledAt??cursor;for(const unit of t.units)if(unit.readyAt>localCursor&&unit.readyAt<=now)events.push({at:unit.readyAt,t,type:'roles'});if(t.nextRecruitAt&&t.nextRecruitAt<=now)events.push({at:Math.max(localCursor,t.nextRecruitAt),t,type:'regular'});const u=governor(s,t,localCursor),n=effectNumber(u);if(!u)continue;const prepared=preparedSince(t,u)+30*MINUTE,st=u.effectState;if([94,140].includes(n)&&prepared<=now&&st.capacityStamp!==prepared)events.push({at:Math.max(localCursor,prepared),t,u,type:'capacity'});const giftAt=Math.max(localCursor,prepared);if([81,111].includes(n)&&!st.firstGift&&giftAt<=now&&t.units.length<capacityOf(t.id,s,giftAt))events.push({at:giftAt,t,u,type:'gift'});}return events.sort((a,b)=>a.at-b.at||a.t.id.localeCompare(b.t.id)||a.type.localeCompare(b.type));}
export function hasDueRecruitment(s,now){if(s.featureVersion!==6)return V4.hasDueRecruitment(s,now);return Object.values(s.pendingBattles||{}).some(p=>p.deadline<=now)||nextEffectEvents(s,now,s.updatedAt).length>0||Object.entries(s.returnQueues||{}).some(([uid])=>ownedTerritories(s,uid).some(t=>!isLocked(s,t.id)&&t.units.length<capacityOf(t.id,s,now)));}
export function settleRecruitment(s,now){
  if(s.featureVersion!==6)return V4.settleRecruitment(s,now);if(s.season?.endedAt)return [];const news=[];let cursor=s.updatedAt;now=s.season?.deadline?Math.min(now,s.season.deadline-1):now;
  if(s.season?.deadline&&now>=s.season.deadline-1)for(const p of Object.values(s.pendingBattles||{}))finishPending(s,p,p.defaultTarget,s.season.deadline-1);settleExpiredBattles(s,now);placeQueued(s,cursor);refreshIndexes(s);
  for(let steps=0;;steps++){
    requireGame(steps<10000,'충원 정산량을 확인해 주세요.','SETTLEMENT');const ev=nextEffectEvents(s,now,cursor)[0];if(!ev)break;cursor=ev.at;const {t,at,u,type}=ev;
    placeQueued(s,at);
    if(type==='roles'){resolveRoles(s,t,at);}
    else if(type==='capacity'){u.effectState.capacityStamp=preparedSince(t,u)+30*MINUTE;if(!t.nextRecruitAt&&t.units.length<capacityOf(t.id,s,at))resetRecruit(t,at,economy(s,t,at).interval);}
    else if(type==='gift'){if(t.units.length<capacityOf(t.id,s,at)){t.units.push(bonusSoldier(t,at,'mizhu'));u.effectState.firstGift=true;}}
    else if(t.units.length<capacityOf(t.id,s,at)){
      const unit=spawnRecruit(s,t,at);t.units.push(unit);refreshIndexes(s);const giver=regularRecruitBonus(s,t,at);if(giver&&t.units.length<capacityOf(t.id,s,at))t.units.push(bonusSoldier(t,at,giver.id));
      if(heroNewsAllowed(unit,at))news.push({id:unit.id,type:'hero',at,actor:t.owner,to:t.id,unit:structuredClone(unit),text:`${s.players[t.owner].name} 군주의 ${placeInfo(t.id).ko}에 ${TIERS[unit.sides]} ${unit.name}(D${unit.sides})이 합류했습니다.`});
      t.lastRecruitAt=at;t.cycleMs=economy(s,t,at).interval;t.nextRecruitAt=at+t.cycleMs;
    }else t.nextRecruitAt=0;
    if(t.units.length>=capacityOf(t.id,s,at)){t.nextRecruitAt=0;t.lastRecruitAt=at;}
    t.settledAt=at;resolveRoles(s,t,at);refreshIndexes(s);
  }
  reconcileRoles(s,now);placeQueued(s,now);for(const t of Object.values(s.territories))if(t.owner&&!isLocked(s,t.id))t.settledAt=now;refreshIndexes(s);return news;
}
export function projectWorld(world,now){if(world.featureVersion!==6)return V4.projectWorld(world,now);const s=structuredClone(world);if(s.season?.endedAt)return s;now=s.season?.deadline?Math.min(now,s.season.deadline-1):now;settleRecruitment(s,now);Object.defineProperty(s,'projectedAt',{value:now,enumerable:false});return s;}
export function materializeTerritory(s,id,now){settleRecruitment(s,now);return s.territories[id];}
export function movementPlan(s,uid,from,to,ids,now){
  const a=s.territories[from],b=s.territories[to];if(isLocked(s,from)||isLocked(s,to))return {error:'관평 호위 선택 중인 영토입니다. 잠시 후 다시 시도해 주세요.'};if(!a||!b||!adjacent(from).includes(to))return {error:'변으로 맞닿은 영토로만 이동하거나 공격할 수 있어요.'};if(a.owner!==uid)return {error:'내 영토에서 출발해야 합니다.'};if(now<a.actionReadyAt&&!(b.owner===uid&&Array.isArray(ids)&&ids.length&&ids.every(id=>a.units.some(u=>u.id===id&&u.sides>4))))return {error:`출발 영토의 다음 행동까지 ${clockText(a.actionReadyAt-now)} 남았어요.`};
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)return {error:'이동할 병력을 선택해 주세요.'};const units=ids.map(id=>a.units.find(u=>u.id===id));if(units.some(u=>!u||u.readyAt>now))return {error:'이 영토의 행동 가능한 병력만 이동할 수 있어요.'};
  if(b.owner!==uid){if(ids.length>=a.units.length)return {error:'출발지에 병력을 최소 1명 남겨 주세요.'};if(b.protectionUntil>now)return {error:`시작 보호 중입니다. ${clockText(b.protectionUntil-now)} 남았어요.`};return {units,returning:[],exchange:0,friendly:false};}
  const independent=units.every(u=>u.sides>4);if(units.some(u=>u.sides>4&&u.moveReadyAt>now))return {error:'장수 개인 이동 대기가 남아 있습니다.'};
  const free=Math.max(0,capacityOf(to,s,now)-b.units.length),exchange=Math.max(0,units.length-free),officers=units.filter(u=>u.sides>4),readyD4=b.units.filter(u=>u.sides===4).sort((x,y)=>(x.readyAt>now)-(y.readyAt>now)||Math.max(0,x.readyAt-now)-Math.max(0,y.readyAt-now)||x.createdAt-y.createdAt||byId(x,y));
  if(exchange>officers.length)return {error:'장수·군주만 D4와 교환할 수 있어요. 동행 병사를 줄여 주세요.'};if(exchange&&!independent&&b.actionReadyAt>now)return {error:`교환할 목적지의 다음 행동까지 ${clockText(b.actionReadyAt-now)} 남았어요.`};if(exchange>readyD4.length)return {error:`교환할 D4 병사가 ${exchange-readyD4.length}명 부족해요.`};if(a.units.length-units.length+exchange<1)return {error:'출발지에 병력을 최소 1명 남겨 주세요.'};const returning=readyD4.slice(0,exchange),fit=moveCapacityError(s,from,to,units,returning,now);if(fit)return {error:fit};return {units,returning,exchange,friendly:true,independent};
}
export const validateMove=(...args)=>movementPlan(...args).error||null;
function moveCapacityError(s,from,to,units,returning,now){
  const copy=structuredClone(s),a=copy.territories[from],b=copy.territories[to],ids=new Set(units.map(u=>u.id)),backs=new Set(returning.map(u=>u.id));
  a.units=a.units.filter(u=>!ids.has(u.id)).concat(structuredClone(returning));
  b.units=b.units.filter(u=>!backs.has(u.id)).concat(structuredClone(units).map(u=>({...u,readyAt:Math.max(u.readyAt,now+RULES.actionMs)})));
  resolveRoles(copy,a,now);resolveRoles(copy,b,now);
  for(const id of [from,to]){const before=s.territories[id],after=copy.territories[id];if(Math.max(0,after.units.length-capacityOf(id,copy,now))>Math.max(0,before.units.length-capacityOf(id,s,now)))return '내정 담당 이동으로 주둔 정원이 줄어듭니다. 출발지 병력을 더 줄여 주세요.';}
  return null;
}
export function validateRevival(s,uid,id,ids,now){const t=s.territories[id];if(t?.owner!==uid)return '내 영토에서 군주를 살릴 수 있습니다.';if(livingUnits(s,uid).some(u=>u.sides===20))return '군주가 이미 생존해 있습니다.';if(t.actionReadyAt>now)return '영토의 행동 대기가 남아 있습니다.';if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)return '교환할 병력을 선택해 주세요.';const units=ids.map(id=>t.units.find(u=>u.id===id));if(units.some(u=>!u||u.sides===20||u.readyAt>now))return '이 영토에서 행동 가능한 D4·D6·D8·D12만 교환할 수 있어요.';return units.reduce((n,u)=>n+u.sides,0)<20?'선택한 병력의 면수 합계가 20 이상이어야 합니다.':null;}
function assign(s,uid,c,now){const t=s.territories[c.territoryId];requireGame(t?.owner===uid,'내 영토의 설정만 바꿀 수 있습니다.');requireGame(!isLocked(s,t.id),'호위 선택 중인 영토입니다.');const r=t.roles;
  requireGame(c.governorId===undefined&&c.defenseIds===undefined&&c.retreatId===undefined,'담당과 퇴각지는 자동 배정합니다.');
  if(c.supportTargetId!==undefined){requireGame(t.units.some(u=>[71,85,142].includes(effectNumber(u))),'지원 효과 장수가 없습니다.');requireGame(now>=(r.supportChangeAt||0),'지원 대상 변경 대기가 남아 있어요.');if(c.supportTargetId)requireGame(adjacent(t.id).includes(c.supportTargetId)&&s.territories[c.supportTargetId].owner===uid,'인접한 내 영토만 지원할 수 있습니다.');r.supportManual=c.supportTargetId;r.support=c.supportTargetId;r.supportChangeAt=now+RULES.actionMs;}
  if(c.guardTargetId!==undefined){requireGame(t.units.some(u=>effectNumber(u)===33),'관평이 주둔한 영토에서 정해 주세요.');if(c.guardTargetId)requireGame(t.units.some(u=>u.id===c.guardTargetId&&effectNumber(u)!==33&&[6,8,12].includes(u.sides)),'같은 도시의 다른 장수를 선택해 주세요.');r.guardTarget=c.guardTargetId;}
  resolveRoles(s,t,now);
}
const losses=(units,policy)=>{const dead=units.slice().sort((a,b)=>a.sides-b.sides||byId(a,b)).slice(0,winnerLoss(units.length,policy)),deadIds=new Set(dead.map(u=>u.id));return {dead,survivors:units.filter(u=>!deadIds.has(u.id))};};
function executeBattle(s,uid,c,plan,now){
  const a=s.territories[c.from],b=s.territories[c.to],defender=b.owner,retreat=b.roles.retreat,defenseGuard=b.roles.guardTarget,attackUnits=plan.units,defendUnits=b.units.slice(),ownBefore=ownedTerritories(s,uid).map(t=>t.id);
  for(const t of ownedTerritories(s,uid))t.protectionUntil=0;a.lastAttackAt=now;b.lastAttackAt=now;
  const result=c.frozenResult||evaluateBattle({s,from:a.id,to:b.id,attackUnits,defendUnits,attackIds:c.attackHeroIds||[],at:now,seed:c.seed});const won=result.attack.score>result.defense.score,activeAttack=result.attack.chosen.map(id=>attackUnits.find(u=>u.id===id)).filter(Boolean),activeDefense=result.defense.chosen.map(id=>defendUnits.find(u=>u.id===id)).filter(Boolean);
  const policy=combatPolicy(result.attack.score,result.defense.score),draws=result.survivalDraws||survivalDraws(c.seed,c.id,[...attackUnits,...defendUnits]),attempts=[];
  let attackDead,defendDead,attackSurvivors=[],defendSurvivors=[],returned=[],stationed=[];const escaped=[],retreatCosts=[];
  if(won){const loss=losses(attackUnits,policy);attackDead=loss.dead;attackSurvivors=loss.survivors;defendDead=defendUnits.slice();}
  else{attackDead=attackUnits.slice();const loss=losses(defendUnits,policy);defendDead=loss.dead;defendSurvivors=loss.survivors;}
  // Winner protection removes actual prospective D4 casualties only.
  for(const u of won?activeAttack:activeDefense){const n=effectNumber(u);if((won&&n===36)||(!won&&n===41)||n===139||(!won&&n===57&&reusable(u,now,60))){const dead=won?attackDead:defendDead,target=dead.find(x=>x.sides===4);if(target){dead.splice(dead.indexOf(target),1);(won?attackSurvivors:defendSurvivors).push(target);if(n===57)markProc(u,now);}}}
  // Complete the occupation before routing defeated defenders.
  if(won){b.owner=uid;b.units=[];b.roles=emptyRoles();b.generation++;b.actionReadyAt=now+RULES.actionMs;b.protectionUntil=0;resetRecruit(b,now,RULES.recruitMs);s.players[uid].captures++;}
  else b.units=defendSurvivors;
  const loser=won?activeDefense:activeAttack,dead=won?defendDead:attackDead,loserUid=won?defender:uid,sacrificed=new Set(),specialDraws=new Set();
  const route=u=>{const plan=retreatPlan(s,loserUid,b.id,u,now,c.id);if(!plan)return false;const dest=s.territories[plan.to];if(plan.cost){dest.units=dest.units.filter(x=>x.id!==plan.cost.id);retreatCosts.push({unit:structuredClone(plan.cost),owner:loserUid,to:dest.id});}u.readyAt=Math.max(u.readyAt,now+RULES.escapeMs);stampUnit(u,now,dest.id);dest.units.push(u);dead.splice(dead.findIndex(x=>x.id===u.id),1);escaped.push({unit:structuredClone(u),to:dest.id,cost:plan.cost?.id||''});return true;};
  if(!won&&!defender){const ruler=attackDead.find(u=>u.sides===20);if(ruler){ruler.readyAt=Math.max(ruler.readyAt,now+RULES.escapeMs);ruler.moveReadyAt=Math.max(ruler.moveReadyAt,now+RULES.escapeMs);stampUnit(ruler,now,a.id);a.units.push(ruler);attackDead.splice(attackDead.indexOf(ruler),1);escaped.push({unit:structuredClone(ruler),to:a.id,cost:'',cause:'neutral-ruler'})}}
  for(const u of loser.filter(u=>[11,27,33].includes(effectNumber(u))).sort(officerOrder(s.seed,`${b.id}:guard`))){const n=effectNumber(u);let target;if(n===33&&!(c.guardChoice==='none'&&!won))target=dead.find(x=>x.id===(won?defenseGuard:(c.guardChoice||c.guardTargetId||a.roles.guardTarget))&&x.id!==u.id&&[6,8,12].includes(x.sides))||dead.filter(x=>x.id!==u.id&&[6,8,12].includes(x.sides)).sort((x,y)=>officerOrder(s.seed,`${b.id}:guard`)(x,y))[0];else if(n!==33&&(n===11||defendOrAttackInfantry(won?defendUnits:attackUnits)>=2))target=dead.find(x=>x.sides===20);if(target&&route(target)){escaped.at(-1).cause='guard';sacrificed.add(u.id);}}
  for(const u of loser.slice().sort(officerOrder(s.seed,`${b.id}:escape`))){if(!dead.some(x=>x.id===u.id)||sacrificed.has(u.id))continue;const n=effectNumber(u),st=stateOf(u),limit=n===6?2:1,valid=n===6||n===40||n===77&&defendOrAttackInfantry(won?defendUnits:attackUnits)>=3||n===50||n===147&&defendOrAttackInfantry(won?defendUnits:attackUnits)>=2;if(!valid||st.escapes>=(limit))continue;if(n===50||n===147){specialDraws.add(u.id);if(seededRandom(`${c.seed}:escape:${u.id}:${st.escapes}`)()>=(n===50?.3:.5))continue;}if(route(u)){escaped.at(-1).cause='special';st.escapes++;}}
  for(const u of dead.slice().sort(officerOrder(s.seed,b.id+':general-survival'))){
    if(![6,8,12].includes(u.sides)||sacrificed.has(u.id)||specialDraws.has(u.id)||!policy.survival)continue;
    const roll=draws[u.id],passed=roll<policy.survival;let survived=false;
    if(passed){survived=route(u);if(survived)escaped.at(-1).cause='general';}
    attempts.push({id:u.id,name:u.name,roll,probability:policy.survival,passed,survived,reason:survived?'retreated':passed?'no-space':'draw-failed'});
  }
  if(won){attackSurvivors.forEach(u=>{u.readyAt=Math.max(u.readyAt,now+RULES.actionMs);if(u.sides>4)u.moveReadyAt=now+RULES.actionMs;stampUnit(u,now,b.id);});const cap=capacityOf(b.id,s,now),excess=Math.max(0,attackSurvivors.length-cap);returned=attackSurvivors.slice().sort((x,y)=>x.sides-y.sides||byId(x,y)).slice(0,excess);const ids=new Set(returned.map(u=>u.id));stationed=attackSurvivors.filter(u=>!ids.has(u.id));b.units=stationed;returned.forEach(u=>stampUnit(u,now,a.id));a.units.push(...returned);}
  for(const [units,victory,attack] of [[attackUnits,won,true],[defendUnits,!won,false]])for(const u of units)if(u.heroId){const st=stateOf(u);if(attack){st.attacks++;st.lastAttackAt=now;st.lastAttackWon=won;}if(victory)st.wins++;if(!attack&&effectNumber(u)===30)st.defended[b.id]=true;}
  for(const usage of [...result.attack.used,...result.defense.used]){const u=[...attackUnits,...defendUnits].find(u=>u.id===usage.id);if(u)markProc(u,now);}
  if(won)for(const u of activeAttack){const n=effectNumber(u),st=stateOf(u);if(n===25)a.actionReadyAt=now+8*MINUTE;if(n===59&&reusable(u,now,60)){a.actionReadyAt=Math.min(a.actionReadyAt,now+9*MINUTE);markProc(u,now);}if(!attackSurvivors.includes(u))continue;let gift=false;if(n===46&&!st.captured[b.id]){st.captured[b.id]=true;gift=true;}if(n===84&&!defender&&reusable(u,now,720)&&seededRandom(`${c.seed}:guansuo:${u.id}`)()<.25){gift=true;markProc(u,now);}if(n===89&&!defender&&!st.firstGift){gift=true;st.firstGift=true;}if(gift&&b.units.length<capacityOf(b.id,s,now)){b.units.push(bonusSoldier(b,now,u.id));if(n===46&&b.units.length<capacityOf(b.id,s,now))b.units.push(bonusSoldier(b,now,u.id+':second'));}}
  if(defender&&won&&!ownedTerritories(s,defender).length){s.players[defender].eliminatedAt=now;s.players[defender].defeats++;delete s.returnQueues[defender];}
  s.players[uid].kills+=defendDead.length;s.players[uid].deaths+=attackDead.length;if(defender){s.players[defender].kills+=attackDead.length;s.players[defender].deaths+=defendDead.length;}
  for(const cost of retreatCosts)s.players[cost.owner].retreatCostD4+=1;
  const r={combatVersion:5,policy,survivalAttempts:attempts,friendly:false,from:a.id,to:b.id,attacker:uid,defender,attack:result.attack.dice,defend:result.defense.dice,retreatCosts,raw:result.attack.baseRaw,score:result.attack.score,defense:result.defense.score,won,attackDead:structuredClone(attackDead),defendDead:structuredClone(defendDead),stationed:structuredClone(stationed),returned:structuredClone(returned),defendSurvivors:structuredClone(defendSurvivors),escaped,effects:result};
  logEvent(s,c,{type:'battle',from:a.id,to:b.id,text:`${s.players[uid].name} · ${placeInfo(b.id).ko} ${won?'점령':'공격 실패'} · ${r.score}:${r.defense} · ${policy.grade}(차이 ${policy.delta}) · 공격군 −${attackDead.length} / 수비군 −${defendDead.length}${escaped.length?' · 탈출 '+escaped.length+'명':''}${retreatCosts.length?' · 구조 비용 D4 '+retreatCosts.length+'명':''}`,result:r});
}
const defendOrAttackInfantry=units=>units.filter(u=>u.sides===4).length;
function commandOrigins(before,after){const old=new Map(),origins={};for(const t of Object.values(before.territories))t.units.forEach((u,slot)=>old.set(u.id,{kind:'territory',territoryId:t.id,owner:t.owner,slot}));for(const [owner,q] of Object.entries(before.returnQueues||{}))q.units.forEach((u,slot)=>old.set(u.id,{kind:'queue',territoryId:'',owner,slot}));const inspect=(u,location)=>{const prior=old.get(u.id);if(prior&&JSON.stringify(prior)!==JSON.stringify(location))origins[u.id]=prior;};for(const t of Object.values(after.territories))t.units.forEach((u,slot)=>inspect(u,{kind:'territory',territoryId:t.id,owner:t.owner,slot}));for(const [owner,q] of Object.entries(after.returnQueues))q.units.forEach((u,slot)=>inspect(u,{kind:'queue',territoryId:'',owner,slot}));return origins;}
function executeMove(s,uid,c,now){if(!c.finalizing&&prepareGuardChoice(s,uid,c,now))return;const plan=movementPlan(s,uid,c.from,c.to,c.unitIds,now);requireGame(!plan.error,plan.error);const a=s.territories[c.from],b=s.territories[c.to],selected=new Set(c.unitIds);a.units=a.units.filter(u=>!selected.has(u.id));if(!plan.independent)a.actionReadyAt=now+RULES.actionMs;
  if(!plan.friendly){executeBattle(s,uid,c,plan,now);return;}
  const reverseIds=new Set(plan.returning.map(u=>u.id));b.units=b.units.filter(u=>!reverseIds.has(u.id));const timing=moveTiming(s,a,b,plan.units,now,chooseOfficers(s,a,plan.units,'movement',now)[0]?.id,plan.returning);if(!plan.independent)a.actionReadyAt=now+timing.sourceDelay;if(plan.exchange&&!plan.independent)b.actionReadyAt=now+RULES.actionMs;
  for(const u of plan.units){u.readyAt=Math.max(u.readyAt,now+timing.delays[u.id]);if(u.sides>4)u.moveReadyAt=Math.max(u.moveReadyAt,now+timing.delays[u.id]);stampUnit(u,now,b.id);b.units.push(u);}for(const u of plan.returning){u.readyAt=Math.max(u.readyAt,now+timing.returnDelays[u.id]);stampUnit(u,now,a.id);a.units.push(u);}
  const heroes=plan.units.filter(u=>u.sides>4);if(heroes.length)logEvent(s,c,{type:'move',from:a.id,to:b.id,heroes:heroes.map(u=>({id:u.id,name:u.name,sides:u.sides})),exchange:plan.exchange,text:`${s.players[uid].name} · ${heroes.map(u=>u.name).join(', ')} · ${placeInfo(a.id).ko} → ${placeInfo(b.id).ko}${plan.exchange?' · D4 '+plan.exchange+'명 교환':''}`,result:{friendly:true,from:a.id,to:b.id,count:plan.units.length,exchange:plan.exchange}});
}
export function applyCommand(raw,actor,command,now=command.at){
  if(raw.featureVersion!==6)return V4.applyCommand(raw,actor,command,now);
  const s=normalizeWorld(raw);if(command.seasonId&&!s.season){requireGame(command.seasonId==='season-1','시즌 번호가 다릅니다.');s.season={id:'season-1',number:1,startAt:Date.parse('2026-10-28T12:00:00+09:00'),deadline:0};}requireGame(!s.season?.endedAt,'종료된 시즌은 결과만 볼 수 있습니다.','SEASON_CLOSED');if(seasonClosed(s,now))requireGame(command.type==='recruit','시즌이 마감되었습니다. 결과를 정리하고 있습니다.','SEASON_CLOSED');requireGame(actor&&typeof actor==='string','접속자를 확인할 수 없어요.');requireGame(command&&/^[\w-]{8,100}$/.test(command.id),'명령 번호를 확인할 수 없어요.');if(s.receipts[command.id])return s;
  requireGame(!s.maintenance,'업데이트 점검 중입니다. 잠시 뒤 새로고침해 주세요.','MAINTENANCE');requireGame(command.baseRevision===s.revision,'다른 명령이 먼저 도착했습니다. 최신 전황으로 다시 확인합니다.','CONFLICT');requireGame(Number.isFinite(now)&&now>=s.updatedAt,'전장의 시각을 다시 확인해 주세요.','CLOCK');
  for(const [id,revision] of Object.entries(command.expectedTerritories||{}))requireGame(s.territories[id]?.revision===revision,'선택한 영토가 바뀌었습니다. 다시 확인해 주세요.','TERRITORY_CONFLICT');
  const c={...command,actor,at:now},before=structuredClone(s.territories),pendingBefore=structuredClone(s.pendingBattles||{}),news=settleRecruitment(s,s.season?.deadline&&now>=s.season.deadline?s.season.deadline-1:now);requireGame(c.type==='register'||s.players[actor]||c.type==='recruit'&&s.season?.deadline&&now>=s.season.deadline,'먼저 전장에 입장해 주세요.');
  if(c.type==='register'){requireGame(!s.players[actor],'이미 전장에 입장한 군주입니다.');s.players[actor]={uid:actor,name:cleanName(c.name),nameChosen:true,color:Object.keys(s.players).length%15,joinedAt:now,life:0,eliminatedAt:0,startedAt:0,captures:0,defeats:0,kills:0,deaths:0,revived:0,exchanged:0,rulerId:'',retreatCostD4:0};logEvent(s,c,{type:'register',text:`${s.players[actor].name}님이 전장에 들어왔습니다.`});}
  else if(c.type==='rename'){const p=s.players[actor];requireGame(!ownedTerritories(s,actor).some(t=>isLocked(s,t.id)),'호위 선택 완료 후 이름을 바꿔 주세요.');p.name=cleanName(c.name);p.nameChosen=true;livingUnits(s,actor).filter(u=>u.sides===20).forEach(u=>u.name=p.name);logEvent(s,c,{type:'rename',text:`${p.name}님이 군주 이름을 정했습니다.`});}
  else if(c.type==='start'){
    eligibleToStart(s,actor,now);const choice=chooseStartTerritory(s,actor);requireGame(!isLocked(s,choice.id),'선정 영토의 전투가 끝난 뒤 다시 시작해 주세요.');const t=s.territories[choice.id],p=s.players[actor];c.to=t.id;let evacuated=0,queued=0;
    if(choice.owner){requireGame(!ownedTerritories(s,choice.owner).some(t=>isLocked(s,t.id)),'배정 대상 군주의 전투가 끝난 뒤 다시 시작해 주세요.');const owner=choice.owner,old=t.units.slice();evacuated=old.length;const destinations=stableDestinations(s,owner,t.id);for(const dest of destinations){const moving=old.splice(0,Math.max(0,capacityOf(dest.id,s,now)-dest.units.length));moving.forEach(u=>{u.readyAt=Math.max(u.readyAt,now+RULES.actionMs);stampUnit(u,now,dest.id);});dest.units.push(...moving);}if(old.length){const q=s.returnQueues[owner]??={from:t.id,at:now,life:s.players[owner].life,units:[]};old.forEach(u=>{u.stationTerritoryId='';});q.units.push(...old);queued=old.length;}}
    assignColor(s,actor);const bonus=!!choice.owner&&p.life===0;p.life++;p.eliminatedAt=0;p.startedAt=now;t.owner=actor;t.generation++;t.actionReadyAt=now;t.protectionUntil=now+RULES.protectionMs;t.roles=emptyRoles();t.lastAttackAt=0;t.units=[{id:`${actor}:life:${p.life}:ruler`,name:p.name,sides:20,readyAt:now},...Array.from({length:4},(_,i)=>({id:`${actor}:life:${p.life}:soldier:${i}`,name:'병사',sides:4,readyAt:now}))];t.units.forEach(u=>stampUnit(u,now,t.id));if(bonus){for(let i=0;i<2;i++){const pool=EFFECTS.filter(e=>e.sides===6&&!s.heroIndex[e.id]&&!t.units.some(u=>u.heroId===e.id)),e=pool[Math.floor(seededRandom(s.seed+':gift:'+actor+':'+i)()*pool.length)];const u=stampUnit({id:actor+':life:'+p.life+':gift:'+i,name:e?.name||'이름 없는 부장',sides:6,readyAt:now,...(e?{heroId:e.id,heroVersion:2,effectState:newEffectState()}:{legacy:true})},now,t.id);t.units.push(u);s.history[c.id+'-gift-'+i]={id:c.id+'-gift-'+i,at:now,actor,type:'hero',to:t.id,unit:structuredClone(u),text:p.name+' 군주의 시작 병력에 '+u.name+'(D6)이 합류했습니다.'}}}resetRecruit(t,now,RULES.recruitMs);
    logEvent(s,c,{type:'start',to:t.id,previousOwner:choice.owner,evacuated,queued,text:`${p.name}님이 ${placeInfo(t.id).ko}에서 ${p.life>1?'다시 ':''}시작했습니다.${choice.owner?' 영토 수 1위 '+s.players[choice.owner].name+'의 영토 재배정 · 기존 병력 '+evacuated+'명 복귀'+(queued?'('+queued+'명 복귀 대기)':''):''}`});
  }else if(c.type==='move'){requireGame(Number.isInteger(c.seed)&&c.seed>=0,'전투 주사위 정보를 확인해 주세요.');executeMove(s,actor,c,now);}
  else if(c.type==='resolveGuard')resolveGuard(s,actor,c,now);
  else if(c.type==='assign')assign(s,actor,c,now);
  else if(c.type==='revive'){const t=s.territories[c.territoryId];requireGame(!isLocked(s,t?.id),'호위 선택 중인 영토입니다.');const error=validateRevival(s,actor,t?.id,c.unitIds,now);requireGame(!error,error);const ids=new Set(c.unitIds),units=t.units.filter(u=>ids.has(u.id)),total=units.reduce((n,u)=>n+u.sides,0);t.units=t.units.filter(u=>!ids.has(u.id));const p=s.players[actor],unit={id:`${actor}:life:${p.life}:ruler:${c.id}`,name:p.name,sides:20,readyAt:now+RULES.actionMs};stampUnit(unit,now,t.id);t.units.push(unit);t.actionReadyAt=now+RULES.actionMs;p.revived++;p.exchanged+=units.length;logEvent(s,c,{type:'revive',to:t.id,unit,cost:units.length,total,text:`${p.name} 군주가 ${placeInfo(t.id).ko}에서 병력 ${units.length}명(합계 ${total})과 교환해 부활했습니다.`});}
  else if(c.type==='announce'){requireGame(c.id===RELEASE.id&&s.release?.id!==RELEASE.id,'이미 안내한 업데이트입니다.');s.release={id:RELEASE.id,text:RELEASE.text,at:now};logEvent(s,c,{type:'update',text:RELEASE.text});}
  else requireGame(c.type==='recruit','새 전장에서는 승인 요청·승인·거절 절차를 사용하지 않습니다.');
  cleanRoles(s);reconcileRoles(s,now);placeQueued(s,now);refreshIndexes(s);
  for(const t of Object.values(s.territories)){t.battleLock=Object.values(s.pendingBattles||{}).find(p=>p.locks[t.id])?.id||'';if(t.owner&&!isLocked(s,t.id)){const cap=capacityOf(t.id,s,now),wasFull=before[t.id].units.length>=capacityOf(t.id,raw,now);if(t.units.length>=cap)t.nextRecruitAt=0;else if(!t.nextRecruitAt||wasFull&&t.units.length<before[t.id].units.length)resetRecruit(t,now,economy(s,t,now).interval);}if(JSON.stringify({...t,revision:0})!==JSON.stringify({...before[t.id],revision:0}))t.revision=before[t.id].revision+1;}
  c.resolved={};c.resolutionByTerritory={};c.resolutionByPlayer={};for(const p of Object.values(pendingBefore))if(!s.pendingBattles[p.id]){c.resolved[p.id]=true;for(const id of Object.keys(p.locks))c.resolutionByTerritory[id]=p.id;c.resolutionByPlayer[p.actor]=p.id;const defender=raw.territories[p.to].owner;if(defender)c.resolutionByPlayer[defender]=p.id;}for(const e of news)s.history[e.id]=e;if(s.season?.number>=2&&!s.season.startAnnounced){const id='season-start-'+s.season.id;s.season.startAnnounced=true;s.history[id]={id,type:'season',actor,at:now,text:'📣 시즌 '+s.season.number+' 개막! 새로운 강토에서 군웅의 쟁패를 시작합니다. 72곳 점령 또는 72시간 후 승자를 가립니다.'};}if(closeIfWon(s,now)){const v=seasonVictory(s),id='season-end-'+s.season.id;s.history[id]={id,type:'season',actor,at:now,text:v.title+' · '+v.text};}s.history=trim(s.history,100);s.revision++;s.updatedAt=now;s.command={id:c.id,type:c.type,actor,at:now,baseRevision:command.baseRevision,from:c.from||'',to:c.to||c.territoryId||'',battleId:c.battleId||'',resolved:c.resolved||{},resolutionByTerritory:c.resolutionByTerritory||{},resolutionByPlayer:c.resolutionByPlayer||{},guardChoice:c.guardChoice||'',officerMove:c.type==='move'&&raw.territories[c.to]?.owner===actor&&Array.isArray(c.unitIds)&&c.unitIds.length>0&&c.unitIds.every(id=>raw.territories[c.from]?.units.some(u=>u.id===id&&u.sides>4)),seed:c.seed??0,protocol:6,origins:commandOrigins(raw,s)};s.receipts[c.id]={at:now,actor};s.receipts=trim(s.receipts,100);return normalizeWorld(s);
}
export function leaderboard(s,sort='heroes'){if(s.featureVersion!==6)return V4.leaderboard(s,sort);const keys={heroes:['heroes'],territories:['territories','army','kills'],army:['army','territories','kills'],kills:['kills','territories','army'],deaths:['deaths','territories','army']}[sort]||['territories','army','kills'];const rows=Object.values(s.players).map(p=>({...p,territories:ownedTerritories(s,p.uid).length,army:livingUnits(s,p.uid).length,queued:queuedUnits(s,p.uid).length,kills:p.kills||0,deaths:p.deaths||0,...armyCounts(s,p.uid)}));rows.sort((a,b)=>keys.reduce((n,key)=>n||b[key]-a[key],0)||a.joinedAt-b.joinedAt||a.uid.localeCompare(b.uid));let rank=0;return rows.map((r,i)=>{if(!i||keys.some(k=>r[k]!==rows[i-1][k]))rank=i+1;return {...r,rank};});}
export const visibleHistory=s=>Object.values(s.history||{}).filter(e=>!(e.type==='move'&&!e.heroes?.length)).sort((a,b)=>b.at-a.at||b.id.localeCompare(a.id));
export const systemEvents=(before,after)=>after.featureVersion!==6?V4.systemEvents(before,after):Object.values(after.history).filter(e=>['update','season'].includes(e.type)&&!before.history?.[e.id]).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
export function estimateBattle(s,from,to,units,ids,at,samples=8192){const t=s.territories[to],active=battleOfficers(s.territories[from],units,ids,at,true,s),defense=battleOfficers(t,t.units,undefined,at,false,s);if(!active.length&&!defense.length)return {chance:winProbability(units,t.units),approximate:false};let wins=0;const key=hash32(`estimate:${s.revision}:${from}:${to}:${units.map(u=>u.id).join(',')}:${ids.join(',')}:${Math.floor(at/MINUTE)}`);for(let i=0;i<samples;i++){const r=evaluateBattle({s,from,to,attackUnits:units,defendUnits:t.units,attackIds:ids,at,seed:key+i});if(r.attack.score>r.defense.score)wins++;}return {chance:wins/samples,approximate:true};}
