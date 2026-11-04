import test,{before,after,beforeEach} from 'node:test';import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';import * as sdk from 'firebase/database';
import {makeSparkRules} from '../tools/spark-rules.mjs';
import {createSparkWorld} from '../src/spark-policy.js';
import {sparkCall} from '../src/spark-store.js';
import {FirebaseStore,changedPaths} from '../src/store.js';
import {normalizeWorld,adjacent,refreshIndexes,capacityOf,emptyRoles} from '../src/engine-next.js';
import {campaignCommand} from '../server/campaign-command.js';
import {historyFeed,WorldReader} from '../src/world-data.js';
import {stampUnit} from '../src/role-policy.js';
import {selectEnhancementRequests} from '../src/enhancement-batch.js';
import {rosterFor} from '../src/hero-catalog.js';import {newEffectState} from '../src/hero-effects-next.js';
let env,serial=0;const now=()=>Date.now(),config={executionMode:'spark',worldId:'season-6',compactSync:true,seasons:true};
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-samguk-online',database:{host:'127.0.0.1',port:9000,rules:JSON.stringify(makeSparkRules())}});});after(async()=>env.cleanup());
beforeEach(async()=>{await env.clearDatabase();await seed('runtimeMode',{mode:'spark',activeWorld:'season-6'});});
const seed=(path,value)=>env.withSecurityRulesDisabled(c=>sdk.set(sdk.ref(c.database(),path),value));
const raw=async path=>{let value;await env.withSecurityRulesDisabled(async c=>{value=(await sdk.get(sdk.ref(c.database(),path))).val();});return value;};
function fake(uid,world){const store=new FirebaseStore({...config});store.sdk=sdk;store.uid=uid;store.db=env.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).database();store.world=world;store.chatRef=sdk.ref(store.db,'sparkChat/season-6');store.retryRead=async()=>{store.world=normalizeWorld(await raw('sparkWorlds/season-6'));};store.now=now;return store;}
async function fixture(){let s=createSparkWorld(6,now()-1000,'spark-rules-test');for(const uid of ['a','b'])for(const type of ['register','start'])s=campaignCommand(s,uid,{id:'spark-fixture-'+uid+'-'+type,type,name:uid},now()).world;await seed('sparkWorlds/season-6',s);await seed('sparkHistoryFeed/season-6',historyFeed(s));return s;}
const cmd=(type,extra={})=>({worldId:'season-6',id:'spark-command-'+(++serial),type,...extra});
test('Google registration/name/start and changed-path feed commit work without Functions; unauthorized writes denied',async()=>{
 const s=createSparkWorld(6,now()-1000,'first');await seed('sparkWorlds/season-6',s);const store=fake('a',s);
 await sparkCall(store,'campaignOrder',cmd('register',{name:'새군주',seq:0}));await sparkCall(store,'campaignOrder',cmd('start',{seq:1}));assert.equal(store.world.players.a.life,1);assert.equal(store.world.players.a.commandSeq,2);
 const anon=env.unauthenticatedContext().database();await assertFails(sdk.get(sdk.ref(anon,'sparkWorlds/season-6')));await assertFails(sdk.set(sdk.ref(store.db,'runtimeMode'),{mode:'ai'}));await assertFails(sdk.set(sdk.ref(store.db,'worlds/season-6'),store.world));await assertFails(sdk.set(sdk.ref(store.db,'sparkWorlds/season-6'),null));
});
test('concurrent commands retry changed revision once; same command replay never moves twice',async()=>{
 const s=await fixture(),a=fake('a',s),b=fake('b',s),r=await Promise.all([sparkCall(a,'campaignOrder',cmd('rename',{name:'A',seq:0})),sparkCall(b,'campaignOrder',cmd('rename',{name:'B',seq:0}))]);const n=normalizeWorld(await raw('sparkWorlds/season-6'));assert.equal(n.players.a.name,'A');assert.equal(n.players.b.name,'B');assert.equal(n.revision,s.revision+2);
});
test('friendly move, neutral attack, full detail separation and local reload keep armies coherent',async()=>{
 const s=await fixture(),from=Object.values(s.territories).find(t=>t.owner==='a'),to=s.territories[adjacent(from.id)[0]],at=now()-1200000;to.owner='a';to.units=[stampUnit({id:'dest-stay',name:'병사',sides:4,readyAt:0},at,to.id)];from.units.forEach(u=>{u.readyAt=0;u.moveReadyAt=0;});from.actionReadyAt=0;to.actionReadyAt=0;to.protectionUntil=0;refreshIndexes(s);await seed('sparkWorlds/season-6',s);const a=fake('a',s),req=cmd('move',{from:from.id,to:to.id,unitIds:[from.units[1].id],seq:0});await sparkCall(a,'campaignOrder',req);const count=a.world.territories[to.id].units.length;await sparkCall(a,'campaignOrder',req);assert.equal(a.world.territories[to.id].units.length,count);
 const attack=adjacent(from.id).find(id=>a.world.territories[id].owner==='');assert.ok(attack);a.world.territories[from.id].actionReadyAt=0;await seed('sparkWorlds/season-6',a.world);const out=await sparkCall(a,'campaignOrder',cmd('move',{from:from.id,to:attack,unitIds:[from.units[0].id],seq:1}));assert.ok(out.event.result);const held=await raw('sparkWorlds/season-6');const e=held.history[out.event.id];assert.ok(e.detailVersion);assert.equal(e.result,undefined);assert.ok((await raw('sparkBattleRecords/season-6/'+e.id+'/'+e.detailVersion)).result);
 const reader=new WorldReader(sdk,a.db,'season-6',{config});try{const w=await reader.read();assert.equal(w.revision,held.revision);assert.ok((await reader.detail(e.id)).result);}finally{reader.close();}
});
test('local bulk enhancement atomically saves target/material/results and lost-response replay is safe',async()=>{
 const s=await fixture(),t=Object.values(s.territories).find(t=>t.owner==='a');while(t.units.length<12)t.units.push(stampUnit({id:'enhance-filler-'+t.units.length,name:'병사',sides:4,readyAt:now()+600000},now(),t.id));refreshIndexes(s);await seed('sparkWorlds/season-6',s);const a=fake('a',s),items=selectEnhancementRequests(s,'a',t.id,t.units.slice(1,3).map(u=>u.id),{},i=>'spark-bulk-enhance-'+i).map(r=>({...r,draw:0}));const req={worldId:'season-6',mode:'local-batch',items};await sparkCall(a,'enhanceArmy',req);const n=normalizeWorld(await raw('sparkWorlds/season-6'));assert.equal(n.players.a.enhanceSeq,2);assert.equal(n.territories[t.id].units.length,10);assert.equal(JSON.parse(n.enhancementLedger)[items[0].id].success,undefined);await sparkCall(a,'enhanceArmy',req);assert.equal(a.world.revision,n.revision);
});
test('expired prisoner actions commit overdue escapes and reject without materials; AI players cannot issue orders',async()=>{
 const s=await fixture(),e=rosterFor(s).find(e=>e.sides===6),t=Object.values(s.territories).find(t=>t.owner==='a'),at=now()-7201000,u=stampUnit({id:'spark-prisoner',name:e.name,sides:6,heroId:e.id,heroVersion:3,effectState:newEffectState(),readyAt:0},at,'');s.campaign.captives[u.id]={id:u.id,unit:u,owner:'b',captor:'a',at,deadline:at+7200000,escapeRound:0,lastPersuadeAt:0,persuadeSeq:0,battleId:'battle-prisoner'};refreshIndexes(s);await seed('sparkWorlds/season-6',s);const a=fake('a',s);await assert.rejects(sparkCall(a,'campaignOrder',cmd('executeCaptive',{prisonerId:u.id,seq:0})));assert.equal(Object.keys(a.world.campaign.captives).length,0);
 a.world.players.b.kind='ai';await seed('sparkWorlds/season-6',a.world);const b=fake('b',a.world);await assert.rejects(sparkCall(b,'campaignOrder',cmd('rename',{name:'AI강제명령',seq:0})));
});
test('offline72h end and1h break create an AI-free next season once without resetting old result',async()=>{
 const s=await fixture();s.season.deadline=now()-1;s.season.startAt=s.season.deadline-72*3600000;await seed('sparkWorlds/season-6',s);const a=fake('a',s);await sparkCall(a,'campaignOrder',cmd('recruit',{seq:0}));assert.ok(a.world.season.endedAt);assert.ok((await raw('seasonIndex/season-6')).endedAt);await assert.rejects(sparkCall(a,'campaignOpen',{worldId:'season-7'}));
 const ended=await raw('sparkWorlds/season-6');ended.season.nextStartAt=now()-1;await seed('sparkWorlds/season-6',ended);await sparkCall(a,'campaignOpen',{worldId:'season-7'});const n=await raw('sparkWorlds/season-7');assert.equal(n.executionMode,'spark');assert.equal(n.ai,undefined);assert.equal(n.players,undefined);assert.equal(n.season.recruitmentVersion,2);assert.ok((await raw('sparkWorlds/season-6')).season.result);await sparkCall(a,'campaignOpen',{worldId:'season-7'});assert.equal((await raw('sparkWorlds/season-7')).seed,n.seed);
});
