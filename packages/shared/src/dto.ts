import type { AnswerRow, RunRow, RunStatus } from "./db";

export interface SeriesPoint {
  bucket: string;
  runs: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  mean_score: number;
}

export interface RunSummary {
  id: number;
  run_ts: string;
  provider: string;
  model_served: string;
  status: RunStatus;
  latency_ms: number;
  mean_score: number;
  answers: number;
}

export interface RunDetail {
  run: RunRow;
  answers: AnswerRow[];
}

export interface HealthResponse {
  ok: boolean;
  total_runs: number;
  last_run_ts: string | null;
}
