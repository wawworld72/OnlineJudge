import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    testTimeout: 20000,
    // 모든 테스트가 같은 Firestore 에뮬레이터 인스턴스를 공유하는 전역 상태로 취급한다 —
    // 파일 단위 병렬 실행을 켜두면 서로 다른 spec 파일의 clearFirestore/seed가 경합해
    // 간헐적으로 실패한다.
    fileParallelism: false,
  },
});
