export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-enhancement-target';
export const RELEASE_TEXT='📣 강화 대상도 행동·이동 대기 중에 강화할 수 있습니다. 대상과 재료 모두 대기 여부와 관계없이 강화에 사용할 수 있으며, 강화해도 기존 공격·이동 대기시간은 줄어들거나 늘어나지 않습니다. 전투 잠금과 기존 강화 확률·재료 비용은 유지됩니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
