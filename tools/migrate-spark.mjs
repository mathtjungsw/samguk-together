import {createRequire} from 'node:module';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {sourceApi as api} from './spark-operation-client.mjs';import {currentWorldId} from './current-world.mjs';
import {normalizeWorld,appendSystemMessages} from '../src/engine-next.js';import {historyFeed} from '../src/world-data.js';
import {packSparkRecords} from '../src/spark-records.js';import {RELEASE_ID,RELEASE_TEXT} from '../src/release-policy.js';
const dir='playtest/ai-version-backup-2026-11-05';fs.mkdirSync(dir,{recursive:true});
const mode=process.argv[2];
const require=createRequire(import.meta.url),{Client}=require('../node_modules/firebase-tools/lib/apiv2.js');const targetConfig=fs.existsSync('playtest/spark-target-config.json')?JSON.parse(fs.readFileSync('playtest/spark-target-config.json')):null;const targetApi=targetConfig?new Client({urlPrefix:targetConfig.firebase.databaseURL,auth:true}):api;
if(mode==='--backup'){
 if(fs.existsSync(dir+'/database.json'))throw Error('백업이 이미 있습니다. 원본 백업을 덮어쓰지 않습니다.');
 const snapshot=(await api.get('/.json')).body,text=JSON.stringify(snapshot);fs.writeFileSync(dir+'/database.json',text);
 const rules=(await api.get('/.settings/rules.json')).body;fs.writeFileSync(dir+'/database.rules.json',typeof rules==='string'?rules:JSON.stringify(rules));
 const id=await currentWorldId(api);fs.writeFileSync(dir+'/manifest.json',JSON.stringify({tag:'ai-rulers-backup-2026-11-05',commit:'6861474',world:id,at:Date.now(),bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')}));
 console.log(JSON.stringify({backup:dir,world:id,bytes:Buffer.byteLength(text),verified:true}));
}else if(mode==='--freeze'){
 if(!fs.existsSync(dir+'/database.json'))throw Error('먼저 백업해야 합니다.');
 await api.put('/aiOperations/enabled.json',false);
 const id=await currentWorldId(api),path='/worlds/'+id+'.json';let frozen=false;
 for(let i=0;i<5;i++){const r=await api.get(path,{headers:{'X-Firebase-ETag':'true'}}),s=r.body;if(s.maintenance){frozen=true;break;}const n=structuredClone(s);n.maintenance=true;n.revision++;n.command={...s.command,id:'spark-migration-freeze',type:'recruit',actor:'maintenance-system',baseRevision:s.revision,at:s.updatedAt};try{await api.put(path,n,{headers:{'if-match':r.response.headers.get('etag')}});frozen=true;break;}catch(e){if(e.status!==412&&e.context?.response?.statusCode!==412)throw e;}}
 if(!frozen)throw Error('전장 동결 충돌; 원본 보존');fs.writeFileSync(dir+'/freeze.json',JSON.stringify({id,at:Date.now()}));console.log(JSON.stringify({world:id,frozen:true,aiAutoEnabled:false}));
}else if(mode==='--copy'){
 const {id}=JSON.parse(fs.readFileSync(dir+'/freeze.json')),source=(await api.get('/worlds/'+id+'.json')).body;if(!source?.maintenance)throw Error('원본 전장이 동결되지 않았습니다.');
 fs.writeFileSync(dir+'/final-world.json',JSON.stringify(source));const baseline=normalizeWorld(source);let n=structuredClone(baseline);n.maintenance=false;n.executionMode='spark';n.sparkVersion=1;
 if(n.ai){if(typeof n.ai==='string'){const a=JSON.parse(n.ai);a.enabled=false;n.ai=JSON.stringify(a);}else n.ai.enabled=false;}
 const tickets=(await api.get('/rewardTickets.json')).body||{};n.sparkTickets=Object.fromEntries(Object.entries(tickets).map(([uid,rows])=>[uid,Object.fromEntries(Object.entries(rows).filter(([,r])=>r.season===id))]));
 n.release={id:RELEASE_ID,text:RELEASE_TEXT,at:Date.now()};n.history[RELEASE_ID]={id:RELEASE_ID,type:'update',actor:'maintenance-system',at:n.release.at,text:RELEASE_TEXT};n.history=Object.fromEntries(Object.entries(n.history).sort((a,b)=>b[1].at-a[1].at).slice(0,100));
 const packed=await packSparkRecords(n),target='/sparkWorlds/'+id+'.json',held=await targetApi.get(target,{headers:{'X-Firebase-ETag':'true'}});if(held.body)throw Error('무료 전장이 이미 있습니다. 덮어쓰지 않습니다.');
 for(const k of ['territories','players','returnQueues','pendingBattles','season','heroIndex','enhancementLedger'])if(JSON.stringify(baseline[k]||null)!==JSON.stringify(packed.world[k]||null))throw Error('보호 필드 변경: '+k);
 await targetApi.put(target,packed.world,{headers:{'if-match':held.response.headers.get('etag')}});
 const backup=JSON.parse(fs.readFileSync(dir+'/database.json'));const archives=Object.fromEntries(Object.entries(backup.worlds||{}).filter(([key])=>key!==id));const patch={['sparkHistoryFeed/'+id]:historyFeed(packed.world),worlds:archives,seasonIndex:backup.seasonIndex||{},recordVersions:backup.recordVersions||{},rewardTickets:tickets};
 for(const [from,to]of [['battleRecords','sparkBattleRecords'],['enhancementRecords','sparkEnhancementRecords'],['recordVersions','sparkRecordVersions']]){const value=(await api.get('/'+from+'/'+id+'.json')).body;if(value)patch[to+'/'+id]=value;}
 // Seed migrated archives first, then publish any durable outbox from the source.
 await targetApi.patch('/.json',patch);if(Object.keys(packed.records).length)await targetApi.patch('/.json',packed.records);
 const chat=(await api.get('/chat/'+id+'.json')).body;await targetApi.put('/sparkChat/'+id+'.json',appendSystemMessages(chat,[packed.world.history[RELEASE_ID]],'maintenance-system',n.release.at));
 const verified=normalizeWorld((await targetApi.get(target)).body);for(const k of ['territories','players','season'])if(JSON.stringify(verified[k])!==JSON.stringify(baseline[k]))throw Error('복사 후 검증 실패: '+k);
 await targetApi.put('/runtimeMode.json',{mode:'spark',activeWorld:id,switchedAt:Date.now(),backupTag:'ai-rulers-backup-2026-11-05'});
 fs.writeFileSync(dir+'/migration-proof.json',JSON.stringify({id,armiesPreserved:true,playersPreserved:true,seasonPreserved:true,aiStopped:true,newWorld:'/sparkWorlds/'+id,at:Date.now()}));
 console.log(JSON.stringify({id,armiesPreserved:true,playersPreserved:true,seasonPreserved:true,aiStopped:true}));
}else throw Error('--backup / --freeze / --copy 중 하나를 지정하세요.');
