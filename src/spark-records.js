import {historySummary} from './world-data.js';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export async function sparkHash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value)))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function packSparkRecords(raw,before={}){
 const world=structuredClone(raw),records={},ledger=JSON.parse(world.enhancementLedger||'{}');
 for(const [id,e]of Object.entries(world.history||{}))if(e.type==='battle'&&e.result&&!e.result.friendly){const full={...e};delete full.detailVersion;const v=await sparkHash(full);records['sparkBattleRecords/'+world.season.id+'/'+id+'/'+v]=full;world.history[id]={...historySummary(full),detailVersion:v};}
 for(const [id,r]of Object.entries(ledger))if(!r.detailVersion){const e={id,type:'enhance',actor:r.uid,at:r.at,enhancement:r},v=await sparkHash(e);records['sparkEnhancementRecords/'+world.season.id+'/'+id+'/'+v]=e;ledger[id]={id,uid:r.uid,seq:r.seq,at:r.at,detailVersion:v};}
 for(const [id,e]of Object.entries(world.history||{}))if(e.type==='enhance'&&e.enhancement){const v=ledger[id]?.detailVersion;if(v)world.history[id]={...historySummary(e),detailVersion:v};}
 for(const [v,item]of Object.entries(world.recordOutbox||{}))if(!item.remove)records['sparkBattleRecords/'+world.season.id+'/'+item.id+'/'+v]=item.event;
 for(const [v,item]of Object.entries(world.enhancementOutbox||{}))if(!item.remove)records['sparkEnhancementRecords/'+world.season.id+'/'+item.id+'/'+v]=item.event;
 delete world.recordOutbox;delete world.enhancementOutbox;
 if(world.enhancementLedger)world.enhancementLedger=JSON.stringify(ledger);
 const refs=s=>[...Object.values(s.history||{}),...Object.values(JSON.parse(s.enhancementLedger||'{}'))].filter(e=>e.detailVersion);
 const keep=new Set(refs(world).map(e=>e.detailVersion));
 for(const e of refs(before))if(!keep.has(e.detailVersion)){const kind=e.type==='enhance'||e.seq!==undefined?'sparkEnhancementRecords':'sparkBattleRecords';records[kind+'/'+world.season.id+'/'+e.id+'/'+e.detailVersion]=null;}
 return {world,records};
}
