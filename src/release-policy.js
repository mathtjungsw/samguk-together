export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-command-recovery';
export const RELEASE_TEXT='📣 이전 명령 확인 오류를 수정했습니다. 이미 처리된 명령은 자동으로 정리하고, 통신 오류 때에는 같은 명령을 중복 적용하지 않고 결과를 확인합니다. 영토·병력·장수·보상과 전적은 유지됩니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
