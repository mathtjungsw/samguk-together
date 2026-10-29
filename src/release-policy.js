export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261029-seasons-war';
export const RELEASE_TEXT='📣 업데이트: 천하 판세·전쟁 준비 지도, 장수 보유 랭킹과 도감 스크롤 유지를 적용했습니다. 현재 시즌도 72곳(80%) 점령 시 우승하며 1시간 후 새 시즌이 열립니다. 다음 시즌부터 무장150인·중립전 군주 탈출·72시간 제한·늦은 첫 참가 D6 두 명을 적용합니다. 채팅은 대화·공지 최근10개, 장수 소식은 전황에서 확인하세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
