export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261029-territory-ranking';
export const RELEASE_TEXT='📣 랭킹 개선: 승리 조건에 맞춰 기본 랭킹을 영토순으로 바꿨습니다. 정렬 버튼과 군주별 결과도 영토를 맨 앞에 표시합니다. 장수 총원·D12/D8/D6 보유 수와 다른 정렬 기능은 계속 확인할 수 있습니다. 새로고침하면 적용됩니다.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
