import fs from 'node:fs';
import {MAP,RANKS,RELEASE} from '../src/engine.js';
const root=JSON.parse(fs.readFileSync('tests/fixtures/protocol4.rules.json','utf8')),w=root.rules.worlds.$world;
function patch(o){for(const [k,v] of Object.entries(o)){if(v&&typeof v==='object')patch(v);else if(typeof v==='string')o[k]=v.replace(/(\.child\('(featureVersion|protocol)'\)\.val\(\)\s*==\s*)4\b/g,'$15').replaceAll(".child('featureVersion').val() == 4",".child('featureVersion').val() == 5").replaceAll(".child('protocol').val() == 4",".child('protocol').val() == 5").replaceAll('update-20261028-auto-roles-10s',RELEASE.id);}}
patch(w);w.featureVersion['.validate']='newData.val() == 5';w.command.protocol['.validate']='newData.val() == 5';
for(const p of MAP.places){const old={normal:12,stronghold:16,citadel:20}[p.rank]+3;w.territories.$tid['.validate']=w.territories.$tid['.validate'].replace(`($tid=='${p.id}'&&!newData.child('units').hasChild('${old}')`, `($tid=='${p.id}'&&!newData.child('units').hasChild('${RANKS[p.rank].capacity+3}')`);}
w.capacityMigration={'.validate':'data.exists() && newData.val() == data.val() || !data.exists() && newData.parent().child("command").child("type").val() == "init"'};
w.returnQueues.$uid.capacityOrigins={'$unit':{'.validate':'data.exists() && newData.val() == data.val()'}};
const h=w.history[Object.keys(w.history).find(k=>k.startsWith('$'))];
h['.validate']+=" && (data.exists() || newData.child('type').val() != 'battle' || (newData.child('result').child('combatVersion').val() == 5 && newData.child('result').child('policy').child('delta').val() == (newData.child('result').child('score').val() > newData.child('result').child('defense').val() ? newData.child('result').child('score').val() - newData.child('result').child('defense').val() : newData.child('result').child('defense').val() - newData.child('result').child('score').val())))";
fs.writeFileSync('firebase.database.rules.json',JSON.stringify(root)+'\n');console.log('Generated protocol 5 rules');
