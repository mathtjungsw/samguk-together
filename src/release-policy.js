export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-action-latency';
export const RELEASE_TEXT='📣 공격·이동 결과 표시를 개선했습니다. 서버가 확정한 결과를 먼저 보여주고 전황은 이어서 반영합니다. 이미 받은 전황을 재사용하고 불필요한 채팅 재조회를 줄였습니다. 전황 반영 중에는 중복 명령을 방지합니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
