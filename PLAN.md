# PLAN.md — decision-models-evals

## 1. Product Requirements

**What:** Continuously evaluate model APIs — starting with Jev (TypeSafe `systemone`) — via cron-driven probes, store validated results in D1, show trends on a public dashboard. More APIs later.

**Stack:** TypeScript · Cloudflare Workers (cron worker + SvelteKit SSR dashboard) · D1 · ApexCharts

| ID | Requirement |
|---|---|
| REQ-1 | Scheduled probe of Jev: cron defined in wrangler config, prompt versioned in code, retry w/ backoff on 429/529, 30s timeout, API key as Worker secret |
| REQ-2 | Thin ingester → D1: per-run metrics (latency, tokens, status, model version), per-answer values (noul/choice/score, confidence, probabilities), raw request/response archived verbatim |
| REQ-3 | Data API: time-bucketed series + run list/detail endpoints |
| REQ-4 | Public dashboard: simple, presentable, themed charts |
| NFR-1 | Stay in free tier |
| NFR-2 | Local dev parity (local D1, cron testing) |
| NFR-3 | One-command deploy |
| NFR-4 | Multi-API ready: model/provider stored per run; nothing Jev-specific in schema names |

**Out of scope:** auth, LLM-as-judge, alerting, rollup tables.
**Open:** [1] exact prompt content [2] final data format — schema below is a v1 proposal [3] cron cadence [4] future providers.

## 2. Design

**Architecture — two workers, D1 is the only seam:**

```
eval-worker (cron)  ──writes──►  D1 (SQLite)  ◄──reads──  dashboard (SvelteKit, public)
```
- eval-worker: bare Worker, `scheduled()` → Jev → D1. Holds the only secret. No public URL.
- dashboard: SvelteKit SSR + `/api` routes reading the same D1. No secrets.
- Why two: SvelteKit's adapter can't cleanly host a cron handler; separate blast radius; independent deploys.
- Heavy historical analysis: offline via `wrangler d1 export` (enabled by raw archival). A third analytics worker only if analysis ever becomes recurring/automated.

**Repo layout (npm workspaces):**
```
packages/shared/            # types: Jev API, DB rows, API DTOs
apps/eval-worker/           # suite.ts (prompt), jev-client.ts, ingester.ts, migrations/, wrangler.jsonc
apps/dashboard/             # SvelteKit: routes/+page, routes/api/*, hooks.server.ts (rate limit)
```

**Schema (v1 proposal — OPEN-2):**
```sql
runs(id, run_ts, provider, model_served, prompt_version, status, error_code,
     latency_ms, input_tokens, output_tokens, request_json, response_json,
     UNIQUE(run_ts, prompt_version))
answers(run_id, question_id, type, noul, choice, score, confidence,
        probabilities_json, correct)
-- indexes on run_ts, (provider, run_ts)
```

**Phases:**
- **0** Scaffold workspaces, TS strict (NFR-3)
- **1** Shared types, D1 migration, local dev setup (REQ-2, NFR-2)
- **2** Eval worker: prompt file (one prompt/tick; multiple later), Jev client with retry/timeout/validation, ingester writes D1 atomically (REQ-1, REQ-2)
- **3** API routes: `series`, `runs`, `health` — SQL time-bucketing, percentiles computed in TS (REQ-3)
- **4** Dashboard: theme, charts, layout — iterate with you (REQ-4)

**Edge cases worth planning:** retries exhausted → run recorded as error with raw body; response shape mismatch → recorded, raw archived; duplicate cron delivery → deduped by unique constraint.
