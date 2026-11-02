export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-portraits-200';
export const RELEASE_TEXT='📣 추가 무장 50명의 초상화를 넣었습니다. 이제 무장 200명 모두 도감·도시·내 장수·전투 화면에서 초상을 확인할 수 있습니다. 기존 무장과 능력·병력·전적은 유지됩니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
