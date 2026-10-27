import DATA from './data/game-data.json' with {type:'json'};
export const MAP=DATA,MINUTE=60_000;
export const RULES=Object.freeze({recruitMs:10*MINUTE,actionMs:10*MINUTE,restartMs:60*MINUTE,protectionMs:20*MINUTE,escapeMs:20*MINUTE,historyLimit:100,chatLimit:50,attackMultiplier:.9,attackLoss:.4,defenseLoss:.2});
export const RANKS={normal:{name:'일반 영토',capacity:12,neutral:2},stronghold:{name:'요충지',capacity:16,neutral:4},citadel:{name:'대거점',capacity:20,neutral:6}};
export const TIERS={4:'병사',6:'부장',8:'장수',12:'장군',20:'군주'};
export const COLORS=['#637d9b','#6f8c63','#b87965','#997faa','#b39856','#648f91','#a66f8a','#8f855f','#617f74','#9c7c61','#767fb2','#a3868a','#819362','#6d8aab','#aa7960'];
const places=new Map(DATA.places.map(p=>[p.id,p])),links=new Map(DATA.layout.cells.map(p=>[p.id,p.neighbors]));
export const placeInfo=id=>places.get(id),adjacent=id=>links.get(id)||[];
export const baseCapacity=id=>RANKS[placeInfo(id)?.rank||'normal'].capacity;
export const ownedTerritories=(s,uid)=>Object.values(s.territories).filter(t=>t.owner===uid);
export const queuedUnits=(s,uid)=>s.returnQueues?.[uid]?.units||[];
export const livingUnits=(s,uid)=>[...ownedTerritories(s,uid).flatMap(t=>t.units),...queuedUnits(s,uid)];
export const isOfficer=u=>[6,8,12].includes(u.sides),isLeader=u=>u.sides>4;
export function hash32(value){let h=2166136261;for(const c of String(value)){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function seededRandom(seed){let h=typeof seed==='number'?seed>>>0:hash32(seed);return()=>{h=(h+0x6D2B79F5)>>>0;let t=h;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export class GameError extends Error{constructor(message,code='INVALID'){super(message);this.name='GameError';this.code=code;}}
export const requireGame=(ok,message,code)=>{if(!ok)throw new GameError(message,code);};
export const rawScore=(raw,attack=false,coefficient=.9)=>attack?Math.max(1,Math.floor(raw*coefficient)):raw;
export const sumRoll=units=>units.reduce((n,u)=>n+u.roll,0);
export const byId=(a,b)=>a.id.localeCompare(b.id);
