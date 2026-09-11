import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { calibrationFixtures, type CalibrationFixture } from "./fixtures";
import { ReviewInputSchema } from "../../src/domain/schemas";
import { getProblemPackage } from "../../src/server/content";
import { CredentialResolver } from "../../src/server/credentials";
import { GroqDesignEvaluator, type Completion } from "../../src/server/design-evaluator";
import { SafeError } from "../../src/server/http";
import type { ReviewInput } from "../../src/domain/types";

type RecordRow = { fixture: string; repetition: number; phase: string; outcome: string; latencyMs: number; usage?: Completion["usage"]; ratings?: Record<string, number>; marks?: number; findings?: unknown[]; evidenceValid?: boolean; contradictionDetected?: boolean; errorCode?: string };
it("validates ten authored fixtures and records explicit live calibration or unavailable gates", async () => {
  expect(calibrationFixtures).toHaveLength(10);
  for (const fixture of calibrationFixtures) expect(ReviewInputSchema.safeParse(fixture.input).success, fixture.id).toBe(true);
  // Keys are read locally, never logged or included in results.
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const live = process.env.CALIBRATION_LIVE === "1";
  const resolver = new CredentialResolver();
  let available = true;
  try { resolver.select("platform", "calibration"); } catch { available = false; }
  const rows: RecordRow[] = [];
  const directory = resolve("docs/calibration-results"); mkdirSync(directory, { recursive: true });
  const report: Record<string, unknown> = { generatedAt: new Date().toISOString(), model: "openai/gpt-oss-120b", reasoningEffort: "medium", completionBudget: 4096, fixtureCount: 10, liveRequested: live, credentialAvailable: available, status: !available ? "unverified_missing_credentials" : !live ? "unverified_live_not_requested" : "running", independentHumanReview: "unverified", rows };
  const save = () => writeFileSync(resolve(directory, "latest.json"), JSON.stringify(report, null, 2) + "\n");
  save();
  if (!live || !available) return;
  let halted = false;
  async function run(fixture: CalibrationFixture, repetition: number, input: ReviewInput, phase: string) {
    const start = Date.now(); let usage: Completion["usage"];
    try {
      const credential = resolver.select("platform", "calibration");
      const outcome = await new GroqDesignEvaluator(getProblemPackage(input.problemId, input.contentVersion)!, credential, undefined, resolver, (value) => { usage = value; }).evaluate(input, new AbortController().signal);
      rows.push({ fixture: fixture.id, repetition, phase, outcome: outcome.kind, latencyMs: Date.now() - start, usage,
        ...(outcome.kind === "report" ? { ratings: Object.fromEntries(outcome.report.assessment.criteria.map((criterion) => [criterion.criterionId, criterion.rating])), marks: outcome.report.marks, findings: outcome.report.assessment.findings, evidenceValid: true, ...(fixture.authoredContradiction ? { contradictionDetected: outcome.report.assessment.findings.some((finding) => finding.kind === "contradiction" && finding.evidence.some(({ quote }) => Boolean(quote && fixture.authoredContradiction!.includes(quote)))) } : {}) } : {}),
      }); save();
      return outcome;
    } catch (error) {
      const safe = error instanceof SafeError ? error : undefined;
      rows.push({ fixture: fixture.id, repetition, phase, outcome: "failed", latencyMs: Date.now() - start, usage, errorCode: safe?.code ?? "INTERNAL_ERROR" });
      // A calibration batch never cycles through quota or rejected credentials.
      if (["PROVIDER_QUOTA", "PROVIDER_RATE_LIMIT", "CREDENTIAL_REJECTED", "PLATFORM_UNAVAILABLE"].includes(safe?.code ?? "")) halted = true;
      save(); return null;
    }
  }
  for (const fixture of calibrationFixtures) {
    const repeats = ["conventional", "alternative"].includes(fixture.kind) ? 3 : 1;
    for (let repetition = 1; repetition <= repeats && !halted; repetition++) {
      const initial = { ...fixture.input, snapshotId: randomUUID(), sessionId: randomUUID() };
      const outcome = await run(fixture, repetition, initial, "initial");
      if (outcome?.kind === "clarification" && !halted) {
        await run(fixture, repetition, { ...initial, phase: "final", clarification: outcome.clarification, answers: outcome.clarification.questions.map(({ id }) => ({ questionId: id, status: "answered", answer: fixture.clarificationAnswer })) }, "final_answered_actual");
      }
    }
    if (fixture.kind === "conventional" && !halted) {
      // Fixed final-round fixtures model an authored prior targeted clarification.
      for (const status of ["answered", "skipped"] as const) {
        const initial = { ...fixture.input, snapshotId: randomUUID(), sessionId: randomUUID() };
        const questionId = randomUUID();
        const final: ReviewInput = { ...initial, phase: "final", clarification: { id: randomUUID(), sessionId: initial.sessionId, snapshotId: initial.snapshotId, configuration: initial.configuration, questions: [{ id: questionId, text: fixture.clarificationQuestion, reference: { section: "assumptions", field: "text" } }] }, answers: [status === "answered" ? { questionId, status, answer: fixture.clarificationAnswer } : { questionId, status }] };
        await run(fixture, 1, final, `final_${status}_authored`);
        if (halted) break;
      }
    }
  }
  const humanPath = process.env.CALIBRATION_HUMAN_RATINGS;
  const human = humanPath ? JSON.parse(readFileSync(humanPath, "utf8")) as Record<string, Record<string, number>> : null;
  let comparisons = 0, withinOne = 0;
  if (human) for (const row of rows.filter((row) => row.phase === "initial" || row.phase === "final_answered_actual")) for (const [criterion, rating] of Object.entries(row.ratings ?? {})) {
    const independent = human[row.fixture]?.[criterion];
    if (Number.isInteger(independent) && independent >= 0 && independent <= 4) { comparisons++; if (Math.abs(independent - rating) <= 1) withinOne++; }
  }
  report.independentHumanReview = comparisons ? { comparisons, requiredComparisons: 90, agreementWithinOne: withinOne / comparisons, target: 0.9, passed: comparisons === 90 ? withinOne / comparisons >= 0.9 : null, coverage: comparisons === 90 ? "complete" : "incomplete_unverified" } : "unverified";
  report.strongRepeats = calibrationFixtures.filter((f) => ["conventional", "alternative"].includes(f.kind)).map((f) => {
    const marks = rows.filter((r) => r.fixture === f.id && (r.phase === "initial" || r.phase === "final_answered_actual") && r.marks !== undefined).map((r) => r.marks!);
    return { fixture: f.id, marks, range: marks.length ? Math.max(...marks) - Math.min(...marks) : null, target: 5, passed: marks.length === 3 ? Math.max(...marks) - Math.min(...marks) <= 5 : null };
  });
  report.alternativeAcceptance = "Requires independent semantic review of the alternative fixture findings; schema validity is insufficient.";
  report.status = halted ? "incomplete_provider_limit_or_credential" : "completed_calls_semantic_review_required";
  save();
}, 2_000_000);
