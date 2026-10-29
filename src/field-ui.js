import {seasonClosed} from './season-policy.js';
import {rosterFor} from './hero-catalog.js';
import {ownedTerritories,capacityOf,isLocked,adjacent,placeInfo,visibleHistory,nextRecruitAt} from './engine.js';
import {EFFECTS} from './hero-effects.js';
import {remaining} from './readiness.js';
import {escapeHTML as esc} from './portraits.js';

export function probabilityText(p,approximate=false){
  if(!Number.isFinite(p)||p<0||p>1)return '계산 확인 불가';
  const prefix=approximate?'약 ':'';
  if(!approximate&&(p===0||p===1))return `${p*100}%`;
  return prefix+(p<.01?'1% 미만':p>=.99?'99% 이상':p>=.9895?'99%에 가까움':(p*100).toFixed(1)+'%');
}
export function battleRecord(raw){
  const r=structuredClone(raw),list=v=>Array.isArray(v)?v:Object.values(v||{});
  for(const key of ['attack','defend','attackDead','defendDead','stationed','returned','defendSurvivors','escaped','retreatCosts','survivalAttempts'])r[key]=list(r[key]);
  if(r.effects)for(const side of ['attack','defense']){r.effects[side]??={};for(const key of ['logs','dice','chosen','used'])r.effects[side][key]=list(r.effects[side][key]);}
  return r;
}
export const eventRelated=(e,uid)=>!!uid&&(e.type==='update'||e.type==='battle'?(e.type==='update'||e.result?.attacker===uid||e.result?.defender===uid):e.actor===uid||e.previousOwner===uid);
export function eventText(e){if(e.type!=='battle'||!e.result)return e.text||'';const r=e.result;return `${placeInfo(e.to)?.ko||'도시'} · ${r.won?'공격군 점령':r.score===r.defense?'동점 · 수비군 승리':'공격 실패 · 수비군 승리'} · ${r.score}:${r.defense} · ${r.won?'공격군':'수비군'} ${r.policy?.grade||'승리'} · 공격군 −${r.attackDead?.length||0} / 수비군 −${r.defendDead?.length||0}`;}
export function historyRows(s,uid,{scope='mine',kind='all'}={}){return visibleHistory(s).filter(e=>(scope!=='mine'||eventRelated(e,uid))&&(kind==='all'||kind==='battle'&&e.type==='battle'||kind==='heroes'&&['hero','revive'].includes(e.type)||kind==='other'&&!['battle','hero','revive'].includes(e.type)));}
export function highlights(s){const rows=visibleHistory(s).filter(e=>e.type==='battle'&&e.result&&!e.result.friendly),close=rows.find(e=>e.result.policy?.delta<=2),escape=rows.find(e=>e.result.escaped?.length);return [...new Set([close,escape].filter(Boolean))].map(e=>({e,labels:[e===close?'아슬아슬한 승리':'',e===escape?(e.result.escaped.some(x=>x.unit.sides===20)?'군주 생환':'장수 생환'):''].filter(Boolean)}));}
export function cityRows(s,uid,now,{query='',filter='all',sort='name'}={}){return ownedTerritories(s,uid).map(t=>({t,cap:capacityOf(t.id,s,now),enemy:adjacent(t.id).some(id=>s.territories[id].owner&&s.territories[id].owner!==uid),locked:isLocked(s,t.id)})).filter(r=>placeInfo(r.t.id).ko.includes(query)&&(filter==='all'||filter==='ready'&&r.t.actionReadyAt<=now&&!r.locked||filter==='full'&&r.t.units.length>=r.cap||filter==='enemy'&&r.enemy)).sort((a,b)=>(sort==='army'?b.t.units.length-a.t.units.length:sort==='wait'?Math.max(now,a.t.actionReadyAt)-Math.max(now,b.t.actionReadyAt):0)||placeInfo(a.t.id).ko.localeCompare(placeInfo(b.t.id).ko,'ko'));}
export function cityListHTML(s,uid,now,f){const rows=cityRows(s,uid,now,f),all=cityRows(s,uid,now),paused=all.filter(r=>r.locked).length,full=all.filter(r=>!r.locked&&r.t.units.length>=r.cap).length;return `<div class="info-heading"><h3>내 도시 <small>${all.length}곳</small></h3><p>충원 진행 ${all.length-paused-full} · 정원 도달 ${full} · 일시 정지 ${paused}</p></div><div class="field-filters"><input id="city-query" aria-label="도시 이름 검색" placeholder="도시 이름 검색" value="${esc(f.query)}"><select id="city-filter" aria-label="도시 상태">${[['all','전체'],['ready','영토 대기 없음'],['full','정원 도달'],['enemy','다른 군주와 인접']].map(([v,l])=>`<option value="${v}" ${f.filter===v?'selected':''}>${l}</option>`).join('')}</select><select id="city-sort" aria-label="도시 정렬">${[['name','이름순'],['wait','대기 짧은 순'],['army','병력 많은 순']].map(([v,l])=>`<option value="${v}" ${f.sort===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="city-list">${rows.map(({t,cap,enemy,locked})=>`<button class="city-row" data-city="${t.id}"><strong>${placeInfo(t.id).ko} <small>${t.units.length}/${cap}명 · 장수 ${t.units.filter(u=>u.sides>4).length}</small></strong><span>${locked?'호위 선택 중':t.actionReadyAt>now?'영토 대기 '+remaining(t.actionReadyAt,now):'영토 대기 없음'}${enemy?' · 다른 군주 인접':''}</span><small>${t.units.length>=cap?'정원 도달':nextRecruitAt(t)?'다음 충원 '+remaining(nextRecruitAt(t),now):'충원 확인 중'}</small></button>`).join('')||'<p>조건에 맞는 도시가 없습니다.</p>'}</div><p class="note">영토 대기 해제와 실제 출전 가능 인원은 다릅니다. 도시에서 병력과 목적지를 확인하세요.</p>`;}
export function rosterSummary(s){return [6,8,12].map(sides=>{const pool=rosterFor(s).filter(e=>e.sides===sides),live=pool.filter(e=>s.heroIndex?.[e.id]).length;return {sides,live,total:pool.length,available:pool.length-live};});}
export function rosterSummaryHTML(s){return `<div class="recruit-summary">${rosterSummary(s).map(r=>`<span><b>D${r.sides}</b> 생존 ${r.live}/${r.total} · 모집 가능 ${r.available}${!r.available?' · 당첨 시 D4 충원':''}</span>`).join('')}<small>복귀 대기 포함 · 원래 명단 등급 기준</small></div>`;}
export function historyHTML(s,uid,f,stamp){const rows=historyRows(s,uid,f),cards=highlights(s);return `<div class="field-filters">${[['mine','내 소식'],['all','전체']].map(([v,l])=>`<button data-news-scope="${v}" aria-pressed="${f.scope===v}">${l}</button>`).join('')}<select data-news-kind aria-label="전황 종류">${[['all','모든 소식'],['battle','전투'],['heroes','장수·부활'],['other','이동·기타']].map(([v,l])=>`<option value="${v}" ${f.kind===v?'selected':''}>${l}</option>`).join('')}</select><button data-news-read>확인 완료</button></div><p class="note">보관된 최근 100개 기록 기준 · 이름은 현재 표시와 기록 원문이 다를 수 있습니다.</p><details class="moments" data-preserve="moments"><summary>최근 명장면</summary>${cards.map(({e,labels})=>`<button data-battle-record="${esc(e.id)}">${labels.join(' · ')}<small>${stamp(e.at)} · ${esc(eventText(e))}</small></button>`).join('')||'<p>보관된 기록에 해당 명장면이 없습니다.</p>'}</details><div class="history-list">${rows.map(e=>`<article class="history-entry" data-news-id="${esc(e.id)}"><time>${stamp(e.at)}</time><span><b>${esc(s.players[e.actor]?.name||'전령')}</b> · ${esc(eventText(e))}${e.type==='battle'?`<button data-battle-record="${esc(e.id)}">결과 보기</button>`:''}${e.to?`<button data-news-city="${esc(e.to)}">${esc(placeInfo(e.to)?.ko||'도시')} 위치 ↗</button>`:''}</span></article>`).join('')||'<p class="note">조건에 맞는 소식이 없습니다.</p>'}</div>`;}

// Device-local preferences are separated by identity, mode and season.
export class FieldMemory{
  constructor(storage,key){this.storage=storage;this.key=key;this.value={};try{this.value=JSON.parse(storage.getItem(key)||'{}')||{};}catch{}}
  get(k,fallback){return this.value[k]??fallback;}
  set(k,v){this.value[k]=v;try{this.storage.setItem(this.key,JSON.stringify(this.value));return true;}catch{return false;}}
  initializeNews(s){if(!this.value.news)this.set('news',{ids:Object.keys(s.history||{}),at:s.updatedAt});}
  unseen(s,uid){const known=new Set(this.get('news',{ids:[]}).ids);return visibleHistory(s).filter(e=>eventRelated(e,uid)&&!known.has(e.id));}
  readNews(s,events=visibleHistory(s)){let other={};try{other=JSON.parse(this.storage.getItem(this.key)||'{}')||{};}catch{}const ids=new Set([...(other.news?.ids||[]),...(this.value.news?.ids||[]),...events.map(e=>e.id)]);this.set('news',{at:s.updatedAt,ids:Object.keys(s.history||{}).filter(id=>ids.has(id))});}
}
export const filterChat=(messages,kind)=>messages.filter(m=>kind==='all'||(kind==='system'?m.kind==='system':m.kind!=='system'));
export function canWrite(store){return !store?.world?.season?.endedAt&&!!store?.connected&&(store.mode==='practice'||store.worldReady===true&&store.chatReady===true);}
