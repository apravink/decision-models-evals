CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_ts TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_served TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  error_code TEXT,
  latency_ms INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  request_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  UNIQUE (run_ts, prompt_version)
);

CREATE INDEX idx_runs_run_ts ON runs (run_ts);

CREATE INDEX idx_runs_provider_run_ts ON runs (provider, run_ts);

CREATE TABLE answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('noul', 'choice')),
  noul REAL,
  choice TEXT,
  score REAL,
  confidence REAL,
  probabilities_json TEXT,
  correct INTEGER,
  UNIQUE (run_id, question_id)
);

CREATE INDEX idx_answers_run_id ON answers (run_id);
