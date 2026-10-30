import {randomUUID} from 'node:crypto';
import {historyFeed} from '../src/world-data.js';
import {normalizeWorld} from '../src/engine-next.js';
import {aiCostGate,canActivateAi} from '../src/ai-runtime.js';
import {castAiBallot,aiElectors,aiStartCount,validateAiState} from '../src/ai-world.js';

// Separate future AI-season storage: transactions exclude old dice/army copies.
// Existing worlds/* are never migrated or written by this adapter.
export function aiEnvelope(world){const copy=structuredClone(world),history=historyFeed(world).events;delete copy.history;return {world:copy,history,outbox:{}};}
export class AiStateStore {
  constructor(kv,{path,now=()=>Date.now(),holder=randomUUID(),leaseMs=60_000}={}){
    if(!/^aiStaging\/season-[0-9]+$/.test(path||''))throw Error('검증 단계에서는 aiStaging/season-N 경로만 사용할 수 있습니다.');
    Object.assign(this,{kv,path,now,holder,leaseMs});
  }
  async initialize(world,ops={enabled:false,activationApproved:false}){
    if(await this.kv.read(this.path+'/envelope/world/revision')!==null)return {committed:false};
    const envelope=aiEnvelope(world);envelope.outbox=Object.fromEntries(Object.entries(world.history||{}).map(([id,event])=>[id,{kind:'record',event}]));
    return this.kv.transact(this.path,current=>current?undefined:{envelope:{...envelope,ops}});
  }
  async approveActivation(metrics){
    if(!canActivateAi(metrics,this.now()).allowed)throw Error('활동일 실측과 전체 비용 검토에서 무료량 여유가 확인되지 않았습니다.');
    return this.kv.transact(this.path+'/envelope/ops',old=>({...old,cost:metrics,enabled:true,activationApproved:true}));
  }
  async recover(){
    const outbox=await this.kv.read(this.path+'/envelope/outbox');if(!outbox)return 0;
    const patch={};let count=0;
    for(const [id,item]of Object.entries(outbox)){patch[this.path+'/records/'+id]=item.kind==='delete'?null:item.event;patch[this.path+'/envelope/outbox/'+id]=null;count++;}
    if(count)await this.kv.update(patch);return count;
  }
  async readMeta(){
    await this.recover();
    const [ops,season,ai]=await Promise.all([this.kv.read(this.path+'/envelope/ops'),this.kv.read(this.path+'/envelope/world/season'),this.kv.read(this.path+'/envelope/world/ai')]);
    return {...ops,startAt:season?.startAt,endedAt:season?.endedAt,lastTick:ai?.lastTick};
  }
  async readWorld(){
    if(!this.held&&this.kv.hold)this.held=await this.kv.hold(this.path+'/envelope');
    const value=this.held?await this.held.read():await this.kv.read(this.path+'/envelope');if(!value?.world)throw Error('AI 검증 전장을 찾을 수 없습니다.');
    return validateAiState(normalizeWorld({...value.world,history:value.history||{}}));
  }
  async choiceView(uid,at=this.now()){
    const [players,season,ballots]=await Promise.all([this.kv.read(this.path+'/envelope/world/players'),this.kv.read(this.path+'/envelope/world/season'),this.kv.read(this.path+'/envelope/ballots')]),world={players:players||{},season,territories:{}};
    const open=!!season?.endedAt&&at>=season.endedAt&&at<season.nextStartAt;
    return {eligible:open&&aiElectors(world).includes(uid),open,selected:ballots?.[uid]||null,nextCount:aiStartCount(world,ballots||{}),nextStartAt:season?.nextStartAt||0};
  }
  async castBallot(uid,count,at=this.now()){
    const result=await this.kv.transact(this.path+'/envelope',old=>{
      if(!old?.world)return;
      return {...old,ballots:castAiBallot(old.world,old.ballots||{},uid,count,at)};
    });
    if(!result.committed)throw Error('다음 시즌 설정을 저장하지 못했습니다.');return this.choiceView(uid,at);
  }
  async battleDetail(id){
    if(typeof id!=='string'||!/^[\w:-]{1,160}$/.test(id))throw Error('전투 기록 번호가 올바르지 않습니다.');
    let e=await this.kv.read(this.path+'/records/'+id);
    if(!e?.result)e=(await this.kv.read(this.path+'/envelope/outbox/'+id))?.event;
    if(!e?.result)e=await this.kv.read(this.path+'/records/'+id); // publication may have completed between the two reads
    if(!e?.result)throw Error('이 전투의 상세 기록이 보관 범위를 벗어났습니다.');return e;
  }
  async acquire(round,at){
    const token=randomUUID(),lease={token,holder:this.holder,round,until:at+this.leaseMs};
    const result=await this.kv.transact(this.path+'/envelope/lease',old=>old?.until>at?undefined:{...lease,generation:(old?.generation||0)+1});
    return result.committed?result.value:null;
  }
  async release(lease){
    try{await this.kv.transact(this.path+'/envelope/lease',old=>old?.token===lease.token?{...old,until:0}:undefined);}finally{this.close();}
  }
  close(){this.held?.stop();this.held=null;}
  async reportGate(gate){
    const key=(gate.periodId||'unverified')+':'+gate.mode+':'+(gate.reason||'');
    await this.kv.transact(this.path+'/lastCostNotice',old=>old?.key===key?undefined:{key,at:this.now(),mode:gate.mode,reason:gate.reason});
  }
  async commit({expectedRevision,lease,round,world}){
    const next=aiEnvelope(world);
    const result=await this.kv.transact(this.path+'/envelope',current=>{
      if(!current||current.world.revision!==expectedRevision||current.lease?.token!==lease.token||current.lease?.generation!==lease.generation||current.lease.until<=this.now())return;
      if(!current.ops?.enabled||!current.ops.activationApproved||['paused','hold'].includes(aiCostGate(current.ops.cost,this.now()).mode))return;
      if(world.revision!==expectedRevision+1||world.ai.lastTick!==round||lease.round!==round)throw Error('AI 원자 명령의 회차·revision이 일치하지 않습니다.');
      const outbox={...current.outbox};
      for(const [id,e]of Object.entries(world.history||{}))if(!current.history?.[id])outbox[id]={kind:'record',event:e};
      for(const id of Object.keys(current.history||{}))if(!next.history[id])outbox[id]={kind:'delete'};
      if(Object.keys(outbox).length>256||Buffer.byteLength(JSON.stringify(outbox))>2_000_000)throw Error('전투 기록 복구 대기량이 커서 새 AI 작업을 보류합니다.');
      return {...current,...next,outbox,lease:current.lease,ops:current.ops};
    });
    if(!result.committed)return false;
    await this.recover();return true;
  }
}

// The first implementation deliberately accepts only a demo emulator instance.
export function firebaseAiStateStore(database,options){
  if(!process.env.FIREBASE_DATABASE_EMULATOR_HOST||!/^demo-/.test(database.app?.options?.projectId||''))throw Error('이 AI 저장 어댑터는 demo 프로젝트의 Firebase 에뮬레이터에서만 실행합니다.');
  const driver={
    read:async path=>(await database.ref(path).get()).val(),
    subscribe:(path,next,error)=>{const ref=database.ref(path),callback=s=>next(s.val());ref.on('value',callback,error);return ()=>ref.off('value',callback);},
    update:patch=>database.ref().update(patch),
    transact:async(path,fn)=>{const result=await database.ref(path).transaction(fn,undefined,false);return {committed:result.committed,value:result.snapshot.val()};}
  };
  return new AiStateStore(cachedAiKv(driver),options);
}

export function cachedAiKv(driver){
  const streams=new Map(),parent=path=>[...streams.keys()].filter(p=>p===path||path.startsWith(p+'/')).sort((a,b)=>a.length-b.length)[0];
  const value=async(path,base)=>{const stream=streams.get(base);await stream.ready;return structuredClone(path===base?stream.value:path.slice(base.length+1).split('/').reduce((v,k)=>v?.[k],stream.value)??null);};
  const hold=async path=>{
    const base=parent(path);if(base)return {read:()=>value(path,base),stop:()=>{}};
    let resolve,reject;const ready=new Promise((yes,no)=>{resolve=yes;reject=no;}),stream={ready,value:null};streams.set(path,stream);
    stream.stop=driver.subscribe(path,next=>{stream.value=next;resolve();},reject);
    try{await ready;}catch(e){stream.stop();streams.delete(path);throw e;}
    return {read:()=>value(path,path),stop:()=>{stream.stop();streams.delete(path);}};
  };
  return {hold,read:path=>{const base=parent(path);return base?value(path,base):driver.read(path);},update:driver.update,transact:async(path,fn)=>{
    // Firebase may call transaction(null) before loading a non-cached path.
    // Hold the current snapshot before evaluating a conditional abort.
    const temporary=parent(path)?null:await hold(path);
    try{return await driver.transact(path,fn);}finally{temporary?.stop();}
  }};
}
