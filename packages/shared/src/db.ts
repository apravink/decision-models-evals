import type { AnswerType } from "./jev";

export type RunStatus = "ok" | "error";

export interface RunRow {
  id: number;
  run_ts: string;
  provider: string;
  model_served: string;
  prompt_version: string;
  status: RunStatus;
  error_code: string | null;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  request_json: string;
  response_json: string;
}

export interface AnswerRow {
  id: number;
  run_id: number;
  question_id: string;
  type: AnswerType;
  noul: number | null;
  choice: string | null;
  score: number | null;
  confidence: number | null;
  probabilities_json: string | null;
  correct: 0 | 1 | null;
}
