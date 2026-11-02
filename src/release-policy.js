export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-mission-tab';
export const RELEASE_TEXT='📣 화면 개선: 나의 비밀 목표를 전용 비밀 목표 탭으로 옮겼습니다. 영토·명령 화면은 도시와 병력에 집중하고, 목표 선택·진행률·D6 보상 수령은 새 탭에서 확인하세요. 기존 목표·보상·영토·병력은 그대로입니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
