function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getGraderConfig() {
  return {
    serviceUrl: requireEnv("GRADER_SERVICE_URL"),
    authToken: requireEnv("GRADER_AUTH_TOKEN"),
  };
}

/**
 * Google Classroom API는 서비스 계정 단독으로는 강의 데이터에 접근할 수 없다 — Workspace
 * 관리자가 도메인 전체 위임(Domain-wide delegation)으로 이 서비스 계정에 권한을 부여한
 * 뒤에만, 이 키로 실제 교사 계정을 대신(impersonate)해서 호출할 수 있다
 * (functions/src/services/classroomClient.ts). GitHub Actions 배포 워크플로우가
 * FIREBASE_SERVICE_ACCOUNT를 그대로 재사용해 base64로 인코딩한 값을 여기 넣는다 — 개행이
 * 있는 JSON 키를 .env에 안전하게 담기 위한 인코딩일 뿐, 별도 키가 아니다.
 */
export function getClassroomServiceAccountKey(): { client_email: string; private_key: string } {
  const encoded = requireEnv("CLASSROOM_SERVICE_ACCOUNT_KEY_B64");
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  return JSON.parse(decoded);
}

/** Classroom 과제에 첨부하는 "바로가기" 링크(`/quiz/{quizId}`)를 만들 때 쓰는 배포된 웹앱의 기본 URL. */
export function getAppBaseUrl(): string {
  return requireEnv("APP_BASE_URL");
}

/**
 * Google Apps Script(수업 중 시트로 성적을 당겨가는 스크립트)가 Callable Function이
 * 요구하는 Firebase Auth/App Check를 만들어낼 수 없어서, 별도의 정적 토큰으로만
 * 인증하는 `exportGradesToSheet`(onRequest)에 쓴다.
 */
export function getSheetExportApiToken(): string {
  return requireEnv("SHEET_EXPORT_API_TOKEN");
}

export function getAllowedEmailDomain(): string {
  return process.env.ALLOWED_EMAIL_DOMAIN ?? "hoseo.edu";
}

/**
 * 교사 홈페이지(/teacher)는 Google 이메일 로그인이 아니라 이 공유 출입코드로 접근한다
 * (`teacherLogin`) — 값이 일치하면 그 요청의 익명 Firebase 계정에 커스텀 클레임
 * `teacher: true`를 부여하고, 이후 모든 교사용 Callable Function은 `requireTeacher`로
 * 그 클레임만 확인한다. 이메일 계정을 요구하지 않으므로 GitHub Secret으로만 관리하고
 * 클라이언트 빌드에는 절대 포함하지 않는다.
 */
export function getTeacherAccessCode(): string {
  return requireEnv("TEACHER_ACCESS_CODE");
}

/**
 * Google Classroom API는 서비스 계정 단독으로는 호출할 수 없고, 도메인 전체 위임으로
 * 실제 Workspace 교사 계정을 대신(impersonate)해야 한다(getClassroomServiceAccountKey
 * 참고). 교사 로그인이 더 이상 실제 Google 계정이 아니므로(출입코드+익명 인증), "지금
 * 로그인한 사람의 이메일"이 아니라 이 값으로 항상 impersonate한다 — 웹앱 로그인 방식과
 * Classroom 위임 대상 계정은 서로 다른 개념이다.
 */
export function getClassroomTeacherEmail(): string {
  return requireEnv("CLASSROOM_TEACHER_EMAIL");
}
