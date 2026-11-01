import {normalizeWorld,refreshIndexes,reconcileRoles,capacityOf,isLocked} from '../src/engine-next.js';
import {EFFECTS,newEffectState} from '../src/hero-effects-next.js';import {stampUnit} from '../src/role-policy.js';import {requireGame,placeInfo} from '../src/game-core.js';
export function claimReward(raw,uid,ticket,city,at,randomIndex){
 const s=normalizeWorld(raw),claims=JSON.parse(s.rewardClaims||'{}');if(claims[ticket.id])return {world:s,claim:claims[ticket.id]};
 requireGame(ticket.uid===uid&&ticket.season===s.season.id&&ticket.tier===12&&ticket.status==='available','사용 가능한 D12 랜덤권이 아닙니다.');requireGame(!s.season.endedAt&&(!s.season.deadline||at<s.season.deadline),'종료된 시즌에서는 사용할 수 없습니다.');
 const t=s.territories[city];requireGame(t?.owner===uid&&!isLocked(s,city),'전투 중이 아닌 내 도시를 선택해 주세요.');
 const pool=EFFECTS.filter(e=>e.sides===12&&!s.heroIndex[e.id]);requireGame(pool.length,'미등장 D12 무장이 없습니다. 사용권은 보존됩니다.');
 const cap=capacityOf(city,s,at);requireGame(t.units.length<=cap,'도시 정원을 먼저 확인해 주세요.');
 if(t.units.length===cap){const cost=t.units.findIndex(u=>u.sides===4);requireGame(cost>=0,'빈자리나 교환할 D4 병사 1명이 필요합니다.');t.units.splice(cost,1);s.players[uid].exchanged=(s.players[uid].exchanged||0)+1;}
 const e=pool[randomIndex%pool.length],u=stampUnit({id:'reward:'+ticket.id,name:e.name,sides:12,heroId:e.id,heroVersion:2,effectState:newEffectState(),readyAt:at+600000},at,city);u.moveReadyAt=at+600000;t.units.push(u);t.revision++;if(t.units.length>=capacityOf(city,s,at))t.nextRecruitAt=0;
 reconcileRoles(s,at);refreshIndexes(s);const claim={name:e.name,heroId:e.id,unitId:u.id,city,at};claims[ticket.id]=claim;s.rewardClaims=JSON.stringify(claims);
 s.history[ticket.id]={id:ticket.id,type:'hero',actor:uid,at,to:city,unit:structuredClone(u),text:s.players[uid].name+' 군주가 D12 보상 랜덤권으로 '+placeInfo(city).ko+'에서 '+e.name+'(D12)을 맞이했습니다.'};
 s.history=Object.fromEntries(Object.entries(s.history).sort((a,b)=>b[1].at-a[1].at).slice(0,100));const revision=s.revision++;s.updatedAt=at;s.command={id:ticket.id,type:'aiBatch',actor:'reward-system',at,baseRevision:revision};return {world:normalizeWorld(s),claim};
}
