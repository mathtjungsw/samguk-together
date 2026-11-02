export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261102-first-login-fix';
export const RELEASE_TEXT='📣 접속 오류 수정: 새 시즌 첫 참가자 등록에서 군주 목록이 비어 있을 때 발생하던 오류를 고쳤습니다. 화면을 새로고침한 뒤 구글 계정으로 다시 입장해 주세요. 진행 중인 영토·병력·시즌 규칙은 유지됩니다.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
