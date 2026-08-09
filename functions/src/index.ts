import { initializeApp, getApps } from "firebase-admin/app";

if (getApps().length === 0) {
  initializeApp();
}

export { enterQuiz } from "./callable/enterQuiz";
export { registerStudentEmail } from "./callable/registerStudentEmail";
export { practiceRun } from "./callable/practiceRun";
export { finalSubmit } from "./callable/finalSubmit";
export { getMyResult } from "./callable/getMyResult";
