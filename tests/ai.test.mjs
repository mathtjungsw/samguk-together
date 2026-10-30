import test from 'node:test';import assert from 'node:assert/strict';
import {createSeasonWorld} from '../src/seasons.js';
import {initializeAiWorld,spawnInternalAis,internalCandidates,aiStartCount,aiElectors,castAiBallot,isAi,AI_POLICY} from '../src/ai-world.js';
import {createAiPlanner,aiThreshold} from '../src/ai-policy.js';
import {runAiRound,executeAiTick,aiCostGate,canActivateAi} from '../src/ai-runtime.js';
import {normalizeWorld,applyCommand,refreshIndexes,reconcileRoles,movementPlan,capacityOf} from '../src/engine-next.js';
import {MAP,adjacent,ownedTerritories,livingUnits,hash32,RULES} from '../src/game-core.js';
import {stampUnit} from '../src/role-policy.js';
import {closeIfWon,SEASON_MS} from '../src/season-policy.js';
import {rosterFor} from '../src/hero-catalog.js';
import {newEffectState} from '../src/hero-effects-next.js';

const start=Date.parse('2026-11-01T12:00:00+09:00');
const fresh=(n=1)=>initializeAiWorld(createSeasonWorld(4,start,'ai-regression'),n);
const options={seedFor:id=>hash32('server-private-test-key:'+id),plannerOptions:{samples:64,finalSamples:128}};
const bot=s=>Object.values(s.players).find(isAi).uid;
const unit=(id,sides=4,at=start,t='')=>stampUnit({id,name:sides===20?'군주':'병사',sides,readyAt:at},at,t);
function paint(s,uid,list,count=2){for(const id of list){const t=s.territories[id];t.owner=uid;t.protectionUntil=0;t.actionReadyAt=start;t.nextRecruitAt=0;t.lastRecruitAt=start;t.units=Array.from({length:count},(_,i)=>unit(`paint:${id}:${i}`,4,start,id));}refreshIndexes(s);reconcileRoles(s,start);}
function human(s,uid='human'){s.players[uid]={...structuredClone(s.players[bot(s)]),uid,name:'친구',kind:'human',ai:undefined,rulerId:'',landCount:0};delete s.players[uid].ai;return uid;}
function internalWorld(){const s=fresh(),uid=human(s),center=Object.values(s.territories).find(t=>adjacent(t.id).length>=3).id,region=[center,...adjacent(center)];for(const p of MAP.places)if(region.length<15&&!region.includes(p.id))region.push(p.id);paint(s,uid,region);return {s,uid,center,region};}

test('AI starts 1/5, validates count, preserves input, cannot inject into active seasons',()=>{
 for(const count of [1,5]){const raw=createSeasonWorld(4,start,'seed'),s=initializeAiWorld(raw,count);assert.equal(Object.values(s.players).filter(isAi).length,count);assert.equal(Object.keys(raw.players).length,0);for(const p of Object.values(s.players)){const t=ownedTerritories(s,p.uid)[0];assert.equal(t.units.length,5);assert.equal(t.units.filter(u=>u.sides===20).length,1);assert.ok(t.units.every(u=>u.readyAt>=start+RULES.actionMs));}assert.deepEqual(initializeAiWorld(s,count),s);normalizeWorld(s);}
 for(const count of [0,6,1.5])assert.throws(()=>initializeAiWorld(createSeasonWorld(4,start,'seed'),count),/1~5/);
 let s=createSeasonWorld(4,start,'seed');s=applyCommand(s,'human',{id:'register-human',type:'register',name:'사람',at:start,baseRevision:0});assert.throws(()=>initializeAiWorld(s,3),/진행 중/);
});
test('corrupt AI metadata fails safely without changing saved armies',()=>{const s=fresh(),before=JSON.stringify(s);s.ai.version=99;assert.throws(()=>runAiRound(s,start+600_000,options),/버전/);s.ai.version=1;assert.equal(JSON.stringify(s),before);s.players[bot(s)].ai.idleRounds=NaN;assert.throws(()=>runAiRound(s,start+600_000,options),/손상/);});
test('previous human winners vote, lower median, AI-winner fallback, invalid ballots ignored',()=>{
 const s=fresh(2),a=human(s,'a'),b=human(s,'b');paint(s,a,MAP.places.slice(0,3).map(p=>p.id));paint(s,b,MAP.places.slice(3,6).map(p=>p.id));s.season.winners=[a,b];assert.deepEqual(aiElectors(s),['a','b']);assert.equal(aiStartCount(s,{a:1,b:5}),1);assert.equal(aiStartCount(s,{a:6,b:4}),4);assert.equal(aiStartCount(s,{}),3);s.season.winners=[bot(s)];assert.deepEqual(aiElectors(s),['a','b']);
});
test('winner choice only during the one-hour break and cannot be changed after opening',()=>{
 const s=fresh(),h=human(s),t=Object.values(s.territories).find(t=>!t.owner);paint(s,h,[t.id]);s.season.winners=[h];s.season.endedAt=start+1000;s.season.nextStartAt=start+3601000;
 assert.deepEqual(castAiBallot(s,{},h,5,start+1000),{human:5});assert.throws(()=>castAiBallot(s,{},h,5,start+3601000),/개막/);assert.throws(()=>castAiBallot(s,{},bot(s),2,start+1000),/선택권/);assert.throws(()=>castAiBallot(s,{},h,0,start+1000),/1~5/);
});
test('14/15 country boundary, internal borders and D20 excluded; two-hour exact boundary',()=>{
 const {s,uid,center,region}=internalWorld();const id=region.find(id=>id!==center&&!adjacent(center).includes(id));s.territories[id].owner='';refreshIndexes(s);assert.equal(internalCandidates(s,uid,start+AI_POLICY.spawnMs).length,0);s.territories[id].owner=uid;refreshIndexes(s);assert.ok(internalCandidates(s,uid,start+AI_POLICY.spawnMs).some(t=>t.id===center));assert.equal(spawnInternalAis(s,start+AI_POLICY.spawnMs-1).ai.nextSerial,s.ai.nextSerial);const next=spawnInternalAis(s,start+AI_POLICY.spawnMs);assert.ok(next.ai.nextSerial>s.ai.nextSerial);assert.equal(next.ai.spawnRound,1);assert.deepEqual(spawnInternalAis(next,start+AI_POLICY.spawnMs),next);const withRuler=structuredClone(s);withRuler.territories[center].units.push(unit('human-ruler',20,start,center));refreshIndexes(withRuler);assert.ok(!internalCandidates(withRuler,uid,start+AI_POLICY.spawnMs).some(t=>t.id===center));s.territories[adjacent(center)[0]].owner='';assert.ok(!internalCandidates(s,uid,start+AI_POLICY.spawnMs).some(t=>t.id===center));
});
test('internal spawn preserves all displaced IDs, full destinations queue; not combat stats',()=>{
 const {s,uid,region}=internalWorld();for(const id of region){const t=s.territories[id];t.units=Array.from({length:capacityOf(id,s,start)},(_,i)=>unit(`old:${id}:${i}`,4,start,id));}refreshIndexes(s);const prior=livingUnits(s,uid).map(u=>u.id).sort(),stats=[s.players[uid].deaths,s.players[uid].kills],next=spawnInternalAis(s,start+AI_POLICY.spawnMs);assert.deepEqual(livingUnits(next,uid).map(u=>u.id).sort(),prior);assert.ok(next.returnQueues[uid]?.units.length);assert.deepEqual([next.players[uid].deaths,next.players[uid].kills],stats);assert.ok(next.returnQueues[uid].units.every(u=>u.stationTerritoryId===''&&u.readyAt>=start+AI_POLICY.spawnMs+RULES.actionMs));normalizeWorld(next);
});
test('latest spawn round only after outage, no artificial AI total cap; end before revolt',()=>{
 const {s}=internalWorld();s.ai.nextSerial=200;const next=spawnInternalAis(s,start+AI_POLICY.spawnMs*4);assert.equal(next.ai.spawnRound,4);assert.equal(next.ai.nextSerial,201);assert.ok(Object.keys(next.players).some(id=>id.endsWith('200')));const ended=spawnInternalAis(s,start+SEASON_MS);assert.equal(ended.season.endedAt,start+SEASON_MS);assert.equal(ended.ai.nextSerial,200);
});
test('AI respects initial protection and each round is idempotent without replaying missed attacks',()=>{
 const s=fresh(),early=runAiRound(s,start+RULES.actionMs,options);assert.equal(early.actions.length,0);const at=start+RULES.protectionMs,next=runAiRound(early.world,at,options);assert.ok(next.actions.length<=3);assert.deepEqual(runAiRound(next.world,at,options).world,next.world);assert.equal(next.world.ai.lastTick,2);normalizeWorld(next.world);
});
test('attack policy protects tiny human countries and never relaxes D20 below 90%',()=>{
 const s=fresh(),uid=bot(s),a=ownedTerritories(s,uid)[0],to=adjacent(a.id)[0],h=human(s);paint(s,h,[to]);a.protectionUntil=0;a.actionReadyAt=start;a.units=Array.from({length:13},(_,i)=>unit(`power:${i}`,4,start,a.id));refreshIndexes(s);const planner=createAiPlanner(s,start+RULES.protectionMs,{estimate:()=>({chance:1,approximate:false})});assert.ok(!planner.bestAttack(uid)||planner.bestAttack(uid).to!==to);s.players[uid].ai.idleRounds=99;assert.equal(aiThreshold(s,uid,[{sides:20}],s.territories[to]),.9);assert.ok(aiThreshold(s,uid,[{sides:4}],s.territories[to])>=.65);
});
test('probability cache shares identical battle contexts, invalidates changed defense and neighbor ownership',()=>{
 const s=fresh(),uid=bot(s),a=ownedTerritories(s,uid)[0],to=adjacent(a.id)[0];let calls=0;const planner=createAiPlanner(s,start,{estimate:()=>{calls++;return {chance:.8,approximate:false};}});planner.probability(s,a.id,to,a.units);planner.probability(structuredClone(s),a.id,to,a.units);assert.equal(calls,1);const changed=structuredClone(s);changed.territories[to].units[0].readyAt++;planner.probability(changed,a.id,to,a.units);assert.equal(calls,2);changed.territories[adjacent(to)[0]].owner='other';planner.probability(changed,a.id,to,a.units);assert.equal(calls,3);
});
test('AI proposals must pass current movement cooldown/space checks; refuses unsafe source',()=>{
 const s=fresh(),uid=bot(s),a=ownedTerritories(s,uid)[0],at=start+RULES.protectionMs;a.protectionUntil=0;a.units=Array.from({length:10},(_,i)=>unit(`ready:${i}`,4,start,a.id));refreshIndexes(s);
 const planner=createAiPlanner(s,at,{estimate:()=>({chance:1,approximate:false})}),attack=planner.bestAttack(uid);assert.ok(attack);assert.ok(!movementPlan(s,uid,attack.from,attack.to,attack.unitIds,at).error);a.actionReadyAt=at+1;assert.equal(createAiPlanner(s,at).bestAttack(uid),null);
 const enemies=adjacent(a.id),h=human(s);paint(s,h,[...enemies.slice(0,2),...MAP.places.filter(p=>p.id!==a.id&&!enemies.includes(p.id)).slice(0,2).map(p=>p.id)],12);a.actionReadyAt=at;a.protectionUntil=0;assert.equal(createAiPlanner(s,at,{estimate:()=>({chance:1,approximate:false})}).bestAttack(uid),null);
});
test('AI can revive using five D4 and preserves named units as materials; no money API',()=>{
 const s=fresh(),uid=bot(s),t=ownedTerritories(s,uid)[0];t.units=Array.from({length:9},(_,i)=>unit(`infantry:${i}`,4,start,t.id));t.actionReadyAt=start;t.protectionUntil=0;refreshIndexes(s);const decision=createAiPlanner(s,start+RULES.protectionMs).bestRevival(uid);assert.equal(decision.unitIds.length,5);assert.ok(decision.unitIds.every(id=>t.units.find(u=>u.id===id).sides===4));
});
test('named-officer combat uses the real engine and server seed once; frozen guard resolution survives restart',()=>{
 let s=fresh(),uid=bot(s),a=ownedTerritories(s,uid)[0],to=adjacent(a.id)[0],at=start+RULES.protectionMs;
 const officer=name=>{const e=rosterFor(s).find(e=>e.name===name);return stampUnit({id:'ai-officer:'+e.id,heroId:e.id,heroVersion:2,name:e.name,sides:e.sides,readyAt:start,effectState:newEffectState()},start,a.id);};
 a.units=[unit('remain',4,start,a.id),officer('관평'),officer('공손찬')];a.protectionUntil=0;a.actionReadyAt=start;a.nextRecruitAt=0;s.territories[to].units=Array.from({length:12},(_,i)=>unit('guard-enemy:'+i,4,start,to));refreshIndexes(s);reconcileRoles(s,at);
 let pending;for(let seed=0;seed<30;seed++){const next=applyCommand(s,uid,{id:'ai-frozen-guard-battle',type:'move',from:a.id,to,unitIds:a.units.slice(1).map(u=>u.id),seed,at,baseRevision:s.revision});if(Object.keys(next.pendingBattles).length){pending=next;break;}}
 assert.ok(pending);const frozen=Object.values(pending.pendingBattles)[0],dice=structuredClone(frozen.result.attack.dice),next=runAiRound(pending,at,options).world;assert.equal(Object.keys(next.pendingBattles).length,0);assert.deepEqual(next.history[frozen.id].result.attack,dice);normalizeWorld(next);
});
test('bounded decision time skips extra work without fabricating a victory or replaying missed rounds',()=>{
 const s=fresh(5),before=JSON.stringify(s);let ticks=0;const result=runAiRound(s,start+2*3600_000,{...options,maxDecisionMs:1,clock:()=>ticks++});assert.equal(result.actions.length,0);assert.equal(JSON.stringify(s),before);assert.equal(result.world.ai.lastTick,12);assert.deepEqual(runAiRound(result.world,start+2*3600_000,options).world,result.world);
});
test('no actions after season end, 80% wins before internal AI can remove the victory',()=>{
 const s=fresh(),uid=bot(s);paint(s,uid,MAP.places.slice(0,72).map(p=>p.id));const next=runAiRound(s,start+AI_POLICY.spawnMs,options);assert.equal(next.actions.length,0);assert.equal(next.world.season.reason,'conquest');assert.equal(next.world.ai.nextSerial,s.ai.nextSerial);assert.deepEqual(runAiRound(next.world,start+AI_POLICY.spawnMs+1,options).world,next.world);
});
test('cost guard: missing/stale/unknown is paused, 60/75/85 boundaries and 70 activation gate',()=>{
 const now=start,base={observedAt:now,actualBytes:0,forecastHumanBytes:0,forecastAiBytes:0,forecastOverheadBytes:0,otherCost:0};assert.equal(aiCostGate(null,now).mode,'paused');assert.equal(aiCostGate({...base,observedAt:now-7*3600_000},now).mode,'paused');for(const [ratio,mode]of [[.59,'normal'],[.6,'warning'],[.75,'hold'],[.85,'paused']])assert.equal(aiCostGate({...base,forecastHumanBytes:360_000_000*ratio},now).mode,mode);assert.equal(canActivateAi({...base,forecastHumanBytes:360_000_000*.71},now).allowed,false);assert.equal(aiCostGate({...base,forecastAiBytes:NaN},now).mode,'paused');assert.equal(aiCostGate({...base,otherCost:1},now).mode,'paused');
});
function memoryAdapter(world,now){let value=structuredClone(world),lock=null,generation=0;const metrics={observedAt:now,actualBytes:0,forecastHumanBytes:10_000_000,forecastAiBytes:40_000_000,forecastOverheadBytes:0,otherCost:0};return {meta:{enabled:true,activationApproved:true,cost:metrics,startAt:world.season.startAt,lastTick:world.ai.lastTick},readMeta:async function(){return {...this.meta,lastTick:value.ai.lastTick,endedAt:value.season.endedAt};},readWorld:async()=>structuredClone(value),reportGate:async()=>{},acquire:async()=>{if(lock)return null;return lock=++generation;},release:async lease=>{if(lock===lease)lock=null;},commit:async({expectedRevision,lease,world:next})=>{if(lock!==lease||value.revision!==expectedRevision)return false;value=structuredClone(next);return true;},current:()=>value};}
test('shared round reads world once for 5 AI, lease avoids duplicate concurrent execution',async()=>{
 const at=start+RULES.actionMs,s=fresh(5),db=memoryAdapter(s,at),results=await Promise.all([executeAiTick(db,{now:at,...options}),executeAiTick(db,{now:at,...options})]);assert.equal(results.filter(r=>r.status==='committed').length,1);assert.ok(results.reduce((n,r)=>n+r.reads,0)<=1);assert.equal((await executeAiTick(db,{now:at,...options})).status,'not-due');normalizeWorld(db.current());
});
test('activation/cost block before large state read; conflict retries bounded; lease released',async()=>{
 const at=start+RULES.actionMs,db=memoryAdapter(fresh(),at);db.meta.activationApproved=false;assert.equal((await executeAiTick(db,{now:at,...options})).status,'disabled');db.meta.activationApproved=true;db.meta.cost=null;assert.equal((await executeAiTick(db,{now:at,...options})).status,'cost-paused');db.meta.cost={observedAt:at,actualBytes:0,forecastHumanBytes:0,forecastAiBytes:0,forecastOverheadBytes:0,otherCost:0};let released=0;db.commit=async()=>false;db.release=async()=>released++;const result=await executeAiTick(db,{now:at,...options});assert.equal(result.status,'conflict');assert.equal(result.reads,3);assert.equal(released,1);
});
