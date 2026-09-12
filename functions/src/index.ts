import { initializeApp, getApps } from "firebase-admin/app";

if (getApps().length === 0) {
  initializeApp();
}

export { teacherLogin } from "./callable/teacherLogin";
export { enterQuiz } from "./callable/enterQuiz";
export { registerStudentEmail } from "./callable/registerStudentEmail";
export { practiceRun } from "./callable/practiceRun";
export { finalSubmit } from "./callable/finalSubmit";
export { getMyResult } from "./callable/getMyResult";
export { listQuizzes } from "./callable/listQuizzes";
export { getQuizForEdit } from "./callable/getQuizForEdit";
export { upsertQuiz } from "./callable/upsertQuiz";
export { upsertProblem, deleteProblem } from "./callable/problems";
export { upsertTestCase, deleteTestCase } from "./callable/testCases";
export { runPreDeployCheck } from "./callable/runPreDeployCheck";
export { setQuizStatus } from "./callable/setQuizStatus";
export {
  setQuizTimerDuration,
  startQuizTimer,
  pauseQuizTimer,
  endQuizTimer,
} from "./callable/quizTimer";
export { batchGrade } from "./callable/batchGrade";
export { getParticipantOverview } from "./callable/getParticipantOverview";
export { getParticipantDetail } from "./callable/getParticipantDetail";
export { syncRoster } from "./callable/syncRoster";
export { addTestRosterEntry } from "./callable/addTestRosterEntry";
export {
  deployClassroomAssignment,
  resetClassroomDeployment,
} from "./callable/classroomAssignment";
export { pushGrades } from "./callable/pushGrades";
export { archiveQuiz } from "./callable/archiveQuiz";
export { deleteQuizData } from "./callable/deleteQuizData";
export { exportGradesToSheet } from "./http/exportGradesToSheet";
export { exportQuizResultToSheet } from "./http/exportQuizResultToSheet";
export { upsertQuizFromSheet } from "./http/upsertQuizFromSheet";
