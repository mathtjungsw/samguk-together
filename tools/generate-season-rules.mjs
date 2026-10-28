import fs from 'node:fs';
import {TEST_END,SEASON1_START} from '../src/seasons.js';
export function makeSeasonRules(end=TEST_END,start=SEASON1_START){
 const root=JSON.parse(fs.readFileSync('tests/fixtures/protocol4.rules.json','utf8')),w=root.rules.worlds.$world;
 const gate=`(($world=='main'&&now<${end}&&newData.child('command').child('at').val()<${end})||($world=='season-1'&&now>=${start}&&newData.child('command').child('at').val()>=${start}))`;
 w['.write']=w['.write'].replace("$world=='main'",gate);
 const old=root.rules.chat.global,chat=JSON.parse(JSON.stringify(old).replaceAll(".child('main')",".child('season-1')"));
 old['.write']=`(${old['.write']})&&now<${end}`;chat['.write']=`(${chat['.write']})&&now>=${start}`;
 root.rules.chat['season-1']=chat;return root;
}
if(process.argv[1]?.endsWith('generate-season-rules.mjs'))fs.writeFileSync('firebase.database.rules.json',JSON.stringify(makeSeasonRules())+'\n');
