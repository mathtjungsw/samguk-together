export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261101-queue-reward-4h';
export const RELEASE_TEXT='📣 업데이트: 복귀 대기 장수가 빈자리에 돌아올 때 공격 명령이 취소되던 오류를 수정했습니다. 같은 상황의 재발 방지 검사를 추가했습니다. 진행 중 AI 내부 등장은 4시간 간격으로 변경하며, 시작 AI 수와 10분 행동 판단은 유지합니다. 보상 대상 군주에게 D12 랜덤권 1장을 지급합니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
