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
 * 교사(관리자) 판별은 학생명부 소속 여부가 아니라 별도 허용 목록으로 한다 — 아직 명부에
 * 없는 학생 이메일을 "교사"로 잘못 판별하는 사고를 피하기 위함이다(헌법 I·II).
 */
export function getTeacherEmails(): string[] {
  return requireEnv("TEACHER_EMAILS")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}
