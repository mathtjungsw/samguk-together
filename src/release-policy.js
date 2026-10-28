export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261028-field-ui';
export const RELEASE_TEXT='📣 업데이트: 내 도시·내 소식·전투 다시보기, 지도 우클릭 취소와 확대 유지, 모바일 바로가기·채팅 필터를 추가했습니다. 대기·승률 표시를 다듬고 모집 현황·최근 명장면을 넣었습니다. 기존 병력·규칙은 유지됩니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
