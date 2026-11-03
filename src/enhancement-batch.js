import {applyEnhancement,enhancementPlan} from './enhancement-actions.js';
import {levelOf,enhanceCost} from './enhancement-policy.js';
import {requireGame,byId} from './game-core.js';
export const ENHANCEMENT_BATCH_LIMIT=32;
export function selectEnhancementRequests(s,uid,city,unitIds,boosters={},idFor=()=>crypto.randomUUID(),at=Math.max(s.updatedAt,Date.now())){
 requireGame(Array.isArray(unitIds)&&unitIds.length>0&&unitIds.length<=ENHANCEMENT_BATCH_LIMIT&&new Set(unitIds).size===unitIds.length,'강화할 병력을 선택해 주세요.');
 const t=s.territories[city],chosen=new Set(unitIds),boosterIds=unitIds.map(id=>boosters[id]).filter(Boolean),reserved=new Set(boosterIds);
 requireGame(t?.owner===uid,'내 도시를 선택해 주세요.');
 requireGame([...reserved].every(id=>!chosen.has(id))&&reserved.size===boosterIds.length,'강화 대상이나 같은 장수를 보조 재료로 중복 사용할 수 없습니다.');
 const pool=t.units.filter(u=>u.sides===4&&!levelOf(u)&&!chosen.has(u.id)&&!reserved.has(u.id)).sort((a,b)=>a.arrivedAt-b.arrivedAt||a.createdAt-b.createdAt||byId(a,b));
 let used=0;const reqs=unitIds.map((unitId,i)=>{const u=t.units.find(u=>u.id===unitId);requireGame(u,'현재 도시에 없는 병력입니다.');const cost=enhanceCost(u),req={id:idFor(i),seq:(s.players[uid]?.enhanceSeq||0)+i,city,unitId,materialIds:pool.slice(used,used+cost).map(u=>u.id),boosterId:boosters[unitId]||'',expectedLevel:levelOf(u),expectedFailures:u.enhanceFailures||0};used+=cost;enhancementPlan(s,uid,req,at);return req;});
 requireGame(t.units.length-used-reserved.size-unitIds.length>=1,'모든 재료와 선택 병력이 전사해도 주둔 병력 1명은 남아야 합니다. 선택 인원을 줄여 주세요.');return reqs;
}
export function applyLocalEnhancementBatch(raw,uid,items,at){
 requireGame(Array.isArray(items)&&items.length>0&&items.length<=ENHANCEMENT_BATCH_LIMIT,'한 번에 최대32회 강화할 수 있습니다.');
 requireGame(new Set(items.map(r=>r.id)).size===items.length,'강화 요청 번호가 중복됩니다.');
 let world=raw;const results=[];
 for(const r of items){
  requireGame(r&&/^[\w-]{8,100}$/.test(r.id||'')&&Number.isInteger(r.draw)&&r.draw>=0&&r.draw<=0xffffffff,'로컬 강화 추첨을 확인해 주세요.');
  const receipt=JSON.parse(world.enhancementLedger||'{}')[r.id];
  if(!receipt){const u=world.territories[r.city]?.units.find(u=>u.id===r.unitId);requireGame(u&&levelOf(u)===r.expectedLevel&&(u.enhanceFailures||0)===r.expectedFailures,'강화 대상이 바뀌었습니다. 최신 병력으로 다시 선택해 주세요.');}
  const out=applyEnhancement(world,uid,r,Math.max(at,world.updatedAt),r.draw);world=out.world;results.push(out.result);
 }
 return {world,results};
}
