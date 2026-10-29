import * as NEXT from './engine-next.js';
import {SEASON_MS,BREAK_MS} from './season-policy.js';
import {normalizeWorld,projectWorld,applyCommand,leaderboard,MAP} from './engine.js';
export const TEST_END=Date.parse('2026-10-28T11:00:00+09:00');
export const SEASON1_START=Date.parse('2026-10-28T12:00:00+09:00');
export const SEASON1_WORLD='season-1';
export function seasonPhase(now){return now<TEST_END?'test':now<SEASON1_START?'break':'season1';}
export const activeWorld=now=>now<SEASON1_START?'main':SEASON1_WORLD;
export function worldWritable(id,now){return id==='main'?now<TEST_END:id===SEASON1_WORLD?now>=SEASON1_START:true;}
export function seasonMessage(now){return seasonPhase(now)==='test'?'테스트 시즌은 오늘 11:00에 종료됩니다. 시즌 1은 오늘 12:00에 시작합니다.':seasonPhase(now)==='break'?'테스트 시즌이 종료되었습니다. 최종 랭킹과 결과 지도만 열람할 수 있습니다. 시즌 1은 오늘 12:00에 시작합니다.':'시즌 1 개막 · 새로운 영토와 병력으로 시작합니다. 테스트 시즌 결과는 삼국지 지난 역사에서 확인하세요.';}
export function archiveTestSeason(raw){
  // Realtime Database omits empty objects and arrays; restore the same defaults
  // as an ordinary online login before settling the saved season.
  let s=projectWorld(normalizeWorld(raw),TEST_END);
  for(const p of Object.values(s.pendingBattles||{}))s=applyCommand(s,p.actor,{id:`season-end-${p.id}`,type:'resolveGuard',battleId:p.id,guardChoice:p.defaultTarget,baseRevision:s.revision,at:TEST_END},TEST_END);
  const rows=leaderboard(s),keys=new Map(rows.map((p,i)=>[p.uid,`ruler-${i}`]));
  return {id:'test-20261028',title:'테스트 시즌',endedAt:TEST_END,featureVersion:s.featureVersion,rankings:rows.map(p=>({id:keys.get(p.uid),rank:p.rank,name:p.name,color:p.color,territories:p.territories,army:p.army,kills:p.kills,deaths:p.deaths})),territories:MAP.places.map(p=>({id:p.id,owner:keys.get(s.territories[p.id].owner)||'',army:s.territories[p.id].units.length}))};
}
export function archiveMapWorld(archive){return {featureVersion:archive.featureVersion,updatedAt:archive.endedAt,players:Object.fromEntries(archive.rankings.map(p=>[p.id,{...p,uid:p.id}])),territories:Object.fromEntries(archive.territories.map(t=>[t.id,{id:t.id,owner:t.owner,roles:{},units:Array.from({length:t.army},(_,i)=>({id:`archive-${t.id}-${i}`,sides:4}))}]))};}

export function createSeasonWorld(number,startAt,seed){const s=NEXT.createWorld(startAt,seed);s.season={id:'season-'+number,number,startAt,deadline:startAt+SEASON_MS};return s;}
export function followingSeason(s,now){if(!s.season?.endedAt||now<s.season.nextStartAt)return null;const skipped=Math.floor((now-s.season.nextStartAt)/(SEASON_MS+BREAK_MS));return {number:s.season.number+1,startAt:s.season.nextStartAt+skipped*(SEASON_MS+BREAK_MS)};}
