# flight-plan-3D

<!-- kmjharness:begin — kmjh가 관리합니다. 직접 수정하지 마세요 -->

## 공통 규약 (kmjHarness base)

- 작업을 마치기 전에 반드시 `npm run verify`를 통과시킬 것. lint · typecheck · test · build를 한 번에 돌린다.
- 커밋 메시지는 Conventional Commits (`feat:`, `fix:`, `chore:` …).
- `.kmjharness/`, `.github/workflows/ci.yml` 등 **관리 파일은 직접 수정하지 말 것.** 변경은 `kmjh sync`로만 이뤄진다.
- 공통 표준 문서: https://github.com/MinJunKimsdaads/kmjHarness/tree/main/docs
- 이 레포의 표준 설정은 `../kmjHarness`에 있다. 필요하면 참조할 것.

## 스택 규약 (react-vite)

- 상태 관리는 **Zustand**. Redux · Context 기반 전역 상태 도입 금지.
- 라우팅은 **React Router 7**.
- 스타일은 **Tailwind**. 새 `.scss` 파일 생성 금지 — 서드파티 위젯 오버라이드는 `src/styles/vendor/` 안에서만 허용.
- 테스트는 **Vitest + Testing Library**, 파일명은 `*.test.ts(x)`.
- 경로 별칭 `@/*` → `src/*`.

<!-- kmjharness:end -->

## 이 프로젝트만의 규칙

<!-- 여기부터는 당신의 영역입니다. kmjh는 이 아래를 건드리지 않습니다. -->
