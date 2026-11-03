import {ENHANCEMENT,levelOf,failuresOf,minFace,enhancementEnabled} from './enhancement-policy.js';import {escapeHTML as esc} from './portraits.js';import {placeInfo,isLocked} from './engine-next.js';
import {selectEnhancementRequests} from './enhancement-batch.js';
import {enhanceChance,enhanceCost} from './enhancement-policy.js';
export const enhancementLabel=u=>`+${levelOf(u)} · 기본 ${minFace(u)}~${u.sides} · 실패 ${failuresOf(u)}/${ENHANCEMENT.failures[u.sides]}`;
export const enhancementBadge=u=>u.enhanceLevel!==undefined||u.enhanceFailures!==undefined?`<small class="enhancement-badge">${esc(enhancementLabel(u))}</small>`:'';
export function infantryEnhancementHTML(s,t){if(!enhancementEnabled(s))return '';const groups=new Map();for(const u of t.units.filter(x=>x.sides===4)){const key=`+${levelOf(u)} · 실패 ${failuresOf(u)}/3`;groups.set(key,(groups.get(key)||0)+1);}return `<div class="infantry-enhancement" aria-label="병사 강화 현황">${[...groups].map(([k,n])=>`<span>D4 ${esc(k)} · ${n}명</span>`).join('')}</div>`;}
export function enhancementHTML(s,uid,state,at,busy,pending,queueState={groups:[]}){
 const cities=Object.values(s.territories).filter(t=>t.owner===uid),t=s.territories[state.city],units=t?.units||[],ids=(state.unitIds||[state.unitId]).filter(id=>units.some(u=>u.id===id)),boosters={...(state.boosters||{})};
 if(ids.length===1&&state.boosterId)boosters[ids[0]]=state.boosterId;
 let error='';try{selectEnhancementRequests(s,uid,state.city,ids,boosters,i=>'preview-'+i,at);}catch(e){error=e.message;}
 const results=queueState.notice?[]:state.results||(state.result?[state.result]:queueState.last||[]),count=queueState.groups?.reduce((n,g)=>n+g.items.length,0)||0,blocked=busy||!!pending||!!queueState.error;
 const banner=queueState.error||queueState.notice||(count?`${count}회 저장 중 · 연속 강화 가능 · 공격·이동 대기`:'즉시 추첨 · 저장은 자동으로 진행됩니다.');
 const success=results.filter(r=>r.success).length,dead=results.filter(r=>r.dead).length;
 return `<div class="modal-inner enhancement-modal enhancement-compact">
 <header class="enhance-header"><div class="modal-heading"><h2>병력 강화</h2><button class="close-button" data-close aria-label="닫기">×</button></div>
 <div class="enhance-city-line"><label for="enhance-city">도시</label><select id="enhance-city" data-enhance-city ${blocked?'disabled':''}>${cities.map(x=>`<option value="${esc(x.id)}" ${x.id===state.city?'selected':''}>${esc(placeInfo(x.id).ko)}${isLocked(s,x.id)?' · 전투 잠금':''}</option>`).join('')}</select><span>각각 1회 강화</span></div>
 <p class="enhance-status" role="status">${esc(banner)}</p></header>
 <div class="enhance-body" data-enhance-scroll>
 <details class="enhance-help" data-enhance-preserve="help"><summary>병력 선택 · 강화 규칙 보기</summary><p>대상과 재료 모두 행동·이동 대기 중에 강화 가능합니다. 도시 행동 소모·신규 대기는 없습니다. 기존 대기시간은 줄어들지 않으며 전투 잠금은 유지됩니다. 선택한 병력은 재료로 쓰지 않고 성공·실패 모두 재료를 소모합니다. 저장 중에도 연속 강화할 수 있습니다. 다른 공격·이동으로 병력이 바뀌면 미저장 결과를 취소하고 최신 전황으로 복원합니다. 창을 닫아도 저장은 계속합니다.</p></details>
 ${results.length?`<details class="enhance-recent" data-enhance-preserve="results"><summary>최근 결과 ${results.length}명 · 성공 ${success} · 실패 ${results.length-success}${dead?' · 전사 '+dead:''}</summary><ul>${results.map(r=>`<li>${esc(r.name)} · ${r.dead?'강화 전사':r.success?'성공':'실패'} ${r.dead?'':`+${r.beforeLevel} → +${r.level}`} · 실패 ${r.failures}/${r.failureLimit}</li>`).join('')}</ul></details>`:''}
 <div class="enhance-unit-list" aria-label="강화 병력 선택">${units.map((u,i)=>{
  const selected=ids.includes(u.id),chance=enhanceChance(u,units.find(x=>x.id===boosters[u.id])),risk=selected&&chance<1&&failuresOf(u)+1>=ENHANCEMENT.failures[u.sides],check='enhance-check-'+u.id,booster='enhance-booster-'+u.id;
  return `<div class="enhance-unit-row ${selected?'is-selected':''}"><label class="enhance-unit-choice" for="${esc(check)}"><input id="${esc(check)}" type="checkbox" data-enhance-check="${esc(u.id)}" ${selected?'checked':''} ${blocked||levelOf(u)>=3?'disabled':''}><span class="enhance-unit-text"><strong>${esc(u.name)}${u.sides===4?' '+(i+1):''} <small>D${u.sides}</small></strong><span class="enhance-unit-facts">+${levelOf(u)}${selected?' → +'+Math.min(3,levelOf(u)+1):''} · 눈 ${minFace(u)}~${u.sides} · 실패 ${failuresOf(u)}/${ENHANCEMENT.failures[u.sides]}</span></span>${selected?`<span class="enhance-probability">${Math.round(chance*100)}%</span>`:levelOf(u)>=3?'<span class="enhance-max">최대</span>':''}</label>
  ${selected?`<div class="enhance-booster-line"><label for="${esc(booster)}">보조 재료</label><select id="${esc(booster)}" data-enhance-row-booster="${esc(u.id)}" ${blocked?'disabled':''}><option value="">없음</option>${units.filter(x=>!ids.includes(x.id)&&[6,8,12].includes(x.sides)).map(x=>`<option value="${esc(x.id)}" ${boosters[u.id]===x.id?'selected':''}>${esc(x.name)} D${x.sides} · +${ENHANCEMENT.boost[x.sides]*100}%p · 소모</option>`).join('')}</select></div>`:''}${risk?'<p class="enhance-danger">이번 실패 시 전사</p>':''}</div>`;
 }).join('')}</div></div>
 <footer class="enhance-actions"><div class="enhance-total"><strong>선택 ${ids.length}명</strong><span>총 기본 재료: D4 <b>${ids.reduce((n,id)=>n+(enhanceCost(units.find(u=>u.id===id))||0),0)}명</b> · 보조 <b>${ids.filter(id=>boosters[id]).length}명</b></span></div>
 ${pending?'<p>이전 버전의 미확인 강화 요청이 있습니다.</p><button data-enhance-retry>이전 강화 결과 확인</button>':''}${queueState.error||count?'<button class="enhance-save-retry" data-enhance-save-retry>같은 결과로 다시 저장·확인</button>':''}
 ${error?`<p class="enhance-validation" role="status">${esc(error)}</p>`:''}<button class="primary-button" data-enhance-submit ${blocked||error?'disabled':''}>선택한 ${ids.length}명 즉시 강화</button></footer></div>`;
}
