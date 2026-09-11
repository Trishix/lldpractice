import { describe, expect, it } from "vitest";
import { sortAttemptsByActivity } from "./history-model";
import type { AttemptData } from "@/domain/types";

const attempt = (id: string, createdAt: string, updatedAt: string) => ({ id, createdAt, updatedAt } as AttemptData);

describe("sortAttemptsByActivity", () => {
  it("puts the most recently updated draft first even when it was created earlier", () => {
    const attempts = [
      attempt("older-edited", "2026-09-01T00:00:00.000Z", "2026-09-11T10:00:00.000Z"),
      attempt("newer", "2026-09-10T00:00:00.000Z", "2026-09-10T00:00:00.000Z"),
    ];

    expect(sortAttemptsByActivity(attempts).map(({ id }) => id)).toEqual(["older-edited", "newer"]);
  });
});
