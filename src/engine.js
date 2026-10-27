import DATA from './data/game-data.json' with {type:'json'};

export const MAP=DATA;
export const MINUTE=60_000;
export const RULES=Object.freeze({recruitMs:10*MINUTE,actionMs:10*MINUTE,restartMs:60*MINUTE,protectionMs:20*MINUTE,attackMultiplier:.9,attackLoss:.4,defenseLoss:.2,historyLimit:100,chatLimit:50});
export const RANKS=Object.freeze({normal:{name:'일반 영토',capacity:12,neutral:2},stronghold:{name:'요충지',capacity:16,neutral:4},citadel:{name:'대거점',capacity:20,neutral:6}});
export const TIERS={4:'병사',6:'부장',8:'장수',12:'장군',20:'군주'};
export const COLORS=['#637d9b','#6f8c63','#b87965','#997faa','#b39856','#648f91','#a66f8a','#8f855f','#617f74','#9c7c61','#767fb2','#a3868a','#819362','#6d8aab','#aa7960'];
const placesById=new Map(DATA.places.map(p=>[p.id,p]));
const linksById=new Map(DATA.layout.cells.map(p=>[p.id,p.neighbors]));
const rosterByTier=Object.fromEntries([6,8,12].map(s=>[s,DATA.roster.filter(h=>h.sides===s)]));
export const placeInfo=id=>placesById.get(id);
export const adjacent=id=>linksById.get(id)||[];
export const capacityOf=id=>RANKS[placeInfo(id)?.rank||'normal'].capacity;
export const ownedTerritories=(s,uid)=>Object.values(s.territories||{}).filter(t=>t.owner===uid);
export const armyPower=units=>units.reduce((sum,u)=>sum+(u.sides+1)/2,0);
export const attackScore=raw=>Math.max(1,Math.floor(raw*RULES.attackMultiplier));
export const casualtyCount=(winnerCount,enemyCount,rate)=>Math.max(0,Math.min(winnerCount-1,Math.ceil(enemyCount*rate)));
export const readyUnits=(t,now)=>t.units.filter(u=>u.readyAt<=now);
export const clockText=ms=>{const n=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};

export class GameError extends Error {constructor(message,code='INVALID'){super(message);this.name='GameError';this.code=code;}}
const requireGame=(condition,message,code)=>{if(!condition)throw new GameError(message,code);};
export function cleanName(value){const name=String(value||'').normalize('NFKC').trim().slice(0,16);requireGame(name.length>0&&!/[<>\u0000-\u001f\u007f]/u.test(name),'이름은 1~16자의 글자나 숫자로 입력해 주세요.');return name;}
export function hash32(text){let h=2166136261;for(const char of String(text)){h^=char.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function seededRandom(seed){let h=typeof seed==='number'?seed>>>0:hash32(seed);return ()=>{h=(h+0x6D2B79F5)>>>0;let t=h;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function unitTier(roll){return roll<.8?4:roll<.95?6:roll<.99?8:12;}
export function createWorld(now=Date.now(),seed='samguk-main'){
  const territories={};
  for(const p of DATA.places)territories[p.id]={id:p.id,owner:'',units:Array.from({length:RANKS[p.rank].neutral},(_,i)=>({id:`neutral:${p.id}:${i}`,name:'중립 병사',sides:4,readyAt:0})),generation:0,revision:0,lastRecruitAt:now,actionReadyAt:0,protectionUntil:0};
  return {version:1,mapId:DATA.mapId,seed,revision:0,createdAt:now,updatedAt:now,players:{},territories,requests:{},history:{},receipts:{},command:{id:'initial',type:'init',actor:'',at:now,baseRevision:-1}};
}
export function normalizeWorld(raw){
  requireGame(raw&&raw.version===1&&raw.mapId===DATA.mapId,'전장 저장 버전이 다릅니다. 기존 기록을 보존했어요.','VERSION');
  const s=structuredClone(raw);
  s.players??={};s.requests??={};s.history??={};s.receipts??={};
  requireGame(Number.isInteger(s.revision)&&s.revision>=0&&typeof s.seed==='string','전장 기록을 확인할 수 없어요.','CORRUPT');
  const unitIds=new Set();
  for(const p of DATA.places){const t=s.territories?.[p.id];requireGame(t&&t.id===p.id&&typeof t.owner==='string'&&Array.isArray(t.units)&&t.units.length>=1&&t.units.length<=capacityOf(p.id),'영토의 병력 기록을 확인할 수 없어요.','CORRUPT');
    requireGame(!t.owner||!!s.players[t.owner],'영토 소유자의 기록을 확인할 수 없어요.','CORRUPT');
    for(const key of ['generation','revision','lastRecruitAt','actionReadyAt','protectionUntil'])requireGame(Number.isFinite(t[key])&&t[key]>=0,'영토의 시간 기록을 확인할 수 없어요.','CORRUPT');
    for(const u of t.units){requireGame(u&&typeof u.id==='string'&&!unitIds.has(u.id)&&TIERS[u.sides]&&typeof u.name==='string'&&Number.isFinite(u.readyAt),'중복되거나 손상된 병력 기록입니다.','CORRUPT');unitIds.add(u.id);}
  }
  for(const [uid,p] of Object.entries(s.players))requireGame(p.uid===uid&&typeof p.name==='string'&&Number.isInteger(p.life)&&p.life>=0&&Number.isFinite(p.eliminatedAt),'군주의 기록을 확인할 수 없어요.','CORRUPT');
  return s;
}
function recruitedUnit(s,t,at){
  const rng=seededRandom(`${s.seed}:${t.id}:${t.generation}:${at}`),sides=unitTier(rng());
  const roster=rosterByTier[sides]||[];
  // Living names are unique within one player's army. Fallen officers may return.
  const living=new Set(ownedTerritories(s,t.owner).flatMap(x=>x.units.filter(u=>u.sides>4&&u.sides<20).map(u=>u.name)));
  const candidates=roster.filter(h=>!living.has(h.name));
  const hero=candidates.length?candidates[Math.floor(rng()*candidates.length)]:null;
  return {id:`recruit:${t.id}:${t.generation}:${at}`,name:hero?.name||'병사',sides:hero?sides:4,readyAt:at};
}
export function materializeTerritory(s,id,now){
  const t=s.territories[id];if(!t.owner)return t;
  if(t.units.length>=capacityOf(id)){t.lastRecruitAt=now;return t;}
  const count=Math.min(capacityOf(id)-t.units.length,Math.max(0,Math.floor((now-t.lastRecruitAt)/RULES.recruitMs)));
  for(let i=0;i<count;i++){const at=t.lastRecruitAt+RULES.recruitMs;t.units.push(recruitedUnit(s,t,at));t.lastRecruitAt=at;}
  if(t.units.length>=capacityOf(id))t.lastRecruitAt=now;
  return t;
}
export function projectWorld(world,now){
  const s=structuredClone(world);
  for(const id of Object.keys(s.territories))materializeTerritory(s,id,now);
  return s;
}
export function nextRecruitAt(t){return !t.owner||t.units.length>=capacityOf(t.id)?0:t.lastRecruitAt+RULES.recruitMs;}
export function restartAvailableAt(player){return player?.life>0?player.eliminatedAt+RULES.restartMs:0;}
function eligibleToStart(s,uid,now){
  const p=s.players[uid];requireGame(p,'먼저 전장에 입장해 주세요.');
  requireGame(ownedTerritories(s,uid).length===0,'이미 영토를 가지고 있습니다.');
  requireGame(p.life===0||p.eliminatedAt>0,'재참가 기록을 확인할 수 없어요.');
  requireGame(now>=restartAvailableAt(p),`마지막 영토를 잃은 뒤 1시간이 지나야 다시 시작할 수 있어요. 남은 시간 ${clockText(restartAvailableAt(p)-now)}`,'RESTART_WAIT');
}
function beginLife(s,uid,id,now){
  eligibleToStart(s,uid,now);const p=s.players[uid],t=s.territories[id];
  p.life++;p.eliminatedAt=0;p.startedAt=now;
  t.owner=uid;t.generation++;t.lastRecruitAt=now;t.actionReadyAt=now;t.protectionUntil=now+RULES.protectionMs;
  t.units=[{id:`${uid}:life:${p.life}:ruler`,name:p.name,sides:20,readyAt:now},...Array.from({length:4},(_,i)=>({id:`${uid}:life:${p.life}:soldier:${i}`,name:'병사',sides:4,readyAt:now}))];
  return p;
}
function losses(units,enemyCount,rate){const dead=units.slice().sort((a,b)=>a.sides-b.sides).slice(0,casualtyCount(units.length,enemyCount,rate));const ids=new Set(dead.map(u=>u.id));return {dead,survivors:units.filter(u=>!ids.has(u.id))};}
function trimObject(object,limit,atKey='at'){const rows=Object.entries(object).sort(([,a],[,b])=>b[atKey]-a[atKey]);return Object.fromEntries(rows.slice(0,limit));}
function logEvent(s,command,entry){s.history[command.id]={id:command.id,at:command.at,actor:command.actor,...entry};s.history=trimObject(s.history,RULES.historyLimit);}
function restoreBattleFields(units){return units.map(({roll,...u})=>u);}

export function validateMove(s,uid,from,to,ids,now){
  const a=s.territories[from],b=s.territories[to];
  if(!a||!b||!adjacent(from).includes(to))return '변으로 맞닿은 영토로만 이동하거나 공격할 수 있어요.';
  if(a.owner!==uid)return '내 영토에서 출발해야 합니다.';
  if(now<a.actionReadyAt)return `이 영토의 다음 명령까지 ${clockText(a.actionReadyAt-now)} 남았어요.`;
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)return '출전 병력을 선택해 주세요.';
  if(ids.length>=a.units.length)return '출발지에 병력을 최소 1명 남겨 주세요.';
  if(ids.some(id=>!a.units.some(u=>u.id===id&&u.readyAt<=now)))return '도착한 병력은 10분을 기다린 뒤 다시 행동할 수 있어요.';
  if(b.owner!==uid&&b.protectionUntil>now)return `시작 보호 중인 영토입니다. ${clockText(b.protectionUntil-now)} 뒤 공격할 수 있어요.`;
  if(b.owner===uid&&b.units.length+ids.length>capacityOf(to))return `목적지에는 ${Math.max(0,capacityOf(to)-b.units.length)}명만 더 들어갈 수 있어요.`;
  return null;
}
function executeMove(s,uid,c,now){
  requireGame(s.territories[c.from]&&s.territories[c.to],'영토를 찾을 수 없어요.');
  const a=materializeTerritory(s,c.from,now),b=materializeTerritory(s,c.to,now);
  const error=validateMove(s,uid,c.from,c.to,c.unitIds,now);requireGame(!error,error);
  const selected=a.units.filter(u=>c.unitIds.includes(u.id));
  const selectedIds=new Set(c.unitIds);a.units=a.units.filter(u=>!selectedIds.has(u.id));a.actionReadyAt=now+RULES.actionMs;
  if(a.owner===b.owner){selected.forEach(u=>u.readyAt=now+RULES.actionMs);b.units.push(...selected);logEvent(s,c,{type:'move',from:c.from,to:c.to,text:`${s.players[uid].name} · ${placeInfo(c.from).ko} → ${placeInfo(c.to).ko}, ${selected.length}명 이동`,result:{friendly:true,from:c.from,to:c.to,count:selected.length}});return;}
  for(const t of ownedTerritories(s,uid))t.protectionUntil=0;
  const rng=seededRandom(c.seed),roll=units=>units.map(u=>({...u,roll:1+Math.floor(rng()*u.sides)}));
  const attack=roll(selected),defend=roll(b.units),raw=attack.reduce((n,u)=>n+u.roll,0),defense=defend.reduce((n,u)=>n+u.roll,0),score=attackScore(raw),won=score>defense,defender=b.owner;
  let attackDead,defendDead,stationed=[],returned=[],defendSurvivors=[];
  if(won){const loss=losses(selected,defend.length,RULES.attackLoss);attackDead=loss.dead;defendDead=restoreBattleFields(defend);
    loss.survivors.forEach(u=>u.readyAt=now+RULES.actionMs);
    const excess=Math.max(0,loss.survivors.length-capacityOf(c.to));returned=loss.survivors.slice().sort((a,b)=>a.sides-b.sides).slice(0,excess);const returnIds=new Set(returned.map(u=>u.id));stationed=loss.survivors.filter(u=>!returnIds.has(u.id));a.units.push(...returned);
    b.owner=uid;b.units=stationed;b.generation++;b.lastRecruitAt=now;b.actionReadyAt=now+RULES.actionMs;b.protectionUntil=0;
    s.players[uid].captures++;
    if(defender&&ownedTerritories(s,defender).length===0){s.players[defender].eliminatedAt=now;s.players[defender].defeats++;}
  }else{attackDead=selected;const loss=losses(b.units,selected.length,RULES.defenseLoss);defendDead=loss.dead;defendSurvivors=loss.survivors;b.units=defendSurvivors;}
  const result={friendly:false,from:c.from,to:c.to,attacker:uid,defender,attack,defend,raw,score,defense,won,attackDead,defendDead,stationed,returned,defendSurvivors};
  logEvent(s,c,{type:'battle',from:c.from,to:c.to,text:`${s.players[uid].name} · ${placeInfo(c.to).ko} ${won?'점령':'공격 실패'} · ${score}:${defense} · 공격군 −${attackDead.length} / 수비군 −${defendDead.length}`,result});
}

export function applyCommand(raw,actor,command,now=command.at){
  const s=normalizeWorld(raw);
  requireGame(typeof actor==='string'&&actor.length>0,'접속자를 확인할 수 없어요.');
  requireGame(command&&typeof command.id==='string'&&/^[\w-]{8,100}$/.test(command.id),'명령 번호를 확인할 수 없어요.');
  if(s.receipts[command.id])return s;
  requireGame(command.baseRevision===s.revision,'다른 군주의 명령이 먼저 도착했어요. 최신 전황에서 다시 확인해 주세요.','CONFLICT');
  requireGame(Number.isFinite(now)&&now>=s.updatedAt,'전장의 시간을 다시 확인하고 있어요.','CLOCK');
  const c={...command,actor,at:now};
  const before=structuredClone(s.territories);
  if(c.type==='register'){
    requireGame(!s.players[actor],'이미 전장에 입장한 군주입니다.');
    const name=cleanName(c.name);s.players[actor]={uid:actor,name,color:Object.keys(s.players).length%COLORS.length,joinedAt:now,life:0,eliminatedAt:0,startedAt:0,captures:0,defeats:0};
    logEvent(s,c,{type:'register',text:`${name}님이 전장에 들어왔습니다.`});
  }else{
    requireGame(s.players[actor],'먼저 전장에 입장해 주세요.');
    if(c.type==='start'){
      requireGame(s.territories[c.territoryId],'영토를 찾을 수 없어요.');requireGame(!s.territories[c.territoryId].owner,'다른 군주의 영토입니다. 양도 승인을 요청해 주세요.');
      const p=beginLife(s,actor,c.territoryId,now);logEvent(s,c,{type:'start',to:c.territoryId,text:`${p.name}님이 ${placeInfo(c.territoryId).ko}에서 ${p.life>1?'다시 깃발을 올렸습니다':'깃발을 올렸습니다'}.`});
    }else if(c.type==='move'){
      for(const [id,expected] of Object.entries(c.expectedTerritories||{}))requireGame(s.territories[id]?.revision===expected,'선택한 영토의 전황이 달라졌어요. 병력을 다시 확인해 주세요.','TERRITORY_CONFLICT');
      requireGame(Number.isInteger(c.seed)&&c.seed>=0,'전투 주사위 정보를 확인할 수 없어요.');executeMove(s,actor,c,now);
    }else if(c.type==='request'){
      eligibleToStart(s,actor,now);const t=s.territories[c.territoryId];requireGame(t?.owner&&t.owner!==actor,'현재 다른 군주가 소유한 영토를 선택해 주세요.');
      for(const r of Object.values(s.requests))if(r.applicant===actor&&r.status==='pending'){r.status='cancelled';r.resolvedAt=now;}
      s.requests[c.id]={id:c.id,applicant:actor,owner:t.owner,territoryId:t.id,generation:t.generation,status:'pending',createdAt:now,resolvedAt:0};
      const resolved=Object.values(s.requests).filter(r=>r.status!=='pending').sort((a,b)=>b.resolvedAt-a.resolvedAt);for(const r of resolved.slice(30))delete s.requests[r.id];
      logEvent(s,c,{type:'request',to:t.id,text:`${s.players[actor].name}님이 ${placeInfo(t.id).ko}에서 시작하도록 양도를 요청했습니다.`});
    }else if(c.type==='approve'||c.type==='reject'){
      const r=s.requests[c.requestId];requireGame(r&&r.status==='pending','이미 처리되었거나 취소된 요청입니다.');requireGame(r.owner===actor,'이 요청을 승인할 수 있는 영토 주인이 아닙니다.');
      if(c.type==='reject'){r.status='rejected';r.resolvedAt=now;logEvent(s,c,{type:'reject',text:`${s.players[actor].name}님이 ${placeInfo(r.territoryId).ko} 양도 요청을 거절했습니다.`});}
      else{
        const t=materializeTerritory(s,r.territoryId,now);requireGame(t.owner===actor&&t.generation===r.generation,'요청 이후 영토의 주인이 바뀌었어요. 새로 신청해 주세요.');eligibleToStart(s,r.applicant,now);
        const sourcePoint=placeInfo(t.id).coord;
        const destinations=ownedTerritories(s,actor).filter(x=>x.id!==t.id).sort((a,b)=>{const dist=id=>{const pt=placeInfo(id).coord;return Math.hypot(pt[0]-sourcePoint[0],pt[1]-sourcePoint[1]);};return dist(a.id)-dist(b.id);});
        destinations.forEach(d=>materializeTerritory(s,d.id,now));
        const spaces=destinations.reduce((n,d)=>n+capacityOf(d.id)-d.units.length,0);requireGame(spaces>=t.units.length,`기존 병력 ${t.units.length}명이 돌아갈 자리가 필요해요. 다른 내 영토에 ${t.units.length-spaces}자리 더 마련해 주세요.`,'NO_RETURN_SPACE');
        const returning=t.units.slice();for(const d of destinations){const moving=returning.splice(0,capacityOf(d.id)-d.units.length);moving.forEach(u=>u.readyAt=Math.max(u.readyAt,now+RULES.actionMs));d.units.push(...moving);}
        const p=beginLife(s,r.applicant,t.id,now);r.status='approved';r.resolvedAt=now;
        logEvent(s,c,{type:'approve',to:t.id,text:`${s.players[actor].name}님이 ${placeInfo(t.id).ko} 양도를 승인했습니다. ${p.name}님이 새로 시작합니다.`});
      }
    }else if(c.type==='recruit'){
      requireGame(ownedTerritories(s,actor).length,'충원할 내 영토가 없습니다.');for(const t of ownedTerritories(s,actor))materializeTerritory(s,t.id,now);
      logEvent(s,c,{type:'recruit',text:`${s.players[actor].name}님의 병력 충원을 기록했습니다.`});
    }else throw new GameError('알 수 없는 명령입니다.');
  }
  for(const [id,t] of Object.entries(s.territories))if(JSON.stringify({...t,revision:0})!==JSON.stringify({...before[id],revision:0}))t.revision=before[id].revision+1;
  s.revision++;s.updatedAt=now;s.command={id:c.id,type:c.type,actor,at:now,baseRevision:command.baseRevision,from:c.from||'',to:c.to||c.territoryId||'',requestId:c.requestId||'',seed:c.seed??0};
  s.receipts[c.id]={at:now,actor};s.receipts=trimObject(s.receipts,100);
  normalizeWorld(s);return s;
}

export function winProbability(attack,defend){
  if(!attack.length)return 0;
  const distribution=units=>{let out=[1];for(const u of units){const next=Array(out.length+u.sides).fill(0);for(let sum=0;sum<out.length;sum++)for(let face=1;face<=u.sides;face++)next[sum+face]+=out[sum]/u.sides;out=next;}return out;};
  const a=distribution(attack),d=distribution(defend),cdf=[];let sum=0;for(let i=0;i<d.length;i++){sum+=d[i];cdf[i]=sum;}
  return a.reduce((n,p,raw)=>n+p*(cdf[Math.min(cdf.length-1,attackScore(raw)-1)]||0),0);
}

export function addChatMessage(raw,uid,name,text,now){
  const state=structuredClone(raw||{sequence:0,messages:{},lastSent:{}});state.messages??={};state.lastSent??={};
  text=String(text||'').trim();requireGame(text.length>0&&text.length<=200&&!/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(text),'채팅은 1~200자로 입력해 주세요.');
  requireGame(!state.lastSent[uid]||now-state.lastSent[uid]>=1000,'채팅은 1초에 한 번 보낼 수 있어요.','CHAT_RATE');
  const seq=++state.sequence,slot=String(seq%RULES.chatLimit);
  state.messages[slot]={seq,uid,name:cleanName(name),text,at:now};state.lastSent[uid]=now;
  return state;
}
export const chatMessages=raw=>Object.values(raw?.messages||{}).filter(Boolean).sort((a,b)=>a.seq-b.seq).slice(-RULES.chatLimit);
