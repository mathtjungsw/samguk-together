export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261103-instant-bulk-enhancement';
export const RELEASE_TEXT='📣 즉시·일괄 강화: PC·휴대전화에서 바로 추첨하고 연속 강화합니다. 여러 병력을 선택하면 각각1회 강화하며 총 재료비를 표시합니다. 결과는 서버에 묶어 저장합니다. 저장 중 공격·이동은 대기하며 충돌 시 미저장 결과를 취소·복원합니다. 확률·비용·대기 규칙 유지. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
