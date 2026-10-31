import {riskPolicy} from './ai-risk.js';
import {movementPlan,capacityOf,isLocked,estimateBattle,validateRevival} from './engine-next.js';
import {adjacent,ownedTerritories,livingUnits,hash32,RULES} from './game-core.js';
import {chooseOfficers,officerOrder} from './role-policy.js';
import {effectOf} from './hero-effects-next.js';
import {isAi,AI_POLICY} from './ai-world.js';
import {historyFeed} from './world-data.js';

const mean=units=>units.reduce((n,u)=>n+(u.sides+1)/2,0);
const ids=units=>units.map(u=>u.id);
const bounded=(n,max=1)=>Math.max(0,Math.min(max,n));
const front=(s,t)=>adjacent(t.id).some(id=>s.territories[id].owner!==t.owner);
export function aiThreshold(s,uid,units,target,at=s.updatedAt){
  const elapsed=Math.max(0,at-(s.players[uid].ai?.lastAttackAt??s.players[uid].ai?.bornAt??at)),relief=Math.min(.15,Math.floor(elapsed/3600000)*.05),base=target.owner&&!isAi(s.players[target.owner]) ? .80 : .75;
  return Math.max(units.some(u=>u.sides===20)?.90:0,.65,base-relief);
}
export function canAttackCountry(s,uid,target){return target.owner!==uid&&(!target.owner||isAi(s.players[target.owner])||ownedTerritories(s,target.owner).length>2);}

export function createAiPlanner(s,at,{samples=512,finalSamples=2048,estimate=estimateBattle,shouldContinue=()=>true}={}){
  // Search copies never need historical dice or casualty unit snapshots.
  s={...s,history:historyFeed(s).events};
  const cache=new Map(),counts=Object.fromEntries(Object.keys(s.players).map(uid=>[uid,ownedTerritories(s,uid).length]));
  const probability=(world,from,to,units,n=samples)=>{
    if(!shouldContinue())return {p:.5,lower:0,upper:1,approximate:true};
    // The current combat evaluator depends on these cities, neighbor ownership,
    // the attack units and the shared seed/revision. Unrelated search copies reuse it.
    const key=JSON.stringify([world.seed,world.revision,world.territories[from],world.territories[to],adjacent(to).map(id=>[id,world.territories[id].owner]),units,n]);
    if(!cache.has(key)){
      const result=estimate(world,from,to,units,[],at,n),p=result.chance;
      cache.set(key,{p,lower:result.approximate?bounded(p-2*Math.sqrt(p*(1-p)/n)):p,upper:result.approximate?bounded(p+2*Math.sqrt(p*(1-p)/n)):p,approximate:result.approximate});
    }
    return cache.get(key);
  };
  const legalUnits=(world,uid,from,to,units)=>!movementPlan(world,uid,from,to,ids(units),at).error;
  const ready=t=>t.units.filter(u=>u.readyAt<=at).sort(officerOrder(s.seed,'ai'));
  const attackFormations=(world,a,b,risk=false)=>{
    const units=ready(a).filter(u=>!risk||u.sides!==20),d4=units.filter(u=>u.sides===4),generals=units.filter(u=>[6,8,12].includes(u.sides)),ruler=units.filter(u=>u.sides===20),max=Math.max(0,a.units.length-1),forms=[];
    const safeCount=Math.max(1,Math.floor(a.units.length*(adjacent(a.id).some(id=>world.territories[id].owner&&world.territories[id].owner!==a.owner)?.6:.85)));
    const infantry=d4.slice(0,Math.min(max,safeCount));
    const attackHeroes=chooseOfficers(world,a,generals,'attack',at,2),economic=new Set(generals.filter(u=>effectOf(u)?.economic).map(u=>u.id));
    const add=list=>{const chosen=list.slice(0,max);if(chosen.length&&legalUnits(world,a.owner,a.id,b.id,chosen)&&!forms.some(x=>ids(x).sort().join('|')===ids(chosen).sort().join('|')))forms.push(chosen);};
    // At most six formations. Smallest adequate D4 force wins ties later.
    add(d4.slice(0,Math.min(max,Math.max(1,Math.ceil(mean(b.units)*1.5/2.5)))));
    add(infantry);
    add([...attackHeroes.slice(0,1),...infantry]);
    add([...attackHeroes,...infantry]);
    add([...generals.filter(u=>!economic.has(u.id)),...d4,...generals.filter(u=>economic.has(u.id))]);
    add([...ruler,...generals,...d4]);
    return forms;
  };
  const threat=(world,id,n=128)=>{
    const t=world.territories[id];if(!t.owner||t.protectionUntil>at||isLocked(world,id))return 0;
    let risk=0;
    for(const enemyId of adjacent(id)){
      const enemy=world.territories[enemyId];if(!enemy.owner||enemy.owner===t.owner||enemy.actionReadyAt>at||isLocked(world,enemyId))continue;
      const units=ready(enemy).slice(0,Math.max(0,enemy.units.length-1));
      if(units.length&&legalUnits(world,enemy.owner,enemy.id,id,units))risk=Math.max(risk,probability(world,enemy.id,id,units,n).upper);
    }
    return risk;
  };
  function scoreAttack(uid,a,b,units,p,risk=false,threshold=aiThreshold(s,uid,units,b,at)){
    const copy=structuredClone(s),src=copy.territories[a.id],dst=copy.territories[b.id],selected=new Set(ids(units));
    src.units=src.units.filter(u=>!selected.has(u.id));dst.owner=uid;dst.units=structuredClone(units).map(u=>({...u,readyAt:Math.max(u.readyAt,at+RULES.actionMs)}));dst.protectionUntil=0;
    const sourceRisk=threat(copy,a.id),counterRisk=threat(copy,b.id);
    if(sourceRisk>=.65||!risk&&counterRisk>=.8)return null;
    const maxCount=Math.max(1,...Object.values(counts)),value=bounded(capacityOf(b.id,s,at)/19),links=bounded(adjacent(b.id).filter(id=>s.territories[id].owner===uid).length/3),largest=bounded((counts[b.owner]||0)/maxCount),named=units.filter(u=>u.heroId).length/Math.max(1,units.length),ruler=Number(units.some(u=>u.sides===20));
    const retaliation=Object.values(s.history||{}).some(e=>(e.result||e.battle)?.attacker===b.owner&&(e.result||e.battle)?.defender===uid&&at-e.at<AI_POLICY.spawnMs)?1:0;
    return {from:a.id,to:b.id,unitIds:ids(units),units,probability:p,threshold,sourceRisk,counterRisk,score:40*p.lower+10*value+8*links+6*largest+4*retaliation-25*sourceRisk-15*counterRisk-10*named-10*ruler,reason:'유리한 인접 전투'};
  }
  const tie=(key,a,b)=>hash32(`${s.seed}:${Math.floor(at/AI_POLICY.decisionMs)}:${key}:${a.from}:${a.to}`)-hash32(`${s.seed}:${Math.floor(at/AI_POLICY.decisionMs)}:${key}:${b.from}:${b.to}`);
  function bestAttack(uid,excluded=new Set(),risk=false){
    const policy=risk?riskPolicy(s.players[uid].ai.lastAttackAt??s.players[uid].ai.bornAt,at):null;if(risk&&!policy)return null;const threshold=(units,b)=>risk?policy.minimum:aiThreshold(s,uid,units,b,at);
    const cheap=[];
    for(const a of ownedTerritories(s,uid))if(!excluded.has(a.id)&&a.actionReadyAt<=at&&a.protectionUntil<=at&&!isLocked(s,a.id))for(const to of adjacent(a.id)){
      const b=s.territories[to];if(!canAttackCountry(s,uid,b)||b.protectionUntil>at||isLocked(s,to))continue;
      cheap.push({a,b,value:mean(ready(a))/Math.max(1,mean(b.units))});
    }
    cheap.sort((a,b)=>b.value-a.value||a.a.id.localeCompare(b.a.id)||a.b.id.localeCompare(b.b.id));
    const candidates=[];
    for(const {a,b}of cheap.slice(0,8))for(const units of attackFormations(s,a,b,risk)){
      if(!shouldContinue())return null;
      // Cheap sampling only removes unpromising search candidates, never resolves combat.
      if(probability(s,a.id,b.id,units,64).upper<threshold(units,b))continue;
      const p=probability(s,a.id,b.id,units);if(p.lower<threshold(units,b))continue;
      const candidate=scoreAttack(uid,a,b,units,p,risk,threshold(units,b));if(candidate)candidates.push(candidate);
    }
    const order=(a,b)=>b.score-a.score||a.units.length-b.units.length||tie('attack',a,b);candidates.sort(order);
    const finalists=candidates.slice(0,2).map(c=>{const p=probability(s,c.from,c.to,c.units,finalSamples);return p.lower<c.threshold?null:scoreAttack(uid,s.territories[c.from],s.territories[c.to],c.units,p,risk,c.threshold);}).filter(Boolean).sort(order);
    return finalists[0]?{...finalists[0],type:'move',category:risk?'riskAttack':'attack'}:null;
  }
  const afterTransfer=(a,b,units)=>{
    const plan=movementPlan(s,a.owner,a.id,b.id,ids(units),at);if(plan.error)return null;
    const copy=structuredClone(s),chosen=new Set(ids(units)),back=new Set(ids(plan.returning));
    const cooling=list=>list.map(u=>({...u,readyAt:Math.max(u.readyAt,at+RULES.actionMs)}));
    copy.territories[a.id].units=a.units.filter(u=>!chosen.has(u.id)).concat(cooling(plan.returning));
    copy.territories[b.id].units=b.units.filter(u=>!back.has(u.id)).concat(cooling(units));
    return copy;
  };
  function recentReverse(uid,a,b){const m=s.players[uid].ai?.moves||{};return Object.values(m).some(x=>x.from===b.id&&x.to===a.id&&at-x.at<20*60_000);}
  function bestSupport(uid,excluded=new Set()){
    const endangered=ownedTerritories(s,uid).map(t=>({t,risk:threat(s,t.id,64)})).filter(x=>x.risk>=.45).sort((a,b)=>b.risk-a.risk),options=[];
    for(const {t:b,risk}of endangered.slice(0,2))for(const from of adjacent(b.id)){
      if(!shouldContinue())return null;
      const a=s.territories[from];if(a.owner!==uid||excluded.has(from)||isLocked(s,from))continue;
      const movable=ready(a).filter(u=>u.sides!==20),d4=movable.filter(u=>u.sides===4),heroes=movable.filter(u=>u.sides>4);
      const orderedUnits=[...heroes,...d4],beforeRisk=threat(s,a.id,64);
      for(let size=1;size<=Math.min(orderedUnits.length,a.units.length-1);size++){
        if(!shouldContinue())return null;
        const units=orderedUnits.slice(0,size),copy=afterTransfer(a,b,units);if(!copy)continue;
        const afterRisk=threat(copy,a.id,64),targetRisk=threat(copy,b.id,64);if(afterRisk>=.65||afterRisk>beforeRisk+.1||targetRisk>=risk-.05)continue;
        options.push({type:'move',category:'support',from:a.id,to:b.id,unitIds:ids(units),units,score:100*(risk-targetRisk)+30*risk-units.length,reason:'위험한 아군 도시 보강'});if(targetRisk<.45)break;
      }
    }
    for(const option of options.sort((a,b)=>b.score-a.score||tie('support',a,b)).slice(0,2)){
      const a=s.territories[option.from],b=s.territories[option.to],copy=afterTransfer(a,b,option.units);
      if(threat(copy,a.id,samples)<.65&&threat(copy,b.id,samples)<threat(s,b.id,samples)-.05)return option;
    }return null;
  }
  const distances=uid=>{
    const out=new Map(),queue=ownedTerritories(s,uid).filter(t=>front(s,t));queue.forEach(t=>out.set(t.id,0));
    for(let i=0;i<queue.length;i++)for(const id of adjacent(queue[i].id)){const t=s.territories[id];if(t.owner===uid&&!out.has(id)){out.set(id,out.get(queue[i].id)+1);queue.push(t);}}return out;
  };
  function bestTransfer(uid,excluded=new Set(),officersOnly=false){
    const distance=distances(uid),options=[];
    for(const a of ownedTerritories(s,uid)){
      if(!shouldContinue())return null;
      if(excluded.has(a.id)||isLocked(s,a.id))continue;
      const movable=ready(a).filter(u=>u.sides!==20&&(!officersOnly||u.sides>4)&&!(effectOf(u)?.economic&&a.roles.governor===u.id));
      for(const to of adjacent(a.id)){
        const b=s.territories[to];if(b.owner!==uid||!((distance.get(b.id)??Infinity)<(distance.get(a.id)??Infinity))||isLocked(s,b.id)||recentReverse(uid,a,b))continue;
        // Exact engine planning handles a full city and cooling-down exchanged D4.
        const list=movable.sort((x,y)=>Number(y.sides>4)-Number(x.sides>4)||y.sides-x.sides);
        for(let size=Math.min(list.length,a.units.length-1);size>=1;size--){
          const units=list.slice(0,size),copy=afterTransfer(a,b,units);if(!copy||threat(copy,a.id)>=.65)continue;
          const score=10*units.length+20*Number(front(s,b))-10*(distance.get(b.id)||0);options.push({type:'move',category:officersOnly?'officer':'supply',from:a.id,to:b.id,unitIds:ids(units),units,score,reason:'후방에서 전선으로 인접 보급'});break;
        }
      }
    }
    return options.sort((a,b)=>b.score-a.score||tie('transfer',a,b))[0]||null;
  }
  function bestRevival(uid,excluded=new Set()){
    if(livingUnits(s,uid).some(u=>u.sides===20))return null;
    for(const t of ownedTerritories(s,uid).sort((a,b)=>Number(front(s,a))-Number(front(s,b))||a.id.localeCompare(b.id))){
      if(excluded.has(t.id)||isLocked(s,t.id))continue;const infantry=ready(t).filter(u=>u.sides===4);if(infantry.length<8)continue;
      const cost=infantry.slice(0,5),copy=structuredClone(s);copy.territories[t.id].units=t.units.filter(u=>!cost.some(x=>x.id===u.id));
      if(validateRevival(s,uid,t.id,ids(cost),at)||threat(copy,t.id)>=.45)continue;
      return {type:'revive',category:'revive',territoryId:t.id,from:t.id,unitIds:ids(cost),score:1,reason:'이름 있는 장수 소모 없이 군주 부활'};
    }return null;
  }
  return {bestAttack,bestSupport,bestTransfer,bestRevival,threat,probability,cacheSize:()=>cache.size};
}
