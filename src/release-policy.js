export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-missions-removed';
export const RELEASE_TEXT='📣 비밀 임무 기능을 삭제했습니다. 목표 카드·전용 탭·새 임무 선택과 완료 보상 발급을 제거했습니다. 이미 받은 장수와 확정된 보상, 영토·병력·전적은 유지됩니다. 토벌 보상은 영토·명령의 받을 보상에서 확인하세요. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
