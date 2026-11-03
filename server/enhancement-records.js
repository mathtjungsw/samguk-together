import {recordHash} from './record-versions.js';
import {historySummary} from '../src/world-data.js';

const ledgerOf=s=>JSON.parse(s.enhancementLedger||'{}');
const references=s=>{
 const refs=new Map();
 for(const e of [...Object.values(ledgerOf(s)),...Object.values(s.history||{}).filter(e=>e.type==='enhance')])if(e.detailVersion)refs.set(e.detailVersion,e.id);
 return refs;
};
// Keep the last 100 retry receipts, but move their verbose result out of the
// frequently read world. The atomic outbox protects replies if publication fails.
export function packEnhancementRecords(world,previous={}){
 if(world.enhancementStorageVersion!==1)return world;
 const outbox={...(world.enhancementOutbox||{})},history={...(world.history||{})},ledger=ledgerOf(world);
 const archive=result=>{
  const event={id:result.id,type:'enhance',actor:result.uid,at:result.at,enhancement:result},version=recordHash(event);
  outbox[version]={id:result.id,event};return version;
 };
 for(const [id,row]of Object.entries(ledger))if(!row.detailVersion){
  const version=archive(row);ledger[id]={id:row.id,uid:row.uid,seq:row.seq,at:row.at,detailVersion:version};
 }
 for(const [id,e]of Object.entries(history))if(e.type==='enhance'&&e.enhancement){
  const version=ledger[id]?.detailVersion||archive(e.enhancement);
  history[id]={...historySummary(e),detailVersion:version};
 }
 const next={...world,history,enhancementLedger:JSON.stringify(ledger),enhancementOutbox:outbox},keep=references(next);
 for(const [version,id]of references(previous))if(!keep.has(version))outbox['delete-'+version]={id,version,remove:true};
 return next;
}
export function enhancementPublicationPatch(worldId,outbox){
 const patch={};
 for(const [key,item]of Object.entries(outbox||{})){
  const version=item.remove?item.version:key;
  if(!/^[a-f0-9]{64}$/.test(version)||!item.id||/[.#$\[\]/]/.test(item.id))throw Error('강화 기록 전달 정보가 손상되었습니다.');
  patch['enhancementRecords/'+worldId+'/'+item.id+'/'+version]=item.remove?null:item.event;
  patch['worlds/'+worldId+'/enhancementOutbox/'+key]=null;
 }
 return patch;
}
export async function committedEnhancementResult(ref,world,id,fallback){
 if(fallback&&typeof fallback.success==='boolean')return fallback;
 const row=ledgerOf(world)[id];if(!row?.detailVersion)throw Error('강화 결과 기록을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.');
 const held=world.enhancementOutbox?.[row.detailVersion]?.event;
 const event=held||(await ref.root.child('enhancementRecords/'+ref.key+'/'+id+'/'+row.detailVersion).get()).val(),r=event?.enhancement;
 if(!r||r.id!==id||r.uid!==row.uid||r.seq!==row.seq||typeof r.success!=='boolean')throw Error('강화 결과를 확인 중입니다. 새 강화 대신 이전 결과를 다시 확인해 주세요.');
 return {booster:null,...r};
}
