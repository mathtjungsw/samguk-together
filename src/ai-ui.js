// Inactive presentation seam; app.js does not import it until the server is ready.
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
