import fs from 'node:fs';
import {TEST_END,SEASON1_START} from '../src/seasons.js';
import {RELEASE} from '../src/engine.js';
import {MAP} from '../src/game-core.js';
export function makeSeasonRules(end=TEST_END,start=SEASON1_START){
 const root=JSON.parse(fs.readFileSync('tests/fixtures/protocol4.rules.json','utf8'));
 const next=JSON.parse(fs.readFileSync('tests/fixtures/protocol5.rules.json','utf8'));
 const w=root.rules.worlds.$world,v5=next.rules.worlds.$world;
 if(Date.now()>=end){const read=w['.read'];const season=JSON.parse(JSON.stringify(v5).replaceAll("$world=='main'","$world=='season-1'"));season['.write']=`(${season['.write']})&&now>=${start}&&newData.child('command').child('at').val()>=${start}`;const chat=JSON.parse(JSON.stringify(next.rules.chat.global).replaceAll(".child('main')",".child('season-1')"));chat['.write']=`(${chat['.write']})&&now>=${start}`;root.rules.worlds={main:{'.read':read,'.write':false},'$world':season};root.rules.chat={global:{'.read':read,'.write':false},'season-1':chat};return root;}
 const gate=`(($world=='main'&&now<${end}&&newData.child('command').child('at').val()<${end})||($world=='season-1'&&now>=${start}&&newData.child('command').child('at').val()>=${start}))`;
 const version="($world=='main'?4:5)";
 w['.write']=w['.write'].replace("$world=='main'",gate).replace(/(\.child\('(featureVersion|protocol)'\)\.val\(\)\s*==\s*)4\b/g,`$1${version}`).replaceAll("'update-20261028-auto-roles-10s'",`($world=='main'?'update-20261028-auto-roles-10s':'${RELEASE.id}')`);
 w.featureVersion['.validate']=`newData.val()==${version}`;w.command.protocol['.validate']=`newData.val()==${version}`;
 for(const p of MAP.places){const old={normal:15,stronghold:19,citadel:23}[p.rank],updated={normal:15,stronghold:17,citadel:19}[p.rank];if(old===updated)continue;const before=`($tid=='${p.id}'&&!newData.child('units').hasChild('${old}')`;const after=`($tid=='${p.id}'&&!newData.child('units').hasChild($world=='main'?'${old}':'${updated}')`;if(!w.territories.$tid['.validate'].includes(before))throw Error(`Missing capacity ${p.id}`);w.territories.$tid['.validate']=w.territories.$tid['.validate'].replace(before,after);}
 // Group the identical per-city limits so both season protocols fit in the rules editor.
 const capacityClauses=MAP.places.map(p=>`($tid=='${p.id}'&&!newData.child('units').hasChild(${p.rank==='normal'?"'15'":p.rank==='stronghold'?"$world=='main'?'19':'17'":"$world=='main'?'23':'19'"}))`).join('||');
 const grouped=['normal','stronghold','citadel'].map(rank=>{const ids=MAP.places.filter(p=>p.rank===rank).map(p=>p.id).join('|'),limit=rank==='normal'?"'15'":rank==='stronghold'?"$world=='main'?'19':'17'":"$world=='main'?'23':'19'";return `($tid.matches(/^(${ids})$/)&&!newData.child('units').hasChild(${limit}))`;}).join('||');
 if(!w.territories.$tid['.validate'].includes(capacityClauses))throw Error('Capacity clauses changed');
 w.territories.$tid['.validate']=w.territories.$tid['.validate'].replace(capacityClauses,grouped);
 const historic=w.history.$event['.validate'];
 w.history.$event['.validate']=`($world=='main'?(${historic}):(${v5.history.$event['.validate']}))`;
 w.release['.validate']=w.release['.validate'].replace("'update-20261028-auto-roles-10s'",`($world=='main'?'update-20261028-auto-roles-10s':'${RELEASE.id}')`);
 w.capacityMigration={'.validate':"$world=='season-1' && ("+v5.capacityMigration['.validate']+")"};
 w.returnQueues.$uid.capacityOrigins={'$unit':{'.validate':"$world=='season-1' && ("+v5.returnQueues.$uid.capacityOrigins.$unit['.validate']+")"}};
 const old=root.rules.chat.global,chat=JSON.parse(JSON.stringify(old).replaceAll(".child('main')",".child('season-1')"));
 old['.write']=`(${old['.write']})&&now<${end}`;chat['.write']=`(${chat['.write']})&&now>=${start}`;root.rules.chat['season-1']=chat;
 return root;
}
if(process.argv[1]?.endsWith('generate-season-rules.mjs')){fs.writeFileSync('firebase.database.rules.json',JSON.stringify(makeSeasonRules())+'\n');console.log('Season rules generated for v4 test season and v5 season 1.');}
