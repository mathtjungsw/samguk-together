export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-captive-no-home';
export const RELEASE_TEXT='📣 포로가 확률 탈출하거나 2시간 후 자동 탈출할 때, 원래 군주의 영토가 하나도 없으면 전사합니다. 이 경우 무장 생존 제한이 해제되어 다른 군주에게 다시 등장할 수 있습니다. 영토가 있지만 정원이 찬 경우는 기존처럼 복귀 대기로 보존됩니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
