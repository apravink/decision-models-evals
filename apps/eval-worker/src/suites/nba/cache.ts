import type { NbaGameRow, NbaTeamRow } from "@decision-models-evals/shared";
import type { BdlGame, BdlTeam } from "./bdl";

export async function upsertTeams(db: D1Database, teams: BdlTeam[]): Promise<void> {
  if (teams.length === 0) return;
  await db.batch(
    teams.map((t) =>
      db
        .prepare(
          `INSERT INTO nba_teams (id, abbr, name, city, conference, division) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT (id) DO UPDATE SET abbr = ?2, name = ?3, city = ?4, conference = ?5, division = ?6`,
        )
        .bind(t.id, t.abbreviation, t.name, t.city, t.conference, t.division),
    ),
  );
}

export function toGameRow(g: BdlGame): NbaGameRow {
  return {
    id: g.id,
    date: g.date,
    datetime: g.datetime ?? null,
    season: g.season,
    postseason: g.postseason ? 1 : 0,
    status: g.status ?? null,
    status_state: g.status_state ?? null,
    home_team_id: g.home_team.id,
    visitor_team_id: g.visitor_team.id,
    home_score: g.home_team_score ?? null,
    visitor_score: g.visitor_team_score ?? null,
    postponed: g.postponed ? 1 : 0,
  };
}

export async function upsertGames(db: D1Database, games: BdlGame[]): Promise<void> {
  if (games.length === 0) return;
  await db.batch(
    games.map((g) => {
      const row = toGameRow(g);
      return db
        .prepare(
          `INSERT INTO nba_games (id, date, datetime, season, postseason, status, status_state, home_team_id, visitor_team_id, home_score, visitor_score, postponed)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
           ON CONFLICT (id) DO UPDATE SET datetime = ?3, status = ?6, status_state = ?7, home_score = ?10, visitor_score = ?11, postponed = ?12`,
        )
        .bind(
          row.id,
          row.date,
          row.datetime,
          row.season,
          row.postseason,
          row.status,
          row.status_state,
          row.home_team_id,
          row.visitor_team_id,
          row.home_score,
          row.visitor_score,
          row.postponed,
        );
    }),
  );
}

export async function allTeams(db: D1Database): Promise<NbaTeamRow[]> {
  const { results } = await db.prepare(`SELECT id, abbr, name, city, conference, division FROM nba_teams`).all<NbaTeamRow>();
  return results;
}

export async function gamesByDate(db: D1Database, date: string): Promise<NbaGameRow[]> {
  const { results } = await db
    .prepare(`SELECT id, date, datetime, season, postseason, status, status_state, home_team_id, visitor_team_id, home_score, visitor_score, postponed
              FROM nba_games WHERE date = ?1`)
    .bind(date)
    .all<NbaGameRow>();
  return results;
}

export async function gamesByDatesWithTeams(db: D1Database, dates: string[]): Promise<(NbaGameRow & { home_abbr: string; away_abbr: string })[]> {
  const placeholders = dates.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT g.id, g.date, g.datetime, g.season, g.postseason, g.status, g.status_state, g.home_team_id, g.visitor_team_id, g.home_score, g.visitor_score, g.postponed,
              th.abbr AS home_abbr, tv.abbr AS away_abbr
       FROM nba_games g
       JOIN nba_teams th ON th.id = g.home_team_id
       JOIN nba_teams tv ON tv.id = g.visitor_team_id
       WHERE g.date IN (${placeholders})`,
    )
    .bind(...dates)
    .all<NbaGameRow & { home_abbr: string; away_abbr: string }>();
  return results;
}
