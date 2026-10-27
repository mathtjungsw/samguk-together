import fs from 'node:fs';
import assert from 'node:assert/strict';
import {upgradeWorld,normalizeWorld,refreshIndexes} from '../src/engine.js';
import * as V3 from '../src/engine-v3.js';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node tools/prepare-upgrade-v4.mjs <private-root-backup.json> <private-world.json>');
const root=JSON.parse(fs.readFileSync(input,'utf8')),old=V3.normalizeWorld(root.worlds?.main||root);
assert.equal(old.featureVersion,3,'This tool migrates an existing v3 world only.');
const inventory=s=>[...Object.values(s.territories).flatMap(t=>t.units.map(u=>({id:u.id,name:u.name,sides:u.sides,readyAt:u.readyAt,owner:t.owner,territory:t.id,effectState:u.effectState||null}))),...Object.entries(s.returnQueues||{}).flatMap(([owner,q])=>q.units.map(u=>({id:u.id,name:u.name,sides:u.sides,readyAt:u.readyAt,owner,territory:'',effectState:u.effectState||null})))];
const cutoff=Math.max(Date.now(),old.updatedAt),settled=structuredClone(old);
V3.settleRecruitment(settled,cutoff);
const after=upgradeWorld(old,cutoff),saved=new Map(inventory(after).map(u=>[u.id,u]));
// V3 recruitment may legitimately update counters or place queued troops at the cutoff.
// Compare against that same deterministic V3 settlement, then verify old identities too.
for(const u of inventory(settled))assert.deepEqual(saved.get(u.id),u,'Settled unit changed during migration.');
for(const u of inventory(old)){const kept=saved.get(u.id);assert.ok(kept,'Preexisting unit missing.');for(const key of ['id','name','sides'])assert.equal(kept[key],u[key]);}
for(const [uid,p] of Object.entries(old.players))for(const field of ['name','life','kills','deaths','revived','exchanged'])if(p[field]!==undefined)assert.equal(after.players[uid][field],p[field]);
after.history=Object.fromEntries(Object.entries(after.history).sort(([,a],[,b])=>b.at-a.at).slice(0,100));
after.revision=old.revision+1;after.command={id:'migration-v4-'+cutoff,type:'recruit',actor:old.command.actor,at:cutoff,baseRevision:old.revision,from:'',to:'',battleId:'',guardChoice:'',officerMove:false,seed:0,protocol:4,resolved:{},resolutionByTerritory:{},resolutionByPlayer:{},origins:{}};
refreshIndexes(after);normalizeWorld(after);
fs.writeFileSync(output,JSON.stringify(after,null,2)+'\n');
console.log(JSON.stringify({cutoff,players:Object.keys(after.players).length,preservedUnits:inventory(old).length,totalUnits:saved.size,namedHeroes:Object.keys(after.heroIndex).length,roleMigration:after.roleMigration,revision:after.revision},null,2));
