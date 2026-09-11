import { z } from "zod";
import { ApiFailureSchema, ApiSuccessSchema, McqResultSchema, PublicConfigSchema, ReviewOutcomeSchema } from "../domain/schemas";
import type { EvaluationError, PublicConfig } from "../domain/types";
import type { EvaluationTransport } from "./coordinator";

const MAX_RESPONSE_BYTES = 1_048_576;
const invalid = (): EvaluationError => ({ code: "INVALID_RESPONSE", message: "The evaluation service returned an invalid response.", retryable: true });
const network = (): EvaluationError => ({ code: "NETWORK_ERROR", message: "The evaluation service could not be reached. Check your connection and retry.", retryable: true });

async function readJson(response: Response): Promise<unknown> {
  const advertised = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertised) && advertised > MAX_RESPONSE_BYTES) throw invalid();
  if (!response.body) throw invalid();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw invalid(); }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    try { return JSON.parse(body) as unknown; } catch { throw invalid(); }
  } finally { reader.releaseLock(); }
}

async function requestJson<T>(path: string, init: RequestInit, schema: z.ZodType<T>, fetcher: typeof fetch): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(path, { ...init, cache: "no-store", credentials: "same-origin", redirect: "error" });
  } catch {
    if (init.signal?.aborted) throw { code: "REQUEST_INTERRUPTED", message: "The request timed out or was interrupted.", retryable: true } satisfies EvaluationError;
    throw network();
  }
  const raw = await readJson(response);
  if (!response.ok) {
    const failure = ApiFailureSchema.safeParse(raw);
    if (!failure.success) throw invalid();
    throw failure.data.error;
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw invalid();
  return result.data;
}

/** Each method makes one request; coordinator owns evaluation deadlines and explicit retries. */
export function createHttpEvaluationTransport(fetcher: typeof fetch = fetch): EvaluationTransport {
  return {
    score: (request, signal) => requestJson("/api/mcq/score", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(request), signal,
    }, ApiSuccessSchema(McqResultSchema), fetcher),
    review: (request, credential, signal) => requestJson("/api/design/review", {
      method: "POST", headers: {
        "Content-Type": "application/json", Accept: "application/json",
        ...(request.credentialMode === "user" && credential ? { "X-LLD-Provider-Key": credential.trim() } : {}),
      }, body: JSON.stringify(request), signal,
    }, ApiSuccessSchema(ReviewOutcomeSchema), fetcher),
  };
}

export async function fetchPublicConfig(signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<PublicConfig> {
  const deadline = AbortSignal.timeout(10_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  return requestJson("/api/config", { method: "GET", headers: { Accept: "application/json" }, signal: combined }, PublicConfigSchema, fetcher);
}
