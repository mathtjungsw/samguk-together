import {enableCurrentSeasonAi,seedOpeningAis,aiStartCount,previousRulerNames} from '../src/ai-world.js';
import {runAiRound} from '../src/ai-runtime.js';
import {normalizeWorld,applyCommand,RELEASE} from '../src/engine-next.js';
export function prepareLiveAi(raw,{at,firstSeason,names=[],count=3}){
  const s=normalizeWorld(raw);if(s.season?.endedAt||s.ai)return s;
  return s.season.number<=firstSeason?enableCurrentSeasonAi(s,at,names):seedOpeningAis(s,count,at,names);
}
export function advanceLiveAi(raw,options){const prepared=prepareLiveAi(raw,options);if(prepared.season?.endedAt)return prepared;let n=runAiRound(prepared,options.at,{seedFor:options.seedFor,maxDecisionMs:options.maxDecisionMs??35_000}).world;const actor=Object.keys(n.players)[0];if(actor&&!n.season.endedAt&&n.release?.id!==RELEASE.id)n=applyCommand(n,actor,{id:RELEASE.id,type:'announce',at:options.at,baseRevision:n.revision},options.at);return n;}
export {aiStartCount,previousRulerNames};

export function encodeLiveAi(s){const copy=structuredClone(s);for(const p of Object.values(copy.players))if(p.kind==='ai'&&typeof p.ai==='object')p.ai=JSON.stringify(p.ai);return copy;}
