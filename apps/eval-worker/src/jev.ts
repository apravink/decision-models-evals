import { APIConnectionError, APIError, APITimeoutError, TypeSafeClient } from "@typesafe-ai/sdk";
import type { Answer, Question, SystemOneRequest, SystemOneResponse } from "@decision-models-evals/shared";

export interface JevExchange {
  request_body: string;
  response_status: number;
  response_body: string;
}

export type JevCallResult =
  | { ok: true; response: SystemOneResponse; latency_ms: number; exchange: JevExchange }
  | { ok: false; error_code: string; latency_ms: number; exchange: JevExchange };

export async function runSystemOne(apiKey: string, baseUrl: string | undefined, req: SystemOneRequest): Promise<JevCallResult> {
  const exchanges: JevExchange[] = [];
  const client = new TypeSafeClient({
    apiKey,
    timeout: 30_000,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
    fetch: async (input, init) => {
      const res = await globalThis.fetch(input, init);
      exchanges.push({
        request_body: typeof init?.body === "string" ? init.body : "",
        response_status: res.status,
        response_body: await res.clone().text(),
      });
      return res;
    },
  });
  const ask = client as unknown as { systemOne(req: unknown): Promise<SystemOneResponse> };
  const started = Date.now();
  try {
    const response = await ask.systemOne(req);
    return { ok: true, response, latency_ms: Date.now() - started, exchange: exchanges[exchanges.length - 1]! };
  } catch (err) {
    const exchange: JevExchange = exchanges[exchanges.length - 1] ?? {
      request_body: JSON.stringify(req),
      response_status: 0,
      response_body: String(err),
    };
    const error_code = errorCodeFor(err);
    return { ok: false, error_code, latency_ms: Date.now() - started, exchange };
  }
}

function errorCodeFor(err: unknown): string {
  if (err instanceof APITimeoutError) return "timeout";
  if (err instanceof APIConnectionError) return "retries_exhausted";
  if (err instanceof APIError) return `http_${err.status}`;
  return "invalid_response";
}

export function validateAnswers(questions: Record<string, Question>, answers: Record<string, Answer>): string | null {
  for (const [id, question] of Object.entries(questions)) {
    const answer = answers[id];
    if (!answer) return `missing answer for ${id}`;
    if (answer.type !== question.type) return `type mismatch for ${id}`;
    if (answer.type === "noul" && !Number.isFinite(answer.noul)) return `non-finite noul for ${id}`;
    if (answer.type === "choice" && (typeof answer.choice !== "string" || typeof answer.probabilities !== "object" || answer.probabilities === null)) {
      return `malformed choice answer for ${id}`;
    }
    if (answer.type === "score" && !Number.isFinite(answer.score)) return `non-finite score for ${id}`;
  }
  return null;
}
