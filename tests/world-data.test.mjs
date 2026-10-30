import test from 'node:test';import assert from 'node:assert/strict';
import {historySummary,historyFeed,WorldReader,WORLD_FIELDS,coherentWorld} from '../src/world-data.js';
import {fixture,hero,soldier,command} from './v5-helpers.mjs';
import {eventRelated,highlights} from '../src/field-ui.js';
import {FirebaseStore} from '../src/store.js';
test('compact history keeps defender, highlights and hero moves without dice',()=>{
 const e={id:'battle',at:1,type:'battle',actor:'a',from:'x',to:'y',text:'전투',result:{attacker:'a',defender:'b',won:true,score:21,defense:20,policy:{delta:1,grade:'접전승'},attack:Array(40).fill({sides:12,name:'장수',roll:10}),attackDead:[{id:'u'}],defendDead:[],escaped:[{unit:{sides:20}}]}};
 const row=historySummary(e);assert.equal(eventRelated(row,'b'),true);assert.equal(highlights({history:{battle:row}}).length,1);assert.equal(row.result,undefined);assert.equal(row.battle.escaped,true);assert.deepEqual(historySummary(row),row);assert.ok(JSON.stringify(row).length<JSON.stringify(e).length/3);
 assert.equal(historySummary({id:'move',type:'move',heroes:[{id:'u'}]}).heroMove,true);
});
test('two query partitions must belong to the same atomic command before publication',()=>{assert.equal(coherentWorld({revision:4,updatedAt:20,command:{baseRevision:3,at:20}}),true);assert.equal(coherentWorld({revision:4,updatedAt:20,command:{baseRevision:2,at:19}}),false);assert.equal(coherentWorld({revision:4,updatedAt:20,command:{baseRevision:3,at:19}}),false);});
test('reader uses no historical battles when validated feed is current, caches only requested details',async()=>{
 const f=fixture({attack:[hero('조조'),soldier('stay')]}),e={id:'one',at:1,type:'battle',actor:'a',text:'기록',result:{attack:[],defend:[],score:2,defense:1,attackDead:[],defendDead:[],escaped:[]}};f.s.history={one:e};
 const root={worlds:{'season-1':f.s},historyFeed:{'season-1':historyFeed(f.s)}},reads=[];
 const sdk=mockSdk(root,reads);
 const reader=new WorldReader(sdk,null,'season-1'),s=await reader.read();assert.equal(s.history.one.result,undefined);assert.ok(!reads.includes('worlds/season-1'));assert.ok(!reads.includes('worlds/season-1/history'));await reader.detail('one');await reader.detail('one');assert.equal(reads.filter(p=>p==='worlds/season-1/history/one').length,1);assert.ok(WORLD_FIELDS.includes('pendingBattles'));assert.ok(WORLD_FIELDS.includes('returnQueues'));
});
test('legacy revision gap reads full history rather than losing records',async()=>{
 const f=fixture();f.s.history={old:{id:'old',type:'update',at:1,text:'보존'}};
 const root={worlds:{s:f.s},historyFeed:{s:{revision:f.s.revision-1,events:{}}}},reads=[];
 const sdk=mockSdk(root,reads);
 const s=await new WorldReader(sdk,null,'s').read();assert.equal(s.history.old.text,'보존');assert.equal(reads.filter(p=>p==='worlds/s/history').length,1);
});

test('initial read and realtime start share the same three subscriptions',async()=>{
 const f=fixture(),root={worlds:{s:f.s},historyFeed:{s:historyFeed(f.s)}},reads=[],sdk=mockSdk(root,reads),watched=[];sdk.onValue=(q,callback)=>{watched.push(q);Promise.resolve().then(async()=>callback(await sdk.get(q)));return ()=>{};};
 const reader=new WorldReader(sdk,null,'s');try{await reader.read();reader.start();await reader.read();assert.equal(watched.length,3);assert.equal(reads.filter(p=>p.endsWith(':query')).length,2);assert.equal(reads.filter(p=>p==='historyFeed/s').length,1);}finally{reader.close();}
});

test('a feed frame arriving after the core does not trigger a full legacy history read',async()=>{
 const reader=new WorldReader({},null,'s');reader.raw={revision:2,updatedAt:2,command:{baseRevision:1,at:2}};reader.feed={revision:1,events:{}};reader.ready=new Set(['before','after','feed']);reader.started=true;let delivered=0;reader.onWorld=()=>delivered++;reader.readHistory=()=>assert.fail('matching feed is still in flight');try{await reader.flush();assert.equal(delivered,0);reader.feed={revision:2,events:{}};await reader.flush();assert.equal(delivered,1);assert.equal(reader.fallbacks,0);}finally{reader.close();}
});

test('season discovery reads only closed metadata and preserves the chosen ruler name',async()=>{
 const now=Date.now(),root={worlds:{'season-2':{season:{number:2,endedAt:now-7200000,nextStartAt:now-3600000,result:{id:'season-2',title:'시즌2',endedAt:now-7200000}},players:{a:{name:'이어갈 이름',nameChosen:true}},history:{huge:'must not load'}},'season-3':{revision:4,history:{huge:'must not load'}}}},reads=[];
 const sdk=mockSdk(root,reads);sdk.set=async()=>{};sdk.runTransaction=async()=>assert.fail('existing season must not trigger a broad transaction');const store=new FirebaseStore({compactSync:true,worldId:'season-2'});Object.assign(store,{sdk,db:null,uid:'a',now:()=>now});
 assert.equal(await store.advanceClosedSeason(),true);assert.equal(store.config.worldId,'season-3');assert.equal(store.publicName,'이어갈 이름');assert.ok(reads.every(p=>!p.endsWith('/history')&&!/^worlds\/season-[23]$/.test(p)));assert.equal(reads.length,3);
});

test('season discovery creates an absent next season once and leaves active seasons alone',async()=>{
 const now=Date.now(),root={worlds:{old:{season:{number:2,endedAt:now-7200000,nextStartAt:now-3600000,result:{id:'old',title:'시즌2',endedAt:now-7200000}}}}},reads=[];const sdk=mockSdk(root,reads);let creations=0;sdk.set=async()=>{};sdk.runTransaction=async(p,fn)=>{const next=fn(null);assert.equal(next.season.number,3);assert.equal(next.command.actor,'a');root.worlds['season-3']=next;creations++;return {committed:true};};const store=new FirebaseStore({compactSync:true,worldId:'old'});Object.assign(store,{sdk,db:null,uid:'a',now:()=>now});assert.equal(await store.advanceClosedSeason(),true);assert.equal(creations,1);assert.equal(await store.advanceClosedSeason(),false);assert.equal(creations,1);
});

function mockSdk(root,reads){return {ref:(db,p)=>p,orderByKey:()=>({}),endBefore:k=>({end:k}),startAfter:k=>({start:k}),query:(path,...clauses)=>({path,...Object.assign({},...clauses)}),get:async q=>{const p=typeof q==='string'?q:q.path;reads.push(typeof q==='string'?q:p+':query');let value=p.split('/').reduce((v,k)=>v?.[k],root)??null;if(typeof q!=='string')value=Object.fromEntries(Object.entries(value||{}).filter(([k])=>q.end?k<q.end:k>q.start));return {val:()=>value,exists:()=>value!==null};}};}
