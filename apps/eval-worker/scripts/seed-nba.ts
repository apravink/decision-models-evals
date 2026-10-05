import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchSeasonGames, fetchTeams, type BdlGame } from "../src/suites/nba/bdl";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const SEASON = Number(process.argv[2] ?? 2025);
const THROTTLE_MS = 13_000;

function apiKey(): string {
  if (process.env.BALLDONTLIE_API_KEY) return process.env.BALLDONTLIE_API_KEY;
  try {
    const vars = readFileSync(join(scriptDir, "..", ".dev.vars"), "utf8");
    const match = vars.match(/^BALLDONTLIE_API_KEY=(.+)$/m);
    if (match) return match[1]!.trim();
  } catch {}
  console.error("Set BALLDONTLIE_API_KEY (env var or apps/eval-worker/.dev.vars)");
  process.exit(1);
}

function sqlStr(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNum(value: number | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  return String(value);
}

async function main(): Promise<void> {
  const key = apiKey();
  const out = join(scriptDir, "seed.generated.sql");
  writeFileSync(out, "");

  console.log(`Fetching teams...`);
  const teams = await fetchTeams(key);
  const teamLines: string[] = [];
  for (const t of teams) {
    teamLines.push(
      `INSERT INTO nba_teams (id, abbr, name, city, conference, division) VALUES (${t.id}, ${sqlStr(t.abbreviation)}, ${sqlStr(t.name)}, ${sqlStr(t.city)}, ${sqlStr(t.conference)}, ${sqlStr(t.division)}) ON CONFLICT (id) DO UPDATE SET abbr = excluded.abbr, name = excluded.name, city = excluded.city, conference = excluded.conference, division = excluded.division;`,
    );
  }
  appendFileSync(out, teamLines.join("\n") + "\n");

  console.log(`Fetching ${SEASON} season games (throttled ~1 req/13s)...`);
  let count = 0;
  await fetchSeasonGames(
    key,
    SEASON,
    (games: BdlGame[]) => {
      const gameLines: string[] = [];
      for (const g of games) {
        gameLines.push(
          `INSERT INTO nba_games (id, date, datetime, season, postseason, status, status_state, home_team_id, visitor_team_id, home_score, visitor_score, postponed) VALUES (${g.id}, ${sqlStr(g.date)}, ${sqlStr(g.datetime ?? null)}, ${g.season}, ${g.postseason ? 1 : 0}, ${sqlStr(g.status ?? null)}, ${sqlStr(g.status_state ?? null)}, ${g.home_team.id}, ${g.visitor_team.id}, ${sqlNum(g.home_team_score)}, ${sqlNum(g.visitor_team_score)}, ${g.postponed ? 1 : 0}) ON CONFLICT (id) DO UPDATE SET datetime = excluded.datetime, status = excluded.status, status_state = excluded.status_state, home_score = excluded.home_score, visitor_score = excluded.visitor_score, postponed = excluded.postponed;`,
        );
      }
      appendFileSync(out, gameLines.join("\n") + (gameLines.length > 0 ? "\n" : ""));
      count += games.length;
      console.log(`  fetched ${count} games...`);
    },
    THROTTLE_MS,
  );

  console.log(`Wrote seed SQL to ${out}`);
  console.log(`Apply with: npm run seed:apply:local`);
}

void main();
