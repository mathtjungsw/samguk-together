// Run only after the compatible functions, rules and site are deployed.
import fs from 'node:fs';import {createRequire} from 'node:module';
import {currentWorldId} from './current-world.mjs';import {packBattleRecords,recordPublicationPatch} from '../server/battle-records.js';
import {enhancementPublicationPatch} from '../server/enhancement-records.js';import {recordHash} from '../server/record-versions.js';import {historyFeed} from '../src/world-data.js';
const require=createRequire(import.meta.url),auth=require('../node_modules/firebase-tools/lib/auth.js'),{requireAuth}=require('../node_modules/firebase-tools/lib/requireAuth.js'),{Client}=require('../node_modules/firebase-tools/lib/apiv2.js');
const cfg=JSON.parse(fs.readFileSync('firebase-config.json'));if(cfg.firebase.projectId!=='samguk-together')throw Error('게임 프로젝트를 확인해 주세요.');
await requireAuth({project:cfg.firebase.projectId,...auth.getGlobalDefaultAccount(),nonInteractive:true});const api=new Client({urlPrefix:cfg.firebase.databaseURL,auth:true}),id=await currentWorldId(api);
let before,saved,backup;
for(let attempt=0;attempt<5;attempt++){
 const read=await api.get('/worlds/'+id+'.json',{headers:{'X-Firebase-ETag':'true'}}),s=read.body;
 if(s?.season?.id!==id||s.season.campaignVersion!==1||s.recordStorageVersion!==1)throw Error('대상 전장 형식을 확인해 주세요.');
 backup='playtest/pre-enhancement-compact-'+id+'-'+Date.now()+'.json';fs.writeFileSync(backup,JSON.stringify(s));
 const n=packBattleRecords({...s,enhancementStorageVersion:1},s),allowed=new Set(['history','enhancementLedger','enhancementOutbox','enhancementStorageVersion','recordOutbox']);
 for(const k of Object.keys(s))if(!allowed.has(k)&&recordHash(s[k])!==recordHash(n[k]))throw Error('게임 필드 보존 실패: '+k);
 if(Object.keys(n.history||{}).length!==Object.keys(s.history||{}).length)throw Error('전황 개수 보존 실패');
 const etag=read.response.headers.get('etag');if(!etag)throw Error('동시 저장 보호가 없습니다.');
 try{await api.put('/worlds/'+id+'.json',n,{headers:{'if-match':etag}});before=s;saved=n;break;}catch(e){if(e.status!==412&&e.context?.response?.statusCode!==412)throw e;}
}
if(!saved)throw Error('동시 저장이 많아 원본을 보존했습니다.');
const patch={...recordPublicationPatch(id,saved.recordOutbox),...enhancementPublicationPatch(id,saved.enhancementOutbox)};if(Object.keys(patch).length)await api.patch('/.json',patch);
let verified=0;const legacy=JSON.parse(before.enhancementLedger||'{}');
for(const [version,item]of Object.entries(saved.enhancementOutbox||{}))if(!item.remove){const got=(await api.get('/enhancementRecords/'+id+'/'+item.id+'/'+version+'.json')).body?.enhancement,original=legacy[item.id];if(!got||original&&!original.detailVersion&&recordHash({booster:null,...got})!==recordHash(original))throw Error('강화 상세 보존 실패: '+item.id);verified++;}
// Enable lazy conversion in subsequent seasons only after all compatible code exists.
await api.put('/serverOptimizations/enhancementRecords.json',true);
const current=(await api.get('/worlds/'+id+'.json')).body,feed=historyFeed(current),path='/historyFeed/'+id+'.json';
for(let attempt=0;attempt<5;attempt++){const read=await api.get(path,{headers:{'X-Firebase-ETag':'true'}});if(read.body?.revision>feed.revision)break;try{await api.put(path,feed,{headers:{'if-match':read.response.headers.get('etag')}});break;}catch(e){if(attempt===4||e.status!==412&&e.context?.response?.statusCode!==412)throw e;}}
const clean={...saved};delete clean.enhancementOutbox;delete clean.recordOutbox;const bytes=s=>Buffer.byteLength(JSON.stringify(s));
const proof={season:id,backup,sourceRevision:before.revision,observedRevision:current.revision,beforeBytes:bytes(before),compactedBytes:bytes(clean),reductionPercent:100*(1-bytes(clean)/bytes(before)),verifiedResults:verified,historyCount:Object.keys(saved.history||{}).length,receiptCount:Object.keys(JSON.parse(saved.enhancementLedger||'{}')).length,gameFieldsPreserved:true,enabled:true};
fs.writeFileSync('playtest/enhancement-compact-activation.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
