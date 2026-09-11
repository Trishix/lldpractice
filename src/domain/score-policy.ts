import type { DesignEvaluation, McqEvaluation, Rating, ScorePolicy } from "./types";

const RATINGS = new Set<Rating>([0, 1, 2, 3, 4]);

export class DefaultScorePolicy implements ScorePolicy {
  mcq(correctCount: number, questionCount = 20): { marks: number; percentage: number } {
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 20) {
      throw new RangeError("Question count must be an integer from 1 through 20.");
    }
    if (!Number.isInteger(correctCount) || correctCount < 0 || correctCount > questionCount) {
      throw new RangeError(`Correct count must be an integer from 0 through ${questionCount}.`);
    }
    return { marks: correctCount * 5, percentage: Math.round((correctCount / questionCount) * 100) };
  }

  design(ratings: Rating[]): number {
    if (ratings.length !== 5 || ratings.some((rating) => !RATINGS.has(rating))) {
      throw new RangeError("Design scoring requires exactly five integer ratings from 0 through 4.");
    }
    return ratings.reduce<number>((total, rating) => total + rating, 0) * 2.5;
  }

  overall(mcq: McqEvaluation, design: DesignEvaluation): number | null {
    if (mcq.status !== "succeeded" || design.status !== "succeeded") return null;
    return mcq.result.marks + design.report.marks;
  }
}

export const scorePolicy: ScorePolicy = new DefaultScorePolicy();
