import { randomUUID } from "node:crypto";
import { DesignReviewRequestSchema, ReviewOutcomeSchema } from "../../../../domain/schemas";
import { failure, readJson, success } from "../../../../server/http";
import { review } from "../../../../server/review-service";
export const runtime = "nodejs";
export const maxDuration = 75;
export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const input = DesignReviewRequestSchema.parse(await readJson(request));
    const data = ReviewOutcomeSchema.parse(await review(input, request.headers.get("X-LLD-Provider-Key"), request.signal));
    return success(input, data, requestId);
  } catch (error) { return failure(error, requestId); }
}
