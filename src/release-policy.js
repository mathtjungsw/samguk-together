export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261103-enhancement-compact';
export const RELEASE_TEXT='📣 강화 통신 개선: 서버가 확정한 강화 결과를 먼저 표시하고 중복 전황·채팅 조회를 줄였습니다. 강화 상세 기록은 별도로 안전하게 보관해 전송량을 줄입니다. 성공 확률·재료 비용·대기 규칙은 동일하며 최신 병력 확인 후 다음 행동을 할 수 있습니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
