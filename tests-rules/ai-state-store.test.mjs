import test,{before,after,beforeEach} from 'node:test';import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/database';
import {makeSeasonRules} from '../tools/generate-season-rules.mjs';
import {AiStateStore,aiEnvelope,cachedAiKv} from '../server/ai-state-store.mjs';
import {serverDice} from '../server/ai-job.mjs';
import {initializeAiWorld} from '../src/ai-world.js';
import {runAiRound} from '../src/ai-runtime.js';
import {createSeasonWorld} from '../src/seasons.js';
import {applyCommand,normalizeWorld} from '../src/engine-next.js';
let env;const path='aiStaging/season-4',secret='emulator-test-private-key-long-enough';
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-samguk-online',database:{host:'127.0.0.1',port:9000,rules:JSON.stringify(makeSeasonRules())}});});beforeEach(async()=>env.clearDatabase());after(async()=>env?.cleanup());
function kvFor(db){return cachedAiKv({read:async path=>(await sdk.get(sdk.ref(db,path))).val(),subscribe:(path,next,error)=>sdk.onValue(sdk.ref(db,path),s=>next(s.val()),error),update:patch=>sdk.update(sdk.ref(db),patch),transact:async(path,fn)=>{const r=await sdk.runTransaction(sdk.ref(db,path),fn,{applyLocally:false});return {committed:r.committed,value:r.snapshot.val()};}});}
function setup(at){const s=initializeAiWorld(createSeasonWorld(4,at-600_000,'ai-emulator'),1),ops={enabled:true,activationApproved:true,cost:{observedAt:at,actualBytes:0,forecastHumanBytes:0,forecastAiBytes:40_000_000,forecastOverheadBytes:0,otherCost:0}};return {s,ops};}
test('AI staging storage is private, separate from live worlds; atomic revision conflict preserves both armies',async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  const at=Date.now(),{s,ops}=setup(at),kv=kvFor(c.database()),store=new AiStateStore(kv,{path,now:()=>at});await store.initialize(s,ops);const lease=await store.acquire(1,at),before=await store.readWorld(),planned=runAiRound(before,at,{seedFor:serverDice(secret)}).world;
  const human=applyCommand(before,'human',{id:'ai-human-concurrent-register',type:'register',name:'동시 참가자',at,baseRevision:before.revision});
  await kv.transact(path+'/envelope',old=>({...old,...aiEnvelope(human),lease:old.lease,ops:old.ops}));
  assert.equal(await store.commit({expectedRevision:before.revision,lease,round:1,world:planned}),false);const actual=await store.readWorld();assert.equal(actual.players.human.name,'동시 참가자');normalizeWorld(actual);assert.equal((await sdk.get(sdk.ref(c.database(),'worlds'))).exists(),false);
 });
 const db=env.authenticatedContext('human',{firebase:{sign_in_provider:'google.com'}}).database();await assertFails(sdk.get(sdk.ref(db,path)));await assertFails(sdk.set(sdk.ref(db,path+'/envelope/world/ai/enabled'),true));
});
test('AI state commits before dice publication, restart recovers frozen record without replay; expired lease fenced',async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  let at=Date.now();const {s,ops}=setup(at),kv=kvFor(c.database()),store=new AiStateStore(kv,{path,now:()=>at,leaseMs:100});await store.initialize(s,ops);const oldLease=await store.acquire(1,at);at+=101;const lease=await store.acquire(1,at),before=await store.readWorld(),next=runAiRound(before,at,{seedFor:serverDice(secret)}).world,id='ai-emulator-dice-event';next.history[id]={id,at,type:'battle',text:'고정 주사위 복구',result:{attacker:'a',defender:'b',score:2,defense:1,won:true,attack:[{id:'u',sides:4,roll:2}],defend:[]}};
  assert.equal(await store.commit({expectedRevision:before.revision,lease:oldLease,round:1,world:next}),false);
  const update=kv.update;kv.update=async()=>{throw Error('simulated crash');};await assert.rejects(store.commit({expectedRevision:before.revision,lease,round:1,world:next}),/crash/);kv.update=update;
  const restarted=new AiStateStore(kv,{path,now:()=>at});assert.ok(await restarted.recover());assert.equal((await kv.read(path+'/records/'+id)).result.attack[0].roll,2);assert.equal((await kv.read(path+'/envelope/history/'+id)).result,undefined);const current=await restarted.readWorld();assert.equal(current.ai.lastTick,1);assert.deepEqual(runAiRound(current,at,{seedFor:serverDice(secret)}).world,current);assert.equal(await restarted.recover(),0);
 });
});
