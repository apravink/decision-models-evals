# PLAN.md — decision-models-evals

## 1. Product Requirements Document (PRD)

**What:** Continuously evaluate model APIs — starting with Jev (TypeSafe `systemone`) — via cron-driven **prediction suites**: ask the model for calibrated probabilities on real-world events (NBA game outcomes first; politics/weather later), resolve them against ground truth after the fact, store everything in D1, and show accuracy/calibration/latency trends on a public dashboard. Every suite runs daily against both `jev-latest` and a pinned version, so release drift is visible as a signal, not a surprise.

**Stack:** TypeScript · Cloudflare Workers (cron worker + SvelteKit SSR dashboard) · D1 · @typesafe-ai/sdk · balldontlie (free tier) · ApexCharts

| ID | Requirement |
|---|---|
| REQ-1 | Scheduled daily tick (14:00 UTC): resolve matured predictions, then ask new ones. Official `@typesafe-ai/sdk` with retry/backoff on 429/529, 30s per-attempt timeout, verbatim request/response archival via fetch-tee; API keys as Worker secrets |
| REQ-2 | Thin ingester → D1: per-run metrics (latency, tokens, status, model_requested, model_served), per-answer values (noul/choice/score, confidence, probabilities, legend), raw request/response archived verbatim; deferred resolution writes correct + Brier |
| REQ-3 | Data API: time-bucketed series + run list/detail endpoints; `suite_id` as a filter dimension |
| REQ-4 | Public dashboard: accuracy/Brier/calibration/latency trends per suite + latest-vs-pinned model comparison |
| REQ-5 | Suite abstraction: core schema and worker are domain-agnostic; NBA is the first suite module; politics/weather later = new module, no core/schema changes |
| NFR-1 | Stay in free tier (Cloudflare, balldontlie); Jev eval volume trivially cheap ($0.042/Mtok input, output free) |
| NFR-2 | Local dev parity (local D1, cron testing) |
| NFR-3 | One-command deploy |
| NFR-4 | Multi-API ready: model/provider stored per run; nothing Jev-specific in core schema names |

**Out of scope:** auth, LLM-as-judge, alerting, rollup tables, betting-odds comparison (later: The Odds API free tier).
**Open:** [4] future providers beyond Jev.
**Resolved (2026-10-04):** [1] eval design — daily NBA predictions, one noul per game, season-stats state, T+1 resolution. [2] answer value columns NULLable; `type` selects the meaningful primitive(s). [3] daily tick at **14:00 UTC** (10am ET: last night's games final, tonight's slate known). Also settled: dual-model runs (`jev-latest` + pinned `jev-1.13.0`), official SDK over hand-rolled client, balldontlie free tier (teams + games only — stats derived, not fetched), suite abstraction from day one.

## 2. Low-Level Design (LLD)

**Architecture — two workers, D1 is the only seam:**

```
balldontlie ─► eval-worker (cron 14:00 UTC) ─► Jev API (@typesafe-ai/sdk)
                  │  suites registry: [nba, …future]   ×2 models per tick
                  ▼
                 D1 (SQLite)  ◄─reads─  dashboard (SvelteKit, public)
```
- eval-worker: bare Worker, `scheduled()` → tick(suites) → D1. Holds the only secrets. No public URL.
- dashboard: SvelteKit SSR + `/api` routes reading the same D1. No secrets.
- Why two: SvelteKit's adapter can't cleanly host a cron handler; separate blast radius; independent deploys.
- Heavy historical analysis: offline via `wrangler d1 export` (enabled by raw archival).

**Repo layout (npm workspaces):**
```
packages/shared/            # types: SystemOne wire shapes, DB rows, API DTOs
apps/eval-worker/
  src/suites/types.ts       # Suite interface (below)
  src/suites/nba/           # bdl.ts, cache.ts, state.ts, index.ts — first suite
  src/jev.ts                # SDK client factory + fetch-tee verbatim archival
  src/resolver.ts           # generic: matured answers → outcome → correct + Brier
  src/ingester.ts           # atomic run+answers write via DB.batch()
  src/tick.ts               # per suite: resolve → predict ×2 models
  src/index.ts              # scheduled() entry
  scripts/seed-nba.ts       # one-time backfill (teams + 2025 season)
  migrations/0001_init.sql  # schema v2
  wrangler.jsonc            # cron "0 14 * * *", D1 binding
apps/dashboard/             # SvelteKit: routes/+page, routes/api/*, hooks.server.ts (rate limit)
```

**Suite interface — the whole domain seam:**
```ts
interface Suite {
  id: string;                                            // "nba" | "politics" | "weather"
  version(): string;                                     // bump on template change → suite_version
  pendingQuestions(env, now): Promise<PendingBatch | null>;  // {state, questions[]} — one fan-out call per tick
  outcomesFor(env, ids): Promise<Map<string, Outcome | null>>; // absent = not yet known
}
```
- Core owns (written once, domain-free): tick loop, one fan-out `systemone` call per (suite × model), ingest, matured-answers query (`resolved_ts IS NULL AND resolves_at <= now`), scoring: noul → `correct = (p > 0.5) == o`, `score = (p − o)²`; choice → `correct = choice == winner`, multiclass Brier from stored probabilities. Log-loss and accuracy trends derive at read time from stored raws — no duplicate truth.
- Suites own: data source, namespaced cache tables (`nba_*`), state construction, ground-truth lookup. Core never queries suite tables; suites never touch scoring.
- Deliberately NOT built (over-engineering guard): dynamic suite loading, per-suite cron config, generic data-provider interface.

**Schema v2 (amend `0001_init.sql` in place — nothing deployed; wipe local D1, re-apply):**
```sql
runs(id PK AI, run_ts, suite_id, suite_version, provider, model_requested, model_served,
     status CHECK ok|error, error_code NULLable, latency_ms, input_tokens, output_tokens,
     request_json, response_json,
     UNIQUE(run_ts, suite_id, suite_version, model_requested))
answers(id PK AI, run_id FK→runs ON DELETE CASCADE, question_id,
        type CHECK noul|choice|score,
        noul, choice, score, confidence, probabilities_json, legend_json,   -- value cols NULLable
        correct, resolves_at, resolved_ts,
        UNIQUE(run_id, question_id))
nba_teams(id PK, abbr, name, city, conference, division)                  -- suite-private
nba_games(id PK [balldontlie], date, datetime, season, postseason,
          status, status_state, home_team_id, visitor_team_id,
          home_score, visitor_score, postponed)                           -- suite-private
-- indexes: runs(run_ts), runs(suite_id, run_ts), answers(run_id), answers(resolved_ts), nba_games(date)
```

**NBA suite (`nba-v1`):**
- One noul per game: instructions "Will the home team win?" + criteria true/false. `question_id = YYYYMMDD-{HOME}-{AWAY}` (e.g. `20261005-BOS-NYK`).
- State per game: both teams' snapshots derived from `nba_games` via SQL — W-L, win%, streak, L10, avg PTS for/against, home/away splits — plus prior-season summary (cold-start context). No player stats; no paid endpoints.
- balldontlie usage: `GET /v1/teams` (1 req); `GET /v1/games?dates[]=` for yesterday's results + upcoming slate (~3 req/day); cursor pagination, `per_page=100` max; auth header `Authorization: <key>` (no Bearer prefix). Free tier: 5 req/min, teams/players/games endpoints only.
- `resolves_at` = T+1, advisory: postponed games stay pending until `status_state = final`.
- Seed script (`scripts/seed-nba.ts`): teams + full 2025 season backfill (~14 paged requests, throttled ≤5/min). Run local now; `--remote` at deploy. Note: 2026-27 regular season starts ~Oct 21 — early ticks may see empty slates.

**Tick detail (daily 14:00 UTC):**
1. **Resolve** — matured answers → `suite.outcomesFor()` → write `correct`, `score` (Brier), `resolved_ts`. Null outcome stays pending (retried next tick).
2. **Predict** — `suite.pendingQuestions()` → one fan-out `systemone` call per model (`jev-latest`, `jev-1.13.0`) → ingest two runs (atomic `DB.batch`, verbatim request/response archived).

**Secrets:** `JEV_API_KEY` (passed explicitly to SDK constructor), `BALLDONTLIE_API_KEY`.
**Error taxonomy:** `timeout`, `retries_exhausted`, `http_<status>`, `invalid_response`, `d1_error`.

**Edge cases:** offseason/empty slate → run recorded `ok` with zero answers; postponed game → pending until final; duplicate cron delivery → deduped by UNIQUE; response shape mismatch → run recorded as error, raws archived; resolution source missing data → stays pending.

**Phases:**
- **0** [done 2026-10-04] Scaffold workspaces, TS strict (NFR-3)
- **1** [done 2026-10-04] Shared types, D1 migration v1, local dev setup — cron + D1 verified locally (REQ-2, NFR-2)
- **2** [done 2026-10-05] Eval worker — (a) schema v2 + shared-types rewrite (b) generic core: tick/ingester/resolver/jev (SDK + fetch-tee archival) (c) NBA suite + seed script (d) verified locally end-to-end via mock Jev: dual-model runs, deferred resolution with correct/Brier, verbatim raws (REQ-1, REQ-2, REQ-5). Pending real-key runs: balldontlie seed + first real Jev call.
- **3** API routes: `series`, `runs`, `health` — SQL time-bucketing, percentiles in TS, `suite_id` filter (REQ-3)
- **4** Dashboard: accuracy/Brier/calibration/latency charts, latest-vs-pinned comparison, theme — iterate together (REQ-4)
