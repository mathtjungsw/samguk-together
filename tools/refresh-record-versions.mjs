// Rebuild small archive version stamps without changing any game/archive data.
import {createRequire} from 'node:module';import fs from 'node:fs';
import {recordHash} from '../server/record-versions.js';import {archiveTestSeason} from '../src/seasons.js';
const require=createRequire(import.meta.url),auth=require('../node_modules/firebase-tools/lib/auth.js'),{requireAuth}=require('../node_modules/firebase-tools/lib/requireAuth.js'),{Client}=require('../node_modules/firebase-tools/lib/apiv2.js');
const config=JSON.parse(fs.readFileSync('firebase-config.json','utf8'));await requireAuth({project:config.firebase.projectId,...auth.getGlobalDefaultAccount(),nonInteractive:true});
const api=new Client({urlPrefix:config.firebase.databaseURL,auth:true}),index=(await api.get('/seasonIndex.json')).body||{};
for(const id of [...Object.keys(index),'main']){const raw=(await api.get(id==='main'?'/worlds/main.json':'/worlds/'+id+'/season/result.json')).body;if(!raw)continue;const result=id==='main'?archiveTestSeason(raw):raw;await api.put('/recordVersions/'+id+'/archive.json',JSON.stringify(recordHash(result)));console.log('Archive version refreshed:',id);}
