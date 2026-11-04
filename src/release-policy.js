export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261105-spark-no-ai';
export const RELEASE_TEXT='📣 무료 운영 전장으로 전환했습니다. 이번 시즌 AI는 자동 행동만 멈추고 영토·병력을 보존하며 다음 시즌부터 AI 없이 시작합니다. 공격·이동·강화는 기기에서 계산해 전황에 안전하게 저장합니다. 접속이 없어도 다음 접속 때 충원·탈출·시즌 경과를 정산합니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
// A newer release may replace the banner while this older tab is still open.
// Its receipt means this client must not repeatedly announce its old release.
export const releaseIsKnown=(world,id)=>world?.release?.id===id||!!world?.receipts?.[id];
