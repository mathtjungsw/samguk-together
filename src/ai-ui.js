// Season-end AI selection, with explicit loading and retry feedback.
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const aiName=p=>p?.name||'군주';
export function aiChoiceHTML(view,{busy=false}={}){
  if(!view)return '';
  const status=view.open?(view.eligible?'다음 시즌에 함께할 AI 군주 수를 정하세요.':'우승 군주가 다음 시즌 AI 수를 정하고 있습니다.'):'다음 시즌 시작 AI 수가 확정되었습니다.';
  return `<section class="ai-choice" aria-label="다음 시즌 AI 군주"><h3>다음 시즌 AI 군주</h3><p>${status}</p><p>현재 예정: <strong>${Number(view.nextCount)||3}명</strong></p>${view.eligible?`<div role="group" aria-label="시작 AI 군주 수">${[1,2,3,4,5].map(n=>`<button type="button" data-ai-count="${n}" aria-pressed="${view.selected===n}" ${busy?'disabled':''}>${n}명</button>`).join('')}</div><p>개막 전까지 변경할 수 있습니다. 선택하지 않으면3명으로 시작합니다.</p>`:''}</section>`;
}
export function aiStatusHTML(player,at){
  if(player?.kind!=='ai')return '';
  const remaining=Math.max(0,Math.ceil(((player.ai?.nextDecisionAt||at)-at)/1000)),text=remaining?`${Math.floor(remaining/60)}분 ${remaining%60}초 후 판단`:'다음 회차 판단 대기';
  return `<span class="ai-status" aria-label="AI 군주">${esc(aiName(player))} · ${text}</span>`;
}

export function aiChoiceStatusHTML(error=''){
 return `<section class="ai-choice" aria-label="다음 시즌 AI 군주"><h3>다음 시즌 AI 군주</h3>${error?`<p role="alert">시작 군주 수를 불러오지 못했습니다. ${esc(error)}</p><button type="button" data-ai-retry>다시 불러오기</button>`:'<p role="status">시작 군주 수를 불러오는 중입니다…</p>'}</section>`;
}
export async function loadAiChoice({store,count,isCurrent=()=>true,render}){
 render(aiChoiceStatusHTML());
 try{const view=await store.aiChoice(count);if(isCurrent())render(aiChoiceHTML(view));return view;}
 catch(error){if(isCurrent())render(aiChoiceStatusHTML(error?.message||'연결 상태를 확인해 주세요.'));return null;}
}
