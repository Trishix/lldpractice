import { describe, expect, it } from "vitest";

import { ProblemPackageSchema, PublicProblemSnapshotSchema } from "../../domain/schemas";
import type { Language } from "../../domain/types";
import {
  ContentLookupError,
  DefaultMcqEvaluator,
  getProblemPackage,
  getPublicProblemSnapshot,
  listAuthoringSnippets,
  listPublicProblems,
  projectPublicProblem,
} from "./internal";

const languages: Language[] = ["java", "python", "cpp"];

describe("versioned authored content", () => {
  it("publishes two schema-valid 3.0.0 packages with ten questions in each track", () => {
    expect(listPublicProblems()).toEqual([
      { problemId: "tic-tac-toe", contentVersion: "3.0.0", title: "Tic-Tac-Toe" },
      { problemId: "snake-and-ladder", contentVersion: "3.0.0", title: "Snake and Ladder" },
    ]);

    for (const item of listPublicProblems()) {
      const pkg = getProblemPackage(item.problemId, item.contentVersion);
      expect(pkg).not.toBeNull();
      expect(ProblemPackageSchema.safeParse(pkg).success).toBe(true);
      expect(pkg?.concepts).toHaveLength(20);
      expect(pkg?.concepts.filter(({ track }) => track === "system_design")).toHaveLength(10);
      expect(pkg?.concepts.filter(({ track }) => track === "problem_oop")).toHaveLength(10);
      expect(pkg?.concepts.flatMap(({ variants }) => Object.values(variants))).toHaveLength(60);
      expect(pkg?.concepts.every(({ variants }) => languages.every((language) => variants[language].options.length === 4))).toBe(true);
      for (const language of languages) {
        const projection = pkg!.publicByLanguage[language];
        expect(projection.questions.filter(({ track }) => track === "system_design")).toHaveLength(10);
        expect(projection.questions.filter(({ track }) => track === "problem_oop")).toHaveLength(10);
        expect(projection.questions.filter(({ track }) => track === "problem_oop").every(({ variant }) => variant.snippet.trim().length > 0)).toBe(true);
      }
    }
  });

  it("retains historical wording and fixes all reviewed executable contracts in v2", () => {
    const oldTtt = getProblemPackage("tic-tac-toe", "1.0.0")!;
    const newTtt = getProblemPackage("tic-tac-toe", "2.0.0")!;
    expect(oldTtt.concepts[0].variants.java.assumptions).toBe("The board starts empty and X moves first.");
    expect(newTtt.concepts[0].variants.java.assumptions).toContain("five accepted");
    expect(newTtt.concepts[0].variants.java.id).toBe("ttt.trace-01.java");
    expect(oldTtt.rubricVersion).toBe("ttt-rubric-v1");
    expect(newTtt.rubricVersion).toBe("ttt-rubric-v2");
    expect(newTtt.concepts[8].variants.java.snippet).toContain("new String[size]");
    expect(newTtt.concepts[7].variants.java.snippet).toContain("IN_PROGRESS");
    const snl = getProblemPackage("snake-and-ladder", "2.0.0")!;
    expect(snl.concepts[4].variants.python.snippet).toContain("start <= 99");
    expect(snl.concepts[7].variants.python.snippet).toContain("die_calls");
    expect(snl.publicByLanguage.java.requirements[2].text).toContain("accepted non-winning roll");
    expect(getProblemPackage("tic-tac-toe", "2.0.0")).not.toBeNull();
  });
  it("returns detached public projections with no answer keys, rubric, or reference design", () => {
    const pkg = getProblemPackage("tic-tac-toe", "1.0.0");
    expect(pkg).not.toBeNull();
    const projected = projectPublicProblem(pkg!, "python");
    expect(PublicProblemSnapshotSchema.safeParse(projected).success).toBe(true);
    expect(Object.keys(projected)).not.toContain("keysByVariantId");
    expect(Object.keys(projected)).not.toContain("rubric");
    expect(Object.keys(projected)).not.toContain("referenceDesign");

    projected.title = "mutated";
    expect(getPublicProblemSnapshot("tic-tac-toe", "1.0.0", "python")?.title).toBe("Tic-Tac-Toe");
    expect(getProblemPackage("missing", "1.0.0")).toBeNull();
  });

  it("keeps a published version immutable after lookup", () => {
    const pkg = getProblemPackage("tic-tac-toe", "1.0.0")!;
    expect(() => { pkg.publicByLanguage.java.title = "changed"; }).toThrow(TypeError);
    expect(getProblemPackage("tic-tac-toe", "1.0.0")?.publicByLanguage.java.title).toBe("Tic-Tac-Toe");
  });

  it("verifies the exact sources published in package variants", () => {
    const authored = listAuthoringSnippets();
    const published = listPublicProblems().flatMap(({ problemId, contentVersion }) =>
      getProblemPackage(problemId, contentVersion)!.concepts.flatMap(({ variants }) => Object.values(variants)),
    );
    expect(new Set(authored.map(({ variantId }) => variantId)).size).toBe(120);
    expect(authored.map(({ variantId, language, source }) => ({ variantId, language, source }))).toEqual(
      published.map(({ id, language, snippet }) => ({ variantId: id, language, source: snippet })),
    );
  });

  it("teaches exact landing and overshoot with independent starting positions", () => {
    const pkg = getProblemPackage("snake-and-ladder", "3.0.0")!;
    const concept = pkg.concepts.find(({ conceptTag }) => conceptTag === "Exact 100 and overshoot")!;
    expect(concept.variants.java.assumptions).toContain("independent");
    expect(concept.variants.java.prompt).toMatch(/two independent/i);
    for (const variant of Object.values(concept.variants)) {
      const correctId = pkg.keysByVariantId[variant.id]!.correctOptionId;
      expect(variant.options.find(({ id }) => id === correctId)?.text).toBe("100 97");
    }
    expect(listAuthoringSnippets().find(({ variantId }) => variantId === concept.variants.python.id)?.expectedOutput).toBe("100 97");
  });
});

describe("deterministic MCQ scoring", () => {
  const evaluator = new DefaultMcqEvaluator();
  const pkg = getProblemPackage("snake-and-ladder", "3.0.0")!;
  const variants = pkg.concepts.map(({ variants }) => variants.java);

  it("scores omitted or wrong answers as zero and returns every question in package order", () => {
    const wrong = Object.fromEntries(variants.map((variant) => [
      variant.id,
      variant.options.find(({ id }) => id !== pkg.keysByVariantId[variant.id]!.correctOptionId)!.id,
    ]));
    const result = evaluator.evaluate(pkg, "java", wrong);
    expect(result.correctCount).toBe(0);
    expect(result.marks).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.questions.map(({ variantId }) => variantId)).toEqual(variants.map(({ id }) => id));
    expect(evaluator.evaluate(pkg, "java", {}).questions.every(({ selectedOptionId }) => selectedOptionId === null)).toBe(true);
  });

  it("scores partial and perfect submissions without partial or negative marks", () => {
    const correct = Object.fromEntries(variants.map(({ id }) => [id, pkg.keysByVariantId[id]!.correctOptionId]));
    const partial = evaluator.evaluate(pkg, "java", Object.fromEntries(Object.entries(correct).slice(0, 4)));
    expect({ correctCount: partial.correctCount, marks: partial.marks, percentage: partial.percentage }).toEqual({ correctCount: 4, marks: 20, percentage: 20 });
    const perfect = evaluator.evaluate(pkg, "java", correct);
    expect({ correctCount: perfect.correctCount, marks: perfect.marks, percentage: perfect.percentage }).toEqual({ correctCount: 20, marks: 100, percentage: 100 });
    expect(perfect.tracks).toEqual({
      system_design: { correctCount: 10, questionCount: 10, marks: 50, percentage: 100 },
      problem_oop: { correctCount: 10, questionCount: 10, marks: 50, percentage: 100 },
    });
  });

  it("rejects answer variant IDs and option IDs outside the selected package language", () => {
    expect(() => evaluator.evaluate(pkg, "java", { unknown: "a" })).toThrowError(ContentLookupError);
    expect(() => evaluator.evaluate(pkg, "java", { [variants[0]!.id]: "unknown" })).toThrowError(ContentLookupError);
    const pythonVariant = pkg.concepts[0]!.variants.python;
    expect(() => evaluator.evaluate(pkg, "java", { [pythonVariant.id]: pythonVariant.options[0]!.id })).toThrowError(ContentLookupError);
  });
});
