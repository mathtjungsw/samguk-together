export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261104-season6-recruitment';
export const RELEASE_TEXT='📣 다음 시즌(시즌6)부터 충원 확률 D4 90%·D6 7%·D8 2.2%·D12 0.8%로 변경됩니다. 고유 D6가 모두 등장하면 특기 없는 이름 없는 D6 부장이 충원됩니다. D8·D12 소진 시 D4 대체는 유지합니다. 현재 시즌5의 규칙과 병력은 그대로입니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
