# AI군주 버전 보관 및 복원

2026-11-05 사용자 요청으로 AI 버전과 무료 버전을 분리했다. 게임 데이터 초기화 없이 전환하는 것이 원칙이다.

## 보관 위치

- 검증된 AI 코드: 커밋 `6861474`, GitHub 태그 `ai-rulers-backup-2026-11-05`.
- GitHub 백업 브랜치: `codex/ai-rulers-backup-2026-11-05`.
- 전체 Git 이력의 로컬 사본: 프로젝트 상위 폴더 `samguk-online-AI군주-2026-11-05.bundle`. `git bundle verify` 통과.
- 로컬 운영 데이터/규칙 백업: `playtest/ai-version-backup-2026-11-05/`. `database.json`, 원본 규칙, SHA256 manifest와 최종 동결 전장/이관 증거를 보관한다. 개인정보가 포함되므로 GitHub에 올리지 않는다.
- Firebase 원래 `/worlds`, `/chat`, `/battleRecords`, `/enhancementRecords`도 보존한다. 무료 전장은 `/sparkWorlds` 등 별도 경로다.
- 함수의 배포용 환경 설정 `functions/.env.samguk-together`는 기존 로컬 파일을 보존한다. 비밀키는 Git에 추가하지 않는다.

## 사용자가 AI 복원을 요청했을 때의 절차

아래는 운영자 실행 절차이며, 백업을 만들었다는 이유로 지금 자동 실행하지 않는다.

1. 무료 버전의 최신 코드와 DB를 다시 백업한다. 현재 `/sparkWorlds` 진행을 무시하고 11월5일 스냅샷으로 덮어쓰지 않는다.
2. `/runtimeMode/mode`를 일시적으로 `restoring-ai`로 설정해 무료 클라이언트 쓰기를 차단한다. 무료 전장들의 최신 병력·장수·포로·강화·재시도 기록과 채팅/상세를 보관한다.
3. 새 유료 서비스 없이 기존 프로젝트를 Blaze로 재연결한다. AI 서버 함수 재배포와 운영 비용이 다시 생길 수 있음을 알린다.
4. 복원용 별도 체크아웃에 AI 태그의 소스를 준비한다. 이를 최신 main 위에 복원 커밋으로 만들어 이력을 보존한다. main을 강제 되감기하지 않는다.
5. 무료 운영 이후 생긴 모든 시즌의 최신 전장을 `/worlds`로 복사한다. `executionMode`, `sparkVersion`, `sparkTickets`는 무료 전용 메타데이터로 분리하고, 원래 AI 메타데이터가 있는 세력은 보존한다. 새 시즌에서 AI가 없었다면 기존 서버의 중도 활성화 정책으로 준비한다. 병력·명단·강화·대기·포로·시즌 시작/마감은 바꾸지 않는다.
6. 무료 버전에서 사용한 D12권 상태를 원래 `rewardTickets`에 반영해 재지급을 막는다. 새 `battleRecords`/`enhancementRecords`/`recordVersions`와 채팅도 복사한다. 원본 및 무료 경로는 검증이 끝날 때까지 삭제하지 않는다.
7. `npm test`, `npm run test:rules`, `npm run build`와 실제 복원 데이터 정규화를 검증하고 Firebase 함수/규칙과 Pages를 배포한다. AI enabled는 마지막까지 끈다.
8. 새 사이트와 서버 경로가 최신 진행을 읽는 것을 확인한 뒤 점검을 해제하고 AI를 활성화한다. 현재 시즌 시작 AI를 중복 생성하지 않는다. 사람들의 미확인 요청·로컬 강화 큐는 같은 ID/seq로 확인한다.
9. 전체 공지에 AI 재개와 무료 모드에서의 진행 보존 결과를 알린다.

단순 코드 복원은 태그로 가능하다. **무료 모드에서 쌓인 최신 진행까지 보존하는 운영 복원에는 위 데이터 이관과 Blaze 재연결이 필요하다.** 버튼 하나로 즉시 자동 복귀하는 기능을 구성했다고 표현하지 않는다.
