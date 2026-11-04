import {createSeasonWorld} from '../src/seasons.js';
import {applyCommand,refreshIndexes,emptyRoles} from '../src/engine-next.js';
import {rosterFor} from '../src/hero-catalog.js';
import {newEffectState} from '../src/hero-effects-next.js';
import {stampUnit} from '../src/role-policy.js';
import {seededRandom} from '../src/game-core.js';
export function recruitmentFixture(number=6,sides=6,{remaining=0,targets=1}={}){
 const at=Date.parse('2026-11-04T01:00:00Z');let s=createSeasonWorld(number,at-1000,'recruitment-test');
 s=applyCommand(s,'a',{id:'recruitment-register',type:'register',name:'군주',at,baseRevision:s.revision},at);
 const cities=Object.values(s.territories),active=cities.slice(0,targets),pool=rosterFor(s).filter(e=>e.sides===sides).slice(remaining);
 for(const [i,e]of pool.entries()){
  const t=cities[targets+Math.floor(i/10)];if(i%10===0){t.owner='a';t.units=[];t.nextRecruitAt=0;t.settledAt=at;}
  t.units.push(stampUnit({id:'reserved-'+e.id,name:e.name,sides:e.sides,heroId:e.id,heroVersion:3,effectState:newEffectState(),readyAt:at},at,t.id));
 }
 for(const t of active){t.owner='a';t.units=[stampUnit({id:'stay-'+t.id,name:'병사',sides:4,readyAt:at},at,t.id)];t.roles=emptyRoles();t.nextRecruitAt=at+600000;t.lastRecruitAt=at;t.settledAt=at;}
 s.updatedAt=at;refreshIndexes(s);
 const range={6:[.90,.97],8:[.97,.992],12:[.995,1]}[sides];
 for(let i=0;i<100000;i++){const seed='recruitment-'+i;if(active.every(t=>{const r=seededRandom(`${seed}:${t.id}:${t.generation}:${at+600000}`)();return r>=range[0]&&r<range[1];})){s.seed=seed;return {s,t:active[0],active,at,due:at+600000};}}
 throw Error('No deterministic seed');
}
