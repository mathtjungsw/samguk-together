// Isolated emulator only. Counts actual UTF-8 WebSocket message payloads, not TLS.
import fs from 'node:fs';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
if(process.env.FIREBASE_DATABASE_EMULATOR_HOST!=='127.0.0.1:9000')throw Error('격리 에뮬레이터에서만 실행합니다.');
const require=createRequire(import.meta.url),Socket=require('faye-websocket').Client,dispatch=Socket.prototype.dispatchEvent;
let bytes=0,frames=0;const sockets=new Set();
Socket.prototype.dispatchEvent=function(e){if(e.type==='message'&&String(this.url).includes('ns=demo-enhancement-traffic')){bytes+=Buffer.byteLength(e.data);frames++;sockets.add(this);}return dispatch.call(this,e);};
const {initializeTestEnvironment}=await import('@firebase/rules-unit-testing'),sdk=await import('firebase/database');
const {createSeasonWorld}=await import('../src/seasons.js'),{applyCommand}=await import('../src/engine-next.js'),{applyEnhancement,defaultEnhancementMaterials}=await import('../src/enhancement-actions.js');
const {rewardTransaction,packBattleRecords,publishBattleRecords}=await import('../server/reward-transaction.js'),{WorldReader,historyFeed}=await import('../src/world-data.js');
const adminRequire=createRequire(new URL('../functions/package.json',import.meta.url)),{initializeApp,deleteApp}=adminRequire('firebase-admin/app'),{getDatabase}=adminRequire('firebase-admin/database');
const project='demo-enhancement-traffic',env=await initializeTestEnvironment({projectId:project,database:{host:'127.0.0.1',port:9000,rules:'{"rules":{".read":true,".write":false}}'}}),app=initializeApp({projectId:project,databaseURL:'https://'+project+'.firebaseio.com',credential:{getAccessToken:async()=>({access_token:'owner',expires_in:3600})}},'traffic-writer');
const db=getDatabase(app),readers=[],at=Date.now();let s=createSeasonWorld(5,at-10000,'traffic-identical');
for(const type of ['register','start'])s=applyCommand(s,'a',{type,name:'군주',id:'traffic-'+type,at,baseRevision:s.revision});
const city=Object.values(s.territories).find(t=>t.owner==='a'),target=city.units[1],req={id:'traffic-enhancement-new',city:city.id,unitId:target.id,seq:100,materialIds:defaultEnhancementMaterials(city,target.id,at)},sample=applyEnhancement(s,'a',{...req,seq:0},at,0).result;
s.players.a.enhanceSeq=100;s.history={};const ledger={};
for(let i=0;i<100;i++){const id='traffic-old-'+i,r={...sample,id,seq:i,at:at-1000+i};ledger[id]=r;s.history[id]={id,at:r.at,type:'enhance',actor:'a',text:'군주 · 병사 강화 성공 +0→+1',from:city.id,to:city.id,enhancement:r};}s.enhancementLedger=JSON.stringify(ledger);
const reports=[];let expected;
try{for(const compact of [false,true]){
 const id=compact?'compact':'legacy',r=db.ref('worlds/'+id);let initial=compact?packBattleRecords({...s,enhancementStorageVersion:1},s):s;
 await r.set(initial);if(compact){await publishBattleRecords(r,initial);initial=(await r.get()).val();}await db.ref('historyFeed/'+id).set(historyFeed(initial));
 const active=[];for(let i=0;i<10;i++){const client=env.authenticatedContext(id+'-viewer-'+i).database(),reader=new WorldReader(sdk,client._delegate||client,id);await reader.read();reader.start();readers.push(reader);active.push(reader);}
 await new Promise(r=>setTimeout(r,100));const start=bytes,startFrames=frames;
 const out=await rewardTransaction(r,raw=>applyEnhancement(raw,'a',req,Math.max(at+1,raw.updatedAt),0).world,{compactEnhancements:compact}),next=out.snapshot.val();
 await db.ref('historyFeed/'+id).set(historyFeed(next));
 for(let tries=0;tries<100&&active.some(r=>r.raw.revision!==next.revision||r.feed?.revision!==next.revision);tries++)await new Promise(r=>setTimeout(r,20));
 assert.ok(active.every(r=>r.raw.revision===next.revision&&r.feed?.revision===next.revision));await new Promise(r=>setTimeout(r,100));
 const received=bytes-start;assert.ok(received>0);const final=(await r.get()).val();
 if(expected)assert.deepEqual(final.territories,expected);else expected=final.territories;
 reports.push({mode:id,viewers:10,initialWorldBytes:Buffer.byteLength(JSON.stringify(initial)),storedWorldBytes:Buffer.byteLength(JSON.stringify(final)),webSocketPayloadBytes:received,messageFrames:frames-startFrames});
 for(const reader of active)reader.close();
 }
 const proof={scope:'isolated-emulator-identical-state-one-enhancement-10-viewers',includes:'instrumented faye WebSocket inbound UTF-8 payloads; no TLS/HTTP overhead; not billing',observedSockets:sockets.size,reports,reductionPercent:100*(1-reports[1].webSocketPayloadBytes/reports[0].webSocketPayloadBytes)};
 fs.mkdirSync('playtest',{recursive:true});fs.writeFileSync('playtest/enhancement-traffic-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{for(const reader of readers)reader.close();await deleteApp(app);await env.cleanup();Socket.prototype.dispatchEvent=dispatch;}
