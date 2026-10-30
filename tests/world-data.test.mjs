import test from 'node:test';import assert from 'node:assert/strict';
import {historySummary,historyFeed,WorldReader,WORLD_FIELDS,coherentWorld} from '../src/world-data.js';
import {fixture,hero,soldier,command} from './v5-helpers.mjs';
import {eventRelated,highlights} from '../src/field-ui.js';
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

function mockSdk(root,reads){return {ref:(db,p)=>p,orderByKey:()=>({}),endBefore:k=>({end:k}),startAfter:k=>({start:k}),query:(path,...clauses)=>({path,...Object.assign({},...clauses)}),get:async q=>{const p=typeof q==='string'?q:q.path;reads.push(typeof q==='string'?q:p+':query');let value=p.split('/').reduce((v,k)=>v?.[k],root)??null;if(typeof q!=='string')value=Object.fromEntries(Object.entries(value||{}).filter(([k])=>q.end?k<q.end:k>q.start));return {val:()=>value};}};}
