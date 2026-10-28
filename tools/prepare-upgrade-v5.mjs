import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as V4 from '../src/engine-v4.js';
import {upgradeWorld,normalizeWorld,refreshIndexes} from '../src/engine.js';
const [input,output,time,worldId='season-1']=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node tools/prepare-upgrade-v5.mjs <private-backup.json> <private-output.json> [cutoff-ms] [worldId=season-1]');
if(worldId==='main')throw Error('Do not migrate the archived test season. Target season-1 instead.');
if(fs.existsSync(output))throw Error('Output already exists; preserve it and choose a new output path.');
const root=JSON.parse(fs.readFileSync(input,'utf8'));if(root.worlds&&!root.worlds[worldId])throw Error('Requested season world does not exist in this backup.');const old=V4.normalizeWorld(root.worlds?.[worldId]||root);
assert.equal(old.featureVersion,4);const at=time?Number(time):Math.max(Date.now(),old.updatedAt);
const settled=structuredClone(old);V4.settleRecruitment(settled,at);
const inventory=s=>[...Object.values(s.territories).flatMap(t=>t.units.map(u=>({u,owner:t.owner}))),...Object.entries(s.returnQueues).flatMap(([owner,q])=>q.units.map(u=>({u,owner})))];
const after=upgradeWorld(old,at),kept=new Map(inventory(after).map(x=>[x.u.id,x]));
assert.equal(kept.size,inventory(settled).length);
for(const {u,owner} of inventory(settled)){const x=kept.get(u.id);assert.ok(x);assert.equal(x.owner,owner);for(const key of ['id','name','sides','heroId','createdAt','effectState'])assert.deepEqual(x.u[key],u[key]);assert.ok(x.u.readyAt>=u.readyAt);assert.ok(x.u.moveReadyAt>=u.moveReadyAt);}
assert.deepEqual(after.players,settled.players);assert.deepEqual(after.history,settled.history);
after.revision=old.revision+1;after.command={...after.command,id:'migration-v5-'+at,type:'recruit',at,baseRevision:old.revision,protocol:5};
refreshIndexes(after);normalizeWorld(after);fs.writeFileSync(output,JSON.stringify(after,null,2)+'\n');
console.log(JSON.stringify({at,players:Object.keys(after.players).length,preserved:kept.size,moved:after.capacityMigration.moved,queued:inventory(after).filter(x=>!x.u.stationTerritoryId).length}));
