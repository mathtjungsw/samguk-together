import {normalizeWorld,refreshIndexes,reconcileRoles,capacityOf,isLocked} from './engine-next.js';
import {rosterFor} from './hero-catalog.js';import {newEffectState} from './hero-effects-next.js';
import {stampUnit} from './role-policy.js';import {requireGame,placeInfo} from './game-core.js';
export function sparkReward(raw,uid,id,city,at,draw){
 const s=normalizeWorld(raw),ticket=s.sparkTickets?.[uid]?.[id],claims=JSON.parse(s.rewardClaims||'{}');if(claims[id])return {world:s,result:claims[id]};
 requireGame(ticket?.uid===uid&&ticket.season===s.season.id&&ticket.status==='available'&&ticket.tier===12,'사용 가능한 D12 랜덤권을 확인해 주세요.');
 requireGame(!s.season.endedAt&&at<s.season.deadline,'종료된 시즌에서는 사용할 수 없습니다.');
 const t=s.territories[city];requireGame(t?.owner===uid&&!isLocked(s,city),'내 도시를 선택해 주세요.');
 const pool=rosterFor(s).filter(e=>e.sides===12&&!s.heroIndex[e.id]);requireGame(pool.length,'미등장 D12가 없습니다. 사용권은 보존됩니다.');
 const cap=capacityOf(city,s,at);requireGame(t.units.length<=cap,'도시 정원을 먼저 확인해 주세요.');if(t.units.length===cap){const cost=t.units.findIndex(u=>u.sides===4);requireGame(cost>=0,'빈자리나 D4 병사 1명이 필요합니다.');t.units.splice(cost,1);s.players[uid].exchanged++;}
 const e=pool[draw%pool.length],u=stampUnit({id:'reward:'+id,name:e.name,sides:12,heroId:e.id,heroVersion:3,effectState:newEffectState(),readyAt:at+600000},at,city);u.moveReadyAt=at+600000;t.units.push(u);t.revision++;if(t.units.length>=cap)t.nextRecruitAt=0;
 refreshIndexes(s);reconcileRoles(s,at);const claim={name:e.name,heroId:e.id,unitId:u.id,city,at};claims[id]=claim;s.rewardClaims=JSON.stringify(claims);ticket.status='claimed';ticket.claim=claim;
 s.history[id]={id,type:'hero',actor:uid,at,to:city,unit:structuredClone(u),text:s.players[uid].name+' 군주가 D12 보상으로 '+placeInfo(city).ko+'에서 '+e.name+'(D12)을 맞이했습니다.'};
 s.history=Object.fromEntries(Object.entries(s.history).sort((a,b)=>b[1].at-a[1].at).slice(0,100));s.command={id,type:'claimTicket',actor:uid,at,baseRevision:s.revision++,protocol:6,enhancementProtocol:1};s.updatedAt=at;return {world:normalizeWorld(s),result:claim};
}
