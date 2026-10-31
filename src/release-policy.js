export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261031-records-ai';
export const RELEASE_TEXT='📣 업데이트: 전투·지난 역사 기록을 기기에 저장하고 AI 반복 조회를 줄였습니다. 오래 대치한 AI는 D20 없이 확률적으로 출진합니다. 세력 색은 빈 기본15색 우선·소진 시 새 색으로 배정하며, AI 이름은150인 밖 건국 군주의 AI왕건 형식으로 바꿉니다. 기존 영토·병력은 보존합니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
