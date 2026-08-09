import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // 프론트엔드 컴포넌트 테스트 태스크는 tasks.md 범위에 없었다 — 아직 테스트 파일이
    // 없는 상태에서도 CI가 실패하지 않도록 한다. 테스트가 추가되면 자연히 실행된다.
    passWithNoTests: true,
  },
});
