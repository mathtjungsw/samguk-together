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
