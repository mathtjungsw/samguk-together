import {currentWorldId} from './current-world.mjs';
// Explicitly authorized, structural-only migration. ETag protects concurrent play.
import fs from 'node:fs';import {createRequire} from 'node:module';
import {packBattleRecords,recordPublicationPatch} from '../server/battle-records.js';import {recordHash} from '../server/record-versions.js';import {historyFeed} from '../src/world-data.js';
const require=createRequire(import.meta.url),auth=require('../node_modules/firebase-tools/lib/auth.js'),{requireAuth}=require('../node_modules/firebase-tools/lib/requireAuth.js'),{Client}=require('../node_modules/firebase-tools/lib/apiv2.js');
const config=JSON.parse(fs.readFileSync('firebase-config.json'));if(config.firebase.projectId!=='samguk-together')throw Error('게임 프로젝트가 다릅니다.');
await requireAuth({project:config.firebase.projectId,...auth.getGlobalDefaultAccount(),nonInteractive:true});const api=new Client({urlPrefix:config.firebase.databaseURL,auth:true});
const id=await currentWorldId(api);
let saved,before,backup;
for(let attempt=0;attempt<5;attempt++){
 const read=await api.get('/worlds/'+id+'.json',{headers:{'X-Firebase-ETag':'true'}}),s=read.body;
 if(s?.season?.id!==id||s.season.campaignVersion!==1)throw Error('대상 저장 버전이 다릅니다.');
 backup='playtest/pre-record-migration-'+id+'-'+Date.now()+'.json';fs.writeFileSync(backup,JSON.stringify(s));
 const n=packBattleRecords(s,s,{activate:true});
 for(const field of Object.keys(s).filter(k=>!['history','recordOutbox','recordStorageVersion'].includes(k)))if(recordHash(s[field])!==recordHash(n[field]))throw Error('게임 필드 보존 실패: '+field);
 if(Object.keys(n.history||{}).length!==Object.keys(s.history||{}).length)throw Error('전황 개수가 달라졌습니다.');
 const etag=read.response.headers.get('etag');if(!etag)throw Error('동시 저장 보호가 없습니다.');
 try{await api.put('/worlds/'+id+'.json',n,{headers:{'if-match':etag}});saved=n;before=s;break;}catch(error){if(error.status!==412&&error.context?.response?.statusCode!==412)throw error;}
}
if(!saved)throw Error('동시 명령이 많아 원본을 보존했습니다. 다시 실행해 주세요.');
const patch=recordPublicationPatch(id,saved.recordOutbox);if(Object.keys(patch).length)await api.patch('/.json',patch);
const current=(await api.get('/worlds/'+id+'.json')).body;
if(current.recordStorageVersion!==1||Object.values(current.history||{}).some(e=>e.type==='battle'&&e.result))throw Error('전투 요약 형식 확인 실패');
const records=(await api.get('/battleRecords/'+id+'.json')).body||{};
let verified=0;
for(const [version,item]of Object.entries(saved.recordOutbox||{}))if(!item.remove&&current.history?.[item.id]?.detailVersion===version){const got=records[item.id]?.[version];if(!got||recordHash(got)!==recordHash(item.event))throw Error('전투 상세 보존 확인 실패: '+item.id);verified++;}
const feed=historyFeed(current),path='/historyFeed/'+id+'.json';
for(let attempt=0;attempt<5;attempt++){const read=await api.get(path,{headers:{'X-Firebase-ETag':'true'}});if(read.body?.revision>feed.revision)break;try{await api.put(path,feed,{headers:{'if-match':read.response.headers.get('etag')}});break;}catch(error){if(attempt===4||error.status!==412&&error.context?.response?.statusCode!==412)throw error;}}
const bytes=s=>Buffer.byteLength(JSON.stringify(s));const proof={season:id,backup,beforeBytes:bytes(before),afterBytes:bytes(current),reductionPercent:100*(1-bytes(current)/bytes(before)),legacyDetails:Object.values(before.history||{}).filter(e=>e.type==='battle'&&e.result).length,verifiedDetails:verified,historyCount:Object.keys(current.history||{}).length,pendingPublications:Object.keys(current.recordOutbox||{}).length,gameFieldsPreserved:true,originalRevision:before.revision,observedRevision:current.revision};
fs.writeFileSync('playtest/battle-record-migration-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
