import {catalogEffect} from './hero-catalog.js';
import {hash32,adjacent} from './game-core.js';
const effect=catalogEffect;
export function officerOrder(seed,key='role') {
  return (a,b)=>b.sides-a.sides||(a.arrivedAt||0)-(b.arrivedAt||0)||(a.createdAt||0)-(b.createdAt||0)||hash32(`${seed}:${key}:${a.id}`)-hash32(`${seed}:${key}:${b.id}`)||a.id.localeCompare(b.id);
}
export function chooseOfficers(s,t,units,kind,at,limit=1){
  return units.filter(u=>{const e=effect(u);return e&&u.readyAt<=at&&(kind==='attack'||kind==='defense'?e.battle&&e[kind]:e[kind]);}).sort(officerOrder(s.seed,`${t.id}:${kind}`)).slice(0,limit);
}
export const hasSupport=t=>t.units.some(u=>[71,85,142].includes(effect(u)?.number));
export const hasGuard=t=>t.units.some(u=>effect(u)?.number===33);
export function resolveRoles(s,t,at){
  const r=t.roles;
  if(!t.owner)return;
  const gov=chooseOfficers(s,t,t.units,'economic',at)[0]?.id||'',defense=chooseOfficers(s,t,t.units,'defense',at,2).map(u=>u.id);
  if(gov!==r.governor){r.governor=gov;r.governorSince=at;}
  if([...defense].sort().join('|')!==[...r.defense].sort().join('|')){r.defense=defense;r.defenseSince=at;}
  r.policyVersion=1;r.policySeed=s.seed;r.retreat='';
  r.governorSlot=t.units.findIndex(u=>u.id===r.governor);r.defenseSlots=r.defense.map(id=>t.units.findIndex(u=>u.id===id));
  const targets=adjacent(t.id).filter(id=>s.territories[id].owner===t.owner);
  if(r.supportManual&&!targets.includes(r.supportManual))r.supportManual='';
  if(!hasSupport(t)){r.support='';}
  else if(r.supportManual)r.support=r.supportManual;
  else if(!targets.includes(r.support)){r.support=targets.sort((a,b)=>hash32(`${s.seed}:support:${t.id}:${t.generation}:${a}`)-hash32(`${s.seed}:support:${t.id}:${t.generation}:${b}`)||a.localeCompare(b))[0]||'';}
  if(!t.units.some(u=>u.id===r.guardTarget&&effect(u)?.number!==33&&[6,8,12].includes(u.sides)))r.guardTarget='';
}
export function stampUnit(u,at,territoryId){
  u.createdAt??=at;u.moveReadyAt??=0;u.arrivedAt=at;u.stationTerritoryId=territoryId;return u;
}
export function inheritedCreatedAt(u,s,cutoff){
  const m=/^(?:recruit|bonus):[^:]+:\d+:(\d{12,13})(?::|$)/.exec(u.id);
  if(m&&Number(m[1])<=cutoff)return Number(m[1]);
  for(const p of Object.values(s.players))if(u.id.startsWith(`${p.uid}:life:${p.life}:`)&&!u.id.includes(':ruler:')&&p.startedAt>0)return p.startedAt;
  return cutoff;
}
