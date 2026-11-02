export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-mission-panel-fix';
export const RELEASE_TEXT='📣 오류 수정: 새 시즌 첫 입장 오류와 비밀 목표 화면의 반복 갱신을 고쳤습니다. 목표 내용이 같으면 카드와 보상 도시 선택·스크롤을 유지하며, 오래된 업데이트 공지를 반복 요청하지 않습니다. 새로고침해 주세요. 영토·병력·시즌 규칙은 그대로입니다.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
