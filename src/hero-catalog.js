import OLD from './data/hero-effects.json' with {type:'json'};
import NEXT from './data/hero-effects-next.json' with {type:'json'};
const oldMap=new Map(OLD.map(e=>[e.id,e])),nextMap=new Map(NEXT.map(e=>[e.id,e]));
export const rosterFor=s=>s?.featureVersion===6?NEXT:OLD;
export const catalogEffect=u=>(u?.heroVersion===2?nextMap:oldMap).get(u?.heroId);
