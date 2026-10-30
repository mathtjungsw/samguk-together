// Canonical battles stay untouched. The validated feed omits dice and unit copies.
export const WORLD_FIELDS=['version','mapId','seed','createdAt','updatedAt','revision','command','players','territories','requests','receipts','returnQueues','heroCatalog','heroIndex','pendingBattles','featureVersion','rosterVersion','effectsVersion','effectsSince','rolePolicyVersion','statsSince','roleMigration','capacityMigration','migration','maintenance','release','season'];
const list=v=>Array.isArray(v)?v:Object.values(v||{});
export function historySummary(e){
  const row={};for(const k of ['id','at','actor','type','text','from','to','previousOwner'])if(e[k]!==undefined&&e[k]!==null)row[k]=e[k];
  if(list(e.heroes).length||e.heroMove)row.heroMove=true;
  if(e.battle)row.battle=structuredClone(e.battle);
  if(e.type==='battle'&&e.result){const r=e.result,b={};for(const k of ['attacker','defender','won','score','defense','friendly'])if(r[k]!==undefined)b[k]=r[k];b.escaped=list(r.escaped).length>0;if(r.policy){b.grade=r.policy.grade;b.delta=r.policy.delta;}row.battle=b;}
  return row;
}
export const historyFeed=s=>({revision:s.revision,events:Object.fromEntries(Object.entries(s.history||{}).map(([id,e])=>[id,historySummary(e)]))});
export const feedValid=(feed,revision)=>!!feed&&feed.revision===revision&&typeof feed.events==='object';
export const coherentWorld=s=>s.revision===0||s.command?.baseRevision+1===s.revision&&s.command?.at===s.updatedAt;
export class WorldReader{
  constructor(sdk,db,id,{onWorld=()=>{},onError=()=>{}}={}){Object.assign(this,{sdk,db,id,onWorld,onError});this.stops=[];this.raw={};this.ready=new Set();this.details=new Map();this.reading=null;this.fallbacks=0;}
  ref(path){return this.sdk.ref(this.db,path);}
  group(side){return this.sdk.query(this.ref('worlds/'+this.id),this.sdk.orderByKey(),side==='before'?this.sdk.endBefore('history'):this.sdk.startAfter('history'));}
  async get(path){return (await this.sdk.get(this.ref(path))).val();}
  async read(){if(this.reading)return this.reading;this.reading=this.readStable().finally(()=>this.reading=null);return this.reading;}
  async readStable(){
    const path='worlds/'+this.id;
    for(let attempt=0;attempt<3;attempt++){
      const before=await this.get(path+'/revision');if(before===null)return null;
      const groups=await Promise.all(['before','after'].map(k=>this.sdk.get(this.group(k)).then(s=>s.val()||{}))),raw={...groups[0],...groups[1]};
      const feed=await this.get('historyFeed/'+this.id);raw.history=feedValid(feed,raw.revision)?feed.events:await this.readHistory();
      if(coherentWorld(raw)&&raw.revision===before&&await this.get(path+'/revision')===before){this.raw=raw;this.feed=feed;this.groups=groups;return structuredClone(raw);}
    }
    throw Error('전황이 빠르게 바뀌고 있습니다. 잠시 후 다시 연결해 주세요.');
  }
  async readHistory(){this.fallbacks++;return await this.get('worlds/'+this.id+'/history')||{};}
  start(){
    for(const [index,side]of ['before','after'].entries())this.stops.push(this.sdk.onValue(this.group(side),snap=>{this.groups??=[];this.groups[index]=snap.val()||{};this.raw={...this.groups[0],...this.groups[1],history:this.raw.history};this.ready.add(side);this.schedule();},e=>this.onError(e)));
    this.stops.push(this.sdk.onValue(this.ref('historyFeed/'+this.id),snap=>{this.feed=snap.val();this.schedule();},e=>this.onError(e)));
  }
  schedule(){if(this.closed||this.timer)return;this.timer=setTimeout(()=>{this.timer=null;this.flush().catch(e=>this.onError(e));},0);}
  async flush(){
    if(this.closed||this.ready.size<2||this.flushing||!coherentWorld(this.raw))return;
    this.flushing=true;
    try{
      const revision=this.raw.revision;
      if(feedValid(this.feed,revision))this.raw.history=this.feed.events;
      else{
        // Legacy clients don't publish a feed. Fall back once per changed revision,
        // preserving every event until everyone has refreshed to the new client.
        if(this.historyRevision!==revision){const history=await this.readHistory();if(this.closed||revision!==this.raw.revision){this.schedule();return;}this.raw.history=history;this.historyRevision=revision;}
      }
      this.onWorld(structuredClone(this.raw));
    }finally{this.flushing=false;}
  }
  async detail(id){if(!this.details.has(id)){const e=await this.get('worlds/'+this.id+'/history/'+id);if(!e?.result)throw Error('이 전투의 상세 기록이 보관 범위를 벗어났습니다.');this.details.set(id,e);if(this.details.size>12)this.details.delete(this.details.keys().next().value);}return structuredClone(this.details.get(id));}
  close(){this.closed=true;clearTimeout(this.timer);this.stops.forEach(s=>s());this.stops=[];this.details.clear();}
}
