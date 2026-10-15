/**
 * 기존 퀴즈 전부에 부정행위 방지 설정(복사·붙여넣기 제한, 화면 이탈 감지)을 켠다. 새 퀴즈는
 * 기본값이 이미 켜짐이지만, 기존 퀴즈 문서에는 `clipboardRestricted: false`가 명시 저장돼
 * 있어 코드 기본값 변경만으로는 바뀌지 않는다. GitHub Actions의 `enable-quiz-guards.yml`
 * 워크플로우(수동 실행)가 서비스 계정 자격증명으로 실행한다 — 로컬에서 직접 실행하지 않는다.
 *
 * 삭제된 퀴즈(deletedAt)는 건드리지 않는다. DRY_RUN=true면 변경 없이 대상 수만 출력한다.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const dryRun = process.env.DRY_RUN === "true";

async function main() {
  const db = getFirestore(initializeApp());
  const snap = await db.collection("quizzes").get();

  let updated = 0;
  let skipped = 0;
  const writer = db.bulkWriter();
  for (const doc of snap.docs) {
    const quiz = doc.data();
    if (quiz.deletedAt) {
      skipped++;
      continue;
    }
    if (quiz.clipboardRestricted === true && quiz.focusGuardEnabled === true) {
      skipped++;
      continue;
    }
    updated++;
    if (!dryRun) {
      void writer.update(doc.ref, { clipboardRestricted: true, focusGuardEnabled: true });
    }
  }
  await writer.close();

  console.log(`${dryRun ? "[DRY RUN] " : ""}대상 ${updated}건, 건너뜀 ${skipped}건`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
