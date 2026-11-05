# 시즌 5 운영 종료

2026년 11월 5일 사용자 요청에 따라 시즌 5를 마지막 공식 시즌으로 확정했다. 시즌 6은 진행을 중지하고 운영 DB와 별도 백업에 보관했다. 대문 공식 기록에는 정규 시즌 1~5만 표시한다.

- 신규 운영 프로젝트 `samguk-friends-20261105`의 DB 규칙은 `closure-rules.json`으로 모든 플레이어 읽기와 쓰기를 차단한다. 이전 탭에서도 명령·채팅·시즌 개막을 실행할 수 없다.
- 이전 AI 프로젝트 `samguk-together`에도 같은 차단 규칙을 적용했다. 해당 프로젝트의 변경 전 규칙은 백업 폴더의 `previous-ai-project.rules.json`에 있다.
- 운영 DB의 기존 규칙과 종료 시점 데이터 사본은 `playtest/closed-after-season-5-1793857773477/`에 보관했다. 데이터 SHA-256과 시즌 6 보존 여부는 이 폴더의 `manifest.json`에서 확인한다. 운영 데이터 사본은 Git에 추가하지 않는다.
- 우승자 이름과 영토 수는 Firebase 각 시즌 종료 결과의 `winners`와 순위를 대조해 `farewell/champions.json`에 저장했다. 시즌 1·2 김부장, 시즌 3 정부장, 시즌 4·5 김부장(본)이다.
- 기존 GitHub Pages 주소는 정적 감사 대문으로 전환한다. `npm run build`는 `siteClosed`가 켜져 있으면 감사 문구·우승자·그림·전쟁 GIF만 담은 페이지를 만든다. 대문을 보는 데 Firebase 연결이나 로그인이 필요하지 않다.
- 재개 요청이 오면 종료 당시 백업과 남은 시즌 데이터를 검토하고 재개 시즌을 사용자와 결정한다. `siteClosed`와 `firebase.json`의 운영 규칙 경로를 함께 되돌려야 한다. 플레이어 접속을 허용하기 전에는 DB의 `runtimeMode`도 함께 맞춘다.

대문의 그림은 내장 이미지 생성 도구로 제작했다. 후속 요청으로 GIF 두 편을 각각 9개의 전투 동작 프레임을 엮은 버전으로 교체했다. 기병전은 돌격·창 충돌·말의 회전, 적벽 수전은 전선 접근·불화살 발사·돛의 화재가 이어진다. 프롬프트는 `farewell/art-prompts.md`에 기록했다. 완성 GIF는 `farewell/media/cavalry-duel.gif`와 `farewell/media/red-cliffs-assault.gif`다. 컷 사이 자세 변화가 보이는 짧은 반복 애니메이션이며 프레임 사이 움직임을 보간하지 않는다. 화면에 가까워질 때 다운로드하고 사용자가 멈추거나 재생할 수 있다.

후속 배포 `41978546405`가 성공했다. 공개 대문 HTML과 GIF·포스터 각각2개의 파일 대조를 통과했다. PC/모바일 배치, 실제 공개 GIF 로딩과 재생·정지 전환을 확인했다. 화면은 `playtest/battle-motion-live.png`에 보관했다.
