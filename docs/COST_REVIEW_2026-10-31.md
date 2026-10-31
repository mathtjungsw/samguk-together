# 서버 과금 가능성 검토 — 2026-10-31

확인 시각19:56(KST), 구간10월30일19:56~31일19:56의 Cloud Monitoring API 실측. 페이징을 모두 조회했다. Billing API에서 billingEnabled=true를 확인했다. 청구서·할인·세금·타 프로젝트와 공유되는 무료 제공량의 실제 적용액은 조회하지 못했으므로 청구0원 여부는 확정하지 않는다.

- RTDB sent_bytes_count:337,507,940 bytes(337.5MB/321.9MiB). 암호화·프로토콜 오버헤드 포함 지표. 하루360MB 무료량과 단순 비교하면 약94%, 잔여 약22.5MB다. 이것은 이동24시간이므로 실제 요금 집계일 사용량과 동일하지 않다.
- DB 저장 최신4183348 bytes(약4.2MB). 무료1GB에 비해 작다. GAUGE 여러 시점 값을 합계 사용량으로 해석하지 않는다.
- Cloud Run 요청161회, 과금 대상 인스턴스 시간3953.3초(대부분aiRulerTick). 동일 추세30일 약4830회·118599초. 설정0.1666vCPU/256MiB 기준 단순 CPU 약19759vCPU초·메모리29650GiB초이며 시작부스트·지역·공유무료량 등으로 청구값과 다를 수 있다.
- 예약every10minutes(하루144회), 최소인스턴스0·최대1. AI 전체 전장1회 공유 조회. 이미지는GitHub Pages이며 Firebase 다운로드와 구분한다.

판단: DB무료량 경계에 가까워 활동 증가·AI 전투/군주 증가·반복접속으로 초과할 가능성이 있다. 무료 일360MB 후$1/GB 기준으로 실제 하루500MB면 초과140MB, 동일한30일 약$4.2의 DB다운로드 비용(단순십진추정,세금·다른서비스별도). 하루1GB면 약$19.2. 함수 호출·메모리·CPU는 현 추세에서 DB보다 위험이 작지만 빌드·이미지저장·로그·Eventarc등 부대비용과 청구계정공유할당은 별도다. 예약은청구계정당무료3개 후각$0.10/월이며 타프로젝트소진 여부는 확인하지 않았다.

공식 근거: https://firebase.google.com/pricing / https://firebase.google.com/docs/database/usage/billing / https://cloud.google.com/run/pricing / https://cloud.google.com/scheduler/pricing

운영 요금제·AI 활성화·게임 코드는 변경하지 않았다. 비용만으로 개발을 중지하지 않는 사용자 원칙을 유지한다.
