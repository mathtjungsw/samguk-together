import {enableCurrentSeasonAi,seedOpeningAis,aiStartCount,previousRulerNames} from '../src/ai-world.js';
import {runAiRound} from '../src/ai-runtime.js';
import {normalizeWorld,applyCommand,RELEASE} from '../src/engine-next.js';
import {validateAiState} from '../src/ai-world.js';
import {prepareAiBehavior} from '../src/ai-risk.js';
import {repairColors} from '../src/faction-colors.js';
import {aiNamePool,chooseAiName} from '../src/ai-names.js';
export function upgradeLiveFeatures(raw,at){const s=validateAiState(normalizeWorld(raw));if(s.season?.endedAt)return s;let changed=repairColors(s);
 if(s.ai&&s.ai.namingVersion!==2){s.ai.namingVersion=2;s.ai.namePool=JSON.stringify(aiNamePool());for(const p of Object.values(s.players).filter(p=>p.kind==='ai').sort((a,b)=>a.joinedAt-b.joinedAt||a.uid.localeCompare(b.uid))){if(!Object.values(s.territories).some(t=>t.owner===p.uid))continue;p.name=chooseAiName(s,p.uid,0);for(const t of Object.values(s.territories))if(t.owner===p.uid)for(const u of t.units)if(u.sides===20)u.name=p.name;for(const u of s.returnQueues?.[p.uid]?.units||[])if(u.sides===20)u.name=p.name;}changed=true;}
 if(s.ai&&Object.values(s.players).some(p=>p.kind==='ai'&&p.ai.behaviorVersion!==2)){prepareAiBehavior(s,at);changed=true;}
 if(changed){const before=s.revision++;s.updatedAt=at;s.command={...s.command,id:'features-20261031-'+s.season.id,type:'aiBatch',actor:'ai-system',at,baseRevision:before};}return s;
}
export function prepareLiveAi(raw,{at,firstSeason,names=[],count=3}){
  const s=normalizeWorld(raw);if(s.season?.endedAt||s.ai)return s;
  return s.season.number<=firstSeason?enableCurrentSeasonAi(s,at,names):seedOpeningAis(s,count,at,names);
}
export function advanceLiveAi(raw,options){const prepared=upgradeLiveFeatures(prepareLiveAi(raw,options),options.at);if(prepared.season?.endedAt)return prepared;let n=runAiRound(prepared,options.at,{seedFor:options.seedFor,maxDecisionMs:options.maxDecisionMs??35_000}).world;const actor=Object.keys(n.players)[0];if(actor&&!n.season.endedAt&&n.release?.id!==RELEASE.id)n=applyCommand(n,actor,{id:RELEASE.id,type:'announce',at:options.at,baseRevision:n.revision},options.at);return n;}
export {aiStartCount,previousRulerNames};

export function encodeLiveAi(s){const copy=structuredClone(s);for(const p of Object.values(copy.players))if(p.kind==='ai'&&typeof p.ai==='object')p.ai=JSON.stringify(p.ai);return copy;}
