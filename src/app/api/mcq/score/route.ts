import { randomUUID } from "node:crypto";
import { McqScoreRequestSchema, McqResultSchema } from "../../../../domain/schemas";
import { ContentLookupError, DefaultMcqEvaluator, getProblemPackage } from "../../../../server/content";
import { failure, readJson, SafeError, scoringAdmission, success } from "../../../../server/http";
export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const input = McqScoreRequestSchema.parse(await readJson(request));
    const pkg = getProblemPackage(input.problemId, input.contentVersion);
    if (!pkg) throw new SafeError("CONTENT_VERSION_UNAVAILABLE", "Saved content version is unavailable.", 410);
    const release = scoringAdmission.admit(`${input.attemptId}:${input.snapshotId}`);
    try { return success(input, McqResultSchema.parse(new DefaultMcqEvaluator().evaluate(pkg, input.language, input.answers)), requestId); }
    finally { release(); }
  } catch (error) { return failure(error instanceof ContentLookupError ? new SafeError("INVALID_REQUEST", "Answers must belong to the pinned problem and language.") : error, requestId); }
}
