import type { AnswerRow, RunRow } from "@decision-models-evals/shared";

export type NewRun = Omit<RunRow, "id">;
export type NewAnswer = Omit<AnswerRow, "id" | "run_id">;

export async function ingestRun(db: D1Database, run: NewRun, answers: NewAnswer[]): Promise<"ingested" | "deduped"> {
  const id = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO runs (id, run_ts, suite_id, suite_version, provider, model_requested, model_served, status, error_code, latency_ms, input_tokens, output_tokens, request_json, response_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
      )
      .bind(
        id,
        run.run_ts,
        run.suite_id,
        run.suite_version,
        run.provider,
        run.model_requested,
        run.model_served,
        run.status,
        run.error_code,
        run.latency_ms,
        run.input_tokens,
        run.output_tokens,
        run.request_json,
        run.response_json,
      ),
    ...answers.map((a) =>
      db
        .prepare(
          `INSERT INTO answers (run_id, question_id, type, noul, choice, score, confidence, probabilities_json, legend_json, correct, resolves_at, resolved_ts)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
        )
        .bind(
          id,
          a.question_id,
          a.type,
          a.noul,
          a.choice,
          a.score,
          a.confidence,
          a.probabilities_json,
          a.legend_json,
          a.correct,
          a.resolves_at,
          a.resolved_ts,
        ),
    ),
  ];
  try {
    await db.batch(statements);
    return "ingested";
  } catch (err) {
    if (/unique constraint/i.test(String(err))) return "deduped";
    throw err;
  }
}
