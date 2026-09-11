import { describe, expect, it, vi } from "vitest";
import { createHttpEvaluationTransport, fetchPublicConfig } from "./transport";
import { mcqResult, publicConfig } from "./test-fixtures";
import type { McqScoreRequest } from "../domain/types";

const request: McqScoreRequest = {
  attemptId: "00000000-0000-4000-8000-000000000001", snapshotId: "00000000-0000-4000-8000-000000000002", runId: "00000000-0000-4000-8000-000000000003",
  problemId: "problem:test", contentVersion: "1.0.0", language: "java", answers: {},
};

describe("HTTP evaluation transport", () => {
  it("uses same-origin no-store JSON transport and validates successful envelopes", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ...request, problemId: undefined, contentVersion: undefined, language: undefined, answers: undefined, requestId: "00000000-0000-4000-8000-000000000004", data: mcqResult() }));
    const transport = createHttpEvaluationTransport(fetcher);
    await expect(transport.score(request, new AbortController().signal)).resolves.toMatchObject({ data: { marks: 0 } });
    expect(fetcher).toHaveBeenCalledWith("/api/mcq/score", expect.objectContaining({ cache: "no-store", credentials: "same-origin", redirect: "error", method: "POST", body: JSON.stringify(request) }));
  });

  it("returns validated server errors with correlation and retry timing", async () => {
    const error = { code: "RATE_LIMITED", message: "Retry later.", retryable: true, retryAfterSeconds: 12, requestId: "00000000-0000-4000-8000-000000000004" };
    const transport = createHttpEvaluationTransport(async () => Response.json({ error }, { status: 429 }));
    await expect(transport.score(request, new AbortController().signal)).rejects.toEqual(error);
  });

  it("does not expose raw HTML, malformed envelopes, or fetch failure details", async () => {
    for (const fetcher of [
      async () => new Response("secret upstream trace", { status: 500 }),
      async () => Response.json({ error: { message: "secret upstream trace" } }, { status: 500 }),
      async () => { throw new Error("secret upstream trace"); },
    ]) {
      const transport = createHttpEvaluationTransport(fetcher);
      await expect(transport.score(request, new AbortController().signal)).rejects.not.toHaveProperty("message", expect.stringContaining("secret"));
    }
  });

  it("rejects oversized responses before publishing results", async () => {
    const transport = createHttpEvaluationTransport(async () => new Response("x".repeat(1_048_577)));
    await expect(transport.score(request, new AbortController().signal)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("fetches and validates the public configuration", async () => {
    await expect(fetchPublicConfig(undefined, async () => Response.json(publicConfig))).resolves.toEqual(publicConfig);
    await expect(fetchPublicConfig(undefined, async () => Response.json({ ...publicConfig, platformKeys: ["secret"] }))).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
