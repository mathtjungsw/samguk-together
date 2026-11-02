export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-command-card-removed';
export const RELEASE_TEXT='📣 영토·명령 화면의 이전 명령 확인 카드를 제거했습니다. 처리 상태는 자동 확인하며, 연결이 필요하면 상단 다시 연결 버튼을 이용할 수 있습니다. 비밀 임무는 제공하지 않습니다. 기존 병력·장수·보상은 유지됩니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
