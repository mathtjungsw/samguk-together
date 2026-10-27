# 자료 출처 및 변경 고지

지도 외곽은 André Ourednik 및 Historical Basemaps 기여자의 `world_200.geojson` Han 지형을 사용했습니다.

- 원본: https://github.com/aourednik/historical-basemaps
- 파일: https://github.com/aourednik/historical-basemaps/blob/master/geojson/world_200.geojson
- 라이선스: GPL-3.0. 동봉한 `historical-basemaps-LICENSE.txt` 참조.
- 변경: Han 영역 추출, 지도 투영, 90개 게임용 구획 분할, 교차점 조정으로 최대 인접 5곳 구성. 원본 행정 경계 재현이 아닙니다.

지명과 좌표는 Harvard/Fudan CHGIS Temporal Gazetteer의 262년 기록을 참고했습니다. 82곳은 조회 기록에 연결되며 양평·북평·진양·북해·복양·안정·여강·영안 8곳은 게임용 근사 위치입니다. 해당 구분과 링크는 `src/data/game-data.json`에 있습니다.

- CHGIS: https://chgis.hudci.org/tgw/
- 프로젝트: https://chgis.fas.harvard.edu/

이 게임은 코에이의 삼국지 11 지도 이미지·텍스처·로고를 사용하지 않습니다.

## 무장 100인 초상

- 2026-10-27 OpenAI 내장 `image_gen`으로 이 게임을 위해 제작한 인물 해석입니다. imagegen 스킬의 내장 도구 경로를 사용했습니다.
- `public/assets/portraits-1.webp`부터 `portraits-5.webp`까지 각 5열×4행, 합계 100개 초상입니다. 생성 PNG를 WebP 형식으로 변환했으며 인물 그림 자체를 편집하지 않았습니다.
- 명단과 각 초상의 위치는 `src/data/game-data.json`의 `roster`에 있습니다. 저장된 병력의 이름을 기준으로 연결하며 플레이어 D20에는 별도의 군주 표식을 사용합니다.
- 생성 프롬프트 전문은 `licenses/portrait-prompts.json`에 있습니다. 유비·조조·손권 등은 역사 인물에 대한 새 해석이며 삼국지 시리즈의 게임 이미지를 복제·추출한 자산이 아닙니다.
