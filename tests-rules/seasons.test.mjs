import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {get,ref,set,update} from 'firebase/database';
import {makeSeasonRules} from '../tools/generate-season-rules.mjs';
import * as V4 from '../src/engine-v4.js';
import * as V5 from '../src/engine.js';
import {changedPaths} from '../src/store.js';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-samguk-online',database:{host:'127.0.0.1',port:9000}});});
after(async()=>env?.cleanup());beforeEach(async()=>env.clearDatabase());
const db=()=>env.authenticatedContext('a',{firebase:{sign_in_provider:'google.com'}}).database();
async function load(end,start){await env.cleanup();env=await initializeTestEnvironment({projectId:'demo-samguk-online',database:{host:'127.0.0.1',port:9000,rules:JSON.stringify(makeSeasonRules(end,start))}});}
test('시즌 정각 이전 테스트 전장 허용·시즌1 조기 생성 거부',async()=>{const now=Date.now();await load(now+60000,now+120000);const old=V4.createWorld(now);old.command.actor='a';await assertSucceeds(set(ref(db(),'worlds/main'),old));const next=V5.createWorld(now);next.command.actor='a';await assertFails(set(ref(db(),'worlds/season-1'),next));});
test('종료 후 구버전 클라이언트와 신규 클라이언트의 모든 테스트 전장 쓰기 거부, 기록 읽기 허용',async()=>{const now=Date.now(),old=V4.createWorld(now);old.command.actor='a';await env.withSecurityRulesDisabled(ctx=>set(ref(ctx.database(),'worlds/main'),old));await load(now-1000,now+60000);const next=V4.applyCommand(old,'a',{id:'season-closed-register',type:'register',name:'종료 후 참가',baseRevision:old.revision,at:Date.now()});await assertFails(update(ref(db(),'worlds/main'),changedPaths(old,next)));await assertSucceeds(get(ref(db(),'worlds/main')));await assertFails(set(ref(db(),'chat/global'),{sequence:1}));});
test('개막 후 시즌1 생성·군주 등록·랜덤 시작 가능, 테스트 기록 그대로 유지',async()=>{const now=Date.now();await load(now-60000,now-1000);let s=V5.createWorld(now,'season-1');s.command.actor='a';await assertSucceeds(set(ref(db(),'worlds/season-1'),s));let n=V5.applyCommand(s,'a',{id:'season1-register-new',type:'register',name:'새 시즌 군주',baseRevision:s.revision,at:Date.now()});await assertSucceeds(update(ref(db(),'worlds/season-1'),changedPaths(s,n)));s=n;n=V5.applyCommand(s,'a',{id:'season1-start-new',type:'start',baseRevision:s.revision,at:Date.now()});await assertSucceeds(update(ref(db(),'worlds/season-1'),changedPaths(s,n)));assert.equal(Object.values(n.territories).filter(t=>t.owner==='a').length,1);});
