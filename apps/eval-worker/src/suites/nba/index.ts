import type { Env } from "../../env";
import type { Outcome, PendingBatch, QuestionSpec, Suite } from "../types";
import type { NbaGameRow, NbaTeamRow } from "@decision-models-evals/shared";
import { fetchGamesByDates, fetchTeams } from "./bdl";
import { allTeams, gamesByDate, gamesByDatesWithTeams, upsertGames, upsertTeams } from "./cache";
import { teamSnapshot, type TeamSnapshot } from "./state";

const SUITE_VERSION = "nba-v1";

export const nbaSuite: Suite = {
  id: "nba",
  version: () => SUITE_VERSION,

  async pendingQuestions(env: Env, now: Date): Promise<PendingBatch | null> {
    const today = etDate(now);
    await refreshTeams(env);
    await safeRefreshGames(env, [today]);
    const slate = (await gamesByDate(env.DB, today)).filter((g) => !g.postponed);
    if (slate.length === 0) return null;

    const teams = await allTeams(env.DB);
    const byId = new Map(teams.map((t) => [t.id, t]));
    const season = currentSeason(today);

    const state: Record<string, unknown> = {};
    const questions: QuestionSpec[] = [];
    const resolves_at = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    for (const game of slate) {
      const home = byId.get(game.home_team_id);
      const away = byId.get(game.visitor_team_id);
      if (!home || !away) continue;
      const qid = gameId(game, home, away);
      const [homeNow, awayNow, homePrior, awayPrior] = await Promise.all([
        teamSnapshot(env.DB, game.home_team_id, season, game.date),
        teamSnapshot(env.DB, game.visitor_team_id, season, game.date),
        teamSnapshot(env.DB, game.home_team_id, season - 1),
        teamSnapshot(env.DB, game.visitor_team_id, season - 1),
      ]);
      state[qid] = {
        game: { date: game.date },
        home: teamBlock(home, homeNow, homePrior),
        away: teamBlock(away, awayNow, awayPrior),
      };
      questions.push({
        question_id: qid,
        type: "noul",
        instructions: `Will the home team (\`${qid}.home\`) beat the away team (\`${qid}.away\`) in this game?`,
        noul_criteria: { true: "The home team wins the game", false: "The away team wins the game" },
        resolves_at,
      });
    }
    if (questions.length === 0) return null;
    return { state, questions };
  },

  async outcomesFor(env: Env, questionIds: string[]): Promise<Map<string, Outcome>> {
    const dates = [...new Set(questionIds.map(questionDate))];
    if (dates.length === 0) return new Map();
    await safeRefreshGames(env, dates);
    const rows = await gamesByDatesWithTeams(env.DB, dates);
    const byQid = new Map(rows.map((row) => [gameId(row, { abbr: row.home_abbr } as NbaTeamRow, { abbr: row.away_abbr } as NbaTeamRow), row]));

    const map = new Map<string, Outcome>();
    for (const id of questionIds) {
      const game = byQid.get(id);
      if (!game || game.status_state !== "final" || game.home_score === null || game.visitor_score === null) continue;
      map.set(id, { kind: "noul", value: game.home_score > game.visitor_score ? 1 : 0 });
    }
    return map;
  },
};

function teamBlock(team: NbaTeamRow, current: TeamSnapshot | null, prior: TeamSnapshot | null): Record<string, unknown> {
  return {
    name: `${team.city} ${team.name}`,
    abbreviation: team.abbr,
    conference: team.conference,
    season_to_date: current,
    prior_season: prior,
  };
}

function gameId(game: Pick<NbaGameRow, "date">, home: Pick<NbaTeamRow, "abbr">, away: Pick<NbaTeamRow, "abbr">): string {
  return `${game.date.replaceAll("-", "")}-${home.abbr}-${away.abbr}`;
}

function questionDate(qid: string): string {
  return `${qid.slice(0, 4)}-${qid.slice(4, 6)}-${qid.slice(6, 8)}`;
}

async function refreshTeams(env: Env): Promise<void> {
  const existing = await allTeams(env.DB);
  if (existing.length > 0 || !env.BALLDONTLIE_API_KEY) return;
  const teams = await fetchTeams(env.BALLDONTLIE_API_KEY);
  await upsertTeams(env.DB, teams);
}

async function safeRefreshGames(env: Env, dates: string[]): Promise<void> {
  if (!env.BALLDONTLIE_API_KEY) return;
  try {
    const games = await fetchGamesByDates(env.BALLDONTLIE_API_KEY, dates);
    await upsertGames(env.DB, games);
  } catch (err) {
    console.error("[nba] schedule refresh failed, falling back to cache", err);
  }
}

function etDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function currentSeason(etToday: string): number {
  const year = Number(etToday.slice(0, 4));
  const month = Number(etToday.slice(5, 7));
  return month >= 10 ? year : year - 1;
}
