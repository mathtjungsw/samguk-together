export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261103-compact-enhancement-ui';
export const RELEASE_TEXT='📣 강화 창 개선: 병력 선택과 강화 정보를 한 칸으로 합치고 PC2열·모바일1열로 표시합니다. 재료비·강화 버튼은 하단에 고정하고 상세 규칙·최근 결과는 접어서 볼 수 있습니다. 즉시·일괄 강화와 확률·재료비·저장 방식은 그대로입니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
