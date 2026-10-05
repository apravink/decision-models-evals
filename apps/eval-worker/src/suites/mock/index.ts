import type { Env } from "../../env";
import type { Outcome, PendingBatch, QuestionSpec, Suite } from "../types";

const IDS = ["mock-q1", "mock-q2", "mock-q3"];

export const mockSuite: Suite = {
  id: "mock",
  version: () => "mock-v1",

  async pendingQuestions(_env: Env, now: Date): Promise<PendingBatch> {
    const questions: QuestionSpec[] = IDS.map((id) => ({
      question_id: id,
      type: "noul",
      instructions: `Is the signal \`${id}\` active right now?`,
      noul_criteria: { true: "The signal is active", false: "The signal is inactive" },
      resolves_at: now.toISOString(),
    }));
    return {
      state: { fixture: "mock", signals: { "mock-q1": "on", "mock-q2": "off", "mock-q3": "on" } },
      questions,
    };
  },

  async outcomesFor(env: Env, questionIds: string[]): Promise<Map<string, Outcome>> {
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const placeholders = questionIds.map((_, i) => `?${i + 2}`).join(", ");
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT a.question_id FROM answers a JOIN runs r ON r.id = a.run_id
       WHERE r.suite_id = 'mock' AND r.run_ts < ?1 AND a.question_id IN (${placeholders})`,
    )
      .bind(cutoff, ...questionIds)
      .all<{ question_id: string }>();
    const map = new Map<string, Outcome>();
    for (const row of results) {
      map.set(row.question_id, { kind: "noul", value: (hash(row.question_id) % 2) as 0 | 1 });
    }
    return map;
  },
};

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
