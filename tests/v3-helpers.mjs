import {createWorld,applyCommand,refreshIndexes,adjacent,MINUTE,RULES,baseCapacity} from '../src/engine-v3.js';
import {heroByName,newEffectState} from '../src/hero-effects.js';
export const T=Date.parse('2026-10-27T00:00:00Z');
let serial=0;
export const command=(s,uid,type,fields={},at=s.updatedAt)=>applyCommand(s,uid,{id:`v3-test-${++serial}`,type,baseRevision:s.revision,at,...fields});
export const soldier=(id,sides=4)=>({id,name:sides===4?'병사':sides===20?'군주':'이름 없는 장수',sides,readyAt:0,...([6,8,12].includes(sides)?{legacy:true}:{})});
export const hero=(name,id=name)=>{const e=heroByName.get(name);if(!e)throw Error('Unknown hero');return {id,name,sides:e.sides,readyAt:0,heroId:e.id,effectState:newEffectState()};};
export function fixture({attack=[],defend=[],owner='b',at=T}={}){let s=createWorld(at,'v3-test');s=command(s,'a','register',{name:'유비'});s=command(s,'b','register',{name:'조조'});const from='luoyang',to=adjacent(from)[0];s.territories[from].owner='a';s.territories[from].units=attack.length?attack:[soldier('ruler-a',20),soldier('a1'),soldier('a2'),soldier('a3'),soldier('a4')];s.territories[to].owner=owner;s.territories[to].units=defend.length?defend:[soldier('b1'),soldier('b2')];for(const uid of ['a','b']){s.players[uid].life=1;s.players[uid].startedAt=at;}for(const t of Object.values(s.territories))if(t.owner){t.nextRecruitAt=at+RULES.recruitMs;t.lastRecruitAt=at;t.generation=1;}refreshIndexes(s);return {s,from,to};}
