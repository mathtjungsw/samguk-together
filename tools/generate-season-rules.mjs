import fs from 'node:fs';
import {TEST_END,SEASON1_START} from '../src/seasons.js';
export function makeSeasonRules(testEnd=TEST_END,seasonStart=SEASON1_START,now=Date.now()){
const old=JSON.parse(fs.readFileSync('tests/fixtures/protocol4.rules.json','utf8'));
const next=JSON.parse(fs.readFileSync('tests/fixtures/protocol5.rules.json','utf8'));
function forWorld(value,id){if(Array.isArray(value))return value.map(v=>forWorld(v,id));if(typeof value==='string')return value.replaceAll("$world=='main'",'true').replaceAll("$world == 'main'",'true').replaceAll('$world',`'${id}'`);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,forWorld(v,id)]));return value;}
const main=forWorld(old.rules.worlds.$world,'main'),season=forWorld(next.rules.worlds.$world,'season-1');
main['.write']=`(${main['.write']}) && now < ${testEnd} && newData.child('command').child('at').val() < ${testEnd}`;
season['.write']=`(${season['.write']}) && now >= ${seasonStart} && newData.child('command').child('at').val() >= ${seasonStart}`;
const global=structuredClone(old.rules.chat.global),newChat=JSON.parse(JSON.stringify(next.rules.chat.global).replaceAll(".child('main')",".child('season-1')"));
global['.write']=`(${global['.write']}) && now < ${testEnd}`;
newChat['.write']=`(${newChat['.write']}) && now >= ${seasonStart}`;
const root={rules:{...next.rules,worlds:{main,'season-1':season,'$other':{'.write':false}},chat:{global,'season-1':newChat,'$other':{'.write':false}}}};
if(now>=testEnd){root.rules.worlds.main={'.read':main['.read'],'.write':false};root.rules.chat.global={'.read':global['.read'],'.write':false};}
return root;
}
if(process.argv[1]?.endsWith('generate-season-rules.mjs')){fs.writeFileSync('firebase.database.rules.json',JSON.stringify(makeSeasonRules())+'\n');console.log('Season rules: test closes 2026-10-28 11:00 KST; season 1 opens 12:00 KST.');}
