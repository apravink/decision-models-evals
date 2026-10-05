export type RunStatus = "ok" | "error";

export type AnswerType = "noul" | "choice" | "score";

export interface RunRow {
  id: string;
  run_ts: string;
  suite_id: string;
  suite_version: string;
  provider: string;
  model_requested: string;
  model_served: string | null;
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
  run_id: string;
  question_id: string;
  type: AnswerType;
  noul: number | null;
  choice: string | null;
  score: number | null;
  confidence: number | null;
  probabilities_json: string | null;
  legend_json: string | null;
  correct: 0 | 1 | null;
  resolves_at: string | null;
  resolved_ts: string | null;
}

export interface NbaTeamRow {
  id: number;
  abbr: string;
  name: string;
  city: string;
  conference: string;
  division: string;
}

export interface NbaGameRow {
  id: number;
  date: string;
  datetime: string | null;
  season: number;
  postseason: 0 | 1;
  status: string | null;
  status_state: string | null;
  home_team_id: number;
  visitor_team_id: number;
  home_score: number | null;
  visitor_score: number | null;
  postponed: 0 | 1;
}
