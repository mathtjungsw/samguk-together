export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-server-speed';
export const RELEASE_TEXT='📣 공격·이동 처리 성능을 개선했습니다. 현재 전장과 전투 상세를 분리하고 반복 집계를 줄였으며 명령 서버의 처리 성능을 높였습니다. 전투 기록·병력·장수는 보존됩니다. 이전 명령 확인 카드는 삭제하고 자동 확인합니다. 최신 화면으로 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
