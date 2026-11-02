import OLD from './data/hero-effects.json' with {type:'json'};
import NEXT from './data/hero-effects-next.json' with {type:'json'};
import CAMPAIGN from './data/hero-effects-200.json' with {type:'json'};
const campaignMap=new Map(CAMPAIGN.map(e=>[e.id,e]));
const oldMap=new Map(OLD.map(e=>[e.id,e])),nextMap=new Map(NEXT.map(e=>[e.id,e]));
export const rosterFor=s=>s?.season?.campaignVersion===1?CAMPAIGN:s?.featureVersion===6?NEXT:OLD;
export const catalogEffect=u=>(u?.heroVersion===3?campaignMap:u?.heroVersion===2?nextMap:oldMap).get(u?.heroId);
