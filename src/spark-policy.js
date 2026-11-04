import {createSeasonWorld} from './seasons.js';
export const sparkEnabled=config=>config?.executionMode==='spark';
export const sparkPath=(config,kind,id='')=>(sparkEnabled(config)?{worlds:'sparkWorlds',historyFeed:'sparkHistoryFeed',chat:'sparkChat',recordVersions:'sparkRecordVersions',battleRecords:'sparkBattleRecords',enhancementRecords:'sparkEnhancementRecords'}[kind]||kind:kind)+(id?'/'+id:'');
export function createSparkWorld(number,startAt,seed){const s=createSeasonWorld(number,startAt,seed);s.executionMode='spark';s.sparkVersion=1;return s;}
export function importSparkPending(storage,from,to,uid){
 if(!storage||!from||from===to||!uid)return;
 const marker=`samguk-spark-import:${from}:${to}:${uid}`;if(storage.getItem(marker))return;
 const prefixes=['samguk-campaign-pending:','samguk-enhancement-pending:'];
 for(let i=0;i<storage.length;i++){const key=storage.key(i),prefix=prefixes.find(p=>key?.startsWith(p+from+':'+uid+':'));if(!prefix)continue;const next=prefix+to+key.slice((prefix+from).length);if(storage.getItem(next)===null)storage.setItem(next,storage.getItem(key));}
 storage.setItem(marker,'1'); // old entries remain as a device-local recovery backup
}
