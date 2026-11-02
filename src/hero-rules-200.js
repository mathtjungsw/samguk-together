import {adjacent,MINUTE} from './game-core.js';
export function ruleMet(s,from,to,own,enemy,u,at,attack,r){
 if(!r)return true;const inf=own.filter(x=>x.sides===4).length,foes=enemy.filter(x=>x.sides===4).length,since=Math.max(u.readyAt,s.territories[to]?.roles?.defenseSince||0);
 return !(r.attack&&!attack||r.defense&&attack||r.inf&&inf<r.inf||r.enemyInf&&foes<r.enemyInf||r.max&&own.length>r.max||r.less&&own.length>=enemy.length||r.more&&own.length<=enemy.length||r.notMore&&own.length>enemy.length||r.notLess&&own.length<enemy.length||r.owned&&!s.territories[to].owner||r.neutral&&s.territories[to].owner||r.noRuler&&own.some(x=>x.sides===20)||r.ruler&&!own.some(x=>x.sides===20)||r.enemyTier&&!enemy.some(x=>x.sides>=r.enemyTier)||r.prepare&&at-since<r.prepare*MINUTE||r.adj&&adjacent(to).filter(id=>s.territories[id].owner===s.territories[from].owner).length<r.adj);
}
