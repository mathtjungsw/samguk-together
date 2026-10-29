import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {get,ref,set,update} from 'firebase/database';
import {makeSeasonRules} from '../tools/generate-season-rules.mjs';
import * as V4 from '../src/engine-v4.js';
import * as V5 from '../src/engine.js';
import {changedPaths} from '../src/store.js';
import {FirebaseStore} from '../src/store.js';
import {fixture,soldier} from '../tests/v5-helpers.mjs';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-samguk-online',database:{host:'127.0.0.1',port:9000}});});
after(async()=>env?.cleanup());beforeEach(async()=>env.clearDatabase());
const db=()=>env.authenticatedContext('a',{firebase:{sign_in_provider:'google.com'}}).database();
async function load(end,start){await env.cleanup();env=await initializeTestEnvironment({projectId:'demo-samguk-online',database:{host:'127.0.0.1',port:9000,rules:JSON.stringify(makeSeasonRules(end,start))}});}
test('시즌 정각 이전 테스트 전장 허용·시즌1 조기 생성 거부',async()=>{const now=Date.now();await load(now+60000,now+120000);const old=V4.createWorld(now);old.command.actor='a';await assertSucceeds(set(ref(db(),'worlds/main'),old));const next=V5.createWorld(now);next.command.actor='a';await assertFails(set(ref(db(),'worlds/season-1'),next));});
test('종료 후 구버전 클라이언트와 신규 클라이언트의 모든 테스트 전장 쓰기 거부, 기록 읽기 허용',async()=>{const now=Date.now(),old=V4.createWorld(now);old.command.actor='a';await env.withSecurityRulesDisabled(ctx=>set(ref(ctx.database(),'worlds/main'),old));await load(now-1000,now+60000);const next=V4.applyCommand(old,'a',{id:'season-closed-register',type:'register',name:'종료 후 참가',baseRevision:old.revision,at:Date.now()});await assertFails(update(ref(db(),'worlds/main'),changedPaths(old,next)));await assertSucceeds(get(ref(db(),'worlds/main')));await assertFails(set(ref(db(),'chat/global'),{sequence:1}));});
test('개막 후 시즌1 생성·군주 등록·랜덤 시작 가능, 테스트 기록 그대로 유지',async()=>{const now=Date.now();await load(now-60000,now-1000);let s=V5.createWorld(now,'season-1');s.command.actor='a';await assertSucceeds(set(ref(db(),'worlds/season-1'),s));let n=V5.applyCommand(s,'a',{id:'season1-register-new',type:'register',name:'새 시즌 군주',baseRevision:s.revision,at:Date.now()});await assertSucceeds(update(ref(db(),'worlds/season-1'),changedPaths(s,n)));s=n;n=V5.applyCommand(s,'a',{id:'season1-start-new',type:'start',baseRevision:s.revision,at:Date.now()});await assertSucceeds(update(ref(db(),'worlds/season-1'),changedPaths(s,n)));assert.equal(Object.values(n.territories).filter(t=>t.owner==='a').length,1);});
test('시즌1 점수차 전투 저장·잘못된 점수차 거부 및 채팅과 전황에 새 공지 저장',async()=>{
 const now=Date.now();await load(now-60000,now-1000);
 const f=fixture({at:now,attack:[soldier('stay'),...Array.from({length:8},(_,i)=>soldier('atk'+i,12))],defend:[soldier('def')]});
 await env.withSecurityRulesDisabled(ctx=>set(ref(ctx.database(),'worlds/season-1'),f.s));
 const n=V5.applyCommand(f.s,'a',{id:'season1-battle',type:'move',from:f.from,to:f.to,unitIds:f.s.territories[f.from].units.slice(1).map(u=>u.id),seed:1,baseRevision:f.s.revision,at:Date.now()});
 const bad=structuredClone(n);bad.history['season1-battle'].result.policy.delta++;
 await assertFails(update(ref(db(),'worlds/season-1'),changedPaths(f.s,bad)));
 await assertSucceeds(update(ref(db(),'worlds/season-1'),changedPaths(f.s,n)));
 const {getDatabase}=await import('firebase/database');void getDatabase;
 const store=new FirebaseStore({worldId:'season-1'});Object.assign(store,{uid:'a',sdk:await import('firebase/database'),db:db(),world:n,chat:null,connected:true,worldReady:true,chatReady:true,chatPath:'chat/season-1'});store.ref=ref(store.db,'worlds/season-1');store.chatRef=ref(store.db,'chat/season-1');
 await assertSucceeds(store.submit({type:'announce',id:V5.RELEASE.id}));
 assert.equal((await get(store.ref)).val().release.id,V5.RELEASE.id);assert.ok((await get(store.chatRef)).exists());
});

test('시즌1 D6 전령 저장과 D4·D20 모집 위조 거부, 최신 공지 이후 구버전 재공지 거부',async()=>{
 const sdk=await import('firebase/database'),now=Date.now();await load(now-60000,now-1000);const f=fixture({at:now});
 await env.withSecurityRulesDisabled(ctx=>set(ref(ctx.database(),'worlds/season-1'),f.s));
 const n=V5.applyCommand(f.s,'a',{id:'d6-news-policy',type:'recruit',at:Date.now(),baseRevision:f.s.revision});
 n.history['new-d6']={id:'new-d6',type:'hero',at:n.updatedAt,actor:'a',to:f.from,unit:{id:'new-d6',name:'왕평',sides:6},text:'군주의 도시에 부장 왕평(D6)이 합류했습니다.'};
 for(const sides of [4,20]){const bad=structuredClone(n);bad.history['new-d6'].unit.sides=sides;await assertFails(update(ref(db(),'worlds/season-1'),changedPaths(f.s,bad)));}
 await assertSucceeds(update(ref(db(),'worlds/season-1'),changedPaths(f.s,n)));
 const store=new FirebaseStore({worldId:'season-1'});Object.assign(store,{uid:'a',sdk,db:db(),world:n,chat:null,connected:true,worldReady:true,chatReady:true,chatPath:'chat/season-1'});store.ref=ref(store.db,'worlds/season-1');store.chatRef=ref(store.db,'chat/season-1');
 // Store an additional D6 system event atomically with a normal command.
 const {appendSystemMessages}=await import('../src/engine.js');const next=V5.applyCommand(n,'a',{id:'d6-chat-news',type:'recruit',at:Date.now(),baseRevision:n.revision});next.history['chat-d6']={...n.history['new-d6'],id:'chat-d6',at:next.updatedAt};const chat=appendSystemMessages(null,[next.history['chat-d6']],'a',next.updatedAt),patch={};for(const [k,v]of Object.entries(changedPaths(n,next)))patch['worlds/season-1/'+k]=v;patch['chat/season-1']=chat;await assertFails(update(ref(db()),patch));await assertSucceeds(update(ref(db(),'worlds/season-1'),changedPaths(n,next)));
 store.world=next;store.chat=null;await assertSucceeds(store.submit({type:'announce',id:V5.RELEASE.id}));
 const current=(await get(store.ref)).val(),old=V5.applyCommand(V5.normalizeWorld(current),'a',{id:'stale-release-recruit',type:'recruit',at:Date.now(),baseRevision:current.revision});old.command.type='announce';old.command.id='update-20261028-combat-v5';old.receipts[old.command.id]={actor:'a',at:old.updatedAt};old.release={id:old.command.id,text:'과거 공지',at:old.updatedAt};await assertFails(update(store.ref,changedPaths(current,old)));
});
