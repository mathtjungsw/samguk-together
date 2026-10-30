import test from 'node:test';import assert from 'node:assert/strict';
import {AiStateStore,firebaseAiStateStore} from '../server/ai-state-store.mjs';
import {createAiJob,serverDice} from '../server/ai-job.mjs';
import {initializeAiWorld} from '../src/ai-world.js';
import {runAiRound} from '../src/ai-runtime.js';
import {createSeasonWorld} from '../src/seasons.js';
import {normalizeWorld} from '../src/engine-next.js';
const start=Date.parse('2026-11-01T12:00:00+09:00'),at=start+600_000,path='aiStaging/season-4',secret='test-secret-only-32-bytes-long-enough';
const fresh=()=>initializeAiWorld(createSeasonWorld(4,start,'ai-storage'),1);
const ops={enabled:true,activationApproved:true,cost:{observedAt:at,actualBytes:0,forecastHumanBytes:0,forecastAiBytes:40_000_000,forecastOverheadBytes:0,otherCost:0}};
export function memoryKv(){const root={};const read=path=>structuredClone(path.split('/').reduce((v,k)=>v?.[k],root)??null),assign=(path,value)=>{const keys=path.split('/');let node=root;for(const k of keys.slice(0,-1))node=node[k]??={};if(value===null)delete node[keys.at(-1)];else node[keys.at(-1)]=structuredClone(value);};return {root,read:async p=>read(p),update:async patch=>Object.entries(patch).forEach(([p,v])=>assign(p,v)),transact:async(p,fn)=>{const next=fn(read(p));if(next===undefined)return {committed:false,value:read(p)};assign(p,next);return {committed:true,value:read(p)};}};}
test('server dice stable on retry, different events/keys independent, job is disabled by default',async()=>{
 const seed=serverDice(secret);assert.equal(seed('one-event'),seed('one-event'));assert.notEqual(seed('one-event'),seed('other-event'));assert.notEqual(seed('one-event'),serverDice(secret+'2')('one-event'));assert.throws(()=>serverDice('short'),/32/);
 const job=createAiJob({adapter:{readMeta:()=>assert.fail('disabled factory must not access a database')},secret});assert.deepEqual(await job(),{status:'disabled',reads:0});
});
test('storage refuses production paths; initializer is idempotent and disabled by default',async()=>{
 const kv=memoryKv();assert.throws(()=>new AiStateStore(kv,{path:'worlds/season-4'}),/aiStaging/);assert.throws(()=>firebaseAiStateStore({app:{options:{projectId:'samguk-together'}}},{path}),/에뮬레이터/);const store=new AiStateStore(kv,{path,now:()=>at});assert.equal((await store.initialize(fresh())).committed,true);assert.equal((await store.initialize(fresh())).committed,false);assert.equal((await store.readMeta()).enabled,false);normalizeWorld(await store.readWorld());
});
test('activation requires a representative activity day, full service review, overhead and 70% margin',async()=>{
 const kv=memoryKv(),store=new AiStateStore(kv,{path,now:()=>at});await store.initialize(fresh());await assert.rejects(store.approveActivation(ops.cost),/実|활동일/);await store.approveActivation({...ops.cost,representativeDays:1,allServicesReviewed:true});assert.equal((await store.readMeta()).activationApproved,true);await assert.rejects(store.approveActivation({...ops.cost,representativeDays:1,allServicesReviewed:true,forecastOverheadBytes:300_000_000}),/무료량/);
});
test('stale holder is fenced even after lease expiry and generation change; conflict never writes',async()=>{
 const kv=memoryKv();let now=at;const a=new AiStateStore(kv,{path,now:()=>now,leaseMs:100}),b=new AiStateStore(kv,{path,now:()=>now,leaseMs:100});await a.initialize(fresh(),ops);const old=await a.acquire(1,now);assert.equal(await b.acquire(1,now),null);now+=101;const lease=await b.acquire(1,now);assert.ok(lease.generation>old.generation);const world=await b.readWorld(),next=runAiRound(world,now,{seedFor:serverDice(secret)}).world;assert.equal(await a.commit({expectedRevision:world.revision,lease:old,round:1,world:next}),false);assert.equal(await b.commit({expectedRevision:world.revision+1,lease,round:1,world:next}),false);assert.equal(await b.commit({expectedRevision:world.revision,lease,round:1,world:next}),true);assert.equal((await b.readWorld()).revision,world.revision+1);await a.release(old);assert.equal(await a.acquire(1,now),null);
});
test('committed raw events recover after interrupted publication without replaying a round',async()=>{
 const kv=memoryKv(),store=new AiStateStore(kv,{path,now:()=>at});await store.initialize(fresh(),ops);const s=await store.readWorld(),lease=await store.acquire(1,at),next=runAiRound(s,at,{seedFor:serverDice(secret)}).world;
 const id='synthetic-dice-detail';next.history[id]={id,at,type:'battle',actor:'ai-system',text:'복구 검증',result:{attacker:'a',defender:'b',score:2,defense:1,won:true,attack:[{id:'u',sides:4,roll:2}],defend:[]}};
 const update=kv.update;kv.update=async()=>{throw Error('simulated connection interruption');};await assert.rejects(store.commit({expectedRevision:s.revision,lease,round:1,world:next}),/interruption/);const persisted=await kv.read(path+'/envelope');assert.equal(persisted.world.revision,next.revision);assert.equal(persisted.history[id].result,undefined);assert.equal(persisted.outbox[id].event.result.attack[0].roll,2);assert.equal((await store.battleDetail(id)).result.attack[0].roll,2);await assert.rejects(store.battleDetail('../ops'),/기록 번호/);kv.update=update;
 const restarted=new AiStateStore(kv,{path,now:()=>at});assert.ok(await restarted.recover());assert.equal((await kv.read(path+'/records/'+id)).result.attack[0].roll,2);assert.equal(Object.keys(await kv.read(path+'/envelope/outbox')).length,0);assert.equal((await restarted.readWorld()).revision,next.revision);assert.equal(await restarted.recover(),0);
});
test('budget pause changed during calculation is checked in the atomic commit; same notice deduplicates',async()=>{
 const kv=memoryKv(),store=new AiStateStore(kv,{path,now:()=>at});await store.initialize(fresh(),ops);const s=await store.readWorld(),lease=await store.acquire(1,at),next=runAiRound(s,at,{seedFor:serverDice(secret)}).world;await kv.update({[path+'/envelope/ops/cost/actualBytes']:360_000_000});assert.equal(await store.commit({expectedRevision:s.revision,lease,round:1,world:next}),false);assert.equal((await store.readWorld()).revision,s.revision);const gate={mode:'paused',reason:'무료량 접근'};await store.reportGate(gate);const first=await kv.read(path+'/lastCostNotice');await store.reportGate(gate);assert.deepEqual(await kv.read(path+'/lastCostNotice'),first);
});
