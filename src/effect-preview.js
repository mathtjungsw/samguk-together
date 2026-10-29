import {effectOf,effectNumber,effectStatus,preparedSince,reusable} from './hero-effects.js';
import {adjacent,MINUTE} from './game-core.js';
// Visible conditions share the same inputs and predicate with actual scoring.
export function battleCondition(s,from,to,own,enemy,u,at,attack=true){
  const n=effectNumber(u),num=own.length,foes=enemy.length,inf=own.filter(u=>u.sides===4),off=own.filter(u=>[6,8,12].includes(u.sides)),ruler=own.some(u=>u.sides===20),less=num<foes,adj=adjacent(to).filter(id=>s.territories[id].owner===s.territories[from].owner).length;
  const conditions={4:enemy.some(x=>x.sides>=6),5:less,7:num<=6,10:foes>=num*2,17:at-Math.max(preparedSince(s.territories[to],u,true),u.effectState.lastProcAt||0)>=30*MINUTE,20:foes<=4,21:adj>=2,24:inf.length>=4,28:at-preparedSince(s.territories[to],u,true)>=20*MINUTE,31:foes-num>=2,35:inf.length>=3,37:enemy.some(x=>x.sides===4),38:off.length>=2,42:ruler,44:num<=5,45:!s.territories[to].owner,51:num<=5,55:off.length>=2,56:less,58:inf.length>=4,60:!s.territories[to].owner,61:num>foes,63:foes<=4,64:num<=4,68:num<=4,69:enemy.some(x=>[12,20].includes(x.sides)),70:less,72:new Set(own.map(x=>x.sides)).size>=3,75:num>=6,76:!ruler,78:inf.length>=3,79:own.some(x=>x.sides===12),98:adj>=2,99:inf.length>=1};
  if(u.heroVersion===2)Object.assign(conditions,{70:true,101:inf.length>=4,103:ruler,108:at-preparedSince(s.territories[to],u,true)>=10*MINUTE,109:enemy.some(x=>x.sides===4)&&enemy.filter(x=>x.sides===4).length>=3,112:adj>=2,115:num<=foes,116:!!s.territories[to].owner&&adj>=2,117:inf.length>=4,118:less,119:!!u.effectState?.lastAttackWon&&at-u.effectState.lastAttackAt<=30*MINUTE,120:inf.length>=3,121:less,123:num<=4,125:num<=4,126:!s.territories[to].owner,127:enemy.some(x=>[12,20].includes(x.sides)),128:at-preparedSince(s.territories[to],u,true)>=20*MINUTE,143:ruler,144:inf.length>=3,146:inf.length>=3});
  const after=[6,11,27,33,40,50,77,147];
  const uncertain=[8,9,12,14,15,18,19,29,32,34,39,43,62,65,67,73,87,91,95,96,97,16];
  const met=conditions[n]??(after.includes(n)||uncertain.includes(n)?null:true);
  const label=after.includes(n)?'패전 시 판정':met===false?'조건 미충족 · 이번 효과 없음':met===null?'주사위 결과에 따라 판정':'조건 충족 · 점수 상한 내 반영';
  return {met,label,context:`아군 ${num}명 · 적군 ${foes}명 · 편성 ${[...new Set(own.map(x=>x.sides))].sort((a,b)=>a-b).map(n=>'D'+n).join('·')}`,state:effectStatus(u,at)};
}
