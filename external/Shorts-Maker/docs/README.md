# Docs Index

이 저장소의 human docs는 아래만 남긴다. 경로/환경 정보는 generated JSON 쪽이 더 자세하다.

## Entry Points

- [../README.md](../README.md)
- [CODEX_GUIDE.md](./CODEX_GUIDE.md)
- [OPERATIONS.md](./OPERATIONS.md)
- [developer-map.json](./developer-map.json)
- [environment-map.json](./environment-map.json)

## Human Docs

- [../README.md](../README.md): 저장소 개요, 로컬 실행, 핵심 명령
- [CODEX_GUIDE.md](./CODEX_GUIDE.md): 어디를 읽고 어디를 수정해야 하는지에 대한 Codex 진입 가이드
- [OPERATIONS.md](./OPERATIONS.md): env, 인증, 배포, QA, telemetry, publish 상태 참고
- [BGM_SETUP.md](./BGM_SETUP.md): 고정 BGM 파일 위치와 파일명
- [PERSONAL_V1_FINAL_USER_FLOW.md](./PERSONAL_V1_FINAL_USER_FLOW.md): 개인용 V1의 확정 제작 흐름과 저장·복구·렌더 기준
- [PERSONAL_V1_SCREEN_INFORMATION_ARCHITECTURE.md](./PERSONAL_V1_SCREEN_INFORMATION_ARCHITECTURE.md): 개인용 V1의 1차 메뉴, 화면 계층, 제작 단계와 기능 소유권
- [PERSONAL_V1_DESKTOP_WIREFRAMES.md](./PERSONAL_V1_DESKTOP_WIREFRAMES.md): 개인용 V1의 PC 화면 배치, 단계별 작업영역, 상태와 CTA 와이어프레임
- [PERSONAL_V1_UI_DESIGN_SYSTEM.md](./PERSONAL_V1_UI_DESIGN_SYSTEM.md): 개인용 V1의 색상, 타이포그래피, 컴포넌트, 상태, 접근성 UI 기준
- [PRODUCT_SIMPLIFICATION_BLUEPRINT.md](./PRODUCT_SIMPLIFICATION_BLUEPRINT.md): 다중 사용자·발행 기능을 포함한 이전 구조 참고. 개인용 V1 결정에는 위 네 문서를 우선 적용

## Generated Docs

- [developer-map.json](./developer-map.json): 현재 route, 도메인, 진입 파일, 테스트, hotspot 맵
- [environment-map.json](./environment-map.json): 환경변수별 사용 파일과 분류 인벤토리

## Data Docs

- [revenue-ratecard.yaml](./revenue-ratecard.yaml): 가격/과금 기준 데이터

## Notes

- 구조, route, entry file, env taxonomy가 바뀌면 `npm run docs:refresh`
- generated JSON drift 확인은 `npm run docs:check`
