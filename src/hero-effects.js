import EFFECTS from './data/hero-effects.json' with {type:'json'};
import {MINUTE,RULES,baseCapacity,placeInfo,adjacent,ownedTerritories,seededRandom,rawScore,sumRoll,byId} from './game-core.js';
export {EFFECTS};
export const heroByName=new Map(EFFECTS.map(e=>[e.name,e]));
export const heroById=new Map(EFFECTS.map(e=>[e.id,e]));
export const effectOf=u=>u?.heroId?heroById.get(u.heroId):undefined;
export const effectNumber=u=>effectOf(u)?.number||0;
export const newEffectState=()=>({recruits:0,attacks:0,wins:0,escapes:0,lastProcAt:0,hasProc:false,firstGift:false,lastAttackAt:0,lastAttackWon:false,captured:{},defended:{},capacityStamp:0});
export function stateOf(u){return u.effectState??=newEffectState();}
export const reusable=(u,at,minutes)=>!u.effectState?.hasProc||at-u.effectState.lastProcAt>=minutes*MINUTE;
export function markProc(u,at){const st=stateOf(u);st.hasProc=true;st.lastProcAt=at;}
export function governor(s,t,at){const u=t.units.find(u=>u.id===t.roles?.governor);return u&&u.readyAt<=at&&effectOf(u)?.economic?u:null;}
export const preparedSince=(t,u,defense=false)=>Math.max(u.readyAt,t.roles?.[defense?'defenseSince':'governorSince']||0);
export function economy(s,t,at){
  let interval=RULES.recruitMs,capacity=baseCapacity(t.id),d6=0,d8=0;
  const u=governor(s,t,at),n=effectNumber(u),since=u?preparedSince(t,u):at;
  if(n===2)interval=8*MINUTE;
  if(n===48&&placeInfo(t.id).rank!=='normal')interval=9*MINUTE;
  if(n===52)interval=9.5*MINUTE;
  if(n===3)capacity+=3;
  if(n===47)capacity+=2;
  if(n===53||n===94&&at-since>=30*MINUTE)capacity++;
  if(n===13)d6=400;
  if(n===54&&ownedTerritories(s,t.owner).length<=3)d6=200;
  if(n===66)d6=100;
  if(n===74)d8=50;
  if(t.owner)for(const other of ownedTerritories(s,t.owner)){
    if(other.id===t.id||other.roles?.support!==t.id||!adjacent(other.id).includes(t.id))continue;
    const supporter=governor(s,other,at),kind=effectNumber(supporter);
    if(kind===71)d6=Math.max(d6,100);
    if(kind===85)interval=Math.min(interval,9.5*MINUTE);
  }
  return {interval,capacity,probabilities:[9000-d6-d8,700+d6,250+d8,50]};
}
export function regularRecruitBonus(s,t,at){
  const u=governor(s,t,at);if(!u)return null;
  const n=effectNumber(u),st=stateOf(u);st.recruits++;
  if(n===1&&st.recruits%3===0||n===49&&st.recruits%6===0||n===92&&st.recruits%10===0)return u;
  if(n===86&&at-Math.max(preparedSince(t,u),t.lastAttackAt||0,st.lastProcAt||0)>=60*MINUTE){markProc(u,at);return u;}
  return null;
}
export function battleOfficers(t,units,ids,at,attack){
  const chosen=ids??(attack?[]:t.roles?.defense||[]);
  return [...new Set(chosen)].slice(0,2).map(id=>units.find(u=>u.id===id)).filter(u=>u&&u.readyAt<=at&&effectOf(u)?.battle&&effectOf(u)[attack?'attack':'defense']);
}
const sorted=(units,high=false)=>units.slice().sort((a,b)=>(high?b.originalRoll-a.originalRoll:a.originalRoll-b.originalRoll)||byId(a,b));
const infantry=units=>units.filter(u=>u.sides===4);
const officers=units=>units.filter(u=>[6,8,12].includes(u.sides));
const hasRuler=units=>units.some(u=>u.sides===20);
const emptyLedger=()=>({bonus:0,flat:0,cost:0,logs:[]});

// A single pure evaluator drives real combat and independent probability samples.
// Every die retains its original value; caps are visible score adjustments.
export function evaluateBattle({s,from,to,attackUnits,defendUnits,attackIds=[],defenseIds,at,seed=0,rolls=null}){
  const rng=seededRandom(seed),roll=(units,side)=>units.map((u,i)=>({...structuredClone(u),originalRoll:rolls?.[side]?.[i]??(1+Math.floor(rng()*u.sides)),roll:0})).map(u=>({...u,roll:u.originalRoll}));
  const a={attack:true,dice:roll(attackUnits,'attack'),coefficient:.9,chosen:[],ledger:new Map(),penalty:0,flatPenalty:0,cancel:0,relief:0,rerolled:new Set(),used:[]};
  const d={attack:false,dice:roll(defendUnits,'defense'),coefficient:1,chosen:[],ledger:new Map(),penalty:0,flatPenalty:0,cancel:0,relief:0,rerolled:new Set(),used:[]};
  a.chosen=battleOfficers(s.territories[from],a.dice,attackIds,at,true);
  d.chosen=battleOfficers(s.territories[to],d.dice,defenseIds,at,false);
  const ledger=(side,u)=>{if(!side.ledger.has(u.id))side.ledger.set(u.id,{...emptyLedger(),name:u.name,number:effectNumber(u)});return side.ledger.get(u.id);};
  const ownChange=(side,u,fn,label)=>{const before=rawScore(sumRoll(side.dice),side.attack),l=ledger(side,u);fn();const diff=rawScore(sumRoll(side.dice),side.attack)-before;if(diff>=0)l.bonus+=diff;else l.cost+=diff;if(diff)l.logs.push(`${u.name} · ${label} ${diff>0?'+':''}${diff}`);};
  const flat=(side,u,value,label)=>{const l=ledger(side,u);l.flat+=value;if(value)l.logs.push(`${u.name} · ${label} +${value}`);};
  const enemyCount=(side,enemy)=>enemy.dice.length;
  const adjCount=()=>adjacent(to).filter(id=>s.territories[id].owner===s.territories[from].owner).length;
  const all=[...a.chosen.map(u=>[a,d,u]),...d.chosen.map(u=>[d,a,u])].sort((x,y)=>effectNumber(x[2])-effectNumber(y[2])||byId(x[2],y[2]));
  const effectRng=u=>seededRandom(`${seed}:effect:${u.id}:${effectNumber(u)}`);
  // Rerolls first; Zhuge Liang reserves dice before Xun You.
  for(const [side,enemy,u] of all.slice().sort((x,y)=>(effectNumber(x[2])===18?-1:effectNumber(y[2])===18?1:effectNumber(x[2])-effectNumber(y[2])))){
    const n=effectNumber(u),rng2=effectRng(u);let targets=[];
    if(n===12)targets=side.dice.filter(x=>x.sides===20&&x.roll<=7).slice(0,1);
    if(n===18)targets=side.dice.filter(x=>[4,6].includes(x.sides)&&x.roll<=x.sides/2).sort((x,y)=>x.originalRoll/x.sides-y.originalRoll/y.sides||byId(x,y)).slice(0,3);
    if(n===39)targets=[u];
    if(n===67)targets=sorted(infantry(side.dice).filter(x=>x.roll===1)).slice(0,1);
    for(const target of targets)if(!side.rerolled.has(target.id)){side.rerolled.add(target.id);ownChange(side,u,()=>{target.roll=Math.max(target.roll,1+Math.floor(rng2()*target.sides));},'재굴림');}
  }
  for(const [side,enemy,u] of all){
    const n=effectNumber(u),num=side.dice.length,foes=enemyCount(side,enemy),st=stateOf(u),inf=infantry(side.dice),less=num<foes,attack=side.attack;
    const plus=(value,label='특기')=>flat(side,u,value,label);
    const self=value=>ownChange(side,u,()=>{u.roll=Math.min(u.sides,u.roll+value);},'본인 눈');
    const addDie=(target,value)=>{if(target)ownChange(side,u,()=>{target.roll=Math.min(target.sides,target.roll+value);},'아군 눈');};
    if(n===4&&enemy.dice.some(x=>x.sides>=6))plus(4);
    if(n===5&&less)plus(5);
    if(n===7&&num<=6)plus(5);
    if(n===8)ownChange(side,u,()=>{u.roll=Math.max(u.roll,Math.min(8,u.sides));},'최저 눈');
    if(n===9)self(4);
    if(n===10&&foes>=num*2)plus(6);
    if(n===17&&at-Math.max(preparedSince(s.territories[to],u,true),st.lastProcAt||0)>=30*MINUTE){plus(6);side.used.push({id:u.id,type:'proc'});}
    if(n===20&&foes<=4)plus(6);
    if(n===21&&adjCount()>=2)plus(3);
    if(n===23)plus(2);
    if(n===24&&inf.length>=4)for(const target of sorted(inf).slice(0,2))ownChange(side,u,()=>{target.roll=Math.max(target.roll,2);},'군율');
    if(n===26)plus(3);
    if(n===28&&at-preparedSince(s.territories[to],u,true)>=20*MINUTE)plus(3);
    if(n===29)self(2);
    if(n===30){const first=!st.defended[to],initial=!Object.keys(st.defended).length;if(!first)plus(1);else if(initial||at-preparedSince(s.territories[to],u,true)>=20*MINUTE)plus(4);}
    if(n===31&&foes-num>=2)plus(4);
    if(n===32)plus(st.lastAttackWon&&at-st.lastAttackAt<=30*MINUTE?3:1);
    if(n===34)self(Math.min(2,st.attacks));
    if(n===35&&inf.length>=3)self(2);
    if(n===37&&infantry(enemy.dice).length)ownChange(side,u,()=>{u.roll=Math.max(1,u.roll-1);},'화공 비용');
    if(n===38&&officers(side.dice).length>=2)plus(2);
    if(n===42&&hasRuler(side.dice))plus(3);
    if(n===44&&num<=5)plus(4);
    if(n===45&&!s.territories[to].owner)plus(3);
    if(n===51&&num<=5)plus(2);
    if(n===55&&officers(side.dice).length>=2)plus(1);
    if(n===56&&less)plus(2);
    if(n===58&&inf.length>=4)plus(2);
    if(n===60&&!s.territories[to].owner)plus(2);
    if(n===61&&num>foes)plus(2);
    if(n===62)self(1);
    if(n===63&&foes<=4)plus(2);
    if(n===64&&num<=4)plus(2);
    if(n===65)side.cancel+=1;
    if(n===68&&num<=4)plus(2);
    if(n===69&&enemy.dice.some(x=>x.sides===12||x.sides===20))plus(2);
    if(n===70&&less)side.cancel+=2;
    if(n===72&&new Set(side.dice.map(x=>x.sides)).size>=3)plus(2);
    if(n===75&&num>=6)plus(1);
    if(n===76&&!hasRuler(side.dice))plus(2);
    if(n===78&&inf.length>=3)addDie(sorted(inf)[0],1);
    if(n===79){const target=sorted(side.dice.filter(x=>x.sides===12))[0];addDie(target,target?.name==='관우'?2:1);}
    if(n===87)side.relief+=1;
    if(n===91)self(st.wins>=4?2:st.wins>=2?1:0);
    if(n===95&&u.roll===1)ownChange(side,u,()=>{u.roll=Math.min(3,u.sides);},'궁리');
    if(n===96&&u.originalRoll===6)plus(2);
    if(n===99)addDie(sorted(inf)[0],1);
    if(n===19)side.cancel+=4;
  }
  for(const [side,enemy,u] of all){const n=effectNumber(u);if((n===16||n===73)&&side.attack){const coefficient=n===16?1:.92;if(coefficient>side.coefficient){const gain=rawScore(sumRoll(side.dice),true,coefficient)-rawScore(sumRoll(side.dice),true,side.coefficient);side.coefficient=coefficient;const l=ledger(side,u);l.bonus+=Math.min(n===16?8:2,gain);if(gain)l.logs.push(`${u.name} · 공격 감산 완화 +${Math.min(n===16?8:2,gain)}`);}}}
  for(const [side,enemy,u] of all){
    const n=effectNumber(u);let targets=[],delta=0,setOne=false;
    if(n===14){targets=enemy.dice.slice().sort((x,y)=>y.sides-x.sides||y.originalRoll-x.originalRoll||byId(x,y)).slice(0,1);delta=3;}
    if(n===15||n===37){targets=sorted(infantry(enemy.dice),true).slice(0,2);delta=2;}
    if(n===43){targets=sorted(infantry(enemy.dice),true).slice(0,1);setOne=true;}
    if(n===97){targets=sorted(infantry(enemy.dice),true).slice(0,1);delta=1;}
    for(const target of targets){const before=rawScore(sumRoll(enemy.dice),enemy.attack,enemy.coefficient);target.roll=setOne?1:Math.max(1,target.roll-delta);const diff=before-rawScore(sumRoll(enemy.dice),enemy.attack,enemy.coefficient);enemy.penalty+=diff;if(diff)ledger(side,u).logs.push(`${u.name} · 적 눈 감소 -${diff}`);}
    if(n===98&&adjCount()>=2){enemy.flatPenalty++;ledger(side,u).logs.push(`${u.name} · 포위 감점 -1`);}
  }
  const finish=(side,enemy)=>{
    let cancel=enemy.cancel;
    const entries=[...side.ledger.values()];for(const l of entries){const removed=Math.min(l.flat,cancel);l.flat-=removed;cancel-=removed;if(removed)l.logs.push(`상대 책략으로 가산 ${removed} 무효`);}
    const baseRaw=side.dice.reduce((n,u)=>n+u.originalRoll,0),base=rawScore(baseRaw,side.attack),bonus=Math.min(10,entries.reduce((n,l)=>n+Math.min(8,Math.max(0,l.bonus+l.flat)),0)),cost=entries.reduce((n,l)=>n+l.cost,0),penalty=Math.min(6,side.penalty+Math.max(0,side.flatPenalty-side.relief));
    return {dice:side.dice,baseRaw,baseScore:base,bonus,cost,penalty,score:Math.max(1,base+bonus+cost-penalty),logs:entries.flatMap(l=>l.logs),used:side.used,chosen:side.chosen.map(u=>u.id)};
  };
  return {attack:finish(a,d),defense:finish(d,a)};
}

export function moveTiming(s,a,b,units,at,officerId,returning=[]){
  const actor=units.find(u=>u.id===officerId&&effectOf(u)?.movement),n=effectNumber(actor),delays=Object.fromEntries(units.map(u=>[u.id,10*MINUTE])),returnDelays=Object.fromEntries(returning.map(u=>[u.id,10*MINUTE]));let sourceDelay=10*MINUTE;
  const inf=units.filter(u=>u.sides===4).sort(byId),set=(u,minutes)=>{if(u)delays[u.id]=minutes*MINUTE;};
  if(n===22){set(actor,8);inf.slice(0,2).forEach(u=>set(u,8));}
  if(n===82)inf.slice(0,2).forEach(u=>set(u,9));
  if(n===83)set(actor,7);
  if(n===88)sourceDelay=9*MINUTE;
  if(n===93)inf.slice(0,1).forEach(u=>set(u,8));
  if(n===100){set(actor,9);inf.slice(0,1).forEach(u=>set(u,9));}
  const reverse=returning.slice().sort(byId)[0];if(n===80&&reverse&&reusable(actor,at,720)){returnDelays[reverse.id]=8*MINUTE;markProc(actor,at);}
  const receiver=governor(s,b,at);
  if(effectNumber(receiver)===90&&inf.length>=3&&reusable(receiver,at,10)){delays[inf[0].id]=Math.min(delays[inf[0].id],8*MINUTE);markProc(receiver,at);}
  return {delays,returnDelays,sourceDelay};
}

export function effectStatus(u,at){
  const e=effectOf(u);if(!e)return u.sides===20?'플레이어 군주 · D20':u.legacy?'기존 동급 병력 · 고유 효과 없음':'일반 병사';
  const st=u.effectState||newEffectState();let text='';
  if([6,40,77].includes(e.number))text=`탈출 ${Math.max(0,(e.number===6?2:1)-st.escapes)}회 남음`;
  if(e.number===50)text=`50% 탈출 · 성공 ${Math.max(0,2-st.escapes)}회 남음`;
  if([11,27,33].includes(e.number))text='생애 1회 희생 호위';
  if([34,91].includes(e.number))text=`공격 ${st.attacks}회 · 승리 ${st.wins}회`;
  if([57,59,80,84,90].includes(e.number)&&st.hasProc){const mins=e.number===57?1440:e.number===90?10:720;const left=st.lastProcAt+mins*MINUTE-at;if(left>0)text=`다음 발동 약 ${Math.ceil(left/MINUTE)}분`;}
  return text||e.category;
}
