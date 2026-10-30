import {writeFile} from 'node:fs/promises';
import {createSeasonWorld} from '../src/seasons.js';
import {initializeAiWorld,isAi} from '../src/ai-world.js';
import {runAiRound} from '../src/ai-runtime.js';
import {MAP,hash32,RULES} from '../src/game-core.js';
import {stampUnit} from '../src/role-policy.js';
import {refreshIndexes,reconcileRoles,capacityOf} from '../src/engine-next.js';
import {rosterFor} from '../src/hero-catalog.js';
import {newEffectState} from '../src/hero-effects-next.js';
const start=Date.parse('2026-11-01T12:00:00+09:00'),reports=[];
for(const count of [1,5,20]){
 let s=initializeAiWorld(createSeasonWorld(4,start,'ai-benchmark'),Math.min(count,5)),players=Object.values(s.players);
 for(let i=players.length;i<count;i++){const p=structuredClone(players[0]);p.uid=`ai-benchmark-${i}`;p.name=`AI 시험 ${i}`;p.rulerId='';s.players[p.uid]=p;}
 players=Object.values(s.players);const heroes=rosterFor(s);let heroIndex=0;
 for(const [i,t]of Object.values(s.territories).entries()){
   t.owner=players[i%count].uid;t.actionReadyAt=start;t.protectionUntil=0;t.lastRecruitAt=start;t.nextRecruitAt=0;t.roles.governor='';t.roles.defense=[];
   const e=heroes[heroIndex++],unit=e?{id:'benchmark-hero:'+e.id,heroId:e.id,heroVersion:2,name:e.name,sides:e.sides,readyAt:start,effectState:newEffectState()}:null;
   t.units=Array.from({length:Math.min(10,capacityOf(t.id,s,start))},(_,n)=>stampUnit(n===0&&unit?unit:{id:`benchmark-infantry:${t.id}:${n}`,name:'병사',sides:4,readyAt:start},start,t.id));
 }
 // Leave several neutral expansion sites for the 1-AI case (avoid an automatic80% win).
 if(count===1)for(const t of Object.values(s.territories).slice(60)){t.owner='';t.units=t.units.filter(u=>u.sides===4).slice(0,2);}
 s.ai.nextSerial=count+1;refreshIndexes(s);reconcileRoles(s,start);
 const at=start+RULES.protectionMs,began=performance.now(),result=runAiRound(s,at,{seedFor:id=>hash32('benchmark-private-key:'+id),maxDecisionMs:40_000});
 const report={ai:count,territories:MAP.places.length,actions:result.actions.length,elapsedMs:Math.round(performance.now()-began),stateJsonBytes:Buffer.byteLength(JSON.stringify({...s,history:undefined})),afterStateJsonBytes:Buffer.byteLength(JSON.stringify({...result.world,history:undefined})),dbCalls:0};reports.push(report);console.log(JSON.stringify(report));
}
await writeFile(process.argv[2]||'playtest/ai-benchmark.json',JSON.stringify({scope:'synthetic-local-only',billingMeasurement:false,reports},null,2)+'\n');
