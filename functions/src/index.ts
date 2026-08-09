import { initializeApp, getApps } from "firebase-admin/app";

if (getApps().length === 0) {
  initializeApp();
}

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
export { batchGrade } from "./callable/batchGrade";
