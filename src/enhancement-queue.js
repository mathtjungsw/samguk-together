import {selectEnhancementRequests,applyLocalEnhancementBatch,ENHANCEMENT_BATCH_LIMIT} from './enhancement-batch.js';
export class EnhancementQueue{
 constructor({key,uid,world,send,refresh,notify=()=>{},connected=()=>true,storage=globalThis.localStorage,now=()=>Date.now(),draw=()=>crypto.getRandomValues(new Uint32Array(1))[0],id=()=>crypto.randomUUID()}){Object.assign(this,{key,uid,world,send,refresh,notify,connected,storage,now,draw,id});}
 read(){const raw=this.storage?.getItem(this.key);if(!raw)return {version:1,groups:[],flight:[],error:'',last:[]};const s=JSON.parse(raw);if(s.version!==1||!Array.isArray(s.groups)||!Array.isArray(s.flight))throw Error('이 기기의 강화 대기 기록을 확인하지 못했습니다. 기록은 보존됩니다.');return s;}
 save(s){if(!this.storage)throw Error('강화 대기 기록을 저장할 기기 저장소가 없습니다.');this.storage.setItem(this.key,JSON.stringify(s));}
 lock(fn){return globalThis.navigator?.locks?globalThis.navigator.locks.request(this.key,fn):Promise.resolve().then(fn);}
 proven(g,w){const ledger=JSON.parse(w?.enhancementLedger||'{}');return g.items.every(r=>ledger[r.id]?.uid===this.uid&&ledger[r.id].seq===r.seq);}
 pending(){return this.read().groups.length>0;}
 preview(){const state=this.read();let world=this.world();if(state.error)return world;for(const g of state.groups){if(this.proven(g,world)||g.ack&&(world.players[this.uid]?.enhanceSeq||0)>g.items.at(-1).seq)continue;world=applyLocalEnhancementBatch(world,this.uid,g.items,Math.max(g.at,world.updatedAt)).world;}return world;}
 async enqueue(city,unitIds,boosters={}){
  if(this.runtimeError)throw Error(this.runtimeError);
  const result=await this.lock(()=>{if(this.closed||!this.connected())throw Error('연결 후 강화해 주세요.');const s=this.read();if(s.error)throw Error('이전 강화 저장부터 다시 확인해 주세요.');if(s.groups.reduce((n,g)=>n+g.items.length,0)+unitIds.length>128)throw Error('저장 대기가 많습니다. 잠시 후 다시 강화해 주세요.');const world=this.preview(),at=Math.max(this.now(),world.updatedAt),items=selectEnhancementRequests(world,this.uid,city,unitIds,boosters,()=>this.id(),at).map(r=>({...r,draw:this.draw()})),out=applyLocalEnhancementBatch(world,this.uid,items,at),g={id:this.id(),at,items,results:out.results};s.groups.push(g);s.notice='';s.last=out.results;this.save(s);return out.results;});
  this.readAttempts=0;this.nextRead=0;this.notify();this.schedule();return result;
 }
 schedule(){if(this.closed||this.timer||this.sending)return;this.timer=setTimeout(()=>{this.timer=null;this.flush().catch(()=>{});},120);this.timer.unref?.();}
 async reconcile(){await this.lock(()=>{const s=this.read(),w=this.world();s.groups=s.groups.filter(g=>!this.proven(g,w)&&!(g.ack&&(w.players[this.uid]?.enhanceSeq||0)>g.items.at(-1).seq));s.flight=s.flight.filter(id=>s.groups.some(g=>g.id===id));if(!s.groups.length)s.error='';this.save(s);});}
 async flush({retry=false}={}){
  if(this.closed||this.sending||!this.connected()||this.runtimeError&&!retry)return;
  if(retry)this.runtimeError='';
  this.sending=true;
  try{
   await this.reconcile();const payload=await this.lock(()=>{const s=this.read();if(s.error&&!retry)return null;if(retry){s.error='';this.save(s);}let groups=s.flight.length?s.groups.filter(g=>s.flight.includes(g.id)):[];
    if(!groups.length){let n=0;for(const g of s.groups.filter(g=>!g.ack)){if(n+g.items.length>ENHANCEMENT_BATCH_LIMIT)break;groups.push(g);n+=g.items.length;}s.flight=groups.map(g=>g.id);this.save(s);}return groups.length?{ids:groups.map(g=>g.id),items:groups.flatMap(g=>g.items)}:null;});
   if(!payload){if(this.read().groups.some(g=>g.ack)&&(retry||(this.readAttempts||0)<3&&Date.now()>=(this.nextRead||0))){this.readAttempts=(this.readAttempts||0)+1;this.nextRead=Date.now()+(this.readAttempts===1?2000:5000);try{await this.refresh();await this.reconcile();}catch{}}return;}
   let rejected=false;
   try{
    await this.send(payload.items);
    await this.lock(()=>{const s=this.read();for(const g of s.groups)if(payload.ids.includes(g.id))g.ack=true;s.flight=[];s.error='';this.save(s);});
   }catch(e){
    rejected=e.details?.committed===false||/invalid-argument|unauthenticated|permission-denied/.test(e.code||'');
    await this.lock(()=>{const s=this.read();if(e.details?.committed===false||/invalid-argument|unauthenticated|permission-denied/.test(e.code||'')){s.groups=s.groups.filter(g=>g.ack);s.flight=[];s.error='';s.notice='강화 대상이나 재료가 바뀌어 저장되지 않은 결과를 취소했습니다. 최신 병력으로 복원했습니다.';s.last=[];}else s.error='저장 응답을 확인하지 못했습니다. 같은 추첨으로 다시 저장합니다. 다시 저장을 눌러 주세요.';this.save(s);});
   }
   try{await this.reconcile();if(rejected||this.pending()){await this.refresh();await this.reconcile();}}catch{}
  }catch(e){this.runtimeError=e.message||'기기의 강화 대기 기록을 확인해 주세요.';}
  finally{this.sending=false;if(!this.closed){this.notify();const s=this.read();if(!this.runtimeError&&!s.error&&s.groups.some(g=>!g.ack))this.schedule();}}
 }
 close(){this.closed=true;clearTimeout(this.timer);}
}
