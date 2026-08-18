import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { runPreDeployCheckSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { computePreDeployCheck } from "../services/preDeployCheck";

export const runPreDeployCheck = createCallable(
  runPreDeployCheckSchema,
  async ({ data, isTeacher }) => {
    requireTeacher(isTeacher);
    return computePreDeployCheck(getFirestore(), data.quizId);
  },
);
