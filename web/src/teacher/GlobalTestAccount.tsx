import { useState } from "react";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import { addGlobalTestAccount } from "./api";

/**
 * 실제 학생 계정 없이 어떤 퀴즈든(Classroom 연동 여부·분반과 무관) 학생 화면을
 * 테스트할 수 있도록, 교사 본인이 로그인할 이메일을 전역으로 한 번만 등록하는
 * 화면. 퀴즈 목록 화면에 특정 퀴즈 선택과 무관하게 항상 보인다(QuizManager.tsx).
 */
export function GlobalTestAccount() {
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [added, setAdded] = useState(false);

  async function runAdd() {
    await addGlobalTestAccount({ studentId, name, email });
    setAdded(true);
  }

  return (
    <div>
      <h3>교사 테스트 계정(전역)</h3>
      <p className="field-hint">
        실제 학생 계정 없이 모든 퀴즈(Classroom 연동 여부·분반과 무관)의 학생 화면(입장·문제 실행·
        제출)을 테스트하고 싶을 때, 본인이 로그인할 이메일을 여기 한 번만 등록해두면 이후 모든
        퀴즈에 그대로 적용됩니다 — 퀴즈마다 따로 등록할 필요가 없습니다. 상태·시작종료시각·
        일시정지·마감·실행 횟수 제한과 무관하게 항상 입장·실행·제출까지 가능하고, 그 결과는 참가자
        현황·성적 반영·시트 내보내기에서 자동으로 제외됩니다. 학번은 실제 학생과 겹치지 않을 만한
        값(예: "test-teacher")을 입력해주세요.
      </p>
      <label>
        학번(실제 학생과 겹치지 않는 임의 값)
        <input value={studentId} onChange={(e) => setStudentId(e.target.value)} />
      </label>
      <label>
        이름
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        로그인할 이메일
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <DelayedActionButton
        label="테스트 계정 등록"
        pendingLabel="등록 중..."
        delayedLabel="등록에 시간이 걸리고 있습니다..."
        onAction={runAdd}
      />
      {added && <p>등록됨 — 이제 이 이메일로 어떤 퀴즈에 입장하든 테스트 계정으로 인식됩니다.</p>}
    </div>
  );
}
