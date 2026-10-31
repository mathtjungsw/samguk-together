// Pure lifecycle policy; independent of rendering, transport and wall-clock timers.
import {MAP,livingUnits} from './game-core.js';
export const SEASON_MS=72*3600000,BREAK_MS=3600000;
export const conquestTarget=Math.ceil(MAP.places.length*.8);
export function armyCounts(s,uid){const units=livingUnits(s,uid),tiers={6:0,8:0,12:0};for(const u of units)if(u.sides in tiers)tiers[u.sides]++;return {heroes:tiers[6]+tiers[8]+tiers[12],tiers};}
export function seasonRows(s){return Object.values(s.players).map(p=>({...p,territories:Object.values(s.territories).filter(t=>t.owner===p.uid).length,army:livingUnits(s,p.uid).length,...armyCounts(s,p.uid)}));}
export function finishSeason(s,at,reason){
  if(s.season?.endedAt)return false;
  const rows=seasonRows(s).sort((a,b)=>b.territories-a.territories||a.name.localeCompare(b.name,'ko')||a.uid.localeCompare(b.uid)),max=rows[0]?.territories||0;
  const winners=max?rows.filter(p=>p.territories===max).map(p=>p.uid):[];
  s.season={...s.season,endedAt:at,nextStartAt:at+BREAK_MS,reason,winners};
  const keys=new Map(rows.map((p,i)=>[p.uid,'ruler-'+i]));let rank=0;
  s.season.result={id:s.season.id,title:`시즌 ${s.season.number}`,endedAt:at,featureVersion:s.featureVersion,reason,winners:winners.map(id=>keys.get(id)),rankings:rows.map((p,i)=>{if(!i||p.territories!==rows[i-1].territories)rank=i+1;return {id:keys.get(p.uid),rank,name:p.name,color:p.color,...(Number.isInteger(p.colorSlot)?{colorSlot:p.colorSlot}:{}),territories:p.territories,army:p.army,heroes:p.heroes,tiers:p.tiers,kills:p.kills||0,deaths:p.deaths||0};}),territories:MAP.places.map(p=>({id:p.id,owner:keys.get(s.territories[p.id].owner)||'',army:s.territories[p.id].units.length}))};
  return true;
}
export function seasonVictory(s){const x=s.season;if(!x?.endedAt)return null;const names=(x.winners||[]).map(id=>s.players[id]?.name||'군주'),who=names.join(' · ');return {title:!names.length?'이번 쟁패가 막을 내렸습니다':names.length>1?'천하의 영광을 나누다':x.reason==='conquest'?`천하의 패자, ${who}`:`사흘 쟁패의 승자, ${who}`,text:!names.length?'이번 시즌은 패권을 겨룬 군주 없이 막을 내렸습니다. 다음 전장에서 다시 만나요.':names.length>1?`난세의 군웅이 사흘을 겨루었으나 강토의 크기는 우열을 가리지 못했습니다. ${who}, 여러 군주의 위업을 함께 역사에 새깁니다.`:x.reason==='conquest'?`${who} 군주께서 난세를 평정하고 천하의 패업을 이루셨습니다. 그 이름을 삼국지 지난 역사에 길이 새깁니다!`:`사흘의 쟁패 끝에 가장 넓은 강토를 거머쥔 ${who} 군주께 천하의 영광을 바칩니다. 그 위업을 삼국지 지난 역사에 길이 새깁니다!`};}
export function closeIfWon(s,now){if(!s.season||s.season.endedAt)return false;const max=Math.max(0,...seasonRows(s).map(p=>p.territories));return s.season.deadline>0&&now>=s.season.deadline?finishSeason(s,s.season.deadline,'time'):max>=conquestTarget?finishSeason(s,now,'conquest'):false;}
export const seasonClosed=(s,now)=>!!s?.season&&(!!s.season.endedAt||s.season.deadline>0&&now>=s.season.deadline);
