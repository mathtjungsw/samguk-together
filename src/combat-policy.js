import {placeInfo,seededRandom} from './game-core.js';
export const COMBAT_VERSION=5;
export const RANKS={normal:{name:'일반 영토',capacity:12,neutral:2},stronghold:{name:'요충지',capacity:14,neutral:4},citadel:{name:'대거점',capacity:16,neutral:6}};
export const baseCapacity=id=>RANKS[placeInfo(id)?.rank||'normal'].capacity;
export function combatPolicy(attack,defense){
  const delta=Math.abs(attack-defense),loss=delta<=2?3:delta<=5?2:delta<=9?1:0;
  return {version:5,delta,grade:delta<=2?'접전승':delta<=5?'근소승':delta<=9?'우세승':'완승',loss,survival:delta<=2?.30:delta<=5?.15:0};
}
export const winnerLoss=(count,policy)=>Math.min(policy.loss,Math.max(0,count-1));
export const survivalRoll=(seed,battleId,unitId)=>seededRandom(`${seed}:general-survival:${battleId}:${unitId}`)();
export function survivalDraws(seed,battleId,units){return Object.fromEntries(units.filter(u=>[6,8,12].includes(u.sides)).map(u=>[u.id,survivalRoll(seed,battleId,u.id)]));}
