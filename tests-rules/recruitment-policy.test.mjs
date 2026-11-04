import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';import {ref,set} from 'firebase/database';
import {makeSeasonRules} from '../tools/generate-season-rules.mjs';
import {rewardTransaction} from '../server/reward-transaction.js';
import {normalizeWorld,settleRecruitment} from '../src/engine-next.js';
import {recruitmentFixture} from '../tests/recruitment-helpers.mjs';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),{initializeApp,deleteApp}=require('firebase-admin/app'),{getDatabase}=require('firebase-admin/database');let env,app,db;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-samguk-online',database:{host:'127.0.0.1',port:9000,rules:JSON.stringify(makeSeasonRules())}});process.env.FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:9000';app=initializeApp({projectId:'demo-samguk-online',databaseURL:'https://demo-samguk-online.firebaseio.com',credential:{getAccessToken:async()=>({access_token:'owner',expires_in:3600})}},'recruitment-policy-tests');db=getDatabase(app);});
after(async()=>{await deleteApp(app);await env.cleanup();});
test('server transaction keeps season5 D4 fallback and season6 D6 fallback across reload and replay',async()=>{
 for(const number of [5,6]){const {s,t,due}=recruitmentFixture(number),r=db.ref('worlds/season-'+number);await r.set(s);
  const apply=()=>rewardTransaction(r,raw=>{const n=normalizeWorld(raw);settleRecruitment(n,due);n.updatedAt=due;return n;});await apply();const n=normalizeWorld((await r.get()).val()),u=n.territories[t.id].units.at(-1);assert.equal(u.sides,number===6?6:4);assert.equal(n.season.recruitmentVersion,number===6?2:undefined);assert.deepEqual(n.heroIndex,s.heroIndex);await apply();assert.deepEqual(normalizeWorld((await r.get()).val()).territories,n.territories);
 }
});
test('players cannot activate, disable or create a recruitment policy in server-owned campaign worlds',async()=>{
 const player=env.authenticatedContext('a',{firebase:{sign_in_provider:'google.com'}}).database();
 for(const season of [5,6])for(const policy of [1,2,null])await assertFails(set(ref(player,'worlds/season-'+season+'/season/recruitmentVersion'),policy));
});
