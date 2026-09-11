import type { AttemptData } from "@/domain/types";

export function sortAttemptsByActivity(attempts: AttemptData[]): AttemptData[] {
  return [...attempts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
