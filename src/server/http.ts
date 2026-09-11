import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { INPUT_BOUNDS } from "../domain/schemas";
import type { RequestMetadata } from "../domain/types";

export class SafeError extends Error {
  constructor(public code: string, message: string, public status = 400, public retryable = false, public retryAfterSeconds?: number) { super(message); }
}
export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
export function success(metadata: RequestMetadata, data: unknown, requestId: string) {
  return json({ attemptId: metadata.attemptId, snapshotId: metadata.snapshotId, runId: metadata.runId, requestId, data });
}
export function failure(error: unknown, requestId = randomUUID()) {
  const safe = error instanceof SafeError ? error : error instanceof z.ZodError || error instanceof SyntaxError
    ? new SafeError("INVALID_REQUEST", "The request is invalid.")
    : new SafeError("INTERNAL_ERROR", "The request could not be completed.", 500, true);
  return json({ error: { code: safe.code, message: safe.message, retryable: safe.retryable, requestId,
    ...(safe.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: safe.retryAfterSeconds }),
  } }, safe.status, safe.retryAfterSeconds === undefined ? {} : { "Retry-After": String(safe.retryAfterSeconds) });
}
export async function readJson(request: Request): Promise<unknown> {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // Next's reconstructed URL may use its bind hostname. Host is the incoming browser authority.
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") ?? url.host}`;
  if ((origin && origin !== expectedOrigin) || request.headers.get("sec-fetch-site") === "cross-site") throw new SafeError("ORIGIN_REJECTED", "Use this application's own origin.", 403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") throw new SafeError("UNSUPPORTED_MEDIA_TYPE", "Use JSON.", 415);
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > INPUT_BOUNDS.jsonBodyBytes)) throw new SafeError("BODY_TOO_LARGE", "The request exceeds the size limit.", 413);
  if (!request.body) throw new SafeError("INVALID_REQUEST", "A JSON body is required.");
  const reader = request.body.getReader();
  const deadline = AbortSignal.timeout(10_000);
  const signal = AbortSignal.any([request.signal, deadline]);
  let total = 0;
  const chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel(); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new SafeError("REQUEST_TIMEOUT", "The request body timed out.", 408, true);
      const { value, done } = await reader.read();
      if (signal.aborted) throw new SafeError("REQUEST_TIMEOUT", "The request body timed out.", 408, true);
      if (done) break;
      total += value.byteLength;
      if (total > INPUT_BOUNDS.jsonBodyBytes) { void reader.cancel(); throw new SafeError("BODY_TOO_LARGE", "The request exceeds the size limit.", 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

// Best effort per process: no cross-instance locks or deployment-wide quota claim.
export class AdmissionControl {
  private active = new Set<string>();
  private recent = new Map<string, number>();
  private windowStarted = 0;
  private admitted = 0;
  constructor(private limit = 4, private intervalMs = 1_000, private now = Date.now, private windowBudget = 20, private windowMs = 60_000) {}
  admit(identity: string): () => void {
    const now = this.now();
    if (now - this.windowStarted >= this.windowMs) { this.windowStarted = now; this.admitted = 0; }
    if (this.admitted >= this.windowBudget) throw new SafeError("ADMISSION_LIMIT", "The process request budget is busy. Retry after the window resets.", 429, true, Math.max(1, Math.ceil((this.windowStarted + this.windowMs - now) / 1000)));
    for (const [id, time] of this.recent) if (time <= now) this.recent.delete(id);
    if (this.active.has(identity)) throw new SafeError("DUPLICATE_REQUEST", "This evaluation is already running.", 409, true);
    if (this.active.size >= this.limit || (this.recent.get(identity) ?? 0) > now) throw new SafeError("ADMISSION_LIMIT", "Review capacity is busy. Retry shortly.", 429, true, 1);
    this.admitted++;
    this.active.add(identity);
    this.recent.set(identity, now + this.intervalMs);
    return () => { this.active.delete(identity); };
  }
}
export const reviewAdmission = new AdmissionControl();
export const scoringAdmission = new AdmissionControl(32, 1_000, Date.now, 120);
