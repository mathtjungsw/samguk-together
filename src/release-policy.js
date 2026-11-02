export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-enhancement-season5';
export const RELEASE_TEXT='📣 다음 시즌 예고: 시즌 5부터 병력 강화와 AI 일반 공격 조건 완화를 적용합니다. 강화는 최소 주사위 눈을 높이며, 재료 소모·누적 실패 전사에 주의하세요. 도시 행동 소모와 강화 후 신규 대기는 없습니다. 현재 시즌 4의 규칙·병력은 유지합니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
