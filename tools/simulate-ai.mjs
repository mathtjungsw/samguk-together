// Entirely local synthetic seasons. Does not import Firebase, fetch or credentials.
import {writeFile} from 'node:fs/promises';
import {createSeasonWorld} from '../src/seasons.js';
import {initializeAiWorld,isAi} from '../src/ai-world.js';
import {runAiRound} from '../src/ai-runtime.js';
import {hash32,ownedTerritories} from '../src/game-core.js';
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const hours=Number(args.hours||6),count=Number(args.count||3),seeds=Number(args.seeds||1),samples=Number(args.samples||512);
if(!Number.isFinite(hours)||hours<1||hours>72||![1,2,3,4,5].includes(count)||!Number.isInteger(seeds)||seeds<1||seeds>20||!Number.isInteger(samples)||samples<64||samples>2048)throw Error('hours=1..72, count=1..5, seeds=1..20, samples=64..2048');
const reports=[];
for(let seed=0;seed<seeds;seed++){
 const start=Date.parse('2026-11-01T12:00:00+09:00'),began=performance.now();let s=initializeAiWorld(createSeasonWorld(4,start,`ai-simulation-${seed}`),count),actions=0,attacks=0,maxMs=0,readBytes=0,rounds=0;
 for(let minute=10;minute<=hours*60&&!s.season.endedAt;minute+=10){
  // Core-only JSON estimate; excludes feed, outbox, writes and wire overhead.
  const state={...s,history:undefined};readBytes+=Buffer.byteLength(JSON.stringify(state));
  const out=runAiRound(s,start+minute*60_000,{seedFor:id=>hash32('simulation-private-key:'+id),plannerOptions:{samples,finalSamples:Math.max(2048,samples)},maxDecisionMs:40_000});
  s=out.world;actions+=out.actions.length;attacks+=out.actions.filter(a=>['attack','riskAttack'].includes(a.category)).length;maxMs=Math.max(maxMs,out.elapsedMs||0);rounds++;
  if(minute%60===0)process.stdout.write(`seed ${seed+1}/${seeds}, hour ${minute/60}/${hours}, AI ${Object.values(s.players).filter(isAi).length}, actions ${actions}\n`);
 }
 const report={seed,hours,count,rounds,actions,attacks,aiCount:Object.values(s.players).filter(isAi).length,territories:Object.values(s.players).filter(isAi).map(p=>({name:p.name,territories:ownedTerritories(s,p.uid).length})),ended:!!s.season.endedAt,reason:s.season.reason||'',elapsedMs:Math.round(performance.now()-began),maxRoundMs:Math.round(maxMs),coreReadJsonBytes:readBytes};reports.push(report);console.log(JSON.stringify(report));
}
if(args.output)await writeFile(args.output,JSON.stringify({scope:'synthetic-local-only',billingMeasurement:false,reports},null,2)+'\n');
