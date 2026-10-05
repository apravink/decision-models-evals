import type { Suite, Outcome } from "./suites/types";
import type { Env } from "./env";

interface MaturedRow {
  id: number;
  question_id: string;
  type: "noul" | "choice" | "score";
  noul: number | null;
  choice: string | null;
  score: number | null;
  probabilities_json: string | null;
  legend_json: string | null;
}

export async function resolveMatured(env: Env, suite: Suite, now: Date): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.question_id, a.type, a.noul, a.choice, a.score, a.probabilities_json, a.legend_json
     FROM answers a JOIN runs r ON r.id = a.run_id
     WHERE r.suite_id = ?1 AND a.resolved_ts IS NULL AND a.resolves_at IS NOT NULL AND a.resolves_at <= ?2`,
  )
    .bind(suite.id, now.toISOString())
    .all<MaturedRow>();
  if (results.length === 0) return 0;

  const outcomes = await suite.outcomesFor(env, results.map((r) => r.question_id));
  const resolved_ts = now.toISOString();
  let count = 0;
  for (const row of results) {
    const outcome = outcomes.get(row.question_id);
    if (!outcome) continue;
    const scored = scoreAnswer(row, outcome);
    await env.DB.prepare(`UPDATE answers SET correct = ?1, score = ?2, resolved_ts = ?3 WHERE id = ?4`)
      .bind(scored.correct, scored.score, resolved_ts, row.id)
      .run();
    count++;
  }
  return count;
}

function scoreAnswer(row: MaturedRow, outcome: Outcome): { correct: 0 | 1; score: number } {
  if (outcome.kind === "noul") {
    const p = row.noul ?? 0.5;
    const o = outcome.value;
    return { correct: (p > 0.5) === (o === 1) ? 1 : 0, score: (p - o) ** 2 };
  }
  if (outcome.kind === "choice") {
    const probs = parseRecord(row.probabilities_json);
    let score = 0;
    for (const [option, prob] of Object.entries(probs)) {
      score += (Number(prob) - (option === outcome.value ? 1 : 0)) ** 2;
    }
    return { correct: row.choice === outcome.value ? 1 : 0, score };
  }
  const legend = parseRecord(row.legend_json);
  const levels = Math.max(Object.keys(legend).length, 2);
  const prediction = row.score ?? 0;
  const truth = outcome.value;
  return { correct: Math.round(prediction) === truth ? 1 : 0, score: 1 - Math.abs(prediction - truth) / (levels - 1) };
}

function parseRecord(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
