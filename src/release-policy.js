export const D6_NEWS_SINCE=Date.parse('2026-10-28T14:00:00+09:00');
export const RELEASE_ID='update-20261030-compact-sync';
export const RELEASE_TEXT='📣 통신 절약 업데이트: 지도·전황은 작은 요약으로 읽고 전투 주사위 상세는 결과를 볼 때만 불러옵니다. 원본 병력·전투 기록·지난 역사는 보존했습니다. AI 군주는 아직 운영에 등장하지 않습니다. 무료 사용량을 확인한 뒤 다음 단계로 진행합니다. 새로고침해 주세요.';
export const heroNewsAllowed=(u,at)=>[8,12].includes(u.sides)||u.sides===6&&at>=D6_NEWS_SINCE;
