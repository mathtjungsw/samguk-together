import {historySummary} from '../src/world-data.js';
import {recordHash} from './record-versions.js';
import {packEnhancementRecords,enhancementPublicationPatch} from './enhancement-records.js';

// A committed outbox is the source of truth until publication. Versioned paths
// make older concurrent publishers harmless: they can never overwrite a correction.
export function packBattleRecords(world,previous={}, {activate=false}={}){
 if(world?.season?.campaignVersion!==1||!activate&&world.recordStorageVersion!==1)return world;
 const history={},outbox={...(world.recordOutbox||{})};
 for(const [id,event]of Object.entries(world.history||{})){
  if(event.type==='battle'&&event.result){
   const full={...event};delete full.detailVersion;
   const version=recordHash(full);history[id]={...historySummary(full),detailVersion:version};
   outbox[version]={id,event:full};
  }else history[id]=event;
 }
 for(const [id,event]of Object.entries(previous.history||{})){
  const version=event.detailVersion;
  if(version&&event.type!=='enhance'&&history[id]?.detailVersion!==version)outbox['delete-'+version]={id,version,remove:true};
 }
 return packEnhancementRecords({...world,history,recordOutbox:outbox,recordStorageVersion:1},previous);
}
export function recordPublicationPatch(worldId,outbox){
 const patch={};
 for(const [key,item]of Object.entries(outbox||{})){
  const version=item.remove?item.version:key;
  if(!/^[a-f0-9]{64}$/.test(version)||!item.id||/[.#$\[\]/]/.test(item.id))throw Error('전투 상세 전달 정보가 손상되었습니다.');
  patch['battleRecords/'+worldId+'/'+item.id+'/'+version]=item.remove?null:item.event;
  patch['worlds/'+worldId+'/recordOutbox/'+key]=null;
 }
 return patch;
}
export async function publishBattleRecords(ref,world){
 const patch={...recordPublicationPatch(ref.key,world.recordOutbox),...enhancementPublicationPatch(ref.key,world.enhancementOutbox)};
 if(Object.keys(patch).length)await ref.root.update(patch);
}
export async function committedBattleEvent(ref,world,id,fullHistory={}){
 if(fullHistory[id]?.result)return fullHistory[id];
 const event=world.history?.[id];if(!event?.detailVersion)return event||null;
 const waiting=world.recordOutbox?.[event.detailVersion]?.event;if(waiting)return waiting;
 return (await ref.root.child('battleRecords/'+ref.key+'/'+id+'/'+event.detailVersion).get()).val()||event;
}
