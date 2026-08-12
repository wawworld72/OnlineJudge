import { google } from "googleapis";
import { retryOnce } from "../shared/retryOnce";
import { getClassroomServiceAccountKey } from "../config";

const SCOPES = [
  "https://www.googleapis.com/auth/classroom.rosters.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.students",
];

/**
 * Google Classroom API 클라이언트. `googleapis`를 임포트하는 유일한 모듈 경계 중 하나로
 * 유지한다 — 학생용 함수의 콜드 스타트 경로에 이 무거운 의존성이 섞이지 않도록
 * (research.md §16) `syncRoster`/`deployClassroomAssignment`/`pushGrades`만 이 모듈을
 * 임포트한다.
 *
 * 서비스 계정은 그 자체로는 Classroom 강의 데이터에 접근할 권한이 없다 — Workspace
 * 관리자가 이 서비스 계정에 도메인 전체 위임(Domain-wide delegation)을 승인한 뒤,
 * `subject`로 실제 호출한 교사 계정을 지정해 그 교사를 대신(impersonate)해서 요청해야
 * 한다(2026-08-12, 서비스 계정 단독 호출이 403으로 거부됨을 실측 확인).
 */
async function classroom(impersonateEmail: string) {
  const { client_email, private_key } = getClassroomServiceAccountKey();
  const auth = new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: SCOPES,
    subject: impersonateEmail,
  });
  return google.classroom({ version: "v1", auth });
}

export interface ClassroomStudent {
  userId: string;
  email: string;
  name: string;
}

export async function listCourseStudents(
  courseId: string,
  impersonateEmail: string,
): Promise<ClassroomStudent[]> {
  return retryOnce(async () => {
    const api = await classroom(impersonateEmail);
    const students: ClassroomStudent[] = [];
    let pageToken: string | undefined;
    do {
      const res = await api.courses.students.list({ courseId, pageToken });
      for (const s of res.data.students ?? []) {
        if (s.userId && s.profile?.emailAddress) {
          students.push({
            userId: s.userId,
            email: s.profile.emailAddress,
            name: s.profile.name?.fullName ?? s.profile.emailAddress,
          });
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return students;
  });
}

export interface CreateCourseWorkResult {
  courseWorkId: string;
  alternateLink: string;
}

export async function createCourseWork(
  courseId: string,
  title: string,
  description: string,
  maxPoints: number,
  dueAt: Date,
  joinUrl: string,
  impersonateEmail: string,
): Promise<CreateCourseWorkResult> {
  return retryOnce(async () => {
    const api = await classroom(impersonateEmail);
    const res = await api.courses.courseWork.create({
      courseId,
      requestBody: {
        title,
        description,
        workType: "ASSIGNMENT",
        state: "PUBLISHED",
        maxPoints,
        dueDate: { year: dueAt.getUTCFullYear(), month: dueAt.getUTCMonth() + 1, day: dueAt.getUTCDate() },
        dueTime: { hours: dueAt.getUTCHours(), minutes: dueAt.getUTCMinutes() },
        materials: [{ link: { url: joinUrl } }],
      },
    });
    return {
      courseWorkId: res.data.id!,
      alternateLink: res.data.alternateLink!,
    };
  });
}

export interface StudentSubmission {
  userId: string;
  submissionId: string;
}

export async function listStudentSubmissions(
  courseId: string,
  courseWorkId: string,
  impersonateEmail: string,
): Promise<StudentSubmission[]> {
  return retryOnce(async () => {
    const api = await classroom(impersonateEmail);
    const res = await api.courses.courseWork.studentSubmissions.list({ courseId, courseWorkId });
    return (res.data.studentSubmissions ?? [])
      .filter((s) => s.userId && s.id)
      .map((s) => ({ userId: s.userId!, submissionId: s.id! }));
  });
}

export async function patchGrade(
  courseId: string,
  courseWorkId: string,
  submissionId: string,
  grade: number,
  impersonateEmail: string,
): Promise<void> {
  await retryOnce(async () => {
    const api = await classroom(impersonateEmail);
    await api.courses.courseWork.studentSubmissions.patch({
      courseId,
      courseWorkId,
      id: submissionId,
      updateMask: "assignedGrade,draftGrade",
      requestBody: { assignedGrade: grade, draftGrade: grade },
    });
    await api.courses.courseWork.studentSubmissions.return({ courseId, courseWorkId, id: submissionId });
  });
}
