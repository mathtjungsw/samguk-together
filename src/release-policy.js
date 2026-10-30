export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261030-ai-live';
export const RELEASE_TEXT='📣 군웅의 귀환: 이번 시즌부터 2시간마다 15영토 이상 국가의 내부 조건에 맞는 곳에 새 군주가 등장합니다. 지난 시즌의 군주 이름을 이어받으며 기존 병력은 복귀합니다. 시즌 시작 군주 배치는 다음 시즌부터 적용하고, 직전 우승자가 1~5명을 선택합니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
