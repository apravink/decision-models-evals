CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  run_ts TEXT NOT NULL,
  suite_id TEXT NOT NULL,
  suite_version TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'jev',
  model_requested TEXT NOT NULL,
  model_served TEXT,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  error_code TEXT,
  latency_ms INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  request_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  UNIQUE (run_ts, suite_id, suite_version, model_requested)
);

CREATE INDEX idx_runs_run_ts ON runs (run_ts);

CREATE INDEX idx_runs_suite_run_ts ON runs (suite_id, run_ts);

CREATE TABLE answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('noul', 'choice', 'score')),
  noul REAL,
  choice TEXT,
  score REAL,
  confidence REAL,
  probabilities_json TEXT,
  legend_json TEXT,
  correct INTEGER,
  resolves_at TEXT,
  resolved_ts TEXT,
  UNIQUE (run_id, question_id)
);

CREATE INDEX idx_answers_run_id ON answers (run_id);

CREATE INDEX idx_answers_resolved_ts ON answers (resolved_ts);

CREATE TABLE nba_teams (
  id INTEGER PRIMARY KEY,
  abbr TEXT NOT NULL,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  conference TEXT NOT NULL,
  division TEXT NOT NULL
);

CREATE TABLE nba_games (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  datetime TEXT,
  season INTEGER NOT NULL,
  postseason INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  status_state TEXT,
  home_team_id INTEGER NOT NULL,
  visitor_team_id INTEGER NOT NULL,
  home_score INTEGER,
  visitor_score INTEGER,
  postponed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_nba_games_date ON nba_games (date);

CREATE INDEX idx_nba_games_season_home ON nba_games (season, home_team_id);

CREATE INDEX idx_nba_games_season_visitor ON nba_games (season, visitor_team_id);
