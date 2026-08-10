/**
 * 프로덕션 Firestore에 테스트용 학생 문서 1건을 생성/갱신한다(수업 연동 없이 학번·이름
 * 검증을 테스트하기 위한 수동 시드). GitHub Actions의 `seed-student.yml` 워크플로우가
 * `google-github-actions/auth@v2`로 발급한 자격증명(GOOGLE_APPLICATION_CREDENTIALS)을
 * 사용해 실행한다 — 로컬 환경에서 직접 실행하지 않는다.
 *
 * 사용법: STUDENT_ID=<학번> STUDENT_NAME=<이름> npx tsx functions/scripts/seedProdStudent.ts
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const studentId = process.env.STUDENT_ID;
const name = process.env.STUDENT_NAME;

if (!studentId || !name) {
  console.error("STUDENT_ID, STUDENT_NAME 환경변수가 필요합니다.");
  process.exit(1);
}

async function main() {
  const app = initializeApp();
  const db = getFirestore(app);

  await db.collection("students").doc(studentId!).set(
    {
      name,
      email: null,
      status: "ACTIVE",
    },
    { merge: true },
  );

  console.log(`시드 완료: students/${studentId} (name=${name})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
