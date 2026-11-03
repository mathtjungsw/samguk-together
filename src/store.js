import {campaignEnabled,FIRST_CAMPAIGN_SEASON,isRetiredMissionCommand} from './campaign-policy.js';
import {EnhancementQueue} from './enhancement-queue.js';
import {campaignRequestState} from './campaign-pending.js';
import {recordCache} from './record-cache.js';
import {WorldReader,historyFeed} from './world-data.js';
const indexEntry=result=>({id:result.id,title:result.title,endedAt:result.endedAt});
import {seasonClosed} from './season-policy.js';
import {canWrite} from './field-ui.js';
import {worldWritable,activeWorld,createSeasonWorld,followingSeason,archiveTestSeason} from './seasons.js';
import {createWorld,normalizeWorld,upgradeWorld,applyCommand,addChatMessage,appendSystemMessages,systemEvents,hasDueRecruitment,GameError,RULES} from './engine.js';

export const commandId=()=>crypto.randomUUID();
export const entropy=()=>crypto.getRandomValues(new Uint32Array(1))[0];
export function changedPaths(before,after,path='',out={}){
  if(JSON.stringify(before)===JSON.stringify(after))return out;
  if(after===undefined||after===null){out[path]=null;return out;}
  if(typeof after!=='object'||Array.isArray(after)){out[path]=after;return out;}
  for(const key of new Set([...Object.keys(before||{}),...Object.keys(after)]))changedPaths(before?.[key],after[key],path?`${path}/${key}`:key,out);
  return out;
}

export class LocalStore {
  constructor({storage=localStorage,key='samguk-online-practice-v1'}={}){this.storage=storage;this.key=key;this.chatKey=key+':chat';this.world=null;this.chat=null;this.uid=null;this.connected=true;this.mode='practice';this.onWorld=()=>{};this.onChat=()=>{};this.onConnection=()=>{};this.channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel(key);if(this.channel)this.channel.onmessage=()=>this.refresh();this.storageListener=e=>{if(e.key===key||e.key===this.chatKey)this.refresh();};if(typeof window!=='undefined')window.addEventListener('storage',this.storageListener);}
  now(){return Date.now();}
  async locked(task){if(globalThis.navigator?.locks)return navigator.locks.request(this.key,task);return task();}
  readWorld(){const text=this.storage.getItem(this.key);if(!text)return createWorld(this.now(),'practice-world-v1');try{const raw=JSON.parse(text);return raw.featureVersion===5?normalizeWorld(raw):upgradeWorld(raw,Math.max(this.now(),raw.updatedAt));}catch(error){throw new GameError('이 기기의 연습 기록을 읽지 못했어요. 원본 기록을 보존했습니다.','CORRUPT');}}
  refresh(){try{this.world=this.readWorld();this.chat=JSON.parse(this.storage.getItem(this.chatKey)||'null');this.onWorld(this.world);this.onChat(this.chat);}catch(error){this.onConnection(false,error.message);}}
  async connect(name,uid){this.uid=uid||`practice-${crypto.randomUUID()}`;await this.locked(()=>{let world=this.readWorld();if(!world.players[this.uid])world=applyCommand(world,this.uid,{id:commandId(),type:'register',name,at:Math.max(this.now(),world.updatedAt),baseRevision:world.revision});this.storage.setItem(this.key,JSON.stringify(world));});this.refresh();this.channel?.postMessage('updated');return this.world.players[this.uid];}
  async submit(spec){return this.locked(()=>{const world=this.readWorld(),c={...spec,id:spec.id||commandId(),at:Math.max(this.now(),world.updatedAt),baseRevision:world.revision};const next=applyCommand(world,this.uid,c),events=systemEvents(world,next);if(events.length){this.chat=appendSystemMessages(JSON.parse(this.storage.getItem(this.chatKey)||'null'),events,this.uid,c.at);this.storage.setItem(this.chatKey,JSON.stringify(this.chat));}this.storage.setItem(this.key,JSON.stringify(next));this.world=next;this.onWorld(next);if(events.length)this.onChat(this.chat);this.channel?.postMessage('updated');return {world:next,event:next.history[c.id]||null};});}
  async sendChat(text){return this.locked(()=>{const raw=JSON.parse(this.storage.getItem(this.chatKey)||'null');const next=addChatMessage(raw,this.uid,this.world.players[this.uid].name,text,this.now());this.storage.setItem(this.chatKey,JSON.stringify(next));this.chat=next;this.onChat(next);this.channel?.postMessage('updated');});}
  async close(){this.channel?.close();if(typeof window!=='undefined')window.removeEventListener('storage',this.storageListener);}
}

export class FirebaseStore {
  constructor(config){this.config=config;this.uid=null;this.world=null;this.chat=null;this.mode='online';this.connected=false;this.worldReady=false;this.chatReady=false;this.offset=0;this.onWorld=()=>{};this.onChat=()=>{};this.onConnection=()=>{};this.stops=[];this.pendingId=null;}
  now(){return Date.now()+this.offset;}
  campaignKey(){return 'samguk-campaign-pending:'+this.config.firebase?.projectId+':'+this.uid+':'+this.config.worldId;}
  pendingCampaign(){let pending=this.campaignPending||null;try{pending=JSON.parse(globalThis.localStorage?.getItem(this.campaignKey())||'null')||pending;}catch{}if(pending&&(isRetiredMissionCommand(pending.type)||pending.worldId&&pending.worldId!==this.config.worldId||campaignRequestState(this.world,this.uid,pending,this.config.worldId)!=='unknown')){this.clearCampaignPending(pending);return null;}return pending;}
  saveCampaignPending(req){this.campaignPending=req;try{if(req)globalThis.localStorage?.setItem(this.campaignKey(),JSON.stringify(req));else globalThis.localStorage?.removeItem(this.campaignKey());}catch{}}
  async callCampaign(name,data){const f=await import('firebase/functions');return (await f.httpsCallable(f.getFunctions(this.app,'asia-southeast1'),name)(data)).data;}
  clearCampaignPending(request){if(this.campaignPending?.id===request.id)this.campaignPending=null;try{const saved=JSON.parse(globalThis.localStorage?.getItem(this.campaignKey())||'null');if(saved?.id===request.id)globalThis.localStorage?.removeItem(this.campaignKey());}catch{}}
  syncKey(){return this.campaignKey()+':confirmed';}
  campaignSyncPending(){
    let p=this.confirmedSync;try{p=JSON.parse(globalThis.localStorage?.getItem(this.syncKey())||'null')||p;}catch{}
    if(!p)return false;
    const same=p.worldId===this.config.worldId&&this.world?.season?.id===p.worldId;
    const known=p.kind==='enhance'?(this.world?.players?.[this.uid]?.enhanceSeq||0)>p.seq:campaignRequestState(this.world,this.uid,p,p.worldId)!=='unknown';
    const proven=same&&known&&(!Number.isInteger(p.revision)||this.world.revision>=p.revision);
    if(proven||p.worldId!==this.config.worldId){this.confirmedSync=null;clearTimeout(this.syncTimer);try{globalThis.localStorage?.removeItem(this.syncKey());}catch{}return false;}
    this.confirmedSync=p;return true;
  }
  beginCampaignSync(request,commit,urgent=false){
    this.confirmedSync={id:request.id,seq:request.seq,worldId:request.worldId,...(request.kind==='enhance'?{kind:'enhance'}:{}),...(commit?.worldId===request.worldId&&commit.id===request.id?{revision:commit.revision}:{})};
    try{globalThis.localStorage?.setItem(this.syncKey(),JSON.stringify(this.confirmedSync));}catch{}
    clearTimeout(this.syncTimer);if(!this.campaignSyncPending())return;
    const scope=this.config.worldId;
    const check=async(attempt)=>{if(this.closed||scope!==this.config.worldId||!this.campaignSyncPending())return;try{await this.retryRead({worldOnly:true});}catch{}if(this.closed||scope!==this.config.worldId)return;if(this.campaignSyncPending()&&attempt<2){this.syncTimer=setTimeout(()=>check(attempt+1),attempt===0?2000:5000);this.syncTimer.unref?.();}this.onConnection(this.connected);};
    this.syncTimer=setTimeout(()=>check(0),urgent?0:500);this.syncTimer.unref?.();
  }
  campaignRecovered(request,state){this.clearCampaignPending(request);if(state==='superseded')throw new GameError('이전 명령 확인을 정리했습니다. 최신 전황에서 병력을 다시 선택해 주세요.','STALE_COMMAND');return {world:this.world,event:this.world.history?.[request.id]||null,result:{id:request.id,...(state==='confirmed'?{already:true}:{notReplayable:true})}};}
  async recoverCampaign(){return this.serialize(async()=>{const pending=this.pendingCampaign();if(!pending)return {world:this.world,result:{checked:true}};try{return await this.performCampaign(pending);}catch(error){if(error.code==='STALE_COMMAND')return {world:this.world,result:{notReplayable:true}};throw error;}});}
  async autoRecoverCampaign({reset=false}={}){
    if(this.closed||!this.connected||!this.worldReady||this.campaignExecuting||this.recoveryTask||this.campaignSyncPending())return;
    const pending=this.pendingCampaign();if(!pending){this.recoveryState=null;return;}
    const key=this.campaignKey()+':'+pending.id;
    if(reset||this.recoveryState?.key!==key)this.recoveryState={key,attempts:0,next:0};
    const state=this.recoveryState;
    if(state.attempts>=3||Date.now()<state.next)return;
    state.attempts++;state.next=Date.now()+(state.attempts===1?2000:5000);
    this.recoveryTask=this.recoverCampaign();
    try{return await this.recoveryTask;}catch{return null;}finally{state.next=Date.now()+(state.attempts===1?2000:5000);this.recoveryTask=null;if(!this.closed)this.onConnection(this.connected);}
  }
  async performCampaign(spec){
    this.campaignExecuting=true;
    try{return await this.executeCampaign(spec);}finally{this.campaignExecuting=false;}
  }
  async executeCampaign(spec){
    if(this.closed)throw new GameError('연결이 종료되었습니다. 다시 접속해 주세요.','OFFLINE');
    if(this.campaignSyncPending())throw new GameError('명령은 완료됐습니다. 최신 전황을 확인한 뒤 다시 시도해 주세요.','SYNC_PENDING');
    if(spec.worldId&&spec.worldId!==this.config.worldId)throw new GameError('이전 시즌의 명령은 다시 실행할 수 없습니다.','STALE_COMMAND');
    let state=campaignRequestState(this.world,this.uid,spec,this.config.worldId);
    if(state!=='unknown')return this.campaignRecovered(spec,state);
    let pending=this.pendingCampaign();
    // Recovery first observes the latest committed state. Never change the ID
    // or sequence of an uncertain request to make an old attack run again.
    if(pending){await this.retryRead();state=campaignRequestState(this.world,this.uid,pending,this.config.worldId);if(state!=='unknown'){if(pending.id===spec.id)return this.campaignRecovered(pending,state);this.clearCampaignPending(pending);pending=null;}else if(pending.id!==spec.id)throw Error('처리 상태를 자동 확인 중입니다. 잠시 후 다시 시도해 주세요.');}
    if(this.closed||spec.worldId&&spec.worldId!==this.config.worldId)throw new GameError('전장이 바뀌었습니다. 최신 화면에서 다시 확인해 주세요.','STALE_COMMAND');
    const request=pending||{...spec,seq:this.world.players[this.uid]?.commandSeq||0,worldId:this.config.worldId};this.saveCampaignPending(request);
    let data;
    try{data=await this.callCampaign('campaignOrder',request);}
    catch(error){
      if(error.details?.definiteRejection||/invalid-argument|unauthenticated|permission-denied/.test(error.code||''))this.clearCampaignPending(request);
      await this.retryRead().catch(()=>{});state=campaignRequestState(this.world,this.uid,request,this.config.worldId);
      if(state!=='unknown')return this.campaignRecovered(request,state);
      throw error;
    }
    // Callable success confirms the write independently of a later read error.
    this.clearCampaignPending(request);
    this.beginCampaignSync(request,data.commit,!!data.guardPending);
    // Registration/name/start flows consume the resulting world immediately.
    // Only combat/movement and guard completion detach their screen refresh.
    if(!['move','resolveGuard'].includes(request.type)&&this.campaignSyncPending())try{await this.retryRead({worldOnly:true});}catch{}
    return {...data,world:this.world,...(this.campaignSyncPending()?{syncPending:true}:{})};
  }
  campaignAction(spec){return this.serialize(()=>this.performCampaign({...spec,id:spec.id||commandId()}));}
  async aiChoice(count){const f=await import('firebase/functions'),call=f.httpsCallable(f.getFunctions(this.app,'asia-southeast1'),'aiRulerChoice');return (await call({worldId:this.config.worldId,...(count===undefined?{}:{count})})).data;}
  async claimReward(ticketId,city){if(!canWrite(this))throw Error('최신 전황을 확인한 뒤 시도해 주세요.');const f=await import('firebase/functions'),call=f.httpsCallable(f.getFunctions(this.app,'asia-southeast1'),'rulerReward');const result=(await call({ticketId,city})).data;await this.retryRead();return result;}
  enhancementKey(){return 'samguk-enhancement-pending:'+this.config.firebase?.projectId+':'+this.uid+':'+this.config.worldId;}
  enhancementQueue(){
    const key=this.enhancementKey()+':local-v1';
    if(this.localEnhancements?.key!==key){this.localEnhancements?.close();const uid=this.uid,scope=this.config.worldId;this.localEnhancements=new EnhancementQueue({key,uid,world:()=>this.world,now:()=>this.now(),connected:()=>!this.closed&&this.connected&&this.worldReady&&this.uid===uid&&this.config.worldId===scope,send:items=>this.callCampaign('enhanceArmy',{mode:'local-batch',worldId:scope,items}),refresh:()=>this.retryRead({worldOnly:true}),notify:()=>this.onEnhancement?.()});}
    return this.localEnhancements;
  }
  localEnhancementPending(){if(!this.uid||!this.world)return false;try{return this.enhancementQueue().pending();}catch{return true;}}
  queueEnhancement(city,ids,boosters){if(this.pendingEnhancement()||this.pendingCampaign()||this.campaignSyncPending()||!this.worldReady||!this.chatReady)throw Error('이전 명령과 최신 전황을 확인한 뒤 강화해 주세요.');return this.enhancementQueue().enqueue(city,ids,boosters);}
  flushLocalEnhancements(options){if(this.uid&&this.world)this.enhancementQueue().flush(options).catch(()=>{});}
  pendingEnhancement(){try{const p=JSON.parse(globalThis.localStorage?.getItem(this.enhancementKey())||'null');return p&&p.worldId===this.config.worldId&&typeof p.id==='string'?p:null;}catch{return null;}}
  enhanceArmy(spec){return this.serialize(async()=>{
    if(!canWrite(this)||this.closed)throw Error('최신 전황을 다시 연결한 뒤 시도해 주세요.');
    const req=this.pendingEnhancement()||{...spec,worldId:this.config.worldId},key=this.enhancementKey(),uid=this.uid;
    const clear=()=>{try{if(JSON.parse(globalThis.localStorage?.getItem(key)||'null')?.id===req.id)globalThis.localStorage?.removeItem(key);}catch{}};
    try{globalThis.localStorage?.setItem(key,JSON.stringify(req));}catch{}
    let result;
    try{result=await this.callCampaign('enhanceArmy',req);}
    catch(error){if(error.details?.committed===false||/invalid-argument|unauthenticated|permission-denied/.test(error.code||''))clear();throw error;}
    // Success is final even if a subsequent refresh fails. Reuse the realtime
    // world and never re-send a confirmed roll to repair a failed read.
    clear();
    if(!this.closed&&this.uid===uid&&req.worldId===this.config.worldId)this.beginCampaignSync({...req,kind:'enhance'});
    return result;
  });}
  serialize(task){const result=(this.writeQueue||Promise.resolve()).catch(()=>{}).then(task);this.writeQueue=result.catch(()=>{});return result;}
  async setup(){
    if(this.app)return;
    const [appSdk,authSdk,dbSdk]=await Promise.all([import('firebase/app'),import('firebase/auth'),import('firebase/database')]);
    this.authSdk=authSdk;this.sdk=dbSdk;this.app=appSdk.initializeApp(this.config.firebase,'samguk-online');this.auth=authSdk.getAuth(this.app);this.db=dbSdk.getDatabase(this.app);
    if(this.config.emulators){
      if(!['localhost','127.0.0.1'].includes(location.hostname))throw new GameError('개발 전장은 이 기기에서만 열 수 있어요.');
      authSdk.connectAuthEmulator(this.auth,'http://127.0.0.1:9099',{disableWarnings:true});dbSdk.connectDatabaseEmulator(this.db,'127.0.0.1',9000);this.mode='emulator';
    }
    this.stops.push(dbSdk.onValue(dbSdk.ref(this.db,'.info/serverTimeOffset'),snap=>{this.offset=Number(snap.val())||0;}));
    this.stops.push(dbSdk.onValue(dbSdk.ref(this.db,'.info/connected'),snap=>{this.connected=snap.val()===true;if(!this.connected){this.worldReady=false;this.chatReady=false;}else if(this.ref)this.retryRead().catch(()=>{});this.onConnection(this.connected);}));
    await this.auth.authStateReady();
  }
  async readWorldAt(id){
    if(!this.config.compactSync)return (await this.sdk.get(this.sdk.ref(this.db,'worlds/'+id))).val();
    this.readers??=new Map();let reader=this.readers.get(id);if(!reader){reader=new WorldReader(this.sdk,this.db,id,{cache:this.records()});this.readers.set(id,reader);}return reader.read();
  }
  records(){const scope=JSON.stringify([this.config.firebase?.projectId||this.config.firebase?.databaseURL||'test',this.uid||'anonymous']);if(this.recordScope!==scope){this.recordScope=scope;this.recordStorage=recordCache(scope);}return this.recordStorage;}
  async seasonArchive(id){const worldId=id==='test'?'main':id,path='worlds/'+worldId,key='archive:'+worldId,cache=this.records();
    let version;try{version=(await this.sdk.get(this.sdk.ref(this.db,'recordVersions/'+worldId+'/archive'))).val();}catch(error){const offline=await cache.get(key,undefined);if(offline?.rankings&&offline?.territories)return {...offline,localUnverified:true};throw error;}const cached=version?await cache.get(key,version):null;if(cached?.rankings&&cached?.territories)return cached;
    const archive=id==='test'?archiveTestSeason((await this.sdk.get(this.sdk.ref(this.db,path))).val()):(await this.sdk.get(this.sdk.ref(this.db,path+'/season/result'))).val();if(!archive)throw Error('최종 기록을 아직 정리하고 있습니다.');
    // Never persist against a stale metadata stamp while a correction is arriving.
    const after=(await this.sdk.get(this.sdk.ref(this.db,'recordVersions/'+worldId+'/archive'))).val();if(version&&after===version)await cache.put(key,version,archive);return archive;
  }
  async battleDetail(id){return this.reader?this.reader.detail(id):(await this.sdk.get(this.sdk.ref(this.db,'worlds/'+this.config.worldId+'/history/'+id))).val();}
  async advanceClosedSeason(){
    if(!this.config.compactSync)return false;
    const path='worlds/'+this.config.worldId,season=(await this.sdk.get(this.sdk.ref(this.db,path+'/season'))).val();
    const next=followingSeason({season},this.now());if(!next)return false;
    // Discover the current season without downloading archived armies and dice.
    const profile=(await this.sdk.get(this.sdk.ref(this.db,path+'/players/'+this.uid))).val();
    if(profile?.nameChosen)this.publicName=profile.name;
    await this.sdk.set(this.sdk.ref(this.db,'seasonIndex/'+this.config.worldId),indexEntry(season.result)).catch(()=>{});
    this.config.worldId='season-'+next.number;this.initialRaw=null;
    const nextRef=this.sdk.ref(this.db,'worlds/'+this.config.worldId);
    if((await this.sdk.get(this.sdk.ref(this.db,'worlds/'+this.config.worldId+'/revision'))).exists())return true;
    if(next.number>=FIRST_CAMPAIGN_SEASON){await this.callCampaign('campaignOpen',{worldId:this.config.worldId});return true;}
    // Transactions are needed only for a new season, never to test an existing one.
    const result=await this.sdk.runTransaction(nextRef,current=>{if(current)return;const initial=createSeasonWorld(next.number,next.startAt,'samguk:'+this.config.worldId+':'+entropy());initial.command.actor=this.uid;return initial;},{applyLocally:false});
    if(result.committed||result.snapshot.exists())return true;
    throw new GameError('새 시즌을 준비하지 못했습니다. 다시 연결해 주세요.');
  }
  async login({restore=false,name='',testUid=''}={}){
    await this.setup();
    let user=this.auth.currentUser;
    if(restore&&!user)return null;
    if(!user){
      if(this.config.emulators){const b64=text=>btoa(unescape(encodeURIComponent(text))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');const token=b64(JSON.stringify({alg:'none',typ:'JWT'}))+'.'+b64(JSON.stringify({sub:testUid||crypto.randomUUID(),email:`${testUid||crypto.randomUUID()}@example.test`,email_verified:true,name:name||'개발 군주',iss:'https://accounts.google.com',aud:'demo-samguk-online'}))+'.';user=(await this.authSdk.signInWithCredential(this.auth,this.authSdk.GoogleAuthProvider.credential(token))).user;}
      else{const provider=new this.authSdk.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});user=(await this.authSdk.signInWithPopup(this.auth,provider)).user;}
    }
    this.uid=user.uid;this.profileName=name||user.displayName||'새 군주';
    this.stops.push(this.sdk.onValue(this.sdk.ref(this.db,'rewardTickets/'+this.uid),snap=>{this.rewards=snap.val()||{};if(this.world)this.onWorld(this.world);},()=>{}));
    if(this.config.seasons){const index=(await this.sdk.get(this.sdk.ref(this.db,'seasonIndex'))).val()||{};this.config.worldId=Object.keys(index).filter(id=>/^season-[0-9]+$/.test(id)).sort((a,b)=>Number(b.slice(7))-Number(a.slice(7)))[0]||activeWorld(this.now());for(let tries=0;tries<4;tries++){if(await this.advanceClosedSeason())continue;const prev=await this.readWorldAt(this.config.worldId);this.initialRaw=prev;if(prev?.players?.[this.uid]?.nameChosen)this.publicName=prev.players[this.uid].name;if(prev?.season?.endedAt)await this.sdk.set(this.sdk.ref(this.db,'seasonIndex/'+this.config.worldId),indexEntry(prev.season.result)).catch(()=>{});if(prev?.season?.deadline&&this.now()>=prev.season.deadline&&!prev.season.endedAt){if(campaignEnabled(prev)){await this.callCampaign('campaignOrder',{worldId:this.config.worldId,id:commandId(),seq:prev.players?.[this.uid]?.commandSeq||0,type:'recruit'});continue;}const before=normalizeWorld(prev),command={id:commandId(),type:'recruit',at:this.now(),baseRevision:before.revision},ended=applyCommand(before,this.uid,command,command.at);const chatPath='chat/'+this.config.worldId,chat=(await this.sdk.get(this.sdk.ref(this.db,chatPath))).val(),nextChat=appendSystemMessages(chat,systemEvents(before,ended),this.uid,command.at),patch={};for(const[k,v]of Object.entries(changedPaths(before,ended)))patch['worlds/'+this.config.worldId+'/'+k]=v;if(this.config.compactSync)patch['historyFeed/'+this.config.worldId]=historyFeed(ended);for(const[k,v]of Object.entries(changedPaths(chat,nextChat)))patch[chatPath+'/'+k]=v;await this.sdk.update(this.sdk.ref(this.db),patch);continue;}const next=prev?followingSeason(prev,this.now()):null;if(!next)break;this.config.worldId='season-'+next.number;if(next.number>=FIRST_CAMPAIGN_SEASON){await this.callCampaign('campaignOpen',{worldId:this.config.worldId});continue;}const nextRef=this.sdk.ref(this.db,'worlds/'+this.config.worldId);const result=await this.sdk.runTransaction(nextRef,current=>{if(current)return;const initial=createSeasonWorld(next.number,next.startAt,'samguk:'+this.config.worldId+':'+entropy());initial.command.actor=this.uid;return initial;},{applyLocally:false});if(result.committed||result.snapshot.exists())continue;throw new GameError('새 시즌을 준비하지 못했습니다. 다시 연결해 주세요.');}}
    const path=`worlds/${this.config.worldId||'main'}`;this.ref=this.sdk.ref(this.db,path);this.chatPath=/^season-/.test(this.config.worldId)?'chat/'+this.config.worldId:'chat/global';this.chatRef=this.sdk.ref(this.db,this.chatPath);
    let raw=this.initialRaw||await this.readWorldAt(this.config.worldId||'main');this.initialRaw=null;
    if(!raw){const initial=createWorld(this.now(),`samguk:${this.config.worldId||'main'}:${entropy()}`);initial.command.actor=this.uid;const result=await this.sdk.runTransaction(this.ref,current=>current?undefined:initial,{applyLocally:false});raw=result.committed?result.snapshot.val():(await this.sdk.get(this.ref)).val();}
    this.world=normalizeWorld(raw);this.worldReady=true;if(this.world.season?.endedAt)this.sdk.set(this.sdk.ref(this.db,'seasonIndex/'+this.config.worldId),indexEntry(this.world.season.result)).catch(()=>{});
    if(this.config.compactSync){
      this.reader=this.readers?.get(this.config.worldId||'main')||new WorldReader(this.sdk,this.db,this.config.worldId||'main',{cache:this.records()});
      this.reader.onWorld=raw=>{try{const world=normalizeWorld(raw);this.worldReady=true;this.observed=world;if(world.command.id!==this.pendingId){this.world=world;this.onWorld(world);}this.onConnection(this.connected);}catch(e){this.worldReady=false;this.onConnection(false,e.message);}};
      this.reader.onError=e=>{this.worldReady=false;this.onConnection(false,firebaseMessage(e));};this.reader.start();
    }else this.stops.push(this.sdk.onValue(this.ref,snap=>{if(!snap.exists()){this.worldReady=false;this.onConnection(false,'전황을 다시 확인해야 합니다.');return;}try{const world=normalizeWorld(snap.val());this.worldReady=true;this.observed=world;if(world.command.id===this.pendingId)return;this.world=world;this.onWorld(world);}catch(error){this.worldReady=false;this.onConnection(false,error.message);}},error=>{this.worldReady=false;this.onConnection(false,firebaseMessage(error));}));
    this.stops.push(this.sdk.onValue(this.chatRef,snap=>{this.chat=snap.val();this.chatReady=true;this.onChat(this.chat);this.onConnection(this.connected);},error=>{this.chatReady=false;this.onConnection(false,firebaseMessage(error));}));
    // .info is maintained locally by the SDK. A server get() is not supported
    // by production RTDB; wait for the local listener already installed in setup.
    this.connected=await new Promise(resolve=>this.sdk.onValue(this.sdk.ref(this.db,'.info/connected'),snap=>resolve(snap.val()===true),{onlyOnce:true}));
    // A Google identity authenticates access; the player chooses the public
    // ruler name separately before a profile is registered or migrated.
    if(this.config.seasons&&this.world.featureVersion===6&&!this.world.players[this.uid]&&this.publicName&&!this.pendingCampaign()&&!this.campaignSyncPending()&&!seasonClosed(this.world,this.now())){await this.retryRead();await this.submit({type:'register',name:this.publicName});}this.onWorld(this.world);return this.world.players[this.uid]||{uid:this.uid,name:'',nameChosen:false};
  }
  async retryRead({worldOnly=false}={}){
    if(this.reading){await this.reading;if(!worldOnly&&!this.chatReady)return this.retryRead();return;}
    const scope=this.config.worldId;
    this.reading=(async()=>{try{
      const [w,c]=await Promise.all([this.config.compactSync?this.readWorldAt(scope||'main'):this.sdk.get(this.ref).then(s=>s.val()),worldOnly?Promise.resolve(null):this.sdk.get(this.chatRef)]);
      if(this.closed||scope!==this.config.worldId)return;
      const world=normalizeWorld(w);
      if(!this.world||this.world.season?.id!==world.season?.id||world.revision>=this.world.revision){this.world=world;this.observed=world;}
      this.worldReady=true;this.campaignSyncPending();
      if(c){this.chat=c.val();this.chatReady=true;this.onChat(this.chat);}
      this.onWorld(this.world);this.onConnection(this.connected);
    }catch(error){if(!this.closed&&scope===this.config.worldId){this.worldReady=false;if(!worldOnly)this.chatReady=false;this.onConnection(false,worldOnly&&this.campaignSyncPending()?'명령은 완료됐습니다. 최신 전황을 확인 중입니다.':firebaseMessage(error));}throw error;}finally{this.reading=null;}})();return this.reading;
  }
  submit(spec){return this.serialize(()=>this.performCommand(spec));}
  async performCommand(spec){
    if(seasonClosed(this.world,this.now())&&(this.world.season?.endedAt||spec.type!=='recruit'))throw new GameError('시즌이 종료되었습니다. 최종 결과를 확인해 주세요.','SEASON_CLOSED');
    if(this.config.seasons&&!worldWritable(this.config.worldId||'main',this.now()))throw new GameError('시즌 종료 또는 개막 대기 중입니다. 랭킹과 최종 지도만 볼 수 있습니다.','SEASON_CLOSED');
    if(!canWrite(this))throw new GameError('전황·채팅을 다시 확인해야 합니다. 다시 연결 버튼을 눌러 주세요.','OFFLINE');
    if(campaignEnabled(this.world))return this.performCampaign({...spec,id:spec.id||commandId()});
    const id=spec.id||commandId();let at=Math.max(this.now(),this.world.updatedAt);
    this.pendingId=id;
    try{
      for(let attempt=0;attempt<6;attempt++){
        const before=this.world;
        if(before.receipts[id])return {world:before,event:before.history[id]||null};
        at=Math.max(at,before.updatedAt);
        if(spec.type==='recruit'&&((before.featureVersion===2&&before.rosterVersion===1)||(before.featureVersion>=3&&before.rosterVersion===2))&&!hasDueRecruitment(before,at)&&!seasonClosed(before,at)&&(!this.config.seasons||before.season))return {world:before,event:null};
        const command={...spec,...(this.config.seasons&&this.config.worldId==='season-1'?{seasonId:'season-1'}:{}),id,at,baseRevision:before.revision};const next=applyCommand(before,this.uid,command,at),events=systemEvents(before,next);const patch=changedPaths(before,next);
        try{
          if(events.length||this.config.compactSync){
            const nextChat=events.length?appendSystemMessages(this.chat,events,this.uid,this.now()):this.chat,rootPatch={};
            if(this.config.compactSync){const feedPath=`historyFeed/${this.config.worldId||'main'}`;if(this.reader?.feed?.revision===before.revision){for(const [path,value] of Object.entries(changedPaths(historyFeed(before),historyFeed(next))))rootPatch[feedPath+'/'+path]=value;}else rootPatch[feedPath]=historyFeed(next);}
            for(const [path,value] of Object.entries(patch))rootPatch[`worlds/${this.config.worldId||'main'}/${path}`]=value;
            for(const [path,value] of Object.entries(changedPaths(this.chat,nextChat)))rootPatch[`${this.chatPath||'chat/global'}/${path}`]=value;
            await this.sdk.update(this.sdk.ref(this.db),rootPatch);this.chat=nextChat;this.onChat(nextChat);
          }else await this.sdk.update(this.ref,patch);
          if(next.season?.endedAt)this.sdk.set(this.sdk.ref(this.db,'seasonIndex/'+this.config.worldId),indexEntry(next.season.result)).catch(()=>{});this.pendingId=null;this.world=this.observed?.revision>next.revision?this.observed:next;this.onWorld(this.world);return {world:this.world,event:this.world.history[id]||next.history[id]||null};
        }catch(error){
          const [worldRaw,chatSnap]=await Promise.all([this.config.compactSync?this.readWorldAt(this.config.worldId||'main'):this.sdk.get(this.ref).then(s=>s.val()),this.sdk.get(this.chatRef)]);const current=normalizeWorld(worldRaw);this.world=current;this.chat=chatSnap.val();this.onChat(this.chat);
          if(current.receipts[id]){this.pendingId=null;this.onWorld(current);return {world:current,event:current.history[id]||null};}
          if((current.revision===before.revision&&!events.length)||attempt===5)throw new GameError(firebaseMessage(error),'REMOTE');
          await new Promise(resolve=>setTimeout(resolve,20+Math.random()*40*(attempt+1)));
        }
      }
    }finally{this.pendingId=null;if(this.world)this.onWorld(this.world);}
  }
  sendChat(text){return this.serialize(()=>this.performChat(text));}
  async performChat(text){
    if(seasonClosed(this.world,this.now()))throw new GameError('종료된 시즌은 채팅할 수 없습니다.','SEASON_CLOSED');
    if(this.config.seasons&&!worldWritable(this.config.worldId||'main',this.now()))throw new GameError('종료된 시즌은 채팅할 수 없습니다.','SEASON_CLOSED');
    if(!canWrite(this,{allowLocalEnhancement:true}))throw new GameError('전황과 채팅을 다시 확인한 뒤 보내 주세요.','OFFLINE');
    const name=this.world.players[this.uid]?.name||this.profileName;
    const checked=addChatMessage(this.chat,this.uid,name,text,this.now());text=Object.values(checked.messages).find(m=>m.seq===checked.sequence).text;
    let blocked=null;
    const result=await this.sdk.runTransaction(this.chatRef,current=>{
      try{const next=addChatMessage(current,this.uid,name,text,this.now());const slot=String(next.sequence%RULES.chatLimit);next.messages[slot].at=this.sdk.serverTimestamp();next.lastSent[this.uid]=this.sdk.serverTimestamp();return next;}
      catch(error){blocked=error;return undefined;}
    },{applyLocally:false});
    if(!result.committed)throw blocked||new GameError('채팅을 보내지 못했어요. 다시 시도해 주세요.');
    this.chat=result.snapshot.val();this.onChat(this.chat);
  }
  async close({signOut=false}={}){this.closed=true;this.localEnhancements?.close();clearTimeout(this.syncTimer);this.readers?.forEach(r=>r.close());this.reader?.close();this.stops.forEach(stop=>stop());this.stops=[];if(signOut&&this.auth)await this.authSdk.signOut(this.auth);this.connected=false;}
}

export function firebaseMessage(error){const code=String(error?.code||'');if(/popup-closed|cancelled-popup/.test(code))return '로그인 창을 닫았어요. 다시 로그인할 수 있습니다.';if(/unauthorized-domain/.test(code))return '이 접속 주소에서 구글 로그인을 사용할 수 있도록 전장 연결을 준비하고 있어요.';if(/operation-not-allowed/.test(code))return '구글 로그인 연결이 아직 준비되지 않았어요.';if(/permission|PERMISSION/.test(code)||/permission_denied/i.test(error?.message||''))return '명령을 저장하지 못했어요. 최신 전황과 접속 권한을 확인해 주세요.';if(/network/.test(code))return '인터넷 연결을 확인해 주세요.';return error?.message||'전장에 연결하지 못했어요.';}
