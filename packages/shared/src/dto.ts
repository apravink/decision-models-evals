import type { AnswerRow, RunRow, RunStatus } from "./db";

export interface SeriesPoint {
  bucket: string;
  runs: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  mean_score: number;
}

export interface RunSummary {
  id: string;
  run_ts: string;
  suite_id: string;
  model_requested: string;
  model_served: string | null;
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
