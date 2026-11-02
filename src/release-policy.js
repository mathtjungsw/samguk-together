export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-faction-labels';
export const RELEASE_TEXT='📣 지도에 세력명을 추가했습니다. 각 세력의 대표 영토 한 곳에 굵은 이름과 세력색 표식을 표시합니다. 천하 판세·전쟁 준비에 모두 적용되며, 모바일 확대 시 겹친 이름을 다시 표시합니다. 기존 영토·병력·장수·전적은 유지됩니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
