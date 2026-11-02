export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-campaign-season5';
export const RELEASE_TEXT='📣 다음 시즌 업데이트: 시즌 5부터 비밀 목표(D6 랜덤 2명), 강대국 토벌령(D6 랜덤 1명), 포로·몸값·처형·강제 등용·자동 탈출, 무장 인연 6종과 무장 200명·티어/능력 재조정을 적용합니다. 병력 강화와 AI 일반 공격 완화도 시즌 5부터 시작합니다. 현재 시즌 4의 규칙·병력은 유지됩니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
