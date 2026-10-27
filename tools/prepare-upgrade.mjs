// Offline migration only. Input/output must stay outside the public repository.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {upgradeWorld,normalizeWorld} from '../src/engine.js';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node tools/prepare-upgrade.mjs <private-backup.json> <private-world.json>');
const root=JSON.parse(fs.readFileSync(input,'utf8')),before=root.worlds?.main||root;
assert.notEqual(before.featureVersion,3,'Already migrated; refusing a second migration.');
const inventory=s=>Object.values(s.territories).flatMap(t=>t.units.map(u=>({id:u.id,sides:u.sides,readyAt:u.readyAt,owner:t.owner,territory:t.id})));
const old=inventory(before),cutoff=Math.max(Date.now(),before.updatedAt),after=upgradeWorld(before,cutoff),next=new Map(inventory(after).map(u=>[u.id,u]));
for(const unit of old)assert.deepEqual(next.get(unit.id),unit,'An existing unit changed during migration.');
for(const [id,p] of Object.entries(before.players))for(const key of ['name','life','kills','deaths','revived','exchanged'])if(p[key]!==undefined)assert.equal(after.players[id][key],p[key]);
after.revision=before.revision+1;
after.command={id:'migration-v3-'+cutoff,type:'recruit',actor:before.command.actor,at:cutoff,baseRevision:before.revision,from:'',to:'',seed:0,protocol:3};
normalizeWorld(after);
fs.writeFileSync(output,JSON.stringify(after,null,2)+'\n');
console.log(JSON.stringify({cutoff,players:Object.keys(after.players).length,territories:Object.keys(after.territories).length,preservedUnits:old.length,totalUnits:next.size,newOldProtocolRecruits:next.size-old.length,namedHeroes:Object.keys(after.heroIndex).length,migration:after.migration,revision:after.revision},null,2));
