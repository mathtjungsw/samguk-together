import {applyCommand,normalizeWorld} from '../src/engine-next.js';
import {campaignEnabled} from '../src/campaign-policy.js';
import {applyCampaignAction} from '../src/campaign-actions.js';
import {requireGame} from '../src/game-core.js';
const fields={register:['name'],rename:['name'],start:[],move:['from','to','unitIds','expectedTerritories'],resolveGuard:['battleId','guardChoice'],assign:['territoryId','governorId','defenseIds','supportTargetId','guardTargetId'],revive:['territoryId','unitIds'],recruit:[],announce:[],claimMission:[],claimCampaignReward:['rewardId','city'],requestRansom:['prisonerId','materials','city'],acceptRansom:['prisonerId','city'],rejectRansom:['prisonerId'],releaseCaptive:['prisonerId'],executeCaptive:['prisonerId'],persuadeCaptive:['prisonerId','materials','city']};
export function campaignCommand(raw,uid,input,at,options={}){
 requireGame(campaignEnabled(raw),'새 명령은 다음 시즌부터 사용할 수 있습니다.');requireGame(input&&fields[input.type]&&/^[\w-]{8,90}$/.test(input.id||''),'명령을 확인해 주세요.');requireGame(JSON.stringify(input).length<24000,'명령 크기를 확인해 주세요.');
 if(raw.receipts?.[input.id])return {world:normalizeWorld(raw),result:{id:input.id,already:true}};if(input.seq!==undefined)requireGame(Number.isInteger(input.seq)&&input.seq===(raw.players[uid]?.commandSeq||0),'이미 처리됐거나 오래된 명령입니다. 최신 전황을 확인해 주세요.');
 const done=out=>{if(input.seq!==undefined&&out.world.players[uid])out.world.players[uid].commandSeq=input.seq+1;return out;};
 const spec={id:input.id,type:input.type};for(const key of fields[input.type])if(input[key]!==undefined)spec[key]=input[key];
 if(['register','rename','start','move','resolveGuard','assign','revive','recruit','announce'].includes(input.type)){const n=applyCommand(raw,uid,{...spec,seed:options.draw||0,at,baseRevision:raw.revision},at);return done({world:n,result:{id:spec.id}});}
 return done(applyCampaignAction(raw,uid,spec,at,options));
}
export function settlementAfterRejectedAction(raw,uid,id,at){if(!raw.players[uid]||raw.season.endedAt)return normalizeWorld(raw);return applyCommand(raw,uid,{id:'reject-'+id,type:'recruit',at,baseRevision:raw.revision},at);}
