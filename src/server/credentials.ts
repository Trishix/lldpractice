import "server-only";
import { createHash } from "node:crypto";
import type { CredentialMode } from "../domain/types";
import { SafeError } from "./http";
type Phase = "initial" | "final" | "calibration";
type Environment = Record<string, string | undefined>;
export interface Credential { key: string; fingerprint: string; mode: CredentialMode }
const fingerprint = (key: string) => createHash("sha256").update(key).digest("hex");
export function platformAvailable(env: Environment = process.env) { return Boolean(env.GROQ_REVIEW_API_KEY || env.GROQ_FINAL_REVIEW_API_KEY || env.GROQ_API_KEY || env.GROQ_FALLBACK_API_KEY); }
export class CredentialResolver {
  private health = new Map<string, { rejected: boolean; until: number }>();
  private platformQuotaUntil = 0;
  constructor(private env: Environment = process.env, private now = Date.now) {}
  select(mode: CredentialMode, phase: Phase, learnerKey?: string | null): Credential {
    if (mode === "platform" && learnerKey) throw new SafeError("INVALID_REQUEST", "Platform mode does not accept a learner key.");
    if (mode === "user") {
      if (!learnerKey?.trim()) throw new SafeError("USER_KEY_REQUIRED", "A learner provider key is required.", 422);
      if (learnerKey.length > 512 || /[\s\x00-\x1f]/.test(learnerKey)) throw new SafeError("INVALID_REQUEST", "The learner key format is invalid.");
      const chosen = { key: learnerKey, fingerprint: fingerprint(learnerKey), mode };
      const health = this.health.get(chosen.fingerprint);
      if (health?.rejected) throw new SafeError("CREDENTIAL_REJECTED", "The provider rejected this credential. Replace the key.", 422);
      if (health && health.until > this.now()) throw new SafeError("PROVIDER_RATE_LIMIT", "The provider credential is cooling down.", 429, true, Math.ceil((health.until - this.now()) / 1000));
      return chosen;
    }
    if (this.platformQuotaUntil > this.now()) throw new SafeError("PROVIDER_QUOTA", "Platform provider quota is exhausted. Retry after the cooldown.", 429, true, Math.ceil((this.platformQuotaUntil - this.now()) / 1000));
    const role = phase === "initial" ? this.env.GROQ_REVIEW_API_KEY : phase === "final" ? this.env.GROQ_FINAL_REVIEW_API_KEY : this.env.GROQ_CALIBRATION_API_KEY;
    const candidates = [...new Set([role, this.env.GROQ_API_KEY, this.env.GROQ_FALLBACK_API_KEY].filter((key): key is string => Boolean(key?.trim())))];
    for (const key of candidates) {
      const hash = fingerprint(key), health = this.health.get(hash);
      if (!health?.rejected && (!health || health.until <= this.now())) return { key, fingerprint: hash, mode };
    }
    const next = Math.min(...candidates.map((key) => this.health.get(fingerprint(key))).filter((h) => h && !h.rejected && h.until > this.now()).map((h) => h!.until));
    throw new SafeError("PLATFORM_UNAVAILABLE", "Platform review is unavailable. MCQs remain available.", 503, true, Number.isFinite(next) ? Math.ceil((next - this.now()) / 1000) : undefined);
  }
  failed(credential: Credential, error: unknown): SafeError {
    const provider = error as { status?: number; name?: string; code?: string; error?: { code?: string; type?: string }; headers?: Headers | Record<string, string> };
    const raw = provider.headers instanceof Headers ? provider.headers.get("retry-after") : provider.headers?.["retry-after"];
    const retry = Math.max(1, Math.ceil(raw && Number.isFinite(Number(raw)) ? Number(raw) : raw && Number.isFinite(Date.parse(raw)) ? (Date.parse(raw) - this.now()) / 1000 : 60));
    if (provider.status === 401 || provider.status === 403) {
      this.health.set(credential.fingerprint, { rejected: true, until: Infinity });
      return new SafeError("CREDENTIAL_REJECTED", credential.mode === "user" ? "The provider rejected this credential. Replace the key." : "The platform credential was rejected. An explicit retry may use an eligible replacement.", 422, credential.mode === "platform");
    }
    if (provider.status === 429 || provider.status === 402) {
      const quota = provider.status === 402 || /quota|billing|spend|insufficient/i.test(`${provider.code ?? ""} ${provider.error?.code ?? ""} ${provider.error?.type ?? ""}`);
      this.health.set(credential.fingerprint, { rejected: false, until: this.now() + retry * 1000 });
      // Organization limits apply across keys. Never cycle platform keys on 429 or exhausted quota.
      if (credential.mode === "platform") this.platformQuotaUntil = this.now() + retry * 1000;
      return new SafeError(quota ? "PROVIDER_QUOTA" : "PROVIDER_RATE_LIMIT", "The provider limit was reached. Retry after the cooldown.", 429, true, retry);
    }
    if (provider.name?.includes("Timeout") || provider.name === "TimeoutError") return new SafeError("PROVIDER_TIMEOUT", "The provider review timed out.", 504, true);
    if (provider.name?.includes("Abort")) return new SafeError("CANCELLED", "The review was cancelled.", 499, true);
    if (provider.status === 400 && /json_validate/i.test(`${provider.error?.code ?? ""} ${provider.code ?? ""}`)) return new SafeError("PROVIDER_GENERATION_FAILED", "The provider could not generate a schema-conforming assessment. Retry explicitly.", 502, true);
    if (provider.status === 400 || provider.status === 422) return new SafeError("PROVIDER_REQUEST_REJECTED", "The AI review could not be completed because the provider rejected this request. Check your review settings and try again.", 502, true);
    this.health.set(credential.fingerprint, { rejected: false, until: this.now() + 30_000 });
    return new SafeError("PROVIDER_UNAVAILABLE", "The provider could not complete the review. Retry explicitly.", 503, true);
  }
}
export const credentials = new CredentialResolver();
