import {campaignEnabled,CAPTIVE,nextEscapeAt} from './campaign-policy.js';
import {ownedTerritories,seededRandom,requireGame,MINUTE,byId} from './game-core.js';
import {capacityOf,isLocked} from './engine-next.js';
import {stampUnit} from './role-policy.js';
import {defaultMaterials,acceptRansom} from './campaign-actions.js';
let randomFor=key=>seededRandom(key)();
export function configureCampaignRandom(fn){randomFor=fn;}
export function campaignState(s){return s.campaign??={version:1,captives:{},stats:{},rewards:{},bounty:null,bountySerial:0,bountyCooldown:0,targetCounts:{},paidCities:{}};}
export function normalizeCampaign(s){if(!campaignEnabled(s))return;const c=campaignState(s);for(const k of ['captives','stats','rewards','targetCounts','paidCities'])c[k]??={};c.bounty??=null;c.bountySerial??=0;c.bountyCooldown??=0;for(const p of Object.values(c.captives)){p.escapeRound??=0;requireGame(p.id===p.unit?.id&&s.players[p.owner]&&s.players[p.captor]&&p.owner!==p.captor&&p.unit.heroId&&[6,8,12].includes(p.unit.sides)&&p.deadline===p.at+CAPTIVE.deadline&&Number.isInteger(p.escapeRound)&&p.escapeRound>=0&&p.escapeRound<=9,'포로 기록을 확인해 주세요.','CORRUPT');}}
export function campaignStat(s,uid){const st=campaignState(s).stats[uid]??={wins:{},neutral:{},lost:{},bountyPaid:0};for(const k of ['wins','neutral','lost'])st[k]??={};st.bountyPaid??=0;return st;}
export function campaignEvent(s,id,at,type,text,extra={}){s.history[id]={id,at,actor:'campaign-system',type,text,...extra};}
export function safeReturn(s,uid,u,city,at,delay=10){
 const list=ownedTerritories(s,uid).filter(t=>!isLocked(s,t.id)).sort((a,b)=>(capacityOf(b.id,s,at)-b.units.length)-(capacityOf(a.id,s,at)-a.units.length)||byId(a,b)),dest=list.find(t=>t.id===city&&t.units.length<capacityOf(t.id,s,at))||list.find(t=>t.units.length<capacityOf(t.id,s,at));
 u.protectedReturn=true;u.readyAt=Math.max(u.readyAt||0,at+delay*MINUTE);u.moveReadyAt=Math.max(u.moveReadyAt||0,at+delay*MINUTE);
 if(dest){stampUnit(u,at,dest.id);dest.units.push(u);dest.revision++;if(!dest.nextRecruitAt&&dest.units.length<capacityOf(dest.id,s,at))dest.nextRecruitAt=at+(dest.cycleMs||10*MINUTE);}
 else{u.stationTerritoryId='';const q=s.returnQueues[uid]??={from:city||Object.keys(s.territories)[0],at,life:s.players[uid].life,units:[]};q.units.push(u);}
 return dest?.id||'';
}
export function releaseCaptive(s,p,at,cause='release',city=''){
 const c=campaignState(s);delete c.captives[p.id];safeReturn(s,p.owner,p.unit,city,at);campaignEvent(s,p.id+'-'+cause,at,'captive',`${p.unit.name}(D${p.unit.sides}) · ${cause==='escape'?'탈출 성공':cause==='deadline'?'2시간 확정 탈출':'석방'} · ${s.players[p.owner].name} 군주에게 복귀합니다.`,{actor:p.owner,previousOwner:p.captor});
}
export function settleCampaign(s,at){
 if(!campaignEnabled(s)||s.season.endedAt)return;const c=campaignState(s);normalizeCampaign(s);const limit=Math.min(at,(s.season.deadline||Infinity)-1);
 for(const p of Object.values(c.captives).sort((a,b)=>nextEscapeAt(a)-nextEscapeAt(b)||a.id.localeCompare(b.id))){
  if(!ownedTerritories(s,p.captor).length){releaseCaptive(s,p,at,'liberated');continue;}
  let escaped=false;while(p.escapeRound<9&&p.at+CAPTIVE.first+p.escapeRound*CAPTIVE.step<=limit){const round=p.escapeRound++,due=p.at+CAPTIVE.first+round*CAPTIVE.step,draw=randomFor('escape:'+s.season.id+':'+p.id+':'+p.at+':'+round);p.lastEscapeAt=due;p.lastEscapePassed=draw<CAPTIVE.chance;if(p.lastEscapePassed){releaseCaptive(s,p,at,'escape');escaped=true;break;}}
  if(!escaped&&p.deadline<=limit)releaseCaptive(s,p,at,'deadline');
  else if(!escaped&&p.request?.expiresAt<=limit)delete p.request;
  if(c.captives[p.id]&&s.players[p.owner].kind==='ai'&&!p.request&&at>=p.at+10*MINUTE){const count=CAPTIVE.ransom[p.unit.sides],materials=defaultMaterials(s,p.owner,count,at),city=ownedTerritories(s,p.owner).find(t=>!isLocked(s,t.id));if(materials.length===count&&city){p.request={id:'ai-ransom-'+p.id,city:city.id,materials,at,expiresAt:Math.min(at+10*MINUTE,p.deadline)};if(s.players[p.captor].kind==='ai'){const dest=ownedTerritories(s,p.captor).find(t=>!isLocked(s,t.id));if(dest)acceptRansom(s,p,p.captor,dest.id,at);}}}
 }
 updateBounty(s,limit);
}
export function captureDefeated(s,owner,captor,dead,sacrificed,at,command){
 if(!campaignEnabled(s)||!owner||!captor)return null;const c=campaignState(s);if(Object.values(c.captives).filter(p=>p.captor===captor).length>=3)return null;
 const pool=dead.filter(u=>u.heroId&&[6,8,12].includes(u.sides)&&!sacrificed.has(u.id)).sort(byId);if(!pool.length)return null;const rng=seededRandom(command.seed+':capture:'+command.id),u=pool[Math.floor(rng()*pool.length)];if(rng()>=CAPTIVE.capture)return null;
 dead.splice(dead.findIndex(x=>x.id===u.id),1);u.stationTerritoryId='';const p={id:u.id,unit:u,owner,captor,at,deadline:at+CAPTIVE.deadline,escapeRound:0,lastPersuadeAt:0,persuadeSeq:0,battleId:command.id};c.captives[p.id]=p;s.players[captor].capturesOfficers=(s.players[captor].capturesOfficers||0)+1;s.players[owner].capturedOfficers=(s.players[owner].capturedOfficers||0)+1;campaignEvent(s,command.id+'-capture',at,'captive',`${s.players[captor].name} 군주가 ${s.players[owner].name}의 ${u.name}(D${u.sides})을 포로로 잡았습니다.`,{actor:captor,previousOwner:owner});return {id:u.id,name:u.name,sides:u.sides,owner,captor};
}
export function awardSlots(s,uid,id,slots,kind,at){const c=campaignState(s);if(!c.rewards[id])c.rewards[id]={id,uid,slots,kind,at,claimed:[]};return c.rewards[id];}
export function activeBountyId(s,at){const b=s.campaign?.bounty;return b&&at<b.until?b.id:'';}
export function battleCampaign(s,{attacker,defender,to,won,bountyId,at}){
 if(!campaignEnabled(s))return;const c=campaignState(s);if(won){const st=campaignStat(s,attacker);st.wins[to]=at;if(!defender)st.neutral[to]=at;else campaignStat(s,defender).lost[to]=at;
 const b=c.bounty;if(defender&&b&&b.id===bountyId&&b.target===defender&&at<b.until&&s.players[attacker].kind!=='ai'){
  const key=attacker+'|'+defender+'|'+to;b.players??={};b.cities??={};b.paid??=0;
  if(!c.paidCities[key]&&!b.cities[to]&&(b.players[attacker]||0)<2&&b.paid<6&&st.bountyPaid<4){c.paidCities[key]=true;b.cities[to]=true;b.players[attacker]=(b.players[attacker]||0)+1;b.paid++;st.bountyPaid++;awardSlots(s,attacker,b.id+'-'+to,1,'bounty',at);campaignEvent(s,b.id+'-'+to,at,'bounty',`${s.players[attacker].name} · 토벌 점령 보상 D6 랜덤 무장 1명 수령 가능`,{actor:attacker,to});}
 }}
}
export function updateBounty(s,at){
 if(!campaignEnabled(s)||s.season.endedAt)return;const c=campaignState(s),rows=Object.keys(s.players).map(uid=>({uid,count:ownedTerritories(s,uid).length})).filter(p=>p.count>0).sort((a,b)=>b.count-a.count||a.uid.localeCompare(b.uid)),first=rows[0],second=rows[1];
 if(c.bounty){const b=c.bounty;if(at>=b.until||first?.uid!==b.target||!second||first.count-second.count<=5){campaignEvent(s,b.id+'-end',at,'bounty',`${s.players[b.target].name} 대상 토벌령이 종료되었습니다.`);c.bounty=null;c.bountyCooldown=at+4*60*MINUTE;}return;}
 if(at<s.season.startAt+6*60*MINUTE||at<c.bountyCooldown||rows.length<3||first.count<30||first.count-second.count<10||(c.targetCounts[first.uid]||0)>=2)return;
 const id='bounty-'+s.season.id+'-'+(++c.bountySerial);c.bounty={id,target:first.uid,at,until:at+2*60*MINUTE,players:{},cities:{},paid:0};c.targetCounts[first.uid]=(c.targetCounts[first.uid]||0)+1;campaignEvent(s,id,at,'bounty',`📣 천하 토벌령: ${s.players[first.uid].name} · 2시간 동안 도시 점령 시 D6 랜덤 무장 보상. 군주당2회·전체6회 한도.`);
}
