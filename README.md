# FlightPlan 3D Viewer

FlightPlan 2D 지도(OpenLayers)에서 선택한 항공기를 **Cesium 3D**로 보여주는 뷰어.
부모 창에서 `postMessage`로 좌표/heading을 받아 3D 글로브에 기체를 렌더링한다.
(현재 수신 연동은 WIP — Phase 3에서 복구 예정)

- 데모: <http://developkmj.dothome.co.kr/flight3Dviewer/>
- 부모 앱: [flight-plan](https://github.com/MinJunKimsdaads/flight-plan)

## 스택
React 19 · TypeScript 5.8 · Vite 6 · Cesium 1.130

## 개발
~~~bash
npm ci
npm run dev          # http://localhost:5173
npm run type-check
npm run lint
npm run build        # dist/ (base = VITE_BASE_WEB)
~~~

## 환경 / 배포
- base 경로는 빌드 시 `VITE_BASE_WEB`(예: `/flight3Dviewer/`)로 주입. `.env`는 커밋하지 않음(`.env.example` 참고).
- `main` push → `deploy.yml`이 verify(build) 통과 후 FTP 배포. `ci.yml`은 lint/type-check/build 검증.
- 필요한 GitHub Secrets: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`.
