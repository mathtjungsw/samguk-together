import {createWorld,normalizeWorld,applyCommand,addChatMessage,GameError,RULES} from './engine.js';

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
  readWorld(){const text=this.storage.getItem(this.key);if(!text)return createWorld(this.now(),'practice-world-v1');try{return normalizeWorld(JSON.parse(text));}catch(error){throw new GameError('이 기기의 연습 기록을 읽지 못했어요. 원본 기록을 보존했습니다.','CORRUPT');}}
  refresh(){try{this.world=this.readWorld();this.chat=JSON.parse(this.storage.getItem(this.chatKey)||'null');this.onWorld(this.world);this.onChat(this.chat);}catch(error){this.onConnection(false,error.message);}}
  async connect(name,uid){this.uid=uid||`practice-${crypto.randomUUID()}`;await this.locked(()=>{let world=this.readWorld();if(!world.players[this.uid])world=applyCommand(world,this.uid,{id:commandId(),type:'register',name,at:Math.max(this.now(),world.updatedAt),baseRevision:world.revision});this.storage.setItem(this.key,JSON.stringify(world));});this.refresh();this.channel?.postMessage('updated');return this.world.players[this.uid];}
  async submit(spec){return this.locked(()=>{const world=this.readWorld(),c={...spec,id:spec.id||commandId(),at:Math.max(this.now(),world.updatedAt),baseRevision:world.revision};const next=applyCommand(world,this.uid,c);this.storage.setItem(this.key,JSON.stringify(next));this.world=next;this.onWorld(next);this.channel?.postMessage('updated');return {world:next,event:next.history[c.id]||null};});}
  async sendChat(text){return this.locked(()=>{const raw=JSON.parse(this.storage.getItem(this.chatKey)||'null');const next=addChatMessage(raw,this.uid,this.world.players[this.uid].name,text,this.now());this.storage.setItem(this.chatKey,JSON.stringify(next));this.chat=next;this.onChat(next);this.channel?.postMessage('updated');});}
  async close(){this.channel?.close();if(typeof window!=='undefined')window.removeEventListener('storage',this.storageListener);}
}

export class FirebaseStore {
  constructor(config){this.config=config;this.uid=null;this.world=null;this.chat=null;this.mode='online';this.connected=false;this.offset=0;this.onWorld=()=>{};this.onChat=()=>{};this.onConnection=()=>{};this.stops=[];this.pendingId=null;}
  now(){return Date.now()+this.offset;}
  async setup(){
    if(this.app)return;
    const [appSdk,authSdk,dbSdk]=await Promise.all([import('firebase/app'),import('firebase/auth'),import('firebase/database')]);
    this.authSdk=authSdk;this.sdk=dbSdk;this.app=appSdk.initializeApp(this.config.firebase,'samguk-online');this.auth=authSdk.getAuth(this.app);this.db=dbSdk.getDatabase(this.app);
    if(this.config.emulators){
      if(!['localhost','127.0.0.1'].includes(location.hostname))throw new GameError('개발 전장은 이 기기에서만 열 수 있어요.');
      authSdk.connectAuthEmulator(this.auth,'http://127.0.0.1:9099',{disableWarnings:true});dbSdk.connectDatabaseEmulator(this.db,'127.0.0.1',9000);this.mode='emulator';
    }
    this.stops.push(dbSdk.onValue(dbSdk.ref(this.db,'.info/serverTimeOffset'),snap=>{this.offset=Number(snap.val())||0;}));
    this.stops.push(dbSdk.onValue(dbSdk.ref(this.db,'.info/connected'),snap=>{this.connected=snap.val()===true;this.onConnection(this.connected);}));
    await this.auth.authStateReady();
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
    const path=`worlds/${this.config.worldId||'main'}`;this.ref=this.sdk.ref(this.db,path);this.chatRef=this.sdk.ref(this.db,'chat/global');
    let raw=(await this.sdk.get(this.ref)).val();
    if(!raw){const initial=createWorld(this.now(),`samguk:${this.config.worldId||'main'}:${entropy()}`);initial.command.actor=this.uid;const result=await this.sdk.runTransaction(this.ref,current=>current?undefined:initial,{applyLocally:false});raw=result.committed?result.snapshot.val():(await this.sdk.get(this.ref)).val();}
    this.world=normalizeWorld(raw);
    this.stops.push(this.sdk.onValue(this.ref,snap=>{if(!snap.exists())return;try{const world=normalizeWorld(snap.val());this.observed=world;if(world.command.id===this.pendingId)return;this.world=world;this.onWorld(world);}catch(error){this.onConnection(false,error.message);}},error=>this.onConnection(false,firebaseMessage(error))));
    this.stops.push(this.sdk.onValue(this.chatRef,snap=>{this.chat=snap.val();this.onChat(this.chat);},error=>this.onConnection(false,firebaseMessage(error))));
    // .info is maintained locally by the SDK. A server get() is not supported
    // by production RTDB; wait for the local listener already installed in setup.
    this.connected=await new Promise(resolve=>this.sdk.onValue(this.sdk.ref(this.db,'.info/connected'),snap=>resolve(snap.val()===true),{onlyOnce:true}));
    // A Google identity authenticates access; the player chooses the public
    // ruler name separately before a profile is registered or migrated.
    this.onWorld(this.world);return this.world.players[this.uid]||{uid:this.uid,name:'',nameChosen:false};
  }
  async submit(spec){
    if(!this.connected)throw new GameError('연결이 끊겼어요. 다시 연결된 뒤 명령을 보내 주세요.','OFFLINE');
    const id=spec.id||commandId();let at=Math.max(this.now(),this.world.updatedAt);
    this.pendingId=id;
    try{
      for(let attempt=0;attempt<3;attempt++){
        const before=this.world;
        if(before.receipts[id])return {world:before,event:before.history[id]||null};
        at=Math.max(at,before.updatedAt);
        const command={...spec,id,at,baseRevision:before.revision};const next=applyCommand(before,this.uid,command,at);const patch=changedPaths(before,next);
        try{
          await this.sdk.update(this.ref,patch);
          this.pendingId=null;this.world=this.observed?.revision>next.revision?this.observed:next;this.onWorld(this.world);return {world:this.world,event:this.world.history[id]||next.history[id]||null};
        }catch(error){
          const current=normalizeWorld((await this.sdk.get(this.ref)).val());this.world=current;
          if(current.receipts[id]){this.pendingId=null;this.onWorld(current);return {world:current,event:current.history[id]||null};}
          if(current.revision===before.revision||attempt===2)throw new GameError(firebaseMessage(error),'REMOTE');
        }
      }
    }finally{this.pendingId=null;if(this.world)this.onWorld(this.world);}
  }
  async sendChat(text){
    if(!this.connected)throw new GameError('다시 연결된 뒤 채팅을 보내 주세요.','OFFLINE');
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
  async close({signOut=false}={}){this.stops.forEach(stop=>stop());this.stops=[];if(signOut&&this.auth)await this.authSdk.signOut(this.auth);this.connected=false;}
}

export function firebaseMessage(error){const code=String(error?.code||'');if(/popup-closed|cancelled-popup/.test(code))return '로그인 창을 닫았어요. 다시 로그인할 수 있습니다.';if(/unauthorized-domain/.test(code))return '이 접속 주소에서 구글 로그인을 사용할 수 있도록 전장 연결을 준비하고 있어요.';if(/operation-not-allowed/.test(code))return '구글 로그인 연결이 아직 준비되지 않았어요.';if(/permission|PERMISSION/.test(code)||/permission_denied/i.test(error?.message||''))return '명령을 저장하지 못했어요. 최신 전황과 접속 권한을 확인해 주세요.';if(/network/.test(code))return '인터넷 연결을 확인해 주세요.';return error?.message||'전장에 연결하지 못했어요.';}
