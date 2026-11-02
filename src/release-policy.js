export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-enhancement-materials';
export const RELEASE_TEXT='📣 강화 재료의 대기 제한을 해제했습니다. 기본 재료인 0강 D4와 보조 재료 D6·D8·D12는 행동·이동 대기 중에도 사용할 수 있습니다. 강화 대상의 기존 대기, 재료 소모량·성공률·전투 잠금은 유지됩니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
