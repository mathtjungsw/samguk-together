export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261028-layout-readiness';
export const RELEASE_TEXT='📣 업데이트: PC 채팅을 도시 명령과 분리하고 지난 역사를 상단으로 옮겼습니다. 장수별 공격·이동 대기와 D4 준비 일정을 표시합니다. 10월 28일 14시 이후 충원되는 D6도 전황·채팅·등장 알림으로 안내합니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>u.sides>=8||u.sides===6&&at>=D6_NEWS_SINCE;
