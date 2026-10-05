import type { QuestionSpec, Suite } from "./suites/types";
import type { Answer, Question, SystemOneRequest } from "@decision-models-evals/shared";
import type { NewAnswer } from "./ingester";
import { ingestRun } from "./ingester";
import type { Env } from "./env";
import { runSystemOne, validateAnswers } from "./jev";
import { resolveMatured } from "./resolver";
import { mockSuite } from "./suites/mock";
import { nbaSuite } from "./suites/nba";

export const MODELS = ["jev-latest", "jev-1.13.0"];

export function suitesFor(env: Env): Suite[] {
  const list: Suite[] = [];
  if (env.BALLDONTLIE_API_KEY) list.push(nbaSuite);
  if (env.MOCK_SUITE === "1") list.push(mockSuite);
  return list;
}

export async function runTick(env: Env): Promise<void> {
  const now = new Date();
  for (const suite of suitesFor(env)) {
    try {
      const resolved = await resolveMatured(env, suite, now);
      if (resolved > 0) console.log(`[${suite.id}] resolved ${resolved} answers`);
    } catch (err) {
      console.error(`[${suite.id}] resolve failed`, err);
    }
    try {
      await predict(env, suite, now);
    } catch (err) {
      console.error(`[${suite.id}] predict failed`, err);
    }
  }
}

async function predict(env: Env, suite: Suite, now: Date): Promise<void> {
  const batch = await suite.pendingQuestions(env, now);
  const specs = batch?.questions ?? [];
  const version = suite.version();
  const run_ts = now.toISOString();

  if (specs.length === 0) {
    const note = JSON.stringify({ note: "no pending questions" });
    const status = await ingestRun(
      env.DB,
      {
        run_ts,
        suite_id: suite.id,
        suite_version: version,
        provider: "jev",
        model_requested: MODELS[0]!,
        model_served: null,
        status: "ok",
        error_code: null,
        latency_ms: 0,
        input_tokens: 0,
        output_tokens: 0,
        request_json: note,
        response_json: note,
      },
      [],
    );
    console.log(`[${suite.id}] empty slate (${status})`);
    return;
  }

  const questions: Record<string, Question> = {};
  for (const spec of specs) questions[spec.question_id] = buildQuestion(spec);

  for (const model of MODELS) {
    const request: SystemOneRequest = { state: batch!.state, model, questions };
    const result = await runSystemOne(env.JEV_API_KEY, env.JEV_BASE_URL, request);

    if (result.ok) {
      const invalid = validateAnswers(questions, result.response.answers);
      if (invalid) {
        console.error(`[${suite.id}] ${model}: ${invalid}`);
        await ingestErrorRun(env.DB, run_ts, suite.id, version, model, "invalid_response", result.latency_ms, result.exchange.request_body, result.exchange.response_body);
        continue;
      }
      const answers = specs.map((spec) => answerFromResponse(spec, result.response.answers[spec.question_id]!));
      const status = await ingestRun(
        env.DB,
        {
          run_ts,
          suite_id: suite.id,
          suite_version: version,
          provider: "jev",
          model_requested: model,
          model_served: result.response.model,
          status: "ok",
          error_code: null,
          latency_ms: result.latency_ms,
          input_tokens: result.response.usage.input_tokens,
          output_tokens: result.response.usage.output_tokens,
          request_json: result.exchange.request_body,
          response_json: result.exchange.response_body,
        },
        answers,
      );
      console.log(`[${suite.id}] ${model}: ${specs.length} answers (${status})`);
    } else {
      await ingestErrorRun(env.DB, run_ts, suite.id, version, model, result.error_code, result.latency_ms, result.exchange.request_body, result.exchange.response_body);
      console.error(`[${suite.id}] ${model}: ${result.error_code}`);
    }
  }
}

async function ingestErrorRun(
  db: D1Database,
  run_ts: string,
  suite_id: string,
  suite_version: string,
  model: string,
  error_code: string,
  latency_ms: number,
  request_body: string,
  response_body: string,
): Promise<void> {
  const status = await ingestRun(
    db,
    {
      run_ts,
      suite_id,
      suite_version,
      provider: "jev",
      model_requested: model,
      model_served: null,
      status: "error",
      error_code,
      latency_ms,
      input_tokens: 0,
      output_tokens: 0,
      request_json: request_body,
      response_json: response_body,
    },
    [],
  );
  console.log(`[${suite_id}] ${model}: error run (${status})`);
}

function buildQuestion(spec: QuestionSpec): Question {
  if (spec.type === "noul") {
    return { type: "noul", instructions: spec.instructions, ...(spec.noul_criteria ? { criteria: spec.noul_criteria } : {}) };
  }
  if (spec.type === "choice") {
    return { type: "choice", instructions: spec.instructions, criteria: spec.choice_criteria ?? {} };
  }
  return { type: "score", instructions: spec.instructions, criteria: spec.score_criteria ?? [] };
}

function answerFromResponse(spec: QuestionSpec, answer: Answer): NewAnswer {
  const base = { question_id: spec.question_id, correct: null, resolves_at: spec.resolves_at, resolved_ts: null } as const;
  if (answer.type === "noul") {
    return { ...base, type: "noul" as const, noul: answer.noul, choice: null, score: null, confidence: null, probabilities_json: null, legend_json: null };
  }
  if (answer.type === "choice") {
    return {
      ...base,
      type: "choice" as const,
      noul: null,
      choice: answer.choice,
      score: null,
      confidence: answer.confidence,
      probabilities_json: JSON.stringify(answer.probabilities),
      legend_json: null,
    };
  }
  return {
    ...base,
    type: "score" as const,
    noul: null,
    choice: null,
    score: answer.score,
    confidence: answer.confidence,
    probabilities_json: JSON.stringify(answer.probabilities),
    legend_json: JSON.stringify(answer.legend),
  };
}
