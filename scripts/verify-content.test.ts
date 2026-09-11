import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { listAuthoringSnippets } from "../src/server/content/internal";

const temporary = mkdtempSync(join(tmpdir(), "lldpractice-content-"));

function run(command: string, args: string[], cwd = temporary): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 10_000 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

afterAll(() => rmSync(temporary, { recursive: true, force: true }));

describe("authored executable content", () => {
  it("compiles and runs all 120 variants with their expected output", () => {
    const snippets = listAuthoringSnippets();
    expect(snippets).toHaveLength(120);

    for (const [index, item] of snippets.entries()) {
      const directory = join(temporary, `case-${index}`);
      mkdirSync(directory);
      let actual: string;
      if (item.language === "python") {
        const source = join(directory, "main.py");
        writeFileSync(source, item.source);
        actual = run("python3", [source], directory);
      } else if (item.language === "java") {
        const source = join(directory, "Main.java");
        writeFileSync(source, item.source);
        run("javac", [source], directory);
        actual = run("java", ["-cp", directory, "Main"], directory);
      } else {
        const source = join(directory, "main.cpp");
        const binary = join(directory, "main");
        writeFileSync(source, item.source);
        run(process.env.CXX ?? "c++", ["-std=c++17", source, "-o", binary], directory);
        actual = run(binary, [], directory);
      }
      expect(actual, item.variantId).toBe(item.expectedOutput);
    }
  });
});
