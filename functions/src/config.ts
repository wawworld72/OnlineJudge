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
