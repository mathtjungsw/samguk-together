import {ENHANCEMENT,enhancementEnabled,levelOf,failuresOf,enhanceChance,enhanceCost} from './enhancement-policy.js';
import {normalizeWorld,isLocked,capacityOf,refreshIndexes} from './engine-next.js';import {resolveRoles} from './role-policy.js';import {requireGame,placeInfo,byId} from './game-core.js';import {seasonClosed} from './season-policy.js';
export function defaultEnhancementMaterials(t,targetId,at){const u=t?.units.find(x=>x.id===targetId);return t?.units.filter(x=>x.id!==targetId&&x.sides===4&&!levelOf(x)).sort((a,b)=>a.arrivedAt-b.arrivedAt||a.createdAt-b.createdAt||byId(a,b)).slice(0,u?enhanceCost(u):0).map(x=>x.id)||[];}
export function enhancementPlan(s,uid,req,at){
 requireGame(enhancementEnabled(s),'병력 강화는 시즌 5부터 사용할 수 있습니다.');
 requireGame(!seasonClosed(s,at),'종료된 시즌에서는 강화할 수 없습니다.');const t=s.territories[req.city];requireGame(t?.owner===uid&&!isLocked(s,req.city),'전투 중이 아닌 내 도시를 선택해 주세요.');
 const u=t.units.find(x=>x.id===req.unitId);requireGame(u,'강화 대상이 현재 도시에 없습니다.');requireGame(levelOf(u)<ENHANCEMENT.maxLevel,'이미 최대 +3 강화입니다.');requireGame(u.readyAt<=at&&u.moveReadyAt<=at,'대상 병력의 기존 행동·이동 대기가 남아 있습니다.');
 const cost=enhanceCost(u),ids=req.materialIds;requireGame(Array.isArray(ids)&&ids.length===cost&&new Set(ids).size===cost,'필요한 기본 D4 재료를 확인해 주세요.');const material=ids.map(id=>t.units.find(x=>x.id===id));requireGame(material.every(x=>x&&x.id!==u.id&&x.sides===4&&!levelOf(x)),'같은 도시의 0강 D4만 기본 재료로 쓸 수 있습니다. 행동 대기 중인 병사도 사용할 수 있습니다.');
 let booster=null;if(req.boosterId){booster=t.units.find(x=>x.id===req.boosterId);requireGame(booster&&booster.id!==u.id&&!ids.includes(booster.id)&&[6,8,12].includes(booster.sides),'같은 도시의 D6·D8·D12 중 다른 병력 1명을 선택해 주세요. 대기 중인 장수도 재료로 사용할 수 있습니다.');}
 requireGame(t.units.length-cost-Number(!!booster)-1>=1,'재료와 강화 대상 외에 주둔 병력 1명을 남겨 주세요.');return {t,u,cost,material,booster,chance:enhanceChance(u,booster),failureLimit:ENHANCEMENT.failures[u.sides]};
}
export function applyEnhancement(raw,uid,req,at,draw){
 const s=normalizeWorld(raw),ledger=JSON.parse(s.enhancementLedger||'{}');requireGame(/^[\w-]{8,100}$/.test(req.id||''),'강화 요청 번호를 확인해 주세요.');
 if(ledger[req.id]){requireGame(ledger[req.id].uid===uid,'다른 군주의 요청입니다.');return {world:s,result:ledger[req.id]};}
 const p=s.players[uid];requireGame(p,'군주 정보를 확인해 주세요.');requireGame(Number.isInteger(req.seq)&&req.seq>=0&&req.seq<1e9&&req.seq===(p.enhanceSeq||0),'이미 처리됐거나 오래된 강화 요청입니다. 최신 전황으로 다시 확인해 주세요.');requireGame(Number.isFinite(at)&&at>=s.updatedAt,'전장 시각을 확인해 주세요.');requireGame(Number.isInteger(draw)&&draw>=0&&draw<=0xffffffff,'서버 강화 난수를 확인해 주세요.');
 const {t,u,cost,material,booster,chance,failureLimit}=enhancementPlan(s,uid,req,at),beforeLevel=levelOf(u),priorFailures=failuresOf(u),success=draw/4294967296<chance,failures=priorFailures+Number(!success),dead=!success&&failures>=failureLimit,consumed=new Set([...material.map(x=>x.id),...(booster?[booster.id]:[])]);
 const before=raw.territories[t.id],action=before.actionReadyAt;for(const x of [u,...material,...(booster?[booster]:[])])requireGame(x.readyAt>=0,'병력 기록을 확인해 주세요.');
 t.units=t.units.filter(x=>!consumed.has(x.id)&&(!dead||x.id!==u.id));if(!dead){u.enhanceLevel=success?beforeLevel+1:Math.max(0,beforeLevel-1);u.enhanceFailures=failures;}
 if(dead){p.deaths=(p.deaths||0)+1;p.enhancementDeaths=(p.enhancementDeaths||0)+1;}p.exchanged=(p.exchanged||0)+consumed.size;p.enhanceSeq=req.seq+1;
 resolveRoles(s,t,at);if(t.roles.guardTarget&&!t.units.some(x=>x.id===t.roles.guardTarget))t.roles.guardTarget='';refreshIndexes(s);
 requireGame(Math.max(0,t.units.length-capacityOf(t.id,s,at))<=Math.max(0,before.units.length-capacityOf(t.id,raw,at)),'재료 장수의 정원 효과가 사라져 주둔 한도를 초과합니다. 다른 재료를 골라 주세요.');
 if(t.units.length<capacityOf(t.id,s,at)&&!t.nextRecruitAt)t.nextRecruitAt=at+(t.cycleMs||600000);t.actionReadyAt=action;t.revision++;
 const result={id:req.id,uid,seq:req.seq,at,city:t.id,unitId:u.id,name:u.name,sides:u.sides,beforeLevel,level:dead?0:u.enhanceLevel,failures,failureLimit,success,dead,chance,materials:[...consumed],booster:booster?{id:booster.id,name:booster.name,sides:booster.sides}:null};ledger[req.id]=result;s.enhancementLedger=JSON.stringify(Object.fromEntries(Object.entries(ledger).sort((a,b)=>b[1].at-a[1].at||b[1].seq-a[1].seq).slice(0,100)));
 s.history[req.id]={id:req.id,actor:uid,at,type:'enhance',from:t.id,to:t.id,text:`${p.name} · ${placeInfo(t.id).ko} · ${u.name}(D${u.sides}) ${dead?'누적 실패 한도 도달 · 강화 전사':success?'강화 성공 +'+beforeLevel+'→+'+u.enhanceLevel:'강화 실패 +'+beforeLevel+'→+'+u.enhanceLevel} · 실패 ${failures}/${failureLimit}`,enhancement:result};s.history=Object.fromEntries(Object.entries(s.history).sort((a,b)=>b[1].at-a[1].at).slice(0,100));
 const revision=s.revision++;s.updatedAt=at;s.command={id:req.id,type:'enhance',actor:uid,at,baseRevision:revision,protocol:6,enhancementProtocol:1};return {world:normalizeWorld(s),result};
}
