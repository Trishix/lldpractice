import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getProblemPackage, listPublicProblems } from "../src/server/content/internal";

function clientAssets(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? clientAssets(file) : /\.(js|map|html)$/.test(file) ? [file] : [];
  });
}

const privateTexts = listPublicProblems().flatMap(({ problemId }) => ["1.0.0", "2.0.0"].flatMap(contentVersion => {
  const pkg = getProblemPackage(problemId, contentVersion)!;
  return [pkg.referenceDesign, ...pkg.rubric.flatMap((criterion) => Object.values(criterion.anchors)),
    ...Object.values(pkg.keysByVariantId).flatMap((key) => Object.values(key.rationaleByOptionId))];
})).filter((text) => text.length > 24);

function checkPublicText(source: string, label: string) {
  for (const text of privateTexts) {
    const forms = [text, JSON.stringify(text).slice(1, -1)];
    expect(forms.some((form) => source.includes(form)), `Private study material found in ${label}`).toBe(false);
  }
  for (const name of ["GROQ_API_KEY", "GROQ_REVIEW_API_KEY", "GROQ_FINAL_REVIEW_API_KEY", "GROQ_FALLBACK_API_KEY", "GROQ_CALIBRATION_API_KEY"]) {
    const key = process.env[name];
    if (key) expect(source.includes(key), `Platform secret found in ${label}`).toBe(false);
  }
}

describe("release disclosure boundaries", () => {
  it("keeps private study material out of production client assets", () => {
    const assets = clientAssets(".next/static");
    expect(assets.length).toBeGreaterThan(0);
    for (const file of assets) checkPublicText(readFileSync(file, "utf8"), file);
  });

  it("keeps private study material out of initial HTML", async () => {
    const origin = process.env.LLD_VERIFY_ORIGIN ?? "http://127.0.0.1:3000";
    for (const path of ["/", "/history", "/settings", "/api/config", "/attempts/00000000-0000-4000-8000-000000000001"]) {
      const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(10_000) });
      expect(response.status, path).toBe(200);
      checkPublicText(await response.text(), `initial HTML ${path}`);
    }
  });
});
