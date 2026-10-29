export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261029-compact-map';
export const RELEASE_TEXT='📣 화면 개선: 우승 조건을 맨 위 제목 줄에 합쳐 지도 공간을 넓혔습니다. 지도 탭 옆의 ‘요약 접기’로 천하 판세·전쟁 준비 요약을 숨길 수 있고, ‘요약 펼치기’로 다시 볼 수 있습니다. 접기 상태는 이 브라우저에 저장됩니다. 영토 선택·확대와 게임 규칙은 그대로입니다.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
